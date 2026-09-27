/**
 * "Celebrations deferred": toasts held back while a lesson run is on screen.
 *
 * A unit (or a stage test) ends on a screen that announces what the run
 * earned - the XP, a level crossed, new badges - so a toast that would fire
 * mid-run (a badge the moment it is earned) waits instead of announcing the
 * same thing twice:
 *
 *   hold()                    a run opened
 *   celebrateOrHold(show)     show it now, or keep it while a run is open
 *   release({ announced })    the run closed. `announced`: its end screen
 *                             already said it all, so what was kept is
 *                             dropped. Otherwise (closed before the end
 *                             screen) what was kept is shown now.
 *
 * Pure (no React), so it is testable on its own: SessionProvider keeps one
 * per provider and hands its functions out through the session. The
 * practice modal holds and releases; the badge toaster celebrates through it.
 */
export interface CelebrationHold {
  /** A run is on screen: celebrations wait until it is released. */
  hold: () => void;
  /** The run closed; see the file comment for `announced`. A no-op when nothing is held. */
  release: (outcome: { announced: boolean }) => void;
  /** Show now, or keep `show` for the release while a run is on screen. */
  celebrateOrHold: (show: () => void) => void;
  /** A run is on screen. */
  isHeld: () => boolean;
}

export function createCelebrationHold(): CelebrationHold {
  let held = false;
  let waiting: Array<() => void> = [];

  return {
    hold() {
      held = true;
    },
    release({ announced }) {
      const kept = waiting;
      held = false;
      waiting = [];
      if (announced) return;
      for (const show of kept) {
        try {
          show();
        } catch {
          // One toast that fails must not swallow the rest.
        }
      }
    },
    celebrateOrHold(show) {
      if (held) waiting.push(show);
      else show();
    },
    isHeld: () => held
  };
}
