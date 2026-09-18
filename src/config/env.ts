/** Build-time configuration read from Vite's import.meta.env, in one place. */
export const ENV = {
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD
} as const;

/*
 * Judge0 credentials are deliberately NOT read here any more. A VITE_-prefixed
 * variable is baked into the shipped JavaScript, where anyone can read the key
 * back out of it. The API server is the only place they are read
 * (server/index.js); the browser asks POST /api/execute and learns whether a
 * remote compiler exists from the non-secret flag in GET /api/health.
 */
