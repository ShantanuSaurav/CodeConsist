/**
 * "Celebrations deferred": while a lesson run is on screen a badge toast
 * waits, because the run's end screen lists the badge. Reaching the end
 * screen drops what waited (no badge announced twice); closing the run
 * before it shows what waited (no badge announced never).
 */
import { describe, expect, it, vi } from 'vitest';
import { createCelebrationHold } from '../celebrationHold';

describe('the celebration hold', () => {
  it('shows a celebration at once when no run is on screen', () => {
    const hold = createCelebrationHold();
    const show = vi.fn();
    hold.celebrateOrHold(show);
    expect(show).toHaveBeenCalledTimes(1);
    expect(hold.isHeld()).toBe(false);
  });

  it('holds celebrations during a run and drops them when its end screen announced them', () => {
    const hold = createCelebrationHold();
    const show = vi.fn();
    hold.hold();
    hold.celebrateOrHold(show);
    expect(show).not.toHaveBeenCalled();
    hold.release({ announced: true });
    expect(show).not.toHaveBeenCalled();
    expect(hold.isHeld()).toBe(false);
    // Nothing left over for a later run to show.
    hold.hold();
    hold.release({ announced: false });
    expect(show).not.toHaveBeenCalled();
  });

  it('shows what was held, in order, when the run closes before its end screen', () => {
    const hold = createCelebrationHold();
    const shown: string[] = [];
    hold.hold();
    hold.celebrateOrHold(() => shown.push('Badge earned: Ten solved'));
    hold.celebrateOrHold(() => {
      throw new Error('a toast that fails');
    });
    hold.celebrateOrHold(() => shown.push('Badge earned: First unit'));
    hold.release({ announced: false });
    expect(shown).toEqual(['Badge earned: Ten solved', 'Badge earned: First unit']);
    // Released: the next celebration shows at once.
    hold.celebrateOrHold(() => shown.push('later'));
    expect(shown[shown.length - 1]).toBe('later');
  });

  it('a new run after an announced one starts empty', () => {
    const hold = createCelebrationHold();
    const first = vi.fn();
    const second = vi.fn();
    hold.hold();
    hold.celebrateOrHold(first);
    hold.release({ announced: true });
    hold.hold();
    hold.celebrateOrHold(second);
    hold.release({ announced: false });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
