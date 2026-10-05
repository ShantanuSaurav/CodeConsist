# Phase-by-phase handoff prompts

Updated: 5 October 2026.

These are standalone continuation prompts for ChatGPT, Codex, Claude or another coding assistant with repository access. Each includes safety and verification instructions. **Phases 3–9 are already implemented.** Use these to review/refine a particular phase, not to recreate completed work. Phase 10 still has protected-session acceptance checks; see `HANDOFF.md` and `REMAINING-PHASES.md`.

If the next assistant cannot read the local worktree, provide a sanitized copy of current source and these docs, including untracked files and excluding secrets/databases. Pasting a prompt alone does not transfer code.

## Phase 5 slices

| Slice | Scope | Main location |
| --- | --- | --- |
| 5A | Dashboard / continuation / activity | `src/modules/dashboard` |
| 5B | Learning path / units / placement / tests | `src/modules/challenges/components/LearningPath.tsx`, `pages/LearnPage.tsx` |
| 5C | Challenges / filters / practice presentation | `src/modules/challenges/components/ChallengeLibrary.tsx`, `styles/practice.css` |
| 5D | Roadmaps / nodes / resource drawer | `src/modules/roadmaps` |
| 5E | Articles index / reading / contents | `src/modules/articles` |
| 5F | IDE / execution presentation | `src/modules/playground` |
| 5G | Achievements / leaderboard | `src/modules/achievements`, `src/modules/leaderboard` |

For a single Phase 5 slice, paste its scope into the Phase 5 prompt and explicitly say to work on that slice only.

## Phase 3 — Global shell

```text
Continue Phase 3 of the CodeConsist premium UI/UX redesign.

Work only in C:/Users/KIIT0001/Desktop/Devlingo-redesign on branch redesign. First read AGENTS.md, docs/design/HANDOFF.md and docs/design/REMAINING-PHASES.md; inspect git status and the diff, including untracked files. HEAD ebf5736 contains Phase 2. Later phases already exist as uncommitted implementation: review/refine them, do not start over or discard work.

Use localhost:3200 and the isolated Devlingo-dev API on 4100. Do not touch the live Devlingo-merged checkout or ports 3000/4000. Preserve CodeConsist branding, Phase 2 tokens, module boundaries, all existing routes, auth/API contracts, admin-editable copy and real learning/execution data. No mock data, schema changes, heavy animation dependency, or business-logic rewrite. Orange is brand/current/progress; violet is interactive/focus; green is completion. Keep light/dark and reduced-motion support.

PHASE SCOPE
Review the existing floating header, icon rail, mobile navigation sheet, account/track controls, guest/offline/habit notices and Articles index wiring. Main files: src/app/layout/Navigation.tsx, DashboardLayout.tsx, shell.css, src/app/App.tsx, src/config/routes.ts and src/app/routes/ArticlesRoute.tsx. Preserve the provider order, lazy routes, contentReady gate, practice host and account modals. Existing URLs must keep working; the Articles additions must not replace stage-reader routes.

Check desktop scroll compaction; mobile focus entry, Tab containment, Escape/backdrop dismissal, opener focus restoration, body scroll restoration and resize closure. Verify track switching, theme, account menu, all destinations and skip-to-content. The next phase is landing storytelling review (Phase 4).

After changes, run the focused checks and npm run check, npm run build, node scripts/check-dist.mjs and git diff --check. Keep the shell <=195 kB gzipped. Do not weaken tests. Record exact changed files, reasons, observed checks, warnings, untested states and the next step in REMAINING-PHASES.md. Update HANDOFF.md and this phase's continuation guidance. Never claim a skipped test passed. Do not commit, push, merge or deploy without a new explicit request.
```

## Phase 4 — Landing

```text
Continue Phase 4 of the CodeConsist premium UI/UX redesign.

Work only in C:/Users/KIIT0001/Desktop/Devlingo-redesign on branch redesign. First read AGENTS.md, docs/design/HANDOFF.md and docs/design/REMAINING-PHASES.md; inspect git status and the diff, including untracked files. HEAD ebf5736 contains Phase 2. Later phases already exist as uncommitted implementation: review/refine them, do not start over or discard work.

Use localhost:3200 and the isolated Devlingo-dev API on 4100. Do not touch the live Devlingo-merged checkout or ports 3000/4000. Preserve CodeConsist branding, Phase 2 tokens, module boundaries, all existing routes, auth/API contracts, admin-editable copy and real learning/execution data. No mock data, schema changes, heavy animation dependency, or business-logic rewrite. Orange is brand/current/progress; violet is interactive/focus; green is completion. Keep light/dark and reduced-motion support.

PHASE SCOPE
Review the existing landing implementation, not a new template. Main files: src/modules/landing/pages/Landing.tsx, components/Hero.tsx, ProductStories.tsx, Navbar.tsx, LearningExperience.tsx, Gamification.tsx, Footer.tsx, WelcomeIntro.tsx and styles/premium.css. Keep the real next-challenge preview and current learner data; do not replace them with fictional stats or decorative controls that pretend to run code.

Verify the first-visit intro, Enter/Learn more paths, Start Learning/Explore Roadmaps, all five stories, mobile menu/auth transitions, light/dark, reduced motion and admin-controlled copy. Use restrained CSS motion and large typography. Test desktop and 375/390px layouts. Next is the product experience, Phase 5.

After changes, run the focused checks and npm run check, npm run build, node scripts/check-dist.mjs and git diff --check. Keep the shell <=195 kB gzipped. Do not weaken tests. Record exact changed files, reasons, observed checks, warnings, untested states and the next step in REMAINING-PHASES.md. Update HANDOFF.md and this phase's continuation guidance. Never claim a skipped test passed. Do not commit, push, merge or deploy without a new explicit request.
```

## Phase 5 — Product screens

```text
Continue Phase 5 of the CodeConsist premium UI/UX redesign.

Work only in C:/Users/KIIT0001/Desktop/Devlingo-redesign on branch redesign. First read AGENTS.md, docs/design/HANDOFF.md and docs/design/REMAINING-PHASES.md; inspect git status and the diff, including untracked files. HEAD ebf5736 contains Phase 2. Later phases already exist as uncommitted implementation: review/refine them, do not start over or discard work.

Use localhost:3200 and the isolated Devlingo-dev API on 4100. Do not touch the live Devlingo-merged checkout or ports 3000/4000. Preserve CodeConsist branding, Phase 2 tokens, module boundaries, all existing routes, auth/API contracts, admin-editable copy and real learning/execution data. No mock data, schema changes, heavy animation dependency, or business-logic rewrite. Orange is brand/current/progress; violet is interactive/focus; green is completion. Keep light/dark and reduced-motion support.

PHASE SCOPE
Review the already implemented product redesign in manageable slices: 5A dashboard; 5B Learn and stage/unit gates; 5C challenge library and practice modal; 5D roadmap directory/detail/drawer; 5E articles index/reader; 5F playground; 5G achievements/leaderboard. Each slice has module-scoped styles. Record each slice separately in the progress log.

Use actual session/API data and existing actions. Preserve placement, unit ordering, premium gates, tests, review flow, XP, streaks, pagination/search/filters, manual roadmap status, article hash links, and badge rules. Do not invent locked roadmap states or unlocked achievements. Verify the keyboard panel-width slider and stacked mobile IDE without changing CodeEditor geometry, drafts, compilerService, iframe sandbox, auto-run or console behavior. Test real JS execution and HTML/CSS/JS preview; disclose unavailable language runtimes. Review empty/loading/error states and do not submit answers merely to fill dashboards. Next is account/onboarding, Phase 6.

After changes, run the focused checks and npm run check, npm run build, node scripts/check-dist.mjs and git diff --check. Keep the shell <=195 kB gzipped. Do not weaken tests. Record exact changed files, reasons, observed checks, warnings, untested states and the next step in REMAINING-PHASES.md. Update HANDOFF.md and this phase's continuation guidance. Never claim a skipped test passed. Do not commit, push, merge or deploy without a new explicit request.
```

## Phase 6 — Account and onboarding

```text
Continue Phase 6 of the CodeConsist premium UI/UX redesign.

Work only in C:/Users/KIIT0001/Desktop/Devlingo-redesign on branch redesign. First read AGENTS.md, docs/design/HANDOFF.md and docs/design/REMAINING-PHASES.md; inspect git status and the diff, including untracked files. HEAD ebf5736 contains Phase 2. Later phases already exist as uncommitted implementation: review/refine them, do not start over or discard work.

Use localhost:3200 and the isolated Devlingo-dev API on 4100. Do not touch the live Devlingo-merged checkout or ports 3000/4000. Preserve CodeConsist branding, Phase 2 tokens, module boundaries, all existing routes, auth/API contracts, admin-editable copy and real learning/execution data. No mock data, schema changes, heavy animation dependency, or business-logic rewrite. Orange is brand/current/progress; violet is interactive/focus; green is completion. Keep light/dark and reduced-motion support.

PHASE SCOPE
Review src/modules/account and src/modules/onboarding presentation changes. Existing auth is a split desktop dialog and single-column mobile form; Settings uses only real grouped sections; purchases are one-time unlocks, NOT subscriptions. Keep all field names, validation, auth/reset/OAuth contracts, account mutation handlers, checkout busy guards, certificate security and print semantics, and admin-configured onboarding copy.

The last verification covered guest Settings, sign-in form fit/focus, onboarding's first step and invalid reset/public certificate states. Authenticated learner settings, provider states, purchase history, valid certificate print and OAuth/reset success need owner-assisted QA. Ask the owner to sign in directly; never ask for passwords in chat or manufacture a token. Do not change credentials, reset progress or make purchases for visual testing. Next is admin, Phase 7.

After changes, run the focused checks and npm run check, npm run build, node scripts/check-dist.mjs and git diff --check. Keep the shell <=195 kB gzipped. Do not weaken tests. Record exact changed files, reasons, observed checks, warnings, untested states and the next step in REMAINING-PHASES.md. Update HANDOFF.md and this phase's continuation guidance. Never claim a skipped test passed. Do not commit, push, merge or deploy without a new explicit request.
```

## Phase 7 — Admin

```text
Continue Phase 7 of the CodeConsist premium UI/UX redesign.

Work only in C:/Users/KIIT0001/Desktop/Devlingo-redesign on branch redesign. First read AGENTS.md, docs/design/HANDOFF.md and docs/design/REMAINING-PHASES.md; inspect git status and the diff, including untracked files. HEAD ebf5736 contains Phase 2. Later phases already exist as uncommitted implementation: review/refine them, do not start over or discard work.

Use localhost:3200 and the isolated Devlingo-dev API on 4100. Do not touch the live Devlingo-merged checkout or ports 3000/4000. Preserve CodeConsist branding, Phase 2 tokens, module boundaries, all existing routes, auth/API contracts, admin-editable copy and real learning/execution data. No mock data, schema changes, heavy animation dependency, or business-logic rewrite. Orange is brand/current/progress; violet is interactive/focus; green is completion. Keep light/dark and reduced-motion support.

PHASE SCOPE
Review the existing admin upgrade: src/modules/admin/layout/AdminLayout.tsx, components/ui.tsx, pages/AdminLogin.tsx and styles/admin.css. Keep the practical dense data tables, shared headers, mobile focus trap/scroll lock and all routes/guards/actions. Last observed admin preview was signed out. Have the owner sign in directly at localhost:3200/admin/login; do not bypass guards, copy production sessions or create fake admin data.

Inspect every protected destination read-only: dashboard, analytics, audit log, languages, stages and units, challenges, rules, site copy, onboarding, access, teaching, answer feedback, leagues, users, billing, Excel and security. Check tables/filters, dialogs, keyboard behavior and 375/390px navigation. Do not save settings, issue certificates, import spreadsheets, change credentials, reset leagues or delete users just to test appearance. Log unavailable routes honestly. Next is responsive review, Phase 8.

After changes, run the focused checks and npm run check, npm run build, node scripts/check-dist.mjs and git diff --check. Keep the shell <=195 kB gzipped. Do not weaken tests. Record exact changed files, reasons, observed checks, warnings, untested states and the next step in REMAINING-PHASES.md. Update HANDOFF.md and this phase's continuation guidance. Never claim a skipped test passed. Do not commit, push, merge or deploy without a new explicit request.
```

## Phase 8 — Responsive layouts

```text
Continue Phase 8 of the CodeConsist premium UI/UX redesign.

Work only in C:/Users/KIIT0001/Desktop/Devlingo-redesign on branch redesign. First read AGENTS.md, docs/design/HANDOFF.md and docs/design/REMAINING-PHASES.md; inspect git status and the diff, including untracked files. HEAD ebf5736 contains Phase 2. Later phases already exist as uncommitted implementation: review/refine them, do not start over or discard work.

Use localhost:3200 and the isolated Devlingo-dev API on 4100. Do not touch the live Devlingo-merged checkout or ports 3000/4000. Preserve CodeConsist branding, Phase 2 tokens, module boundaries, all existing routes, auth/API contracts, admin-editable copy and real learning/execution data. No mock data, schema changes, heavy animation dependency, or business-logic rewrite. Orange is brand/current/progress; violet is interactive/focus; green is completion. Keep light/dark and reduced-motion support.

PHASE SCOPE
Review the existing layouts at 1440, 1280, 1024, 768, 390 and 375px in both themes. The previous pass measured zero document overflow across nine guest routes (108 combinations) and rechecked the final challenge rows (12 more). Do not equate these DOM measurements with complete screenshot/device coverage.

Inspect landing, dashboard, learning, challenges, reader contents, roadmap drawers, IDE, achievements, settings, onboarding, auth/checkout and authenticated admin. Use intentional stacked/mobile controls, readable type and touch targets, not hidden functionality or smaller desktop text. Check actual grid placement and long titles, not just scrollWidth. Tailwind utility-layer layout classes override component-layer styles: remove conflicting layout utilities when introducing scoped responsive recipes rather than accumulating !important overrides. Preserve normal window scrolling and fixed dialogs. Next is interaction/accessibility polish, Phase 9.

After changes, run the focused checks and npm run check, npm run build, node scripts/check-dist.mjs and git diff --check. Keep the shell <=195 kB gzipped. Do not weaken tests. Record exact changed files, reasons, observed checks, warnings, untested states and the next step in REMAINING-PHASES.md. Update HANDOFF.md and this phase's continuation guidance. Never claim a skipped test passed. Do not commit, push, merge or deploy without a new explicit request.
```

## Phase 9 — Interaction and state polish

```text
Continue Phase 9 of the CodeConsist premium UI/UX redesign.

Work only in C:/Users/KIIT0001/Desktop/Devlingo-redesign on branch redesign. First read AGENTS.md, docs/design/HANDOFF.md and docs/design/REMAINING-PHASES.md; inspect git status and the diff, including untracked files. HEAD ebf5736 contains Phase 2. Later phases already exist as uncommitted implementation: review/refine them, do not start over or discard work.

Use localhost:3200 and the isolated Devlingo-dev API on 4100. Do not touch the live Devlingo-merged checkout or ports 3000/4000. Preserve CodeConsist branding, Phase 2 tokens, module boundaries, all existing routes, auth/API contracts, admin-editable copy and real learning/execution data. No mock data, schema changes, heavy animation dependency, or business-logic rewrite. Orange is brand/current/progress; violet is interactive/focus; green is completion. Keep light/dark and reduced-motion support.

PHASE SCOPE
Refine only confirmed issues in the implemented UI: focus-visible states, menu/dialog entry and focus return, Escape/Tab behavior, scroll locks, disabled/loading states, empty searches, errors, skeletons, progress, modest hover and opacity transitions. Reuse the existing UI primitives and source helpers; do not add another modal framework or animation library.

The app drawer visibility/focus race, auth/menu focus transition, mobile auth stretching, IDE grid sizing and challenge mobile action layout have already been fixed. Verify rather than undo these fixes. Keep code editor highlight/textarea metrics aligned, current contracts and aria/data-testid names intact. Source-level reduced-motion protection exists; runtime preference emulation was unavailable previously, so verify it if your tools permit. Do not certify full accessibility from a few focus checks. Next is final validation, Phase 10.

After changes, run the focused checks and npm run check, npm run build, node scripts/check-dist.mjs and git diff --check. Keep the shell <=195 kB gzipped. Do not weaken tests. Record exact changed files, reasons, observed checks, warnings, untested states and the next step in REMAINING-PHASES.md. Update HANDOFF.md and this phase's continuation guidance. Never claim a skipped test passed. Do not commit, push, merge or deploy without a new explicit request.
```

## Phase 10 — Final QA and release readiness

```text
Continue Phase 10 of the CodeConsist premium UI/UX redesign.

Work only in C:/Users/KIIT0001/Desktop/Devlingo-redesign on branch redesign. First read AGENTS.md, docs/design/HANDOFF.md and docs/design/REMAINING-PHASES.md; inspect git status and the diff, including untracked files. HEAD ebf5736 contains Phase 2. Later phases already exist as uncommitted implementation: review/refine them, do not start over or discard work.

Use localhost:3200 and the isolated Devlingo-dev API on 4100. Do not touch the live Devlingo-merged checkout or ports 3000/4000. Preserve CodeConsist branding, Phase 2 tokens, module boundaries, all existing routes, auth/API contracts, admin-editable copy and real learning/execution data. No mock data, schema changes, heavy animation dependency, or business-logic rewrite. Orange is brand/current/progress; violet is interactive/focus; green is completion. Keep light/dark and reduced-motion support.

PHASE SCOPE
Finish verification of the current implementation rather than starting another redesign. Begin with the outstanding owner-assisted authenticated admin and learner checks in HANDOFF.md. Then inspect every major route and relevant states in both themes and all six requested widths. Test existing navigation, search/filter, practice entry/gates, roadmap status, reader links and real playground execution. Check signed-in Settings/purchases/certificate print only with legitimate dev data. Never bypass auth, use fictional analytics, perform payments or make destructive changes for a screenshot.

Run all automated gates and record exact results, shell budget, existing warnings and any failures. Last complete run: 92 test files/1,524 tests, boundaries across 381 files, successful production build, 180.12 kB gzipped shell versus 195 kB. Re-measure rather than copying those figures blindly. Separate implemented, browser-tested and release-ready. No production integration is authorized. After QA, provide a reviewed diff summary and integration recommendation; the owner must explicitly approve any commit/merge/deployment. Keep a resume prompt for any genuinely unfinished check.

After changes, run the focused checks and npm run check, npm run build, node scripts/check-dist.mjs and git diff --check. Keep the shell <=195 kB gzipped. Do not weaken tests. Record exact changed files, reasons, observed checks, warnings, untested states and the next step in REMAINING-PHASES.md. Update HANDOFF.md and this phase's continuation guidance. Never claim a skipped test passed. Do not commit, push, merge or deploy without a new explicit request.
```

## Required end-of-phase Markdown entry

```markdown
### Phase [number] — [scope] — [date]
Status: [implemented / verified / waiting on named check]
- Changed files:
- What changed and why:
- Existing functionality preserved:
- Checks actually run and exact results:
- Current shell gzip size:
- Browser routes/themes/widths observed:
- Warnings, limitations and checks NOT run:
- Next phase or acceptance check:
- Updated continuation prompt location:
```

No phase entry should contain credentials, access tokens or private account records.
