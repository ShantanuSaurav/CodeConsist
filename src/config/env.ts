/** Build-time configuration read from Vite's import.meta.env, in one place. */
export const ENV = {
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
  /** Judge0 for compiled languages; the app says "no runtime" when these are unset. */
  judge0Url: (import.meta.env.VITE_JUDGE0_API_URL as string | undefined) ?? '',
  judge0Key: (import.meta.env.VITE_JUDGE0_API_KEY as string | undefined) ?? '',
  judge0Host: (import.meta.env.VITE_JUDGE0_API_HOST as string | undefined) ?? ''
} as const;
