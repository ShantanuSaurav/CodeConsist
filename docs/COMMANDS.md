# CodeConsist — every command you need

One page. Run everything from the repo root:
`C:\Users\KIIT0001\Desktop\Devlingo-merged`

PowerShell scripts are run the same way every time, so the shape is always:

```
powershell -ExecutionPolicy Bypass -File ops\<script>.ps1
```

---

## 1. The short list

| I want to… | Command |
|---|---|
| Start the live server + tunnel | `powershell -ExecutionPolicy Bypass -File ops\start.ps1` |
| Stop them | `powershell -ExecutionPolicy Bypass -File ops\stop.ps1` |
| Check everything is up | `powershell -ExecutionPolicy Bypass -File ops\status.ps1` |
| Watch the request log | `powershell -ExecutionPolicy Bypass -File ops\logs.ps1` |
| Develop (without touching live) | `powershell -ExecutionPolicy Bypass -File ops\dev.ps1` |
| Back up the database now | `powershell -ExecutionPolicy Bypass -File ops\backup-db.ps1` |
| Run all the checks | `npm run check` |

If you only remember one: **`ops\status.ps1`**. It is read-only and tells you what is broken.

---

## 2. Live server (the one Vercel talks to)

### First time only — install

```
powershell -ExecutionPolicy Bypass -File ops\install.ps1
```

Registers three scheduled tasks (**CodeConsist Server**, **CodeConsist Tunnel**, **CodeConsist Backup**) and stops the laptop sleeping *while on mains*. Battery behaviour is deliberately left alone. Safe to run again.

After this, **the server starts by itself every time you log in.** You do not normally start it by hand.

### Start / stop

```
powershell -ExecutionPolicy Bypass -File ops\start.ps1
```
```
powershell -ExecutionPolicy Bypass -File ops\stop.ps1
```

> **Do not use `Start-ScheduledTask` directly.** Run against a task that is *already running*, it kills the running instance — that is how the server went down once. `start.ps1` checks the state first.

`stop.ps1` leaves the tasks installed, so they come back at the next logon.

### The server window

The API runs in **its own visible window** with the request log scrolling, like `npm run dev` used to:

```
[23:49:43] GET     /api/health                    200 45ms (::1)
```

Closing that window **stops the server** — it is the real process. Minimise it instead. If you close it by accident, `ops\start.ps1` brings it back.

---

## 3. Development, beside the live server

```
powershell -ExecutionPolicy Bypass -File ops\dev.ps1
```

| | live | dev |
|---|---|---|
| API | `localhost:4000` | `localhost:4001` |
| web | served from `dist/` | `localhost:3000` (Vite) |
| database | `server\data\db.json` | `server\data-dev\db.json` |

Separate databases on purpose: your test signups must never land where real users are. The first run copies the live file so you start from realistic content, then the two drift apart.

Ctrl+C stops it. **The live server is never touched.**

Start from a clean database instead of a copy:

```
powershell -ExecutionPolicy Bypass -File ops\dev.ps1 -Empty
```

Different port if 4001 is taken:

```
powershell -ExecutionPolicy Bypass -File ops\dev.ps1 -ApiPort 4002
```

### Plain npm (no live server running)

```bash
npm run dev
```

Only use this when the live task is stopped — it wants the same port 4000.

---

## 4. Logs

```
powershell -ExecutionPolicy Bypass -File ops\logs.ps1
```

Follows the request log live. Ctrl+C stops watching; it never touches the server.

| Command ending | Shows |
|---|---|
| `ops\logs.ps1` | every request the API answered |
| `ops\logs.ps1 -Which server` | starts, builds, crashes, restarts |
| `ops\logs.ps1 -Which tunnel` | the tunnel and the watchdog's verdicts |
| `ops\logs.ps1 -Which errors` | stderr from the API, tunnel and build |
| `ops\logs.ps1 -Which backup` | database backups |
| `ops\logs.ps1 -Which all` | all of the above, tagged by file |
| `ops\logs.ps1 -Tail 100` | last 100 lines first, then follow |
| `ops\logs.ps1 -NoFollow` | print and exit |

Files live in `ops\logs\`. Tokens and secrets are masked before anything is printed.

---

## 5. Checks before you push

```bash
npm run check
```

Runs typecheck → module boundaries → content parity → content validation → content lint → extras → tests. That is the one to run.

Individually, when you want a faster loop:

```bash
npm run typecheck
```
```bash
npm run test
```
```bash
npm run test:watch
```
```bash
npm run lint:boundaries
```
```bash
npm run content:validate
```

Build the production bundle (the live server does this itself when sources are newer than `dist/`):

```bash
npm run build
```

---

## 6. Database backups

Runs daily at 03:00 and again at logon. To take one now:

```
powershell -ExecutionPolicy Bypass -File ops\backup-db.ps1
```

Copies `server\data\db.json` into `ops\backups\`, keeping the last 30 — and only when the contents actually changed, so a quiet week does not flush the real history out of the window. Keep more:

```
powershell -ExecutionPolicy Bypass -File ops\backup-db.ps1 -Keep 60
```

`db.json` is **every account, all progress, saved code, orders and certificates.** There is no other copy. `.env` is deliberately *not* backed up — it is secrets, and a copy lying around is a second place to leak from.

To restore: stop the server, copy the chosen `ops\backups\db-*.json` over `server\data\db.json`, start again.

---

## 7. Tunnel

The public domain is in `ops\tunnel.config.json`. Vercel rewrites `/api/*` to it (`vercel.json`), so when the tunnel is down the hosted site has no backend.

Restart just the tunnel:

```
powershell -ExecutionPolicy Bypass -Command "Stop-ScheduledTask -TaskName 'CodeConsist Tunnel'; Start-ScheduledTask -TaskName 'CodeConsist Tunnel'"
```

Set the ngrok auth token (once, ever):

```bash
npx ngrok config add-authtoken YOUR_TOKEN
```

> The free tunnel **dips for 1–4 minutes at a time**. The watchdog checks every 2 minutes and restarts ngrok after 3 failures in a row. A single `[DOWN]` from `status.ps1` is not an outage — check `ops\logs\server-supervisor.log` first, because a restarting *API* looks exactly the same from outside.

---

## 8. Remove everything

```
powershell -ExecutionPolicy Bypass -File ops\uninstall.ps1
```

Removes the three tasks, stops what they started, restores the power settings. Logs and backups are left alone — they are data.

---

## 9. When something is wrong

1. `ops\status.ps1` — start here, always.
2. Nothing on port 4000 → `ops\start.ps1`.
3. Port open but health silent → `ops\logs.ps1 -Which server` for the crash.
4. Local fine, public `[DOWN]` → tunnel; see §7.
5. Server window vanished → somebody closed it; `ops\start.ps1`.
6. Two servers fighting → a stray `npm run dev` owns port 4000. Stop it; the supervisor refuses to be the second server and exits quietly.
7. The laptop must **stay logged in**. These tasks run as you, so a locked screen is fine but a logout is not.

---

## 10. Still outstanding

`APP_ORIGIN` in `.env` is `http://localhost:3000`. **In production that sends real users signing in with Google or GitHub back to localhost.** It needs your Vercel URL, and the same URL has to be registered as a redirect URI in Google Cloud Console and GitHub Developer Settings.

Until that is done, OAuth works on your machine and nowhere else.
