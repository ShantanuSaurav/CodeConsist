/* ==========================================================================
   Unit rewards: the perfect-unit bonus, and the record of a unit's first
   completion.

   Pure, shared by the browser (the optimistic end screen) and the server
   (which pays it - the server never reads XP, a bonus or `unitsCompleted`
   from a request body). One rule on both sides:

     A bonus is paid only when a FIRST solve completes a unit whose id is not
     yet in `unitsCompleted`. "Perfect" means every lesson in the unit has
     `attempts === 1` - and `hintsUsed === 0` while
     `units.perfectRequiresNoHints` is on.

   So regrouping units, hiding a question or replaying a unit never pays a
   second time for the same work; a new unit id holding newly solved lessons
   can pay once, which is bounded by the number of units.
   ========================================================================== */
import type { ChallengeAttempt, UnitCompletion, UnitDef } from '@/types';
import type { UnitSettings } from '../settings/types';
import { DEFAULT_UNIT_SETTINGS } from '../progress/units';

export type RewardRules = Pick<UnitSettings, 'perfectBonusXp' | 'perfectRequiresNoHints'>;

/** What the reward rules read of a progress row (the server's, or the browser's stats). */
export interface RewardProgress {
  xp: number;
  completedChallenges: string[];
  attempts: Record<string, Partial<ChallengeAttempt>>;
  unitsCompleted?: Record<string, UnitCompletion>;
}

/** The unit a question is in, as the server (or the browser) currently groups it. */
export type UnitLookup = (challengeId: string) => Pick<UnitDef, 'id' | 'challengeIds'> | null | undefined;

/** One unit completed for the first time, and what it paid. */
export interface UnitReward {
  unitId: string;
  perfect: boolean;
  bonusXp: number;
  completedAt: string;
  /** The solve that completed it. */
  challengeId: string;
}

function hasOwn(map: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, key);
}

function define<T>(map: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(map, key, { value, writable: true, enumerable: true, configurable: true });
}

function iso(value: Date | string | undefined): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return new Date().toISOString();
}

function bonusOf(cfg: RewardRules): number {
  const n = Math.floor(Number(cfg.perfectBonusXp));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * `unitsCompleted` as stored, made safe: own keys only, every record whole.
 * A fresh object every time - the store's shared row is never mutated.
 */
export function normalizeUnitsCompleted(raw: unknown): Record<string, UnitCompletion> {
  const out: Record<string, UnitCompletion> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const src = raw as Record<string, unknown>;
  for (const id of Object.keys(src)) {
    const rec = src[id];
    if (!id || !rec || typeof rec !== 'object' || Array.isArray(rec)) continue;
    const r = rec as Record<string, unknown>;
    const at = typeof r.completedAt === 'string' && !Number.isNaN(Date.parse(r.completedAt)) ? r.completedAt : null;
    if (!at) continue;
    const bonus = Math.floor(Number(r.bonusXp));
    define(out, id, { completedAt: at, perfect: r.perfect === true, bonusXp: Number.isFinite(bonus) && bonus > 0 ? bonus : 0 });
  }
  return out;
}

/**
 * Was every lesson in the unit cleared first try (and without a hint, while
 * that is required)? `attempts` accumulate over re-solves, so a replay makes
 * this false for good - which is why the perfect badges also count the
 * stored records (`perfectUnitIds`).
 */
export function isPerfectUnit(
  unit: Pick<UnitDef, 'challengeIds'>,
  attempts: Record<string, Partial<ChallengeAttempt>> | null | undefined,
  cfg: Pick<UnitSettings, 'perfectRequiresNoHints'> = DEFAULT_UNIT_SETTINGS
): boolean {
  if (!unit.challengeIds.length || !attempts) return false;
  return unit.challengeIds.every((id) => {
    const a = hasOwn(attempts, id) ? attempts[id] : undefined;
    if (!a || Number(a.attempts) !== 1) return false;
    return !cfg.perfectRequiresNoHints || (Number(a.hintsUsed) || 0) === 0;
  });
}

/**
 * Pay for a unit completed by this solve, if any. `before` is the row as it
 * was, `after` the row once the solve is applied (solve XP included); the
 * result is `after` with the bonus added to `xp` and the completion
 * recorded - the level is the caller's to recompute.
 */
export function applyUnitRewards<P extends RewardProgress>(
  before: P,
  after: P,
  event: { challengeId: string; firstSolve: boolean; now?: Date | string },
  deps: { cfg?: RewardRules; unitFor: UnitLookup }
): { progress: P; reward: UnitReward | null } {
  const none = { progress: after, reward: null };
  if (!event.firstSolve) return none;
  const unit = deps.unitFor(event.challengeId);
  if (!unit || !unit.challengeIds.length || !unit.challengeIds.includes(event.challengeId)) return none;

  const records = normalizeUnitsCompleted(after.unitsCompleted ?? before.unitsCompleted);
  if (hasOwn(records, unit.id)) return none;
  const solved = new Set(after.completedChallenges);
  if (!unit.challengeIds.every((id) => solved.has(id))) return none;

  const cfg = deps.cfg ?? DEFAULT_UNIT_SETTINGS;
  const perfect = isPerfectUnit(unit, after.attempts, cfg);
  const bonusXp = perfect ? bonusOf(cfg) : 0;
  const completedAt = iso(event.now);
  define(records, unit.id, { completedAt, perfect, bonusXp });
  return {
    progress: { ...after, xp: (Number(after.xp) || 0) + bonusXp, unitsCompleted: records },
    reward: { unitId: unit.id, perfect, bonusXp, completedAt, challengeId: event.challengeId }
  };
}

/**
 * The same rule for a guest merge: bonuses only for units completed BY the
 * newly merged ids - a unit that was already complete, or that a new id does
 * not finish, pays nothing. Each unit is judged once; its completion time is
 * the latest solve time among the new ids in it.
 */
export function applyMergeUnitRewards<P extends RewardProgress>(
  before: P,
  merged: P,
  input: { newIds: readonly string[]; solvedAtOf?: (id: string) => string | null | undefined; now?: Date | string },
  deps: { cfg?: RewardRules; unitFor: UnitLookup }
): { progress: P; rewards: UnitReward[]; bonusXp: number } {
  const cfg = deps.cfg ?? DEFAULT_UNIT_SETTINGS;
  const records = normalizeUnitsCompleted(merged.unitsCompleted ?? before.unitsCompleted);
  const solved = new Set(merged.completedChallenges);
  const fresh = new Set(input.newIds);
  const judged = new Set<string>();
  const rewards: UnitReward[] = [];

  for (const id of input.newIds) {
    const unit = deps.unitFor(id);
    if (!unit || judged.has(unit.id)) continue;
    judged.add(unit.id);
    if (hasOwn(records, unit.id) || !unit.challengeIds.length) continue;
    if (!unit.challengeIds.every((c) => solved.has(c))) continue;

    // The completing solve: the latest of the new ids in this unit.
    let completingId = id;
    let completedAt = iso(input.solvedAtOf?.(id) ?? input.now);
    for (const c of unit.challengeIds) {
      if (!fresh.has(c)) continue;
      const at = iso(input.solvedAtOf?.(c) ?? input.now);
      if (Date.parse(at) > Date.parse(completedAt)) {
        completedAt = at;
        completingId = c;
      }
    }
    const perfect = isPerfectUnit(unit, merged.attempts, cfg);
    const bonusXp = perfect ? bonusOf(cfg) : 0;
    define(records, unit.id, { completedAt, perfect, bonusXp });
    rewards.push({ unitId: unit.id, perfect, bonusXp, completedAt, challengeId: completingId });
  }

  const bonusXp = rewards.reduce((sum, r) => sum + r.bonusXp, 0);
  if (rewards.length === 0) return { progress: merged, rewards, bonusXp: 0 };
  return { progress: { ...merged, xp: (Number(merged.xp) || 0) + bonusXp, unitsCompleted: records }, rewards, bonusXp };
}

/**
 * Units counted as done, for the badges: every unit whose lessons are all
 * solved now, plus every recorded completion (a unit an admin later
 * regrouped away still counts).
 */
export function completedUnitIds(
  units: readonly Pick<UnitDef, 'id' | 'challengeIds'>[],
  completed: Iterable<string>,
  records?: Record<string, UnitCompletion> | null
): Set<string> {
  const solved = completed instanceof Set ? (completed as Set<string>) : new Set(completed);
  const ids = new Set(Object.keys(normalizeUnitsCompleted(records)));
  for (const unit of units) {
    if (unit.challengeIds.length > 0 && unit.challengeIds.every((id) => solved.has(id))) ids.add(unit.id);
  }
  return ids;
}

/**
 * Perfect units, for the badges: the recorded perfect completions united with
 * the units that are perfect by their attempts today - so a later replay
 * (which adds attempts) can never take a badge away.
 */
export function perfectUnitIds(
  units: readonly Pick<UnitDef, 'id' | 'challengeIds'>[],
  attempts: Record<string, Partial<ChallengeAttempt>> | null | undefined,
  records?: Record<string, UnitCompletion> | null,
  cfg: Pick<UnitSettings, 'perfectRequiresNoHints'> = DEFAULT_UNIT_SETTINGS
): Set<string> {
  const normal = normalizeUnitsCompleted(records);
  const ids = new Set(Object.keys(normal).filter((id) => normal[id].perfect));
  for (const unit of units) if (isPerfectUnit(unit, attempts, cfg)) ids.add(unit.id);
  return ids;
}
