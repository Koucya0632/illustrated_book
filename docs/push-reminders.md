# Daily study reminder (push)

Sends one APNs push per day to users who **haven't studied yet today**, at a
**user-chosen time in each user's own timezone**: _"今天還沒學 — 花兩分鐘練幾張…"_.

## User controls (Settings → 提醒)

- **每日提醒** — on/off toggle (`user_settings.reminder_enabled`).
- **提醒時間** — hour + minute, minute in **15-minute steps** (0/15/30/45),
  stored as `reminder_hour` / `reminder_minute`. Default **20:00**.

Both write through the normal settings sync (`POST /api/users/settings`).

## How it works

1. **iOS** asks for notification permission (`PushPermissionView`), then uploads
   its APNs device token **and its IANA timezone** to
   `POST /api/users/push-token`. The token is re-sent on every cold launch
   (APNs rotates it), so the stored timezone stays current.
2. The token + timezone live in `user_push_tokens` (one row per device); the
   reminder time + enabled flag live in `user_settings`.
3. **`/api/cron/daily-reminder` runs every 15 min** (`vercel.json`). Each run it
   selects, per user, their most-recently-updated device and checks:
   - reminders are **enabled**, **and**
   - the current local time matches the user's **chosen hour** and **15-min
     minute-bucket** in that device's timezone, **and**
   - there is **no `study_logs` row since local midnight**, **and**
   - they have **not** already been reminded for this local date.
   Matches get one APNs alert. After a successful send, a
   `(user_id, local_date)` row is written to `user_daily_reminders` so nobody
   is reminded twice for the same day. (Users with no `user_settings` row fall
   back to enabled / 20:00 via `COALESCE`.)
4. Tokens APNs reports as permanently dead (`410 Unregistered`,
   `BadDeviceToken`, …) are deleted automatically.

Why 15-minute steps: the cron fires at :00/:15/:30/:45 and buckets the current
minute down to the nearest 15, so the chosen time fires within ~1 minute of the
bucket boundary. Finer granularity would need a more frequent cron.

Users who tapped **「現在不要」** have no token stored, so they receive nothing
regardless of settings. Turning **每日提醒** off (or revoking iOS notification
permission, or signing out) also stops reminders.

## Required environment variables

Set these in Vercel (Production + Preview as needed):

| Var | What | Example |
| --- | --- | --- |
| `APNS_KEY_ID` | Key ID of the APNs Auth Key (.p8) | `ABC123DEF4` |
| `APNS_TEAM_ID` | Apple Developer Team ID | `9XYZ8WVUTS` |
| `APNS_PRIVATE_KEY` | Full PEM contents of the `.p8` file (newlines or `\n` escapes both accepted) | `-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----` |
| `APNS_BUNDLE_ID` | App bundle id → `apns-topic` header | `app.tuji.ios` |
| `APNS_PRODUCTION` | `true` (default) → api.push.apple.com; `false` → sandbox | `true` |
| `CRON_SECRET` | Shared secret Vercel Cron sends as `Bearer` (already used by partman) | — |

> **Note on `APNS_PRODUCTION`:** App Store / TestFlight builds use the
> **production** APNs host. Only development builds run through Xcode use the
> **sandbox** host. A token registered on one host returns `BadDeviceToken` on
> the other, so match this to how the build was signed.

## Getting the `.p8` Auth Key

1. Apple Developer → Certificates, Identifiers & Profiles → **Keys** → **+**.
2. Enable **Apple Push Notifications service (APNs)**, create, download the
   `.p8` (one-time download). Note the **Key ID**.
3. Team ID is in the top-right of the Developer portal (Membership).
4. Put the three values into the env vars above. The `.p8` contents go into
   `APNS_PRIVATE_KEY` verbatim.

## Vercel cron note

The every-15-min schedule (`*/15 * * * *`) requires a plan that allows
sub-daily crons (Pro+). On the Hobby plan crons are limited to once per day,
which can't serve per-user timezones or arbitrary times — upgrade, or fall back
to a single fixed-timezone hourly/daily schedule if that applies.

## Manual test

```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" \
  https://<your-deployment>/api/cron/daily-reminder
```

Returns `{ ok, candidates, sent, failed, prunedDeadTokens }`. To force a send
outside the 20:00 window, temporarily lower `REMINDER_HOUR` in the route, or
test against a device whose timezone makes it locally 20:00.

## DB objects (added by `scripts/migrate.ts`)

- `user_push_tokens.timezone TEXT NOT NULL DEFAULT 'Asia/Taipei'`
- `user_settings.reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE`
- `user_settings.reminder_hour INT NOT NULL DEFAULT 20`
- `user_settings.reminder_minute INT NOT NULL DEFAULT 0`
- `user_daily_reminders (user_id, reminded_on DATE, PRIMARY KEY (user_id, reminded_on))`
