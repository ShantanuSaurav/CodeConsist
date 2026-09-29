/**
 * Shared set-up for the Phase 5 route tests (progression.test.mjs,
 * assessments.test.mjs): a small bank with a real stage path, so the stage
 * order, test-outs and placements have something to walk.
 *
 *   core:  p1 -> p2 -> p3 -> p4 (premium) -> p5
 *   c:     c1
 *   py:    y1 (its test is Python code this server "cannot run": verified false)
 *
 * Every stage has two quiz lessons (`<stage>-a`, `<stage>-b`, answer 1) and a
 * quiz stage test (`<stage>-test`, answer 0, 100 XP). Not a test file itself.
 */
import { completedStagesFor as clearedStagesFor } from '../progression.js';
import { lib } from './learning-fixture.mjs';

const stageMeta = (id, index, extra = {}) => ({ id, index, name: `Stage ${index}`, slug: id, language: 'javascript', description: '', ...extra });

const quiz = (id, stageId, extra = {}) => ({
  id,
  stageId,
  title: id,
  type: 'quiz',
  difficulty: 'easy',
  language: 'javascript',
  prompt: 'p',
  explanation: 'e',
  options: ['Zero', 'One'],
  correctIndex: 1,
  xpReward: 20,
  ...extra
});

const STAGES = [
  stageMeta('p1', '01'),
  stageMeta('p2', '02'),
  stageMeta('p3', '03'),
  stageMeta('p4', '04', { isPremium: true }),
  stageMeta('p5', '05'),
  stageMeta('c1', '01', { language: 'c' }),
  stageMeta('y1', '01', { language: 'python' })
];

function stageChallenges(stageId) {
  const test =
    stageId === 'y1'
      ? { ...quiz(`${stageId}-test`, stageId), type: 'code_runner', language: 'python', entryFunction: 'f', testCases: [{ input: '1', expected: '1' }], isStageTest: true, xpReward: 100 }
      : quiz(`${stageId}-test`, stageId, { correctIndex: 0, isStageTest: true, xpReward: 100 });
  return [quiz(`${stageId}-a`, stageId), quiz(`${stageId}-b`, stageId), test];
}

export const SNAPSHOT = {
  stages: STAGES,
  challenges: STAGES.flatMap((s) => stageChallenges(s.id)),
  languageTracks: [
    { id: 'core', label: 'Developer path', stageIds: ['p1', 'p2', 'p3', 'p4', 'p5'] },
    { id: 'c', label: 'C', stageIds: ['c1'] },
    { id: 'py', label: 'Python', stageIds: ['y1'] }
  ]
};

const BY_ID = new Map(SNAPSHOT.challenges.map((c) => [c.id, c]));

export const getChallenge = (id) => (typeof id === 'string' && BY_ID.has(id) ? BY_ID.get(id) : null);

/** Every lesson and the test of a stage, in order. */
export const cleared = (...stageIds) => stageIds.flatMap((id) => [`${id}-a`, `${id}-b`, `${id}-test`]);

/** The code this fixture's Python test "passes" with. */
export const PASSING_PY = 'def f(x): return x';

/**
 * The server's verdict, minus the sandbox. Answer-graded questions are
 * checked for real; the Python test passes with PASSING_PY but, like a
 * server without CPython, cannot be verified.
 */
export async function verifySubmission(challenge, body) {
  if (challenge.language === 'python') return { ok: body.code === PASSING_PY, verified: false, reason: 'Taken on trust.' };
  if (body.answer === undefined) return { ok: false, verified: true, reason: 'No answer was submitted.' };
  return { ok: lib.gradeAnswer(challenge, body.answer), verified: true, reason: 'Answer checked by the server.' };
}

/** What the routes judge the stage order against (server/index.js progressionContent). */
export const contentFor = (store, extra = {}) => ({ snapshot: SNAPSHOT, overrides: store.getContentOverrides(), premiumEnforced: true, ...extra });

/** server/index.js completedStagesFor over this bank. */
export const completedStagesFor = (store) => (ids, testedOut) => clearedStagesFor(ids, testedOut, { snapshot: SNAPSHOT, overrides: store.getContentOverrides() });
