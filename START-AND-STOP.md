# Starting and stopping the server

Nothing starts by itself when the laptop turns on. After a restart, run one
command and the Vercel site gets its backend back.

## Start everything (after every restart)

Open PowerShell and run:

```bash
cd C:\Users\KIIT0001\Desktop\Devlingo-merged
```

```bash
powershell -ExecutionPolicy Bypass -File ops\up.ps1
```

It takes about 1–3 minutes and starts, in order:

1. **Docker Desktop** — the engine Judge0 runs in
2. **Judge0** — the sandbox that compiles and runs Java, C and C++
3. **The API server and the ngrok tunnel** — what the Vercel site talks to

Then it checks the whole path. When it ends with

```text
Everything is up. The Vercel site can run JavaScript, Python, HTML/CSS/JS, Java, C and C++.
```

the site is fully working. Running it again when things are already up is
harmless; it only starts what is missing.

## Stop everything

```bash
powershell -ExecutionPolicy Bypass -File ops\down.ps1
```

This stops the API, the tunnel, Judge0 and Docker Desktop. Add `-KeepDocker`
to leave Docker Desktop running (if you use it for something else):

```bash
powershell -ExecutionPolicy Bypass -File ops\down.ps1 -KeepDocker
```

Nothing is deleted. The next `ops\up.ps1` brings the same setup back.

## Check what is running

```bash
powershell -ExecutionPolicy Bypass -File ops\status.ps1
```

Read-only. It shows whether the API, the tunnel and the public URL are working.

## What works while it is stopped

The Vercel site still opens. **JavaScript, Python and HTML/CSS/JS keep working**
because they run in the visitor's browser. **Sign-in, saving progress, and
Java/C/C++ do not** — those need this laptop, so they come back with
`ops\up.ps1`.

The laptop has to stay on and awake for the site's backend to be reachable.
Sleep or shutdown takes it offline.

## If something goes wrong

| What you see | What to do |
|---|---|
| Docker shows **"An unexpected error occurred"** | Click **Quit** — never **"Reset to factory defaults"**, which deletes the 14 GB Judge0 image. Then run `ops\up.ps1` again. The script already clears the leftover files that cause this crash; see "Docker Desktop crashes at launch" in `docs/RUNNING-JAVA-C-CPP.md`. Updating Docker Desktop fixes it for good. |
| `the Docker engine did not come up within 4 minutes` | Open Docker Desktop yourself, wait until it says the engine is running, then run `ops\up.ps1` again. |
| `Judge0 did not answer` | `docker compose -f ops\judge0\docker-compose.yml logs --tail=50 server` |
| `the API did not answer` | Look at `ops\logs\server.err.log` and `ops\logs\server-supervisor.log`. |
| `the public tunnel does not reach the API` | Look at `ops\logs\tunnel.err.log`, then run `ops\status.ps1`. |
| The site says Java/C/C++ **needs setup** | The API cannot see Judge0 — check `JUDGE0_API_URL` and `JUDGE0_AUTH_TOKEN` in `.env`, then run `ops\down.ps1 -KeepDocker` and `ops\up.ps1`. |

## About automatic start

Automatic start at login is **off**, on purpose:

- The **CodeConsist Server** and **CodeConsist Tunnel** scheduled tasks still
  exist (that is how `ops\up.ps1` starts them), but their "at log on" triggers
  are disabled.
- Docker Desktop no longer starts at sign-in.
- Judge0's containers use `restart: unless-stopped`, so they only run after
  `ops\up.ps1` starts them.

The separate **CodeConsist Backup** task (a daily database backup) was left as it was.

Running `ops\install.ps1` again re-creates the tasks **with** automatic start.
To turn it back on without reinstalling, enable the "At log on" trigger of both
tasks in Task Scheduler, and tick "Start Docker Desktop when you sign in" in
Docker Desktop's settings.
