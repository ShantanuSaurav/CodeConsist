/**
 * Public API of the onboarding module.
 * Owns: the first-run setup at /welcome - why the learner is here, their
 * track, how much they know, a daily goal and a learning mode - and the
 * rules for which steps show and where Finish leads (flow.ts).
 * Emits: `assessment:open` (a placement, when chosen at the end).
 * Listens: nothing.
 */
export { OnboardingPage } from './pages/OnboardingPage';
