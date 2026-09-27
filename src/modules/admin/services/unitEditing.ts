/**
 * The units editor's operations, as pure functions over a list of units -
 * so every one can be tested to keep each question in exactly one place.
 * Each returns a NEW list (or the same list when the move is not possible:
 * the first unit has no "previous", the last question cannot be split off
 * after itself, ...). The server re-checks whatever is saved.
 */

/** One unit in the editor. `key` is local (React); `id` is the saved id, absent on a new unit. */
export interface EditorUnit {
  key: string;
  id?: string;
  name: string;
  description?: string;
  challengeIds: string[];
}

let counter = 0;
/** A local key for a unit made in the editor. */
export function newUnitKey(): string {
  counter += 1;
  return `new-${counter}-${Math.random().toString(36).slice(2, 7)}`;
}

function replaceAt<T>(list: readonly T[], index: number, value: T): T[] {
  return list.map((item, i) => (i === index ? value : item));
}

/** Move a question up (-1) or down (+1) inside its unit. */
export function moveQuestion(units: readonly EditorUnit[], unitIndex: number, questionIndex: number, direction: -1 | 1): EditorUnit[] {
  const unit = units[unitIndex];
  const target = questionIndex + direction;
  if (!unit || questionIndex < 0 || target < 0 || target >= unit.challengeIds.length) return units as EditorUnit[];
  const ids = [...unit.challengeIds];
  [ids[questionIndex], ids[target]] = [ids[target], ids[questionIndex]];
  return replaceAt(units, unitIndex, { ...unit, challengeIds: ids });
}

/**
 * Move a question into the previous unit (-1, as its last question) or the
 * next one (+1, as its first) - "← previous unit" / "next unit →".
 */
export function moveAcross(units: readonly EditorUnit[], unitIndex: number, questionIndex: number, direction: -1 | 1): EditorUnit[] {
  const from = units[unitIndex];
  const to = units[unitIndex + direction];
  if (!from || !to || questionIndex < 0 || questionIndex >= from.challengeIds.length) return units as EditorUnit[];
  const id = from.challengeIds[questionIndex];
  const next = [...units];
  next[unitIndex] = { ...from, challengeIds: from.challengeIds.filter((_, i) => i !== questionIndex) };
  next[unitIndex + direction] = { ...to, challengeIds: direction === -1 ? [...to.challengeIds, id] : [id, ...to.challengeIds] };
  return next;
}

/**
 * "Split here": the question at `questionIndex` and everything after it
 * become a new unit right after this one.
 */
export function splitAt(units: readonly EditorUnit[], unitIndex: number, questionIndex: number, key: string = newUnitKey()): EditorUnit[] {
  const unit = units[unitIndex];
  if (!unit || questionIndex <= 0 || questionIndex >= unit.challengeIds.length) return units as EditorUnit[];
  const head: EditorUnit = { ...unit, challengeIds: unit.challengeIds.slice(0, questionIndex) };
  const tail: EditorUnit = { key, name: `${unit.name} (part 2)`.slice(0, 60), challengeIds: unit.challengeIds.slice(questionIndex) };
  return [...units.slice(0, unitIndex), head, tail, ...units.slice(unitIndex + 1)];
}

/** Merge a unit with the one after it (the first keeps its id and name). */
export function mergeWithNext(units: readonly EditorUnit[], unitIndex: number): EditorUnit[] {
  const unit = units[unitIndex];
  const next = units[unitIndex + 1];
  if (!unit || !next) return units as EditorUnit[];
  const merged: EditorUnit = { ...unit, challengeIds: [...unit.challengeIds, ...next.challengeIds] };
  return [...units.slice(0, unitIndex), merged, ...units.slice(unitIndex + 2)];
}

/** A new, empty unit at the end. */
export function addUnit(units: readonly EditorUnit[], name = `Unit ${units.length + 1}`, key: string = newUnitKey()): EditorUnit[] {
  return [...units, { key, name, challengeIds: [] }];
}

/** Delete a unit - only an empty one, so no question is ever dropped. */
export function removeUnit(units: readonly EditorUnit[], unitIndex: number): EditorUnit[] {
  const unit = units[unitIndex];
  if (!unit || unit.challengeIds.length > 0) return units as EditorUnit[];
  return units.filter((_, i) => i !== unitIndex);
}

/** Move a whole unit up (-1) or down (+1). */
export function moveUnit(units: readonly EditorUnit[], unitIndex: number, direction: -1 | 1): EditorUnit[] {
  const target = unitIndex + direction;
  if (!units[unitIndex] || target < 0 || target >= units.length) return units as EditorUnit[];
  const next = [...units];
  [next[unitIndex], next[target]] = [next[target], next[unitIndex]];
  return next;
}

/** Put a question that is in no unit ("Not in a unit") at the end of a unit. A question already placed is left alone. */
export function assignQuestion(units: readonly EditorUnit[], questionId: string, unitIndex: number): EditorUnit[] {
  const unit = units[unitIndex];
  if (!unit || units.some((u) => u.challengeIds.includes(questionId))) return units as EditorUnit[];
  return replaceAt(units, unitIndex, { ...unit, challengeIds: [...unit.challengeIds, questionId] });
}

/** Rename, or change the description of, one unit. */
export function editUnit(units: readonly EditorUnit[], unitIndex: number, patch: Partial<Pick<EditorUnit, 'name' | 'description'>>): EditorUnit[] {
  const unit = units[unitIndex];
  if (!unit) return units as EditorUnit[];
  return replaceAt(units, unitIndex, { ...unit, ...patch });
}

/** Questions of `all` that no unit has. */
export function unplaced(units: readonly EditorUnit[], all: readonly string[]): string[] {
  const placed = new Set(units.flatMap((u) => u.challengeIds));
  return all.filter((id) => !placed.has(id));
}
