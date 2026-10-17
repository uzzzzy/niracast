package timeline

import (
	"errors"
	"testing"
	"time"

	"tv-stream/internal/db"
)

var items = []Item{
	{1, "/a.mp4", 60},
	{2, "/b.mp4", 90},
	{3, "/c.mp4", 50},
} // total 200

func at(s int64) time.Time { return time.Unix(s, 0) }

func TestCompute(t *testing.T) {
	cases := []struct {
		name   string
		sec    int64
		id     int64
		seek   float64
		remain float64
	}{
		{"t=0", 0, 1, 0, 60},
		{"t=100", 100, 2, 40, 50},
		{"boundary 60", 60, 2, 0, 90},
		{"t>total 250", 250, 1, 50, 10},
		{"t=total 200", 200, 1, 0, 60},
		{"t=1000+170", 1170, 3, 20, 30},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			p, err := Compute(items, at(c.sec))
			if err != nil {
				t.Fatal(err)
			}
			if p.MediaID != c.id || p.SeekSeconds != c.seek || p.RemainingSec != c.remain {
				t.Fatalf("got %+v want id=%d seek=%v remain=%v", p, c.id, c.seek, c.remain)
			}
		})
	}
}

func TestEmptyNoPanic(t *testing.T) {
	for _, in := range [][]Item{nil, {}, {{1, "/x", 0}}} {
		if _, err := Compute(in, at(123)); !errors.Is(err, ErrEmptyPlaylist) {
			t.Fatalf("want ErrEmptyPlaylist, got %v", err)
		}
	}
}

func TestDBCalculator(t *testing.T) {
	conn, err := db.InitDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.Exec(`INSERT INTO channels (id, number, name) VALUES (1, 1, 'c')`)
	conn.Exec(`INSERT INTO media_files (id, path, duration_sec) VALUES (10, '/a.mp4', 60), (11, '/b.mp4', 90)`)
	conn.Exec(`INSERT INTO schedules (channel_id, media_id, duration_sec, position_order) VALUES (1,10,60,0),(1,11,90,1)`)
	var calc TimelineCalculator = NewDBCalculator(conn)
	p, err := calc.GetCurrentPlayout(1, at(100))
	if err != nil {
		t.Fatal(err)
	}
	if p.MediaID != 11 || p.FilePath != "/b.mp4" || p.SeekSeconds != 40 || p.RemainingSec != 50 {
		t.Fatalf("got %+v", p)
	}
	if _, err := calc.GetCurrentPlayout(99, at(1)); !errors.Is(err, ErrEmptyPlaylist) {
		t.Fatalf("want empty err, got %v", err)
	}
}
