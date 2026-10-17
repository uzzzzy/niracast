CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY,
    number INTEGER UNIQUE,
    name TEXT,
    mode TEXT NOT NULL DEFAULT 'loop' CHECK (mode IN ('loop','scheduled')),
    created_at DATETIME
);

CREATE TABLE IF NOT EXISTS media_files (
    id INTEGER PRIMARY KEY,
    path TEXT UNIQUE,
    filename TEXT,
    duration_sec REAL,
    codec_video TEXT,
    codec_audio TEXT,
    width INTEGER,
    height INTEGER
);

CREATE TABLE IF NOT EXISTS playlist_items (
    id INTEGER PRIMARY KEY,
    channel_id INTEGER NOT NULL,
    media_id INTEGER NOT NULL,
    duration_sec REAL,
    position_order INTEGER
);

CREATE TABLE IF NOT EXISTS schedule_slots (
    id INTEGER PRIMARY KEY,
    channel_id INTEGER NOT NULL,
    media_id INTEGER NOT NULL,
    start_at INTEGER NOT NULL,
    duration_sec REAL NOT NULL,
    recurrence TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none','daily','weekly')),
    until_at INTEGER,
    created_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_slots_channel ON schedule_slots(channel_id, start_at);

-- Compatibility view and triggers for parallel worker migration
CREATE VIEW IF NOT EXISTS schedules AS
    SELECT id, channel_id, media_id, NULL AS start_time, duration_sec, position_order
    FROM playlist_items;

CREATE TRIGGER IF NOT EXISTS trg_schedules_insert
INSTEAD OF INSERT ON schedules
BEGIN
    INSERT INTO playlist_items (channel_id, media_id, duration_sec, position_order)
    VALUES (NEW.channel_id, NEW.media_id, NEW.duration_sec, NEW.position_order);
END;

CREATE TRIGGER IF NOT EXISTS trg_schedules_delete
INSTEAD OF DELETE ON schedules
BEGIN
    DELETE FROM playlist_items WHERE channel_id = OLD.channel_id;
END;

CREATE TABLE IF NOT EXISTS analytics_minute (
    id INTEGER PRIMARY KEY,
    bucket_at INTEGER NOT NULL,
    channel_id INTEGER NOT NULL,
    media_id INTEGER NOT NULL DEFAULT 0,
    viewers_peak INTEGER NOT NULL DEFAULT 0,
    bytes_out INTEGER NOT NULL DEFAULT 0,
    watch_sec REAL NOT NULL DEFAULT 0,
    UNIQUE(bucket_at, channel_id, media_id)
);

CREATE INDEX IF NOT EXISTS idx_analytics_minute_bucket ON analytics_minute(bucket_at, channel_id);
CREATE INDEX IF NOT EXISTS idx_analytics_minute_media ON analytics_minute(media_id, bucket_at);

CREATE TABLE IF NOT EXISTS analytics_daily (
    id INTEGER PRIMARY KEY,
    day_at INTEGER NOT NULL,
    channel_id INTEGER NOT NULL,
    media_id INTEGER NOT NULL DEFAULT 0,
    viewers_peak INTEGER NOT NULL DEFAULT 0,
    bytes_out INTEGER NOT NULL DEFAULT 0,
    watch_sec REAL NOT NULL DEFAULT 0,
    UNIQUE(day_at, channel_id, media_id)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_day ON analytics_daily(day_at, channel_id);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_media ON analytics_daily(media_id, day_at);

