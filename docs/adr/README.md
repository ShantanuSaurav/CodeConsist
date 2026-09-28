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
| [0007](0007-tracks-learning-modes-admin.md) | Language tracks, Learn/Practice modes, server-side Judge0 and the admin console |
| [0008](0008-settings-store-and-activity-log.md) | One settings store for every learning rule; a daily activity log in the learner's own time zone |
| [0009](0009-units-and-celebrations.md) | Units over lessons, a server-paid perfect-unit bonus, CSS celebrations, tiered badges and a level curve that never lowers a level |
| [0010](0010-habits-and-time-zones.md) | A chosen daily goal, a raw-stored streak with freezes and repair derived by one shared engine, days in the learner's own time zone, in-app reminders |
| [0011](0011-feedback-and-review.md) | Wrong answers explained without giving the answer away, an attempt budget, missed questions coming back at the end of the unit with a capped score, Learn mode on every lesson, admin notes on built-in questions stored against a basis, server-priced Practice sessions on a derived review schedule, and admin teaching cards |
