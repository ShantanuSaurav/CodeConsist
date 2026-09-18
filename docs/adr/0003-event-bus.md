# 0003 - Modules communicate through a typed event bus

**Status:** accepted (2026-09)

## Context

The dashboard needs to open the practice modal. The roadmap drawer needs to
start a stage's lessons. The leaderboard should refresh after a solve; the
achievements screen should announce a new badge. Written as imports, each of
those is an edge between modules, and the graph fills in quickly.

## Decision

`platform/events` exports a typed bus with an explicit event map:

- **Facts** emitted by the session: `challenge:completed`, `stage:completed`,
  `auth:signedIn`, `auth:signedOut`, `progress:reset`, `server:status`.
- **Intents** emitted by anyone, handled by the module that owns the screen:
  `practice:open`, `practice:openTest`, `account:openAuth`, `account:openPro`.
  `intents.openPractice(stageId)` etc. are the one-line helpers.

The challenges module hosts the practice modal and subscribes to
`practice:*`; the account module hosts sign-in/Pro and subscribes to
`account:*`; leaderboard subscribes to `challenge:completed` to refresh;
achievements toasts new badges. None of them imports another.

## Consequences

- A third listener for `challenge:completed` is a new subscriber, not an edit to
  the session.
- Payloads are typed; a wrong shape is a compile error.
- Debuggability: it is one indirection. Every event name is in one file, and
  `eventBus.listenerCount` exists for diagnostics. A listener that throws is
  logged and does not stop the others.
- The bus is in-process and synchronous. It is not a job queue and must not be
  used for anything that needs persistence or ordering guarantees.
