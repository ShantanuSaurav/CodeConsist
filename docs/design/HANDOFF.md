# CodeConsist redesign — current handoff

Updated: 5 October 2026.

## Where the work is

- **Working tree:** `C:/Users/KIIT0001/Desktop/Devlingo-redesign`.
- **Branch:** `redesign`; HEAD `ebf5736` (`Redesign phase 2: design system`).
- **Current work:** uncommitted UI implementation for phases 3–9 plus verification work for phase 10. Include new/untracked source and documentation when reviewing or transferring it.
- **Preview:** `http://localhost:3200`; isolated API at port 4100 from `C:/Users/KIIT0001/Desktop/Devlingo-dev`.
- **Live checkout:** `C:/Users/KIIT0001/Desktop/Devlingo-merged`. Do not edit, build, run or deploy there; ports 3000/4000 are live.
- Historical audit/prompts are under the live checkout's `docs/design`, read-only. The current progress record is **this worktree's `docs/design/REMAINING-PHASES.md`**, which supersedes historical “waiting for Phase 2” status text.

## What exists now

The existing application has a floating header/icon rail/mobile sheet; a five-story landing page; redesigned dashboard, learning path, challenge library, article index/reader, connected roadmap nodes, dark/resizable playground, achievements and leaderboard; grouped account screens, split authentication, onboarding and updated admin shell/tables. Phase 2 tokens/primitives are reused. No mock backend or replacement learning/execution engine was introduced.

Only new routes: `/dashboard/articles` and the `/articles` redirect. No existing route was removed. No server/platform/schema/package changes were made in phases 3–10. Every previously supported admin destination stays present.

## Verification status

- Full check passed: **92 test files / 1,524 tests**, TypeScript, import boundaries and content checks.
- Final production build and distribution guard passed: **180.12 kB gzipped shell, budget 195 kB**. The full check was rerun successfully after the last source changes.
- 108 guest-route/light-dark/viewport overflow checks passed across six requested widths; 12 additional challenge-layout checks passed after the last mobile refinement.
- Real JS execution, web iframe/console, article search/contents, roadmap drawer, navigation focus and auth modal fit were checked.
- **Not release-complete:** authenticated admin/learner screens, checkout busy states, valid-certificate print and OAuth/reset happy paths still require owner-assisted testing. Reduced-motion guard was source-reviewed, not runtime-emulated.

## Next action

Finish protected browser QA, not a new redesign. The owner offered to sign into the isolated preview, but the observed admin tab remained at `/admin/login`. Ask them to complete sign-in if needed; do not request passwords in chat, invent a session, remove guards or copy production tokens.

Review admin dashboard, users, billing, languages, stages/units, challenges, analytics, rules/site-copy/access/onboarding, teaching, answer feedback, leagues, Excel, audit log and security. Begin read-only. Verify mobile focus/scroll behavior and representative dialogs. Do not save settings, reset/delete data, change credentials, run imports, charge payments or close/reset leagues just to populate a screenshot.

Then review a real isolated learner account's Settings and purchase/certificate states. Document unavailable services or data honestly. Keep content, progress, auth and execution contracts unchanged.

## Copy-paste continuation prompt

```text
Continue the CodeConsist (formerly Devlingo) premium UI redesign from its existing implementation. Do not rebuild it.

Work only in C:/Users/KIIT0001/Desktop/Devlingo-redesign, branch redesign. Read AGENTS.md, docs/design/HANDOFF.md and docs/design/REMAINING-PHASES.md, then inspect git status and the current diff, including untracked files. HEAD ebf5736 contains Phase 2; phases 3–9 already exist as uncommitted UI changes. Do not discard or duplicate them.

Use preview localhost:3200 with the isolated Devlingo-dev API on 4100. Never touch the live Devlingo-merged checkout or ports 3000/4000. Do not commit, merge, push or deploy without a new explicit request.

First finish Phase 10 acceptance checks: owner-assisted authenticated admin and learner screens, mobile dialogs, purchase busy states and valid certificate print if real dev data exists. The last admin preview was signed out. Have the owner sign in directly; do not ask for secrets in chat or bypass auth. Use read-only review first; do not make payments, destructive changes or credential changes for QA.

Preserve all routes, backend calls, auth, admin-editable copy, progress/streak/XP, units/stage gates, real challenge grading, playground drafts and iframe sandboxing. Keep CodeConsist branding and Phase 2 design tokens. Orange is brand/current/progress, violet is interactive/focus, green is completion. Use CSS/lightweight existing primitives, no new heavy libraries or fake data.

Fix only confirmed UI regressions. Run npm run check, npm run build, node scripts/check-dist.mjs and git diff --check. Shell must stay <=195 kB gzipped. Update REMAINING-PHASES.md with files changed, findings, exact test results, untested checks and next steps. Update HANDOFF.md and the relevant phase prompt after finishing. Distinguish implemented, tested and release-ready; don't claim protected QA passed without observing it.
```

## Switching to an assistant without local filesystem access

Provide the current source and these Markdown files, including untracked files. Exclude `.env*`, database files, tokens, logs containing secrets, `node_modules`, `.git` internals and build output. A historical Phase 2 ZIP alone does not contain the uncommitted redesign. Do not share credentials or private account data to make a UI review possible.

## Integration

The UI is already wired into this worktree; there is no additional `main.tsx` integration step. Finish acceptance review, inspect all changed/new files, and authorize a checkpoint commit before discussing deployment. Never manually copy only `App.tsx` or a single CSS file into the live checkout.
