# modules/admin

**Owns:** the administrator console at `/admin`: a separate sign-in (Admin User ID + password, never a learner account), the admin session token (`STORAGE_KEYS.adminToken`), and the pages for users, language tracks, stages, challenges, analytics, the audit log, the optional Microsoft Excel mirror and credential changes.

**Public API (`index.ts`):** `AdminApp` - the whole `/admin/*` route tree with its own `AdminAuthProvider`. The app mounts it lazily, so learners never download it.

**Talks to:** `/api/admin-auth/*` and `/api/admin/*` only (`services/adminApi.ts`). Every one of those routes is independently gated server-side by `requireAdminAuth` (`server/admin-auth.js`), which verifies the bearer token against the live admin record on every request. This module could be deleted and a learner's token would still get a 401 from all of them.

**Edits are overrides, not content changes:** an admin can hide/reorder/re-label stages, hide or re-word challenges and adjust XP or difficulty. Those live in `server/data/db.json` as `contentOverrides` and are merged onto the authored TypeScript by `server/content.js`; the questions' logic (answers, test cases, concepts) stays in `src/modules/challenges/content` where `npm run check` can execute it.

**Does not own:** learner progress, grading, XP (`platform/session`, `server/index.js`).
