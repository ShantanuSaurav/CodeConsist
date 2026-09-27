# 0009 - Units, celebrations, badge tiers and the retuned level curve

## Context

A stage is 16-23 lessons and a stage test. Taken in one sitting it has no
natural stopping point and no reward until the test, and the only
celebration was 70 confetti particles on every solve - re-solves that paid
nothing included. Badges were fixed milestones with no sense of "how far to
the next one", and the level curve (`50·(L-1)·L`) put the top rank at 19,000
XP, more than all the free content is worth.

## Decision

1. **Units are a view over lessons, never a store of progress.** A stage's
   lessons are grouped into units of about five (`settings.units`), each a
   node on the path with its own end screen. A unit is *done* when every
   lesson in it is solved - derived from `completedChallenges` every time -
   so regrouping can never lose or grant progress.
   - The default grouping splits the lessons into runs by batch letter
     (`stage-3-a04` is in run `a`; admin-written questions are run `x`),
     cuts each run into `max(ceil(n/maxSize), round(n/targetSize))`
     balanced chunks and folds a small trailing chunk into the unit before.
     Ids are `${stageId}:${letter}${k}`. The grouping is cut from every
     lesson of the stage, hidden ones included, and then resolved against
     the visible ones, so hiding a question shrinks its own unit and no
     other lesson moves; default units are numbered by place ("Unit 2").
     The real bank gives 46 units: four per core stage, three for C and C++.
   - An admin may regroup a stage (`contentOverrides.units[stageId]`,
     Stages > Units). Every lesson - hidden ones too - must be in exactly one
     unit; new units get `${stageId}:m<n>` from a counter that only goes up.
     Leftovers (a question written after the grouping was saved) join a
     trailing `${stageId}:auto` unit rather than disappearing.
   - The grouping is resolved by one pure function
     (`src/platform/progress/units.ts`) in both runtimes. The server resolves
     it against the lessons learners see and sends it with `/api/content`;
     the browser caches it (`cq-unit-defs-v1`) for offline and bundled
     content, else uses the default.
   - Units are taken in order, like the lessons inside them. The stage test
     stays outside every unit and unlocks when all lessons are solved.
2. **The perfect-unit bonus is paid by the server, once.** A bonus
   (`units.perfectBonusXp`) is paid only when a *first* solve completes a unit
   whose id is not in `progress.unitsCompleted`, and every lesson in it has
   `attempts === 1` (and no hint while `perfectRequiresNoHints`). A guest
   merge pays only for units the newly merged ids complete. The bonus is part
   of the day's XP (`DayRecord.perfectBonusXp`, `units`); `awardedXp` keeps
   meaning solve XP. `unitsCompleted` records that the bonus was (or was not)
   paid - it is not what makes a unit done.
3. **Celebrations are settings and CSS.** Confetti only for a solve that paid
   (`celebrations.confetti`), a unit end screen with an XP count-up
   (requestAnimationFrame), accuracy, active time, the streak flame and new
   badges, and a full-screen level-up dialog. No animation library:
   framer-motion stays unused, reduced motion is a CSS media query, and the
   end screen is a lazy chunk. Sounds are synthesized WebAudio tones behind a
   per-learner switch (`users[].preferences.soundOn`, `PATCH
   /api/me/preferences`), resolved account → this browser → default.
   While a run is on screen, toasts are held (`celebrateOrHold` in the
   session): the end screen announces the run's badges and level, so the
   held toasts are dropped once it is reached and shown only when the run is
   closed before it (a level crossed then gets its "Level N reached!" toast).
   With `levelUpOverlay` off the end screen shows the level as a line. The
   last question's Finish waits for the run's solves to land, so the end
   screen's XP and confetti are decided on what the solves actually paid.
4. **Badges are tiered families.** `settings.badges.families` turns a metric
   (best streak, solves, units, perfect units, XP, stage tests) into tiers
   named from `tierNames`; ids stay `${family}-${n}`, so `streak-3` and
   `solved-10` are the badges learners already had. Perfect units count the
   recorded completions *and* units perfect by their attempts, so a replay
   never takes a badge away. The badge watcher re-reads what is earned when
   the settings revision changes, so an admin's edit never bursts toasts.
5. **The retuned curve never lowers a level.** The default thresholds keep
   levels 1-10, then add 900 XP per level (level 20 at 13,500), which is below
   the old formula at every level; a property test proves
   `levelFromXp(x, retuned) >= levelFromXp(x, formula)` for 0-100,000 XP. The
   top rank is now reachable with the free content alone.
   A default changed in code does not bump the settings revision, so the
   browser's settings cache (`cq-settings-v1`) is tagged with a fingerprint
   of the build's defaults and ignored under other defaults, and the
   `GET /api/settings` ETag is `"r<revision>-<fingerprint of the rules>"`
   rather than the revision alone - otherwise a browser that cached the old
   curve would keep it (its revision still matches, and a revalidation would
   get a 304).

## Consequences

- `SCHEMA_VERSION` 4: `contentOverrides.units`, the full preferences shape
  on every user, and a lazily filled `progress.unitsCompleted`. No progress
  row is rewritten at load.
- A regrouping can move a learner back to an earlier unit (their solved
  lessons stay solved) and a new unit id can pay one bonus - bounded by the
  number of units. Changing `targetSize` renames default unit ids; harmless,
  because "done" is derived.
- "Perfect" trusts the attempt count the client reports - the same trust
  level XP pricing already has.
- The optimistic end screen can differ from the server's figures (stale
  rules, a different grouping); the server's answer replaces it, and the
  next restore reconciles anything left.
