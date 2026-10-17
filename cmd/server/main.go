package main

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	_ "time/tzdata"

	"github.com/uzzzzy/niracast/internal/analytics"
	"github.com/uzzzzy/niracast/internal/api"
	"github.com/uzzzzy/niracast/internal/auth"
	"github.com/uzzzzy/niracast/internal/db"
	"github.com/uzzzzy/niracast/internal/events"
	"github.com/uzzzzy/niracast/internal/feed"
	"github.com/uzzzzy/niracast/internal/stream"
	"github.com/uzzzzy/niracast/internal/timeline"
	"github.com/uzzzzy/niracast/web"
)

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	addr := env("ADDR", ":8080")
	dbPath := env("DB_PATH", "/data/niracast.db")
	mediaDir := env("MEDIA_DIR", "/media")
	transcodeDir := env("TRANSCODE_DIR", "/transcode")
	staticDir := env("STATIC_DIR", "web/static")
	ffmpegPath := env("FFMPEG_PATH", "ffmpeg")

	// Idle stream assets: a pre-encoded MP4 clip generated once from a JPEG
	// image. At runtime FFmpeg simply copy-loops the clip — near-zero CPU.
	idleImage := env("IDLE_IMAGE", "assets/filler/siaran_segera_kembali.jpg")
	idleClip := env("IDLE_CLIP", "/data/idle/idle.mp4")

	conn, err := db.InitDB(dbPath)
	if err != nil {
		log.Fatalf("init db: %v", err)
	}
	defer conn.Close()

	tracker := analytics.NewTracker()
	flusher := analytics.NewFlusher(conn, tracker)
	defer flusher.Close()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	startTime := time.Now().UTC()

	mediaScanner := newMediaScanner(conn, mediaDir)
	go scanLoop(ctx, mediaScanner, 5*time.Minute)

	ctrl := stream.NewFFmpegController(ffmpegPath)
	sessions := stream.NewSessionManager(ctrl, transcodeDir+"/channels")
	sessions.StartReaperLoop(10 * time.Second)
	defer sessions.StopReaperLoop()

	// Pre-encode the idle clip at startup. If encoding fails (e.g. the image
	// asset is missing from the dev environment), log a warning and continue;
	// the supervisor falls back gracefully to a stream start error.
	if _, err := stream.EnsureIdleClip(ffmpegPath, idleImage, idleClip); err != nil {
		log.Printf("warning: idle clip not generated: %v", err)
	} else {
		log.Printf("idle clip ready: %s", idleClip)
	}

	tzName := env("TIMEZONE", "Asia/Jakarta")
	loc, err := time.LoadLocation(tzName)
	if err != nil {
		log.Fatalf("load timezone %q: %v", tzName, err)
	}

	calc := timeline.NewDBCalculator(conn, loc)
	supervisor := stream.NewSupervisor(
		calc,
		ctrl,
		sessions,
		codecLookupFunc(conn),
		idleClip,
		transcodeDir+"/channels",
	)
	supervisor.SetModeLookup(func(channelID int64) (string, error) {
		var mode string
		err := conn.QueryRow(`SELECT mode FROM channels WHERE id = ?`, channelID).Scan(&mode)
		if errors.Is(err, sql.ErrNoRows) {
			return "loop", nil
		}
		if err != nil {
			return "", err
		}
		if mode == "" {
			mode = "loop"
		}
		return mode, nil
	})

	tracker.SetMediaLookup(func(channelID int64) int64 {
		st := supervisor.Status(channelID)
		if st.State == "playing" {
			return st.MediaID
		}
		return 0
	})

	hub := events.NewHub()
	supervisor.SetPublisher(hub)

	// Publish live viewer count updates periodically (~5s).
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				tot := tracker.TotalViewers()
				hub.Publish(events.Event{
					Type:      "viewers.update",
					ChannelID: 0,
					Data:      map[string]any{"viewers": tot},
					Time:      time.Now(),
				})
				for _, st := range supervisor.RunningStatuses() {
					v := tracker.ChannelViewers(st.ChannelID)
					hub.Publish(events.Event{
						Type:      "viewers.update",
						ChannelID: st.ChannelID,
						Data:      map[string]any{"viewers": v},
						Time:      time.Now(),
					})
				}
			}
		}
	}()

	hls := &hlsHandler{
		ctx:        ctx,
		db:         conn,
		calc:       calc,
		ctrl:       ctrl,
		sessions:   sessions,
		supervisor: supervisor,
		tracker:    tracker,
		root:       transcodeDir + "/channels",
	}

	statusH := newStatusHandler(conn, supervisor, hub, tracker)
	epgH := newEPGHandler(conn, supervisor, calc)
	systemH := newSystemHandler(conn, supervisor, mediaScanner, startTime, ffmpegPath, idleClip, tzName)

	adminPassword := os.Getenv("ADMIN_PASSWORD")
	if adminPassword == "" {
		adminPassword = auth.GenerateRandomPassword(20)
		log.Printf("WARNING: ADMIN_PASSWORD is empty. Generated random admin password: %s", adminPassword)
	}

	sessionSecretStr := os.Getenv("SESSION_SECRET")
	var sessionSecret []byte
	if sessionSecretStr == "" {
		sessionSecret = auth.GenerateRandomBytes(32)
		log.Printf("SESSION_SECRET is empty; generated random ephemeral secret (sessions will reset on restart)")
	} else {
		sessionSecret = []byte(sessionSecretStr)
	}

	authHandler := auth.New(auth.Config{
		AdminPassword: adminPassword,
		SessionSecret: sessionSecret,
	})

	mux := http.NewServeMux()
	api.NewChannelHandler(conn, supervisor).Register(mux)
	api.NewScheduleHandler(conn, supervisor, loc).Register(mux)
	api.NewAnalyticsHandler(conn, tracker, supervisor).Register(mux)
	feed.NewHandler(conn, calc).Register(mux)
	authHandler.Register(mux)
	statusH.register(mux)
	epgH.register(mux)
	systemH.register(mux)
	mux.HandleFunc("GET /api/v1/media", listMedia(conn))
	hls.register(mux)
	// spaFS is rooted at app/dist/app inside the embedded web.Dist FS.
	spaFS, err := web.SPA()
	if err != nil {
		log.Fatalf("init spa fs: %v", err)
	}
	spaHandler := newSPAHandler(spaFS)

	mux.Handle("GET /static/", http.StripPrefix("/static/", http.FileServer(http.Dir(staticDir))))
	mux.Handle("GET /", spaHandler)

	handler := authHandler.Protect(mux, nil)
	srv := &http.Server{Addr: addr, Handler: handler}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdown)
	}()

	log.Printf("niracast listening on %s (media=%s db=%s)", addr, mediaDir, dbPath)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
