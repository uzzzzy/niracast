package timeline

import (
	"errors"
	"testing"
	"time"

	"github.com/uzzzzy/niracast/internal/db"
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
	conn.Exec(`INSERT INTO playlist_items (channel_id, media_id, duration_sec, position_order) VALUES (1,10,60,0),(1,11,90,1)`)
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

func TestUpcoming(t *testing.T) {
	calc := NewCalculator(func(id int64) ([]Item, error) {
		if id == 99 {
			return nil, nil
		}
		return items, nil
	})

	// 1. Current item check at t = 100 (in item 2, seek 40, remaining 50)
	t.Run("current item", func(t *testing.T) {
		up, err := calc.Upcoming(1, at(100), 3)
		if err != nil {
			t.Fatalf("unexpected err: %v", err)
		}
		if len(up) != 3 {
			t.Fatalf("len = %d, want 3", len(up))
		}
		curr := up[0]
		if !curr.IsCurrent {
			t.Errorf("expected is_current=true on item 0")
		}
		if curr.MediaID != 2 {
			t.Errorf("got media_id=%d, want 2", curr.MediaID)
		}
		if curr.Title != "b" {
			t.Errorf("got title=%q, want 'b'", curr.Title)
		}
		if curr.DurationSec != 90 {
			t.Errorf("got duration_sec=%f, want 90", curr.DurationSec)
		}
		if curr.SeekSeconds != 40 {
			t.Errorf("got seek_seconds=%f, want 40", curr.SeekSeconds)
		}
		if !curr.StartAt.Equal(at(60)) {
			t.Errorf("got start_at=%v, want %v", curr.StartAt, at(60))
		}
		if !curr.EndAt.Equal(at(150)) {
			t.Errorf("got end_at=%v, want %v", curr.EndAt, at(150))
		}
		if up[1].IsCurrent || up[2].IsCurrent {
			t.Errorf("subsequent items should have is_current=false")
		}
	})

	// 2. Wrap-around check: item 2 -> item 3 -> item 1
	t.Run("wrap-around", func(t *testing.T) {
		up, err := calc.Upcoming(1, at(100), 3)
		if err != nil {
			t.Fatalf("unexpected err: %v", err)
		}
		if up[0].MediaID != 2 || up[1].MediaID != 3 || up[2].MediaID != 1 {
			t.Fatalf("expected wrap-around [2, 3, 1], got [%d, %d, %d]", up[0].MediaID, up[1].MediaID, up[2].MediaID)
		}
		if !up[1].StartAt.Equal(up[0].EndAt) || !up[2].StartAt.Equal(up[1].EndAt) {
			t.Errorf("items should be contiguous in time")
		}
	})

	// 3. Count larger than playlist: count=5 with 3 items wraps and repeats
	t.Run("count larger than playlist", func(t *testing.T) {
		up, err := calc.Upcoming(1, at(100), 5)
		if err != nil {
			t.Fatalf("unexpected err: %v", err)
		}
		if len(up) != 5 {
			t.Fatalf("len = %d, want 5", len(up))
		}
		wantIDs := []int64{2, 3, 1, 2, 3}
		for i, id := range wantIDs {
			if up[i].MediaID != id {
				t.Errorf("item %d got media_id=%d, want %d", i, up[i].MediaID, id)
			}
		}
	})

	// 4. Skip offset shifts items
	t.Run("skip offset shifts items", func(t *testing.T) {
		// At t=0, item 1 is playing (0..60).
		// With skip offset of 70s, logicalNow is at(70), so item 2 is playing (seek 10).
		baseNow := at(0)
		skipOffset := 70 * time.Second
		upNormal, err := calc.Upcoming(1, baseNow, 3)
		if err != nil {
			t.Fatal(err)
		}
		if upNormal[0].MediaID != 1 {
			t.Fatalf("normal item 0: got media_id=%d, want 1", upNormal[0].MediaID)
		}
		if upNormal[0].SeekSeconds != 0 {
			t.Errorf("normal seek_seconds: got %f, want 0", upNormal[0].SeekSeconds)
		}

		upShifted, err := calc.Upcoming(1, baseNow.Add(skipOffset), 3)
		if err != nil {
			t.Fatal(err)
		}
		if upShifted[0].MediaID != 2 {
			t.Fatalf("shifted item 0: got media_id=%d, want 2", upShifted[0].MediaID)
		}
		if upShifted[0].SeekSeconds != 10 {
			t.Errorf("shifted seek_seconds: got %f, want 10", upShifted[0].SeekSeconds)
		}
		if !upShifted[0].StartAt.Equal(at(60)) {
			t.Errorf("shifted start_at: got %v, want %v", upShifted[0].StartAt, at(60))
		}
	})

	// 5. Empty playlist returns ErrEmptyPlaylist
	t.Run("empty playlist", func(t *testing.T) {
		_, err := calc.Upcoming(99, at(100), 5)
		if !errors.Is(err, ErrEmptyPlaylist) {
			t.Fatalf("got err=%v, want ErrEmptyPlaylist", err)
		}
	})

	// 6. DB Calculator Upcoming works
	t.Run("db calculator upcoming", func(t *testing.T) {
		conn, err := db.InitDB(":memory:")
		if err != nil {
			t.Fatal(err)
		}
		defer conn.Close()
		conn.Exec(`INSERT INTO channels (id, number, name) VALUES (1, 1, 'c')`)
		conn.Exec(`INSERT INTO media_files (id, path, duration_sec) VALUES (10, '/a.mp4', 60), (11, '/b.mp4', 90)`)
		conn.Exec(`INSERT INTO playlist_items (channel_id, media_id, duration_sec, position_order) VALUES (1,10,60,0),(1,11,90,1)`)
		dbCalc := NewDBCalculator(conn)
		items, err := dbCalc.Upcoming(1, at(100), 3)
		if err != nil {
			t.Fatal(err)
		}
		if len(items) != 3 {
			t.Fatalf("got len %d, want 3", len(items))
		}
		if items[0].MediaID != 11 || items[0].Title != "b" || items[0].SeekSeconds != 40 {
			t.Fatalf("got item[0] %+v", items[0])
		}
		if items[1].MediaID != 10 || items[1].Title != "a" {
			t.Fatalf("got item[1] %+v", items[1])
		}
	})
}
