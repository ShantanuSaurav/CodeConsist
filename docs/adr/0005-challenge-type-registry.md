# 0005 - Challenge types are a registry

**Status:** accepted (2026-09)

## Context

The practice modal switched on `challenge.type` in six places (renderer
choice, empty answer, completeness, grading, keyboard shortcuts, modal width),
and `checkAnswer.ts` had three more switches. Adding a type meant finding all
of them.

## Decision

`modules/challenges/challenge-types/registry.ts` maps every `ChallengeType` to
a definition: the renderer component and, for answer-style types, how to start
an answer, tell when it is complete, grade it and point at wrong positions;
plus presentation flags (wide modal, draws its own snippet, supports number
keys). `satisfies Record<ChallengeType, …>` makes a missing entry a compile
error. The modal and the helpers read the table.

Server-side grading (`server/index.js` → `gradeAnswer`) is intentionally a
separate, minimal implementation over the shared `platform/grading-engine`
primitives (`checkBlank`, `sameSet`): the server must never trust client code,
and the client-side check is only instant feedback.

## Consequences

- A new type is one definition file, one renderer component and one line in the
  registry. The content schema (`schema.ts`) gains its per-type requirement in
  the same change.
- The four existing renderers did not change; only their dispatch did.
