import type { Challenge } from '@/types';
import type { Answer } from '@/platform/grading-engine/answers';
import { checkBlank } from '@/platform/grading-engine/grading';

/** Shared by the renderers and registry, without a renderer → registry import cycle. */
export function wrongBlankPositions(challenge: Challenge, answer: Answer): number[] {
  const given = Array.isArray(answer) ? answer : [];
  return (challenge.blanks ?? [])
    .map((blank, index) => checkBlank(String(given[index] ?? ''), blank.answer, blank.alternatives ?? []) ? -1 : index)
    .filter((index) => index >= 0);
}

export function wrongOrderPositions(challenge: Challenge, answer: Answer): number[] {
  const given = Array.isArray(answer) ? answer : [];
  return given
    .map((line, index) => (challenge.pseudocodeLines ?? [])[index] === line ? -1 : index)
    .filter((index) => index >= 0);
}
