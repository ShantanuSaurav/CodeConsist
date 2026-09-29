# modules/onboarding

**Owns:** the first-run setup at `/welcome` (Phase 5): why the learner is here, their track, how much they already know, a daily goal and a learning mode - in the admin's order and words (the `onboarding` settings section). "Redo setup" in Settings opens it again with the answers filled in (`/welcome?redo=1`).

**Public API (`index.ts`):** `OnboardingPage`.

**Emits:** `assessment:open` (a placement, when the learner chooses one at the end).

**Listens:** nothing.

**Rules (`flow.ts`, pure):** `visibleSteps` (the steps switched on; the goal step only while daily goals are on, the track step only with more than one track), `experienceAction` / `recommendedMode` (what an experience answer leads to), `nextAction` (where Finish leads), `stepAnswered`, `answersToKeep`.

**Does not own:** where the answers are kept or when a learner is sent here (`platform/session`: `completeOnboarding`, `dismissOnboarding`, `needsOnboarding` - never for a learner with progress), the steps' look (`ui` primitives `ChoiceCards`, `TrackChoiceList`, `LearningModeCards`, which the admin preview uses too), or placement itself (`modules/challenges` answers `assessment:open`).
