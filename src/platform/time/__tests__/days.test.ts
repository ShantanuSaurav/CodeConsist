import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addDays,
  browserTimeZone,
  dayKeyIn,
  daysBetween,
  isDayKey,
  isValidTimeZone,
  latestPossibleDay,
  learnerDay,
  msUntilLocalMidnight,
  weekStartFor,
  zoneCacheSize
} from '../days';
import { previousDayKey } from '../../xp-leveling/leveling';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('dayKeyIn', () => {
  const instant = new Date('2026-09-25T20:00:00Z');

  it("counts the day in the learner's zone, not the server's", () => {
    expect(dayKeyIn('Asia/Kolkata', instant)).toBe('2026-09-26'); // 01:30 on the 26th
    expect(dayKeyIn('America/Los_Angeles', instant)).toBe('2026-09-25'); // 13:00 on the 25th
    expect(dayKeyIn('UTC', instant)).toBe('2026-09-25');
  });

  it('handles odd offsets and the date-line zones', () => {
    // +5:45: 20:00Z is 01:45 on the 26th.
    expect(dayKeyIn('Asia/Kathmandu', instant)).toBe('2026-09-26');
    // 18:14Z is 23:59 in Kathmandu, 18:15Z is midnight.
    expect(dayKeyIn('Asia/Kathmandu', new Date('2026-09-25T18:14:00Z'))).toBe('2026-09-25');
    expect(dayKeyIn('Asia/Kathmandu', new Date('2026-09-25T18:15:00Z'))).toBe('2026-09-26');
    // +14: already the 26th from 10:00Z.
    expect(dayKeyIn('Pacific/Kiritimati', new Date('2026-09-25T10:00:00Z'))).toBe('2026-09-26');
    // −11: still the 25th at 10:59Z on the 26th.
    expect(dayKeyIn('Pacific/Pago_Pago', new Date('2026-09-26T10:59:00Z'))).toBe('2026-09-25');
    expect(dayKeyIn('Pacific/Pago_Pago', new Date('2026-09-26T11:00:00Z'))).toBe('2026-09-26');
  });

  it('follows a daylight-saving change', () => {
    // US clocks go back at 09:00Z on 2026-11-01 (02:00 PDT -> 01:00 PST).
    expect(dayKeyIn('America/Los_Angeles', new Date('2026-11-01T07:59:00Z'))).toBe('2026-11-01'); // 00:59 PDT
    expect(dayKeyIn('America/Los_Angeles', new Date('2026-11-02T07:59:00Z'))).toBe('2026-11-01'); // 23:59 PST
    expect(dayKeyIn('America/Los_Angeles', new Date('2026-11-02T08:00:00Z'))).toBe('2026-11-02'); // midnight PST
    // Europe goes forward at 01:00Z on 2026-03-29.
    expect(dayKeyIn('Europe/London', new Date('2026-03-28T23:59:00Z'))).toBe('2026-03-28');
    expect(dayKeyIn('Europe/London', new Date('2026-03-29T23:30:00Z'))).toBe('2026-03-30'); // 00:30 BST
  });

  it('crosses month and year boundaries', () => {
    expect(dayKeyIn('Asia/Tokyo', new Date('2026-12-31T15:00:00Z'))).toBe('2027-01-01');
    expect(dayKeyIn('America/New_York', new Date('2027-01-01T04:59:00Z'))).toBe('2026-12-31');
    expect(dayKeyIn('Asia/Kolkata', new Date('2026-02-28T19:00:00Z'))).toBe('2026-03-01');
  });

  it("falls back to the process's own day without a usable zone", () => {
    const local = new Date(2026, 0, 5, 12, 0, 0);
    expect(dayKeyIn(null, local)).toBe('2026-01-05');
    expect(dayKeyIn('Not/AZone', local)).toBe('2026-01-05');
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA names, including aliases', () => {
    for (const zone of ['UTC', 'Asia/Kolkata', 'Asia/Calcutta', 'America/Argentina/Buenos_Aires', 'Etc/GMT+5']) {
      expect(isValidTimeZone(zone)).toBe(true);
    }
  });

  it('refuses anything else', () => {
    for (const zone of ['', 'Mars/Olympus', 'Asia/Kolkata; DROP', '../etc/passwd', 'x'.repeat(65), 42, null, undefined, {}]) {
      expect(isValidTimeZone(zone)).toBe(false);
    }
  });
});

describe('day arithmetic', () => {
  it('moves across month and year ends on the UTC calendar', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2026-09-25', -97)).toBe('2026-06-20');
  });

  it('keeps previousDayKey identical, and independent of daylight saving', () => {
    expect(previousDayKey('2026-03-01')).toBe('2026-02-28');
    expect(previousDayKey('2026-01-01')).toBe('2025-12-31');
    // The days around both European clock changes.
    expect(previousDayKey('2026-03-30')).toBe('2026-03-29');
    expect(previousDayKey('2026-10-26')).toBe('2026-10-25');
  });

  it('counts whole days between two keys', () => {
    expect(daysBetween('2026-09-25', '2026-09-26')).toBe(1);
    expect(daysBetween('2026-09-26', '2026-09-25')).toBe(-1);
    expect(daysBetween('2025-12-31', '2027-01-01')).toBe(366);
    expect(Number.isNaN(daysBetween('nope', '2026-01-01'))).toBe(true);
  });

  it('knows a real day key from a fake one', () => {
    expect(isDayKey('2026-09-25')).toBe(true);
    expect(isDayKey('2024-02-29')).toBe(true);
    expect(isDayKey('2026-02-29')).toBe(false);
    expect(isDayKey('2026-9-25')).toBe(false);
    expect(isDayKey(20260925)).toBe(false);
  });

  it('finds the start of the week', () => {
    // 2026-09-25 is a Friday.
    expect(weekStartFor('2026-09-25', 1)).toBe('2026-09-21');
    expect(weekStartFor('2026-09-25', 0)).toBe('2026-09-20');
    expect(weekStartFor('2026-09-21', 1)).toBe('2026-09-21');
    expect(weekStartFor('2026-09-20', 1)).toBe('2026-09-14');
  });
});

describe('msUntilLocalMidnight', () => {
  it('counts down to midnight in the given zone', () => {
    // 20:00Z is 01:30 in Kolkata: 22.5 hours to go.
    expect(msUntilLocalMidnight(new Date('2026-09-25T20:00:00Z'), 'Asia/Kolkata')).toBe(22.5 * 3_600_000);
    // 20:00Z is 13:00 in Los Angeles: 11 hours to go.
    expect(msUntilLocalMidnight(new Date('2026-09-25T20:00:00Z'), 'America/Los_Angeles')).toBe(11 * 3_600_000);
  });

  it('never returns less than a second', () => {
    expect(msUntilLocalMidnight(new Date('2026-09-25T23:59:59.900Z'), 'UTC')).toBe(1000);
  });
});

describe('browserTimeZone', () => {
  it('reports the runtime zone', () => {
    expect(isValidTimeZone(browserTimeZone())).toBe(true);
  });

  it('is null, not a throw, when Intl misbehaves', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('broken Intl');
    });
    expect(browserTimeZone()).toBeNull();
  });
});

describe('latestPossibleDay', () => {
  it('is the day in the most-ahead zone on Earth', () => {
    expect(latestPossibleDay(new Date('2026-09-25T10:00:00Z'))).toBe('2026-09-26');
    expect(latestPossibleDay(new Date('2026-09-25T09:59:00Z'))).toBe('2026-09-25');
  });
});

describe('learnerDay', () => {
  // 01:00Z on the 27th: the 27th in Auckland, still 18:00 on the 26th in Los Angeles.
  const now = new Date('2026-09-27T01:00:00Z');

  it('is the local day when nothing later is recorded', () => {
    expect(learnerDay('America/Los_Angeles', [], now)).toBe('2026-09-26');
    expect(learnerDay('Pacific/Auckland', ['2026-09-20', null, undefined, 'junk'], now)).toBe('2026-09-27');
  });

  it('never goes back before a day already recorded (a zone flip westward)', () => {
    expect(learnerDay('America/Los_Angeles', ['2026-09-27'], now)).toBe('2026-09-27');
    expect(learnerDay('America/Los_Angeles', [null, '2026-09-25', '2026-09-27'], now)).toBe('2026-09-27');
  });

  it('never believes a day later than it is anywhere on Earth', () => {
    expect(learnerDay('America/Los_Angeles', ['2026-09-29', '2099-01-01'], now)).toBe('2026-09-26');
  });
});

describe('the zone caches', () => {
  it('stay bounded, whatever spellings a caller sends', () => {
    // Never remembered: invalid names.
    for (let i = 0; i < 600; i++) expect(isValidTimeZone(`Nowhere/Place_${i}`)).toBe(false);
    // Intl reads zone names in any case, so every spelling below is valid -
    // and each would otherwise be one more entry in both caches.
    const name = 'america/los_angeles';
    for (let i = 0; i < 600; i++) {
      const spelled = [...name].map((c, n) => ((i >> (n % 11)) & 1 ? c.toUpperCase() : c)).join('');
      expect(isValidTimeZone(spelled)).toBe(true);
      dayKeyIn(spelled, new Date('2026-09-25T20:00:00Z'));
    }
    const size = zoneCacheSize();
    expect(size.validZones).toBeLessThanOrEqual(512);
    expect(size.formatters).toBeLessThanOrEqual(512);
    // Still right after all that.
    expect(isValidTimeZone('Nowhere/Place_1')).toBe(false);
    expect(dayKeyIn('Asia/Kolkata', new Date('2026-09-25T20:00:00Z'))).toBe('2026-09-26');
  });
});
