package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"tv-stream/internal/api"
	"tv-stream/internal/auth"
	"tv-stream/internal/db"
	"tv-stream/internal/events"
	"tv-stream/internal/feed"
	"tv-stream/internal/stream"
	"tv-stream/internal/timeline"
	"tv-stream/web"
)

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	addr := env("ADDR", ":8080")
	dbPath := env("DB_PATH", "/data/tv-stream.db")
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

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go scanLoop(ctx, conn, mediaDir, 5*time.Minute)

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

	calc := timeline.NewDBCalculator(conn)
	supervisor := stream.NewSupervisor(
		calc,
		ctrl,
		sessions,
		codecLookupFunc(conn),
		idleClip,
		transcodeDir+"/channels",
	)

	hub := events.NewHub()
	supervisor.SetPublisher(hub)

	hls := &hlsHandler{
		ctx:        ctx,
		db:         conn,
		calc:       calc,
		ctrl:       ctrl,
		sessions:   sessions,
		supervisor: supervisor,
		root:       transcodeDir + "/channels",
	}

	statusH := newStatusHandler(conn, supervisor, hub)
	epgH := newEPGHandler(conn, supervisor, calc)

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
	api.NewChannelHandler(conn).Register(mux)
	feed.NewHandler(conn).Register(mux)
	authHandler.Register(mux)
	statusH.register(mux)
	epgH.register(mux)
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

	log.Printf("tv-stream listening on %s (media=%s db=%s)", addr, mediaDir, dbPath)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
