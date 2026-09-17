# Architecture decision records

One page per structural decision: the context, what was decided, and what it
costs. Written so the decision is not relitigated every few months. Add a new
numbered file rather than editing history; supersede with a note.

| # | Decision |
| --- | --- |
| [0001](0001-modular-monolith.md) | Modular monolith: app → modules → platform → ui/types/config |
| [0002](0002-content-registry.md) | One content registry for challenges, roadmaps and articles |
| [0003](0003-event-bus.md) | Modules talk through a typed event bus, never by import |
| [0004](0004-boundary-enforcement.md) | Dependency rules are enforced by a script in `npm run check` |
| [0005](0005-challenge-type-registry.md) | Challenge types are a registry, not a switch |
| [0006](0006-code-splitting-and-async-content.md) | Every screen is a chunk; the content bank loads after the shell paints |
