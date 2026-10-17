# API Reference

This document describes the HTTP API for `niracast`.

## Authentication & Headers
- Mutations (`POST`, `PUT`, `DELETE`) require authentication via the `tvs_session` HTTP-only cookie and the CSRF token header:
  ```http
  X-CSRF-Token: <csrf_token>
  ```
- Anonymous public routes: `GET /api/v1/channels`, `GET /api/v1/channels/{id}`, `GET /api/v1/channels/{id}/status`, `GET /api/v1/channels/{id}/epg`.

---

## Schedule API

### Channel Modes
Channels operate in one of two modes (`channels.mode`):
- `"loop"` (default): Wall-clock modulo looping through `playlist_items`.
- `"scheduled"`: Fixed clock-time timeslot broadcasts governed by `schedule_slots`.

### 1. Get Channel Schedule
Retrieves configured slots and expanded occurrences for a channel across a specified time window.

```http
GET /api/v1/channels/{id}/schedule?from={RFC3339}&to={RFC3339}
```

#### Query Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| `from` | string (RFC3339) | No | Window start time (UTC or offset). Defaults to `00:00:00` of current day in server timezone (`TIMEZONE`). |
| `to` | string (RFC3339) | No | Window end time (UTC or offset). Defaults to `from + 7 days`. Maximum window allowed is 31 days. |

#### Response (200 OK)
```json
{
  "channel_id": 1,
  "timezone": "Asia/Jakarta",
  "slots": [
    {
      "id": 10,
      "channel_id": 1,
      "media_id": 5,
      "filename": "news_bulletin.mp4",
      "title": "news_bulletin",
      "start_at": "2026-10-18T12:00:00Z",
      "duration_sec": 3600,
      "media_duration_sec": 3480,
      "recurrence": "daily",
      "until": "2026-11-01T00:00:00Z"
    }
  ],
  "occurrences": [
    {
      "slot_id": 10,
      "media_id": 5,
      "filename": "news_bulletin.mp4",
      "title": "news_bulletin",
      "start_at": "2026-10-18T12:00:00Z",
      "end_at": "2026-10-18T13:00:00Z",
      "media_duration_sec": 3480,
      "truncated": false,
      "short": true,
      "recurring": true
    }
  ]
}
```

- `truncated`: `true` if media duration exceeds the slot duration (playout will be cut at slot end).
- `short`: `true` if media duration is shorter than the slot duration (idle slate will fill remainder).

---

### 2. Create Schedule Slot
Creates a timeslot on a channel. Validates against collisions within a 60-day expansion window.

```http
POST /api/v1/channels/{id}/schedule/slots
Content-Type: application/json
```

#### Request Body
```json
{
  "media_id": 5,
  "start_at": "2026-10-18T12:00:00Z",
  "duration_sec": 3600,
  "recurrence": "daily",
  "until": "2026-11-01T00:00:00Z"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `media_id` | integer | Yes | ID of existing file in `media_files`. |
| `start_at` | string (RFC3339) | Yes | Start timestamp of first slot occurrence. |
| `duration_sec` | float | No | Slot duration in seconds (1..86400). If omitted or 0, defaults to media file duration. |
| `recurrence` | string | No | `"none"`, `"daily"`, or `"weekly"` (default `"none"`). |
| `until` | string (RFC3339) | No | Recurrence cutoff timestamp; must be after `start_at`. |

#### Response (201 Created)
Returns the created `ScheduleSlot` object. Triggers playout supervisor reload (`supervisor.Reload(channelID)`).

---

### 3. Update Schedule Slot
Updates an existing timeslot. Re-validates overlaps against all other channel slots within 60 days.

```http
PUT /api/v1/channels/{id}/schedule/slots/{slotId}
Content-Type: application/json
```

Request body: Same schema as `POST /schedule/slots`.

#### Response (200 OK)
Returns the updated `ScheduleSlot` object. Triggers playout supervisor reload.

---

### 4. Delete Schedule Slot
Deletes a timeslot.

```http
DELETE /api/v1/channels/{id}/schedule/slots/{slotId}
```

#### Response (204 No Content)
Slot removed. Triggers playout supervisor reload.

---

### 5. Conflict Response (409 Conflict)
When `POST` or `PUT` encounters a collision with another slot within the ~60-day overlap validation window:

```http
HTTP/1.1 409 Conflict
Content-Type: application/json
```
```json
{
  "error": "schedule_conflict",
  "message": "schedule conflict with slot 2 (Evening Bulletin) from 2026-10-18T12:00:00Z to 2026-10-18T13:00:00Z",
  "conflict": {
    "slot_id": 2,
    "title": "Evening Bulletin",
    "start_at": "2026-10-18T12:00:00Z",
    "end_at": "2026-10-18T13:00:00Z"
  }
}
```

---

### 6. Playout Skip Interaction in Scheduled Mode
```http
POST /api/v1/channels/{id}/skip
```
- In `"loop"` mode: advances stream playout by updating in-memory supervisor offset.
- In `"scheduled"` mode: manual skip is disabled because playout is tied to wall-clock time. Returns:
  ```http
  HTTP/1.1 409 Conflict
  Content-Type: application/json
  ```
  ```json
  {
    "error": "skip_unavailable"
  }
  ```

---

### 7. EPG Items `kind` Field
```http
GET /api/v1/channels/{id}/epg?count={1..20}
```

EPG responses include a `kind` discriminator on each item:
- `"programme"`: Active or scheduled media broadcast from the channel.
- `"slate"`: Idle fallback card broadcast during schedule gaps or short slot remainders.

#### Example Response
```json
{
  "channel_id": 1,
  "generated_at": "2026-10-18T11:45:00Z",
  "idle": false,
  "items": [
    {
      "kind": "slate",
      "media_id": 0,
      "title": "Siaran Segera Kembali",
      "start_at": "2026-10-18T11:00:00Z",
      "end_at": "2026-10-18T12:00:00Z",
      "duration_sec": 3600,
      "is_current": true
    },
    {
      "kind": "programme",
      "media_id": 5,
      "title": "news_bulletin",
      "start_at": "2026-10-18T12:00:00Z",
      "end_at": "2026-10-18T13:00:00Z",
      "duration_sec": 3600,
      "is_current": false
    }
  ]
}
```

---

## Analytics API

Protected routes requiring authentication (`tvs_session` cookie).

### 1. Live Analytics
Retrieves total real-time viewers and channel-by-channel concurrency and playout health.

```http
GET /api/v1/analytics/live
```

#### Response (200 OK)
```json
{
  "total_viewers": 12,
  "channels": [
    {
      "channel_id": 1,
      "viewers": 8,
      "restarts": 0,
      "last_error": ""
    },
    {
      "channel_id": 2,
      "viewers": 4,
      "restarts": 1,
      "last_error": "exit status 1"
    }
  ]
}
```

---

### 2. Timeseries Analytics
Retrieves aggregated audience metrics (viewers peak, outbound bytes, watch time in seconds) across a time range.

```http
GET /api/v1/analytics/timeseries?range={1h|24h|7d|30d}&channel_id={id}
```

#### Query Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| `range` | string | No | Aggregation window: `"1h"`, `"24h"`, `"7d"`, `"30d"`. Defaults to `"24h"`. |
| `channel_id` | integer | No | Filter by specific channel ID. If omitted or 0, aggregates across all channels. |

#### Response (200 OK)
```json
{
  "range": "24h",
  "points": [
    {
      "ts": "2026-10-18T12:00:00Z",
      "viewers_peak": 10,
      "bytes_out": 5242880,
      "watch_sec": 600
    }
  ]
}
```

---

### 3. Top Media Analytics
Retrieves top watched media items ranked by total watch time in seconds within the requested range.

```http
GET /api/v1/analytics/top-media?range={1h|24h|7d|30d}
```

#### Query Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| `range` | string | No | Window duration: `"1h"`, `"24h"`, `"7d"`, `"30d"`. Defaults to `"24h"`. |

#### Response (200 OK)
```json
{
  "items": [
    {
      "media_id": 5,
      "title": "news_bulletin",
      "watch_sec": 3600
    }
  ]
}
```

---

### 4. Realtime SSE Events
The event stream (`GET /api/v1/events`) emits viewer updates and channel health notifications:

- `event: viewers.update`: Emitted every ~5 seconds. `channel_id: 0` represents total viewers across all channels, while `channel_id > 0` represents per-channel viewers. `data: {"viewers": N}`.
- `event: channel.health`: Emitted when restart count increments or process fails. `data: {"restarts": N, "last_error": "..."}`.
- `event: snapshot`: Initial SSE snapshot includes `viewers`, `restarts`, and `last_error` on each channel status item.

