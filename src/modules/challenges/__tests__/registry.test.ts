import { describe, expect, it } from 'vitest';
import type { Challenge, ChallengeType } from '@/types';
import { CHALLENGE_TYPES, checkAnswer, definitionFor, emptyAnswer, isAnswerComplete, isCodeChallenge, typeLabel } from '../challenge-types';
import { ALL_CHALLENGES, CHALLENGES_VERIFIED, CHALLENGE_BY_ID, STAGE_META, buildStages } from '../content';
import { ChallengeSchema } from '../schema';

const base = { id: 'x', stageId: 'stage-1', title: 't', difficulty: 'easy', language: 'javascript', prompt: 'p', explanation: 'because', xpReward: 10 } as const;

describe('challenge type registry', () => {
  it('has a definition for every ChallengeType and each knows its own type', () => {
    const types: ChallengeType[] = ['quiz', 'multi_select', 'output_prediction', 'fill_blank', 'pseudocode_order', 'debug', 'code_runner'];
    for (const t of types) expect(CHALLENGE_TYPES[t].type).toBe(t);
    expect(isCodeChallenge({ type: 'debug' })).toBe(true);
    expect(isCodeChallenge({ type: 'quiz' })).toBe(false);
    expect(typeLabel({ type: 'output_prediction' })).toBe('Predict the output');
    expect(definitionFor({ type: 'fill_blank' }).rendersSnippet).toBe(true);
  });

  it('grades a quiz by index', () => {
    const c = { ...base, type: 'quiz', options: ['a', 'b', 'c'], correctIndex: 2 } as Challenge;
    expect(emptyAnswer(c)).toBeNull();
    expect(isAnswerComplete(c, null)).toBe(false);
    expect(isAnswerComplete(c, 1)).toBe(true);
    expect(checkAnswer(c, 2)).toBe(true);
    expect(checkAnswer(c, 1)).toBe(false);
  });

  it('grades multi_select as a set', () => {
    const c = { ...base, type: 'multi_select', options: ['a', 'b', 'c', 'd'], correctIndices: [0, 2] } as Challenge;
    expect(checkAnswer(c, [2, 0])).toBe(true);
    expect(checkAnswer(c, [0])).toBe(false);
    expect(isAnswerComplete(c, [])).toBe(false);
  });

  it('grades blanks with alternatives and points at the wrong one', () => {
    const c = {
      ...base,
      type: 'fill_blank',
      codeSnippet: '___ x = ___;',
      blanks: [{ answer: 'const', alternatives: ['let'] }, { answer: '1' }]
    } as Challenge;
    expect(emptyAnswer(c)).toEqual(['', '']);
    expect(checkAnswer(c, ['let', '1'])).toBe(true);
    expect(checkAnswer(c, ['var', '1'])).toBe(false);
    expect(definitionFor(c).kind === 'answer' && definitionFor(c).kind === 'answer' && (definitionFor(c) as any).wrongPositions(c, ['var', '1'])).toEqual([0]);
  });

  it('grades pseudocode order exactly', () => {
    const c = { ...base, type: 'pseudocode_order', pseudocodeLines: ['a', 'b', 'c', 'd'] } as Challenge;
    const start = emptyAnswer(c) as string[];
    expect(start).not.toEqual(['a', 'b', 'c', 'd']);
    expect(checkAnswer(c, ['a', 'b', 'c', 'd'])).toBe(true);
    expect(checkAnswer(c, start)).toBe(false);
  });

  it('code types have no answer to check - they are graded by running', () => {
    const c = { ...base, type: 'code_runner' } as Challenge;
    expect(checkAnswer(c, null)).toBe(false);
    expect(isAnswerComplete(c, null)).toBe(false);
  });
});

describe('challenge content (dev loader)', () => {
  it('every authored challenge passes the schema (the deferred dev check finds nothing)', async () => {
    await expect(CHALLENGES_VERIFIED).resolves.toEqual([]);
  });

  it('loads the whole bank, validated, in stage order', () => {
    expect(ALL_CHALLENGES.length).toBeGreaterThanOrEqual(210);
    expect(CHALLENGE_BY_ID.size).toBe(ALL_CHALLENGES.length);
    const order = STAGE_META.map((s) => s.id);
    let last = -1;
    for (const c of ALL_CHALLENGES) {
      const i = order.indexOf(c.stageId);
      expect(i).toBeGreaterThanOrEqual(last);
      last = i;
    }
  });

  it('gives every stage twenty lessons and one test', () => {
    for (const stage of buildStages()) {
      expect(stage.challenges.length).toBe(20);
      expect(stage.test?.isStageTest).toBe(true);
    }
  });

  it('the schema rejects an unsolvable fill_blank', () => {
    const bad = { ...base, type: 'fill_blank', codeSnippet: 'x = ___', blanks: [{ answer: '1' }, { answer: '2' }] };
    expect(ChallengeSchema.safeParse(bad).success).toBe(false);
  });
});
