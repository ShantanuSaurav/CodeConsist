import { describe, expect, it } from 'vitest';
import type { Challenge, ChallengeType } from '@/types';
import { CHALLENGE_TYPES, checkAnswer, definitionFor, emptyAnswer, isAnswerComplete, isCodeChallenge, typeLabel } from '../challenge-types';
import { ALL_CHALLENGES, CHALLENGES_VERIFIED, CHALLENGE_BY_ID, STAGE_META, buildStages, LANGUAGE_TRACKS } from '../content';
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

  it('keeps the whole bank: 200 core lessons + 2 concept-led openers, 30 C/C++ lessons, one test per stage', () => {
    const lessons = Object.fromEntries(buildStages().map((s) => [s.id, s.challenges.length]));
    expect(lessons).toEqual({
      'stage-1': 22,
      'stage-2': 20,
      'stage-3': 20,
      'stage-4': 20,
      'stage-5': 22,
      'stage-6': 20,
      'stage-7': 20,
      'stage-8': 20,
      'stage-9': 20,
      'stage-10': 20,
      'stage-c1': 15,
      'stage-cpp1': 15
    });
    for (const stage of buildStages()) expect(stage.test?.isStageTest).toBe(true);
    expect(ALL_CHALLENGES.length).toBe(246);
  });

  it('every stage belongs to exactly one track, and every track names real stages', () => {
    const seen = new Map<string, string>();
    for (const track of LANGUAGE_TRACKS) {
      for (const id of track.stageIds) {
        expect(STAGE_META.some((s) => s.id === id), `${track.id} names unknown stage ${id}`).toBe(true);
        expect(seen.has(id), `${id} is in both ${seen.get(id)} and ${track.id}`).toBe(false);
        seen.set(id, track.id);
      }
    }
    for (const stage of STAGE_META) expect(seen.has(stage.id), `${stage.id} belongs to no track`).toBe(true);
    // The core path is Idea's ten stages, in order, untouched.
    expect(LANGUAGE_TRACKS[0].stageIds).toEqual(['stage-1', 'stage-2', 'stage-3', 'stage-4', 'stage-5', 'stage-6', 'stage-7', 'stage-8', 'stage-9', 'stage-10']);
  });

  it('a stage test in a language with no engine is answer-graded, never a code_runner', () => {
    for (const c of ALL_CHALLENGES.filter((x) => x.isStageTest)) {
      if (c.language === 'javascript' || c.language === 'python') expect(c.type).toBe('code_runner');
      else expect(['code_runner', 'debug']).not.toContain(c.type);
    }
  });

  it('the schema accepts a well-formed concept and rejects a callout past the example', () => {
    const quiz = { ...base, type: 'quiz', options: ['a', 'b'], correctIndex: 0 };
    const concept = {
      id: 'variables-let',
      title: 'What is a variable?',
      summary: 'A named place to store a value.',
      intro: 'A variable is a named place where a program can store a piece of information.',
      example: { code: 'let age = 20;\nconsole.log(age);', language: 'javascript', callouts: [{ line: 2, text: 'prints 20' }] },
      why: 'JavaScript keeps a table from names to values.'
    };
    expect(ChallengeSchema.safeParse({ ...quiz, concept }).success).toBe(true);
    const bad = { ...quiz, concept: { ...concept, example: { ...concept.example, callouts: [{ line: 9, text: 'nope' }] } } };
    expect(ChallengeSchema.safeParse(bad).success).toBe(false);
  });

  it('the schema keeps stage tests honest: code_runner where an engine exists, answer-graded where none does', () => {
    const runner = {
      ...base,
      type: 'code_runner',
      isStageTest: true,
      starterCode: 'function f() {}',
      entryFunction: 'f',
      testCases: [{ input: '1', expected: '1' }],
      solutionCode: 'function f(x) { return x; }',
      examples: [{ input: '1', output: '1' }]
    };
    expect(ChallengeSchema.safeParse(runner).success).toBe(true);
    // A C stage test cannot be a code_runner - there is no compiler to grade it with.
    expect(ChallengeSchema.safeParse({ ...runner, stageId: 'stage-c1', language: 'c' }).success).toBe(false);
    const blanks = { ...base, stageId: 'stage-c1', language: 'c', type: 'fill_blank', isStageTest: true, codeSnippet: 'int x = ___;', blanks: [{ answer: '0' }] };
    expect(ChallengeSchema.safeParse(blanks).success).toBe(true);
    // ...and a JavaScript stage test must still be a code_runner with examples.
    expect(ChallengeSchema.safeParse({ ...blanks, stageId: 'stage-1', language: 'javascript' }).success).toBe(false);
  });

  it('the schema rejects an unsolvable fill_blank', () => {
    const bad = { ...base, type: 'fill_blank', codeSnippet: 'x = ___', blanks: [{ answer: '1' }, { answer: '2' }] };
    expect(ChallengeSchema.safeParse(bad).success).toBe(false);
  });
});
