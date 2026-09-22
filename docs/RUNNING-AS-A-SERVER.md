# Running this laptop as the CodeConsist server

The site's frontend is hosted on Vercel. Its `vercel.json` rewrites every
`/api/*` request to an ngrok domain that points at **this laptop**, so the
laptop is the backend: the database, the code runner, payments, the AI
assistant and the admin console all live here.

This folder (`ops/`) makes that arrangement survive a reboot, a crash and a
closed lid, instead of depending on a terminal window someone left open.

## What gets installed

`ops\install.ps1` registers three Windows scheduled tasks and adjusts the
mains-power settings. Nothing else on the machine is touched.

| Task | When it runs | What it does |
|---|---|---|
| `CodeConsist Server` | at logon | Builds if the sources changed, then runs `node server/index.js` and restarts it if it exits (`ops\server.ps1`). |
| `CodeConsist Tunnel` | at logon | Waits for the API, then keeps the ngrok tunnel up (`ops\tunnel.ps1`). |
| `CodeConsist Backup` | daily 03:00, and at logon | Copies `server\data\db.json` into `ops\backups`, keeping the newest 30 (`ops\backup-db.ps1`). |

Power settings, **on mains only**:

- never sleep, never hibernate, disks stay awake
- the screen still turns off after 15 minutes (that costs nothing and saves the panel)
- closing the lid does nothing — **if** this machine exposes that setting. It does not,
  so set *"Closing the lid: Do nothing (plugged in)"* yourself in Control Panel →
  Power Options if the laptop sleeps when you shut it.

Battery settings are deliberately left alone. A laptop that refuses to sleep
on battery is a laptop that overheats in a bag.

## Install

Open PowerShell in the repo and run:

```
powershell -ExecutionPolicy Bypass -File ops\install.ps1
```

Then stop any `npm run dev` you have going — the task serves the **built** app
on the same port, and two servers cannot share it. Start the tasks without
rebooting:

```
powershell -ExecutionPolicy Bypass -File opsstart.ps1
```

Use that rather than `Start-ScheduledTask` directly. Starting a task that is
**already running** does not quietly do nothing — it ends the instance that was
serving. `start.ps1` checks the state first and leaves a healthy server alone.

## Check it

```
powershell -ExecutionPolicy Bypass -File ops\status.ps1
```

It reports each task, whether the port is listening, what `/api/health` says,
whether ngrok is alive, whether **the public domain actually reaches this
machine**, how old the newest backup is, and the tail of each log. The public
check is the one that matters: everything else can look healthy while the
hosted site still has no backend.

## Deploying a change

The task serves `dist/`, so a source edit is not live until it is built. The
supervisor rebuilds automatically when it starts and finds `src/` newer than
`dist/`, so the simplest deploy is:

```
powershell -ExecutionPolicy Bypass -File opsstop.ps1
powershell -ExecutionPolicy Bypass -File opsstart.ps1
```

Or build first and restart only the API:

```
npm run build
powershell -ExecutionPolicy Bypass -File opsstop.ps1
powershell -ExecutionPolicy Bypass -File opsstart.ps1
```

A server-only change (anything under `server/`) needs no build — just restart
the task.

## Stopping

```
powershell -ExecutionPolicy Bypass -File opsstop.ps1
```

To remove everything and put the power settings back:

```
powershell -ExecutionPolicy Bypass -File ops\uninstall.ps1
```

Logs and backups are left on disk — they are data, and uninstalling is not a
reason to throw them away.

## Where things are

- `ops\logs\server-supervisor.log` — what the supervisor did (starts, exits, restarts)
- `ops\logs\server.log` / `server.err.log` — the API's own output
- `ops\logs\tunnel-supervisor.log`, `tunnel.log` — the tunnel
- `ops\logs\backup.log` — backups
- `ops\backups\db-*.json` — the database copies
- `ops\tunnel.config.json` — the reserved domain and port, if either ever changes

Logs roll over at 5 MB and keep three older copies, so they cannot fill the disk.

## If the tunnel check fails

`status.ps1` can report the public domain as DOWN with an SSL or handshake
error. Nine times out of ten that is **not** the tunnel: it is the API
restarting underneath it. While `npm run dev` was running, its file watcher
bounced the server every few seconds, and every request that arrived during a
bounce failed at the TLS layer with `schannel: failed to receive handshake` —
which reads like a network problem and is not one. Once the server was running
under the task and staying up, the same check passed immediately.

So when the public check fails, look at the API first:

- Is `ops\logs\server-supervisor.log` full of restarts? Fix that; the tunnel
  will follow.
- ngrok's own agent, at <http://127.0.0.1:4040/api/tunnels>, shows whether the
  tunnel is registered and how many requests it has served.
- Open the Vercel site from a phone on mobile data — a genuinely outside path.

The supervisor now watches for this itself. ngrok can keep running long after
its link to the edge has died — the process never exits, so only a real
request notices. Every `watchdogMinutes` (default 2) the supervisor fetches
`/api/health` through the public domain, and after `watchdogFailures` misses
in a row (default 3) it restarts ngrok. Both live in `ops	unnel.config.json`;
set `watchdogMinutes` to 0 to turn it off. The thresholds are slack on purpose —
restarting a working tunnel over one lost request would be worse than the bug.

**Only one ngrok session at a time.** The free plan allows a single agent, so
if you start ngrok by hand the task will find it, say so in its log, and step
aside rather than fight it. Stop the manual one if you want the task to own
the tunnel.

## The honest limits of a laptop server

Worth knowing before anyone depends on this:

- **It is only up when the laptop is up.** Shut down, no Wi-Fi, a hotel
  network that blocks outbound — the site has no backend. There is no second
  machine to fail over to.
- **The laptop must stay logged in.** The tasks run as your user. After a
  reboot, the server does not come back until someone logs in. Running Node
  and ngrok as real Windows services would fix that, and is the natural next
  step if this becomes serious.
- **The ngrok free tunnel has limits** — bandwidth caps and a domain tied to
  that ngrok account. If the account changes, update `ops\tunnel.config.json`
  **and** the rewrite in `vercel.json`.
- **`db.json` is the only copy of everything** — every learner account, their
  progress and saved code, every order and certificate. The backups in
  `ops\backups` are on the same disk, so they survive a mistake but not a dead
  drive. Copy them somewhere else periodically.
- **The admin console is reachable from the internet** through the tunnel, at
  `/admin`. It is protected by the separate admin password, but it is exposed
  — keep that password strong, and remember `.env` on this machine holds live
  Razorpay and OAuth credentials.

For anything beyond a side project, a small cloud VM removes the first three
of those in one step.
