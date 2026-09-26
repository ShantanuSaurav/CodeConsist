/**
 * Public API of the account module.
 * Owns: sign-in / sign-up (email + password, Google, GitHub), the unlock
 * modal (one-time purchases and certificates), settings, the OAuth landing
 * page, the password reset page (admin-issued links), and the certificate /
 * verification pages.
 * Listens: account:openAuth, account:openPro. The session emits auth:* facts.
 */
export { AccountModals } from './components/AccountModals';
export { SettingsPage } from './pages/SettingsPage';
export { OAuthCallbackPage } from './pages/OAuthCallbackPage';
export { ResetPasswordPage } from './pages/ResetPasswordPage';
export { CertificatePage } from './pages/CertificatePage';
export { VerifyPage } from './pages/VerifyPage';
