/**
 * Public API of the account module.
 * Owns: sign-in / sign-up, the Pro membership modal, and settings.
 * Listens: account:openAuth, account:openPro. The session emits auth:* facts.
 */
export { AccountModals } from './components/AccountModals';
export { SettingsPage } from './pages/SettingsPage';
