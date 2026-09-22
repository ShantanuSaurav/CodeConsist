/**
 * Every route in the app, in one place. Modules link to each other by URL
 * through these helpers rather than by importing each other's pages, which
 * keeps the dependency graph pointing one way (see docs/adr/0001).
 */
export const ROUTES = {
  landing: '/',
  dashboard: '/dashboard',
  learn: '/dashboard/learn',
  /** The reading for a stage; `section` is a heading slug for a deep link. */
  article: (stageId: string, section?: string) =>
    `/dashboard/learn/${stageId}/read${section ? `#${section}` : ''}`,
  challenges: '/dashboard/challenges',
  playground: '/dashboard/practice',
  roadmaps: '/dashboard/roadmap',
  roadmap: (slug: string) => `/dashboard/roadmap/${slug}`,
  leaderboard: '/dashboard/leaderboard',
  achievements: '/dashboard/achievements',
  settings: '/dashboard/settings',
  /**
   * Where a Google / GitHub sign-in comes back to. The server redirects here
   * with the token in the URL fragment, which this page reads and clears.
   */
  authCallback: '/auth/callback',
  /** A learner's own printable certificate (owner only; outside the dashboard frame so it prints clean). */
  certificate: (id: string) => `/certificates/${id}`,
  /** Public check of a certificate code - no sign-in needed. */
  verify: (code: string) => `/verify/${code}`,
  /** The administrator console - its own sign-in, its own session (modules/admin). */
  admin: '/admin',
  adminLogin: '/admin/login',
  /** Prices, grants, orders and certificates. */
  adminBilling: '/admin/billing'
} as const;

/** Static paths (no parameters), for validators that check internal links. */
export const STATIC_ROUTES: readonly string[] = [
  ROUTES.landing,
  ROUTES.dashboard,
  ROUTES.learn,
  ROUTES.challenges,
  ROUTES.playground,
  ROUTES.roadmaps,
  ROUTES.leaderboard,
  ROUTES.achievements,
  ROUTES.settings,
  ROUTES.authCallback,
  ROUTES.admin,
  ROUTES.adminLogin,
  ROUTES.adminBilling
];
