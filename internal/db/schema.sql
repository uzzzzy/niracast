CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY,
    number INTEGER UNIQUE,
    name TEXT,
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

CREATE TABLE IF NOT EXISTS playlists (
    id INTEGER PRIMARY KEY,
    channel_id INTEGER,
    name TEXT,
    loop_mode TEXT
);

CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY,
    channel_id INTEGER,
    media_id INTEGER,
    start_time DATETIME,
    duration_sec REAL,
    position_order INTEGER
);
