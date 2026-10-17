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
	"tv-stream/internal/db"
	"tv-stream/internal/feed"
	"tv-stream/internal/stream"
	"tv-stream/internal/timeline"
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

	conn, err := db.InitDB(dbPath)
	if err != nil {
		log.Fatalf("init db: %v", err)
	}
	defer conn.Close()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go scanLoop(ctx, conn, mediaDir, 5*time.Minute)

	ctrl := stream.NewFFmpegController(env("FFMPEG_PATH", "ffmpeg"))
	sessions := stream.NewSessionManager(ctrl, transcodeDir+"/channels")
	sessions.StartReaperLoop(10 * time.Second)
	defer sessions.StopReaperLoop()

	hls := &hlsHandler{
		ctx:      ctx,
		db:       conn,
		calc:     timeline.NewDBCalculator(conn),
		ctrl:     ctrl,
		sessions: sessions,
		root:     transcodeDir + "/channels",
	}

	mux := http.NewServeMux()
	api.NewChannelHandler(conn).Register(mux)
	feed.NewHandler(conn).Register(mux)
	mux.HandleFunc("GET /api/v1/media", listMedia(conn))
	hls.register(mux)
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir(staticDir))))
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/static/", http.StatusFound)
	})

	srv := &http.Server{Addr: addr, Handler: mux}
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
