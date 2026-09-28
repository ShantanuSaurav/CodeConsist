/**
 * Celebration pieces: the XP count-up, the level-up screen and the badge
 * tier chip. A separate entry (`@/ui/celebrations`), not re-exported from
 * `@/ui`, so a screen that never celebrates never pulls them in.
 *
 * Plain React with CSS transitions and requestAnimationFrame - no animation
 * library (build plan decision 17). Reduced motion is a CSS media query and
 * a check in XpCountUp. Props only: the ui layer imports nothing from the
 * platform.
 */
export { XpCountUp } from './XpCountUp';
export { LevelUpOverlay } from './LevelUpOverlay';
export { BadgeTierChip } from './BadgeTierChip';
