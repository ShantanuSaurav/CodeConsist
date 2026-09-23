# Running Java, C, C++ and Go

JavaScript and Python work out of the box. JavaScript runs in a sandboxed Node
child process on the server, Python runs in the browser under Pyodide, and
neither needs anything installed.

Java, C, C++ and Go do not, and the Playground says "needs setup" for them.
This page is how you finish that setup.

## Why there is no "just install a compiler" option

This laptop is the production server. `vercel.json` rewrites every `/api/*`
request to an ngrok tunnel that points here, and `POST /api/execute` does not
require a sign-in — anyone on the internet can send it a program.

So the server never compiles or runs submitted source itself. There is no
`gcc` and no `javac` behind `/api/execute`, and there must never be one:
that would be a remote code execution hole with a public URL. Submissions go to
**Judge0**, which exists to run other people's code — each one in its own
`isolate` sandbox, with a CPU limit, a memory limit, no network, and a fresh
filesystem.

There are two ways to get a Judge0. Use the first one.

---

## Option A — Judge0 in Docker on this machine (free)

No account, no API key, no rate limit, and nothing a learner types leaves the
laptop. The stack is `ops/judge0/docker-compose.yml`: the Judge0 server, two
workers, PostgreSQL and Redis, pinned to Judge0 v1.13.1 and published on
`127.0.0.1:2358` only.

Docker Desktop 4.48 (engine 28.5.1) is installed here. The images take about
15 GB of disk once pulled; `judge0/judge0:1.13.1` alone is 14.2 GB.

### A1. cgroups: nothing to change, and why

Judge0 normally enforces its memory limit with **cgroup v1** memory accounting,
and its deployment notes tell you to boot with
`systemd.unified_cgroup_hierarchy=0`. That advice does not apply here, and a
`.wslconfig` kernel flag cannot fix it: Docker Desktop's WSL2 kernel (6.18) is
built **without** the v1 memory controller at all. Check it yourself:

```bash
docker run --rm --entrypoint sh redis:7.2.4 -c "zcat /proc/config.gz | grep MEMCG_V1"
```

`# CONFIG_MEMCG_V1 is not set` means there is nothing to switch on.

So `judge0.conf` turns on `ENABLE_PER_PROCESS_AND_THREAD_TIME_LIMIT` and
`ENABLE_PER_PROCESS_AND_THREAD_MEMORY_LIMIT`. With both on, Judge0 runs
`isolate` without cgroups: CPU time is an `RLIMIT_CPU` per process and memory
an `RLIMIT_AS` (reserved address space) per process. C and C++ keep the 128 MB
`MEMORY_LIMIT`. A JVM reserves far more address space than it uses, so
`server/judge0.js` sends self-hosted Java as a multi-file program whose
`compile`/`run` scripts pass explicit small reservations (`-Xmx256m` and
friends) under a 1,000 MB cap. `MAX_MEMORY_LIMIT` must stay at least 1024000
for that; see `JAVA_MEMORY_LIMIT_KB`.

### A2. Create judge0.conf from the template

`ops/judge0/judge0.conf` holds real passwords, so it is gitignored; the
committed file is `judge0.conf.example`. Copy it and replace `REDIS_PASSWORD`,
`POSTGRES_PASSWORD` and `AUTHN_TOKEN` with three different random strings.
They only matter on 127.0.0.1, but PostgreSQL bakes its password into the data
volume on first boot, so changing it afterwards means deleting the volume and
starting over.

```bash
copy ops\judge0\judge0.conf.example ops\judge0\judge0.conf
```

One way to generate each value:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

`AUTHN_TOKEN` must also go into `.env` as `JUDGE0_AUTH_TOKEN` (step A5).

### A3. Start the stack

Judge0's own deployment procedure brings the database and Redis up first and
waits for them, because the server runs its migrations at boot and fails if
PostgreSQL is not accepting connections yet. Do the same:

```bash
docker compose -f ops/judge0/docker-compose.yml up -d db redis
```

Wait about ten seconds, then start the rest:

```bash
docker compose -f ops/judge0/docker-compose.yml up -d
```

The first run pulls roughly 1.5 GB of images and takes a few minutes. After
that it starts in seconds, and `restart: always` brings it back after a reboot.

### A4. Check it is alive

```bash
curl http://localhost:2358/about
```

A healthy instance answers with JSON naming the version, something like
`{"version":"1.13.1","homepage":"https://judge0.com",...}`.

If the connection is refused, the containers are not up — look at the logs:

```bash
docker compose -f ops/judge0/docker-compose.yml logs --tail=50 server
```

To confirm the sandbox itself works, not just the web layer, submit a one-line
program and read the result back (`wait=true` means the request returns only
once the program has finished):

```bash
curl -s -X POST "http://localhost:2358/submissions?base64_encoded=false&wait=true" -H "Content-Type: application/json" -H "X-Auth-Token: <AUTHN_TOKEN>" -d "{\"language_id\":50,\"source_code\":\"int main(){return 0;}\"}"
```

Every request needs the `X-Auth-Token` header once `AUTHN_TOKEN` is set — a
bare `curl http://localhost:2358/about` answering **401** is the judge working,
not failing. You want `"status":{"id":3,"description":"Accepted"}`. A
`status.id` of 13 ("Internal Error") mentioning cgroups means the two
`ENABLE_PER_PROCESS_AND_THREAD_*` lines are missing from `judge0.conf` (step
**A1**); add them and recreate the containers with
`docker compose -f ops/judge0/docker-compose.yml up -d --force-recreate server worker`.

### A5. Tell the API server about it

Add two lines to `.env` at the project root:

```ini
JUDGE0_API_URL=http://localhost:2358
JUDGE0_AUTH_TOKEN=<the AUTHN_TOKEN from judge0.conf>
```

That is the whole configuration. **Do not set `JUDGE0_API_KEY`** — a key means
"this is a hosted RapidAPI endpoint" and makes the server send `X-RapidAPI-Key`
headers your local instance will not understand.

Then restart the API server so it re-reads `.env` — a server-only change needs
no rebuild, just a stop and a start (see `docs/RUNNING-AS-A-SERVER.md`):

```bash
powershell -ExecutionPolicy Bypass -File ops\stop.ps1
```

```bash
powershell -ExecutionPolicy Bypass -File ops\start.ps1
```

### A6. Confirm end to end

The API server reports what it can actually run:

```bash
curl -s http://localhost:4000/api/health
```

In the `runtimes` object, `java`, `c`, `cpp` and `go` should now read
`{"available":true,"engine":"judge0","label":"Judge0 (self-hosted)"}`. If they
still say `needs Judge0`, the server did not pick up the `.env` change.

Then run an actual program through the app's own route, stdin included:

```bash
curl -s -X POST http://localhost:4000/api/execute -H "Content-Type: application/json" -d "{\"language\":\"java\",\"code\":\"import java.util.*;\\npublic class Main{public static void main(String[] a){Scanner s=new Scanner(System.in);System.out.println(\\\"Hi \\\"+s.nextLine());}}\",\"stdin\":\"world\"}"
```

Expect `{"status":"passed","engine":"judge0","stdout":"Hi world",...}`.

Finally, open the Playground and pick Java. The engine line should name the
self-hosted judge, and the "needs setup" hint should be gone.

### Stopping it

```bash
docker compose -f ops/judge0/docker-compose.yml down
```

Add `-v` to that to delete the PostgreSQL volume as well — which is what you
want if you are changing `POSTGRES_PASSWORD`.

---

## Option B — a hosted Judge0 (RapidAPI)

Worth knowing about, but it is the worse option: it needs an account, it is
rate limited, and every submission — a learner's code — is posted to a third
party rather than staying on this machine.

1. Sign up at [rapidapi.com](https://rapidapi.com/judge0-official/api/judge0-ce)
   and subscribe to **Judge0 CE**.
2. The free "Basic" plan is metered per day. At the time of writing it allows
   **50 submissions a day** across the whole server, which is roughly one
   learner having one session; check the API's pricing page for the current
   number before relying on it. Beyond that the API returns HTTP 429 and the
   Playground reports that it is being rate limited.
3. Put all three values in `.env`:

```ini
JUDGE0_API_URL=https://judge0-ce.p.rapidapi.com
JUDGE0_API_KEY=<your RapidAPI key>
JUDGE0_API_HOST=judge0-ce.p.rapidapi.com
```

Restart the API server. `/api/health` will report the label
`Judge0 (hosted)` so the two setups are never confused for one another.

---

## Troubleshooting

| What you see | What it means |
|---|---|
| Playground still says "needs setup" | `.env` was not re-read. Restart the API server, then check `curl -s http://localhost:4000/api/health`. |
| `JUDGE0_API_URL is not a usable http(s) URL` in the server log | The scheme is missing. It must be `http://localhost:2358`, not `localhost:2358`. |
| `still hold the .env.example placeholder values` in the server log | A `your-...` / `your_...` example value is still in `.env`. A half-filled file counts as unconfigured on purpose. |
| "Judge0 is configured at localhost:2358 but did not answer — is the container running?" | The stack is stopped. `docker compose -f ops/judge0/docker-compose.yml up -d`. |
| "Judge0 ... rejected the API key" | A hosted key that is wrong, expired, or unsubscribed. |
| Submissions return status 13, Internal Error, mentioning cgroups | Step **A1**: the `ENABLE_PER_PROCESS_AND_THREAD_*` lines are missing from `judge0.conf`. |
| The Judge0 server container restarts forever; its log ends in `could not connect to server ... port 5432` | `POSTGRES_HOST=db` / `REDIS_HOST=redis` are missing from `judge0.conf` - Judge0 defaults both to localhost, which inside its container is nothing. |
| Java says "Could not reserve enough space ..." or "unable to create native thread" | The JVM ran under too small an address-space cap. `MAX_MEMORY_LIMIT` in `judge0.conf` must be at least 1024000 (`JAVA_MEMORY_LIMIT_KB` in `server/judge0.js`). |
| Docker Desktop crashes at launch: `remove ...\dockerInference` (or `...\engine.sock`): The file cannot be accessed by the system | A Docker Desktop 4.48 bug on this Windows build: it leaves Unix-socket files that Windows itself cannot delete (even `fsutil` fails). Quit Docker, then **rename** the folder holding the file - `%LOCALAPPDATA%\Docker\run`, `%LOCALAPPDATA%\docker-secrets-engine` - and start Docker again; it recreates them. It recurs on the next Docker start until Docker Desktop is updated. Never pick "Reset to factory defaults": it deletes every image, including the 14 GB judge. |
| Everything works but the tunnel exposes it | It does not: the compose file publishes on `127.0.0.1:2358` only. Keep it that way. |

## Where the code for this lives

- `server/judge0.js` — endpoint classification, headers, stdin, the per-language
  submission (C++17 flag, self-hosted Java as a multi-file program) and result mapping.
- `server/index.js` — the `/api/execute` route and the `runtimes` block of `/api/health`.
- `server/__tests__/execute-judge0.test.mjs` — the above, against a stub judge.
- `ops/judge0/` — the compose file, `judge0.conf.example` (committed) and your
  `judge0.conf` (gitignored, holds the passwords and token).
