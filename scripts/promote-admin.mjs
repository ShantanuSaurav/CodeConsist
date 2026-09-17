#!/usr/bin/env node
/**
 * DEPRECATED - promoting a learner account to admin is no longer how this
 * project creates an administrator.
 *
 * The administrator is now a completely separate account from every learner
 * ("user") account: it has no email, is never a row in the users table, and
 * is configured with its own Admin User ID + Admin Password rather than by
 * promoting something that signed up normally. See server/admin-auth.js.
 *
 * To create or access the administrator account instead:
 *
 *   1. Add ADMIN_USER_ID and ADMIN_PASSWORD to a .env file at the project
 *      root (see .env.example for the placeholders and full explanation).
 *   2. Start the server once (`npm run dev` or `npm start`). On first boot
 *      with no administrator account yet, it hashes ADMIN_PASSWORD with
 *      bcrypt, stores the hash and your chosen ADMIN_USER_ID, and never
 *      reads those two environment variables again.
 *   3. Open /admin/login and sign in with that Admin User ID + Password.
 *
 * To change the Admin User ID or Password later, sign in and use
 * /admin/settings/security - do not try to re-run a bootstrap script for
 * that; it only ever runs once, on an install with no administrator yet.
 *
 * This script is kept only so `npm run promote-admin` (if you still have it
 * in muscle memory or an old script/alias) fails with a clear explanation
 * instead of a confusing error - it intentionally does nothing else.
 */
console.log(
  [
    '',
    '  `promote-admin` has been removed.',
    '',
    '  Administrators are no longer created by promoting a learner account.',
    '  Configure ADMIN_USER_ID and ADMIN_PASSWORD in your .env file instead,',
    '  start the server once, then sign in at /admin/login.',
    '',
    '  See .env.example and docs/CONTENT_AUTHORING.md-adjacent setup notes,',
    '  or server/admin-auth.js for the full mechanism.',
    ''
  ].join('\n')
);
process.exit(1);
