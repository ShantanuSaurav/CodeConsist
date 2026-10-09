# Production refinement — 9 October 2026

The public home now opens directly into the product story. Its original layered
logo has a staged entrance, subtle floating motion, and pointer tracking that
runs outside React. Tracking is time-based, stops after settling, pauses when
hidden or off-screen, and is disabled for touch and reduced-motion preferences.
Frame rates above 60 FPS are not guaranteed or benchmarked across devices.

## Changes

- Standardized practice/practiced/practicing throughout learner-facing labels,
  article prompts, review messages, streak descriptions, and related admin copy.
- Corrected unsupported landing claims about test formats and lesson duration.
  Exact old built-in copy from a cached or older API response is refreshed;
  custom copy and learning identifiers remain intact.
- Refined desktop and mobile layouts, both themes, keyboard navigation,
  skip-to-content, social metadata, and empty lesson states.
- Primary actions preserve first-run onboarding and returning learner progress.
  Lesson previews stay within unlocked stages of the active track.
- Removed circular imports between the challenge registry and the blank/order
  renderers that surfaced as a loading failure during browser verification.
- Patched proxy-addr, shell-quote, concurrently, and source-map-js. Upgraded
  Vitest to 4.1.11 to remove vulnerable test dependencies, with explicit console
  spy cleanup in the billing tests. The billing idempotency assertion is retained.

## Verification

- Type checking and module-boundary checks passed.
- Content parity, reference-solution execution, expansion verification, content
  lint, article/roadmap validation, and content statistics passed: 834 lessons
  and 12 stage tests. Validation executed 59 JavaScript and 7 Python solutions,
  plus 100 SQL reference solutions and starters against their datasets.
- Final Vitest 4.1.11 run: **104 files, 2,770 tests passed**.
- Production build and distribution checks passed. Initial JavaScript is
  **182.81 KB gzip**, within the 195 KB budget; no source maps are shipped.
- `npm audit` including development dependencies: **zero reported vulnerabilities**.
- Browser checks: desktop/light/dark layouts; 390 px and 320 px mobile layouts;
  no horizontal overflow at 320 px; mobile navigation, Escape dismissal and
  focus restoration; onboarding entry and guest exit; article-to-practice;
  correct-answer grading, XP and next-question unlocking; real JavaScript
  execution in the playground; returning-learner landing state.
- The clean production-preview browser session reported no console errors.

## Release scope

### Glass refinement — October 10, 2026

- Added light and dark frosted surfaces to the landing navigation, logo backing,
  workspace and key cards, with static lighting and restrained blur.
- Included prefixed Safari blur support, opaque fallbacks, reduced-transparency,
  high-contrast and forced-colors handling. Mobile uses a smaller blur and a
  stronger menu tint so underlying hero text does not impair navigation.
- Checked desktop light/dark layouts and 390 px mobile navigation in Chrome:
  no horizontal overflow, Escape dismissal and restored keyboard focus.
- Rebuilt production output and passed the distribution guard: 182.81 KB gzip
  initial JavaScript, with no source maps. This visual-only follow-up did not
  rerun the full test suite recorded above.
- Actual macOS Safari testing and a measured high-refresh-rate performance
  benchmark remain unverified on this Windows environment.

No Git push, remote deployment, or managed API restart was performed. Release
the frontend and updated server dependencies together, restart the deployed API,
and verify live sign-in/OAuth and payment-provider callbacks in that environment.
Those authenticated external flows were not manually exercised here.

Existing non-blocking content warnings remain: C and C++ have no companion
articles, one introductory lesson uses the general variables section, and the
content linter reports similarity between some lesson prompts. The lazy-loaded
challenge bank also remains above Vite's default 500 KB uncompressed chunk warning;
it is not part of the initial JavaScript bundle.
