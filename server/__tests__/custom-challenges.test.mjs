import { describe, expect, it } from 'vitest';
import { PRESERVED_FIELDS, generateChallengeId, mergeIssues, normalizeChallengeInput } from '../custom-challenges.js';

const STAGES = ['stage-1', 'stage-2'];
const base = {
  stageId: 'stage-1',
  title: 'A tidy title',
  prompt: 'What does this print to the console?',
  explanation: 'Because the variable holds a number, typeof reports "number".',
  language: 'javascript',
  difficulty: 'easy',
  xpReward: 40
};
const run = (body) => normalizeChallengeInput(body, { stageIds: STAGES, id: 'custom-x' });
const paths = (r) => r.issues.map((i) => i.path);

describe('normalizeChallengeInput - common fields', () => {
  it('accepts a complete quiz and strips unknown keys', () => {
    const r = run({ ...base, type: 'quiz', options: ['a', 'b', 'c', 'd'], correctIndex: 2, optionCount: 4, questionKind: 'mcq' });
    expect(r.issues).toEqual([]);
    expect(r.candidate).toEqual({
      id: 'custom-x',
      stageId: 'stage-1',
      title: 'A tidy title',
      type: 'quiz',
      difficulty: 'easy',
      language: 'javascript',
      prompt: base.prompt,
      explanation: base.explanation,
      xpReward: 40,
      options: ['a', 'b', 'c', 'd'],
      correctIndex: 2
    });
    expect(Object.values(r.candidate)).not.toContain(undefined);
  });

  it('names every missing common field', () => {
    const r = run({ type: 'quiz', options: ['a', 'b'], correctIndex: 0 });
    expect(paths(r)).toEqual(expect.arrayContaining(['stageId', 'language', 'title', 'prompt', 'explanation', 'xpReward']));
  });

  it('rejects an unknown type and an unknown stage', () => {
    const r = run({ ...base, stageId: 'stage-99', type: 'frontend' });
    expect(paths(r)).toEqual(expect.arrayContaining(['type', 'stageId']));
  });

  it('caps hints and tags and drops blanks', () => {
    const r = run({ ...base, type: 'quiz', options: ['a', 'b'], correctIndex: 0, hints: ['', ' one ', 'two', '3', '4', '5', '6', '7'], tags: [] });
    expect(r.candidate.hints).toEqual(['one', 'two', '3', '4', '5', '6']);
    expect(r.candidate).not.toHaveProperty('tags');
  });
});

describe('normalizeChallengeInput - options types', () => {
  it('flags an empty option by letter instead of silently dropping it', () => {
    const r = run({ ...base, type: 'quiz', options: ['a', '', 'c'], correctIndex: 0 });
    expect(r.issues).toContainEqual({ path: 'options.1', message: 'Option B is empty - write the option text or remove it.' });
  });

  it('flags a duplicate option, but options differing only by case are distinct answers', () => {
    const r = run({ ...base, type: 'quiz', options: ['a', ' a ', 'c'], correctIndex: 0 });
    expect(r.issues).toContainEqual({ path: 'options.1', message: 'Option B repeats another option.' });
    expect(run({ ...base, type: 'quiz', options: ['True', 'true', 'TRUE'], correctIndex: 0 }).issues).toEqual([]);
  });

  it('requires a correct option that exists', () => {
    expect(paths(run({ ...base, type: 'quiz', options: ['a', 'b'] }))).toContain('correctIndex');
    expect(paths(run({ ...base, type: 'quiz', options: ['a', 'b'], correctIndex: 5 }))).toContain('correctIndex');
  });

  it('multi_select needs at least one ticked option, sorted and unique', () => {
    expect(paths(run({ ...base, type: 'multi_select', options: ['a', 'b', 'c'], correctIndices: [] }))).toContain('correctIndices');
    const r = run({ ...base, type: 'multi_select', options: ['a', 'b', 'c'], correctIndices: [2, 0, 2] });
    expect(r.issues).toEqual([]);
    expect(r.candidate.correctIndices).toEqual([0, 2]);
  });

  it('output_prediction needs the code snippet', () => {
    expect(paths(run({ ...base, type: 'output_prediction', options: ['a', 'b'], correctIndex: 0 }))).toContain('codeSnippet');
    expect(run({ ...base, type: 'output_prediction', options: ['a', 'b'], correctIndex: 0, codeSnippet: 'console.log(1)' }).issues).toEqual([]);
  });
});

describe('normalizeChallengeInput - fill_blank', () => {
  it('needs exactly one answer per ___', () => {
    const r = run({ ...base, type: 'fill_blank', codeSnippet: 'let x = ___;\nlet y = ___;', blanks: [{ answer: '1' }] });
    expect(r.issues).toContainEqual({ path: 'blanks', message: 'The code has 2 blanks (___) but 1 answer - give exactly one answer per blank.' });
  });

  it('a dropdown must contain the answer', () => {
    const r = run({ ...base, type: 'fill_blank', codeSnippet: 'let x = ___;', blanks: [{ answer: 'let', choices: ['var', 'const'] }] });
    expect(paths(r)).toContain('blanks.0.choices');
    const ok = run({ ...base, type: 'fill_blank', codeSnippet: 'let x = ___;', blanks: [{ answer: 'let', alternatives: [], choices: ['var', 'LET'] }] });
    expect(ok.issues).toEqual([]);
    expect(ok.candidate.blanks).toEqual([{ answer: 'let', choices: ['var', 'LET'] }]);
  });
});

describe('normalizeChallengeInput - pseudocode_order', () => {
  it('needs three non-empty steps and keeps their given (correct) order', () => {
    expect(paths(run({ ...base, type: 'pseudocode_order', pseudocodeLines: ['a', 'b'] }))).toContain('pseudocodeLines');
    const r = run({ ...base, type: 'pseudocode_order', pseudocodeLines: ['FOR EACH n IN numbers  ', '  IF n > largest', 'END FOR'], codeSnippet: 'ignored' });
    expect(r.issues).toEqual([]);
    expect(r.candidate.pseudocodeLines).toEqual(['FOR EACH n IN numbers', '  IF n > largest', 'END FOR']);
    expect(r.candidate).not.toHaveProperty('codeSnippet');
  });
});

describe('normalizeChallengeInput - code types', () => {
  const code = {
    ...base,
    type: 'code_runner',
    starterCode: 'function add(a, b) {\n  // your code here\n}',
    solutionCode: 'function add(a, b) { return a + b; }',
    entryFunction: 'add',
    testCases: [{ input: '1, 2', expected: '3', description: 'adds' }, { input: '0, 0', expected: '0', hidden: 'true' }]
  };

  it('accepts a complete coding question and normalises test cases', () => {
    const r = run(code);
    expect(r.issues).toEqual([]);
    expect(r.candidate.testCases).toEqual([{ input: '1, 2', expected: '3', description: 'adds' }, { input: '0, 0', expected: '0', hidden: true }]);
    expect(r.candidate.entryFunction).toBe('add');
    expect(r.candidate).not.toHaveProperty('uiPreview');
  });

  it('requires starter, solution, entry function and a test case', () => {
    const r = run({ ...base, type: 'code_runner', testCases: [] });
    expect(paths(r)).toEqual(expect.arrayContaining(['starterCode', 'solutionCode', 'entryFunction', 'testCases']));
  });

  it('the entry function must appear in the solution', () => {
    const r = run({ ...code, entryFunction: 'sum' });
    expect(r.issues).toContainEqual({ path: 'entryFunction', message: 'The solution does not define a function called "sum".' });
  });

  it('a frontend question is HTML with uiPreview and no entry function', () => {
    const r = run({ ...code, language: 'html', uiPreview: true, entryFunction: '', testCases: [{ input: '(() => document.querySelector("h1")?.textContent === "Hi")()', expected: 'true' }] });
    expect(r.issues).toEqual([]);
    expect(r.candidate.uiPreview).toBe(true);
    expect(r.candidate).not.toHaveProperty('entryFunction');
    expect(paths(run({ ...code, language: 'python', uiPreview: true }))).toContain('language');
  });

  it('debug uses the same shape', () => {
    expect(run({ ...code, type: 'debug' }).issues).toEqual([]);
  });
});

describe('generateChallengeId', () => {
  it('is lowercase, dashed, prefixed and unique', () => {
    const id = generateChallengeId('stage-1', 'Hello, World! ✓', [], () => 0.5);
    expect(id).toMatch(/^custom-stage-1-hello-world-[a-z0-9]{4}$/);
    expect(id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    const taken = generateChallengeId('stage-1', 'x', [], () => 0.5);
    expect(generateChallengeId('stage-1', 'x', [taken], (() => { let n = 0; return () => (n++ ? 0.25 : 0.5); })())).not.toBe(taken);
  });
});

describe('mergeIssues', () => {
  it('drops exact duplicates', () => {
    expect(mergeIssues([{ path: 'a', message: 'm' }], [{ path: 'a', message: 'm' }, { path: 'b', message: 'm' }])).toHaveLength(2);
  });
});

describe('normalizeChallengeInput - review follow-ups', () => {
  const code = {
    ...base,
    type: 'code_runner',
    starterCode: 'function add(a, b) {}',
    solutionCode: 'function add(a, b) { return a + b; }',
    entryFunction: 'add',
    testCases: [{ input: '1, 2', expected: '3' }]
  };

  it('refuses code questions in languages nothing can grade', () => {
    for (const language of ['java', 'c', 'cpp', 'go', 'sql', 'bash', 'css', 'pseudocode']) {
      expect(paths(run({ ...code, language }))).toContain('language');
    }
    expect(run({ ...code, language: 'typescript' }).issues).toEqual([]);
    expect(run({ ...code, language: 'python', starterCode: 'def add(a, b): pass', solutionCode: 'def add(a, b): return a + b' }).issues).toEqual([]);
  });

  it('checks dropdown choices the way the grader does (case only for single words)', () => {
    const bad = run({ ...base, type: 'fill_blank', codeSnippet: 'x = ___', blanks: [{ answer: 'a + b', choices: ['A + B', 'a - b'] }] });
    expect(paths(bad)).toContain('blanks.0.choices');
    const ok = run({ ...base, type: 'fill_blank', codeSnippet: 'x = ___', blanks: [{ answer: 'a + b', choices: ['a  +  b', 'a - b'] }] });
    expect(ok.issues).toEqual([]);
  });

  it('caps oversized fields with a message naming the field', () => {
    const r = run({ ...code, solutionCode: 'x'.repeat(20001), prompt: 'p'.repeat(4001) });
    expect(paths(r)).toEqual(expect.arrayContaining(['solutionCode', 'prompt']));
  });
});

describe('normalizeChallengeInput - worked examples and constraints', () => {
  const code = {
    ...base,
    type: 'code_runner',
    starterCode: 'function add(a, b) {}',
    solutionCode: 'function add(a, b) { return a + b; }',
    entryFunction: 'add',
    testCases: [{ input: '1, 2', expected: '3' }]
  };

  it('tidies examples and constraints on code questions and drops the keys when empty', () => {
    const r = run({ ...code, examples: [{ input: ' 1, 2 ', output: '3', explanation: '' }, { input: '0, 0', output: '0', explanation: ' adds nothing ' }], constraints: [' a <= 10 ', '', 'b >= 0'] });
    expect(r.issues).toEqual([]);
    expect(r.candidate.examples).toEqual([{ input: '1, 2', output: '3' }, { input: '0, 0', output: '0', explanation: 'adds nothing' }]);
    expect(r.candidate.constraints).toEqual(['a <= 10', 'b >= 0']);

    const empty = run({ ...code, examples: [], constraints: ['', '  '] });
    expect(empty.issues).toEqual([]);
    expect(empty.candidate).not.toHaveProperty('examples');
    expect(empty.candidate).not.toHaveProperty('constraints');
    expect(Object.values(empty.candidate)).not.toContain(undefined);
  });

  it('names the example that is missing its input or output', () => {
    const r = run({ ...code, examples: [{ input: '', output: '3' }, { input: '1, 2', output: '' }] });
    expect(r.issues).toContainEqual({ path: 'examples.0.input', message: 'Example 1 needs the input the learner would be given.' });
    expect(r.issues).toContainEqual({ path: 'examples.1.output', message: 'Example 2 needs the output a correct solution produces.' });
  });

  it('caps the counts and the lengths', () => {
    const many = run({ ...code, examples: Array.from({ length: 7 }, () => ({ input: 'x', output: 'y' })), constraints: Array.from({ length: 11 }, () => 'c') });
    expect(many.issues).toContainEqual({ path: 'examples', message: 'At most 6 worked examples.' });
    expect(many.issues).toContainEqual({ path: 'constraints', message: 'At most 10 constraints.' });
    const long = run({ ...code, examples: [{ input: 'x'.repeat(4001), output: 'y'.repeat(4001), explanation: 'z'.repeat(4001) }], constraints: ['c'.repeat(4001)] });
    expect(paths(long)).toEqual(expect.arrayContaining(['examples.0.input', 'examples.0.output', 'examples', 'constraints']));
  });

  it('ignores them on every other type', () => {
    const r = run({ ...base, type: 'quiz', options: ['a', 'b'], correctIndex: 0, examples: [{ input: '', output: '' }], constraints: ['x'] });
    expect(r.issues).toEqual([]);
    expect(r.candidate).not.toHaveProperty('examples');
    expect(r.candidate).not.toHaveProperty('constraints');
  });
});

describe('normalizeChallengeInput - modifying an authored question (preserve)', () => {
  const code = {
    ...base,
    type: 'code_runner',
    starterCode: 'function add(a, b) {}',
    solutionCode: 'function add(a, b) { return a + b; }',
    entryFunction: 'add',
    testCases: [{ input: '1, 2', expected: '3' }],
    examples: [{ input: '1, 2', output: '3' }]
  };
  const concept = { id: 'c', title: 't', summary: 's', intro: 'i', example: { code: 'x', language: 'javascript' }, why: 'w' };
  // An authored original always has a stageId; the tests below only vary what matters to them.
  const runWith = (body, preserve) => normalizeChallengeInput(body, { stageIds: STAGES, id: 'stage-1-a00', preserve: { stageId: 'stage-1', ...preserve } });

  it('keeps the question in the authored stage', () => {
    const moved = runWith({ ...base, stageId: 'stage-2', type: 'quiz', options: ['a', 'b'], correctIndex: 0 }, { isStageTest: false });
    expect(moved.issues).toEqual([{ path: 'stageId', message: 'A built-in question stays in its stage - hide it here and write a new one in the other stage instead.' }]);
    expect(runWith({ ...base, type: 'quiz', options: ['a', 'b'], correctIndex: 0 }, {}).issues).toEqual([]);
    // A created question (no preserve) can move freely.
    expect(run({ ...base, stageId: 'stage-2', type: 'quiz', options: ['a', 'b'], correctIndex: 0 }).issues).toEqual([]);
  });

  it('carries the preserved fields over from the authored original, and only those', () => {
    expect(PRESERVED_FIELDS).toEqual(['concept', 'isStageTest', 'uiTemplate']);
    const r = runWith({ ...base, type: 'quiz', options: ['a', 'b'], correctIndex: 0 }, { concept, uiTemplate: 'tpl', title: 'Authored title', examples: [{ input: 'a', output: 'b' }] });
    expect(r.issues).toEqual([]);
    expect(r.candidate.concept).toEqual(concept);
    expect(r.candidate.uiTemplate).toBe('tpl');
    expect(r.candidate.title).toBe('A tidy title');
    expect(r.candidate).not.toHaveProperty('isStageTest');
    expect(r.candidate).not.toHaveProperty('examples');
    expect(Object.values(r.candidate)).not.toContain(undefined);
  });

  it('what the body sends wins for examples and constraints', () => {
    const r = runWith({ ...code, examples: [{ input: '5, 5', output: '10' }], constraints: [] }, { isStageTest: true, constraints: ['authored'] });
    expect(r.issues).toEqual([]);
    expect(r.candidate.examples).toEqual([{ input: '5, 5', output: '10' }]);
    expect(r.candidate).not.toHaveProperty('constraints');
    expect(r.candidate.isStageTest).toBe(true);
  });

  it('an executable stage test must stay a code question with a worked example', () => {
    const asQuiz = runWith({ ...base, type: 'quiz', options: ['a', 'b'], correctIndex: 0 }, { isStageTest: true });
    expect(asQuiz.issues).toContainEqual({ path: 'type', message: "This is the stage's final test, so it has to stay a code question." });
    const asDebug = runWith({ ...code, type: 'debug' }, { isStageTest: true });
    expect(paths(asDebug)).toContain('type');
    const noExample = runWith({ ...code, examples: [] }, { isStageTest: true });
    expect(noExample.issues).toContainEqual({ path: 'examples', message: 'A stage test needs at least one worked example - learners see it instead of hints.' });
    expect(runWith(code, { isStageTest: true }).issues).toEqual([]);
  });

  it('a stage test in a language nothing can run must stay answer-graded', () => {
    const blanks = { ...base, language: 'c', type: 'fill_blank', codeSnippet: 'int x = ___;', blanks: [{ answer: '1' }] };
    expect(runWith(blanks, { isStageTest: true }).issues).toEqual([]);
    const asCode = runWith({ ...code, language: 'c' }, { isStageTest: true });
    expect(paths(asCode)).toContain('type');
  });

  it('is a no-op without preserve, or when the original is not a stage test', () => {
    const r = runWith({ ...base, type: 'quiz', options: ['a', 'b'], correctIndex: 0 }, { isStageTest: false });
    expect(r.issues).toEqual([]);
    expect(r.candidate.isStageTest).toBe(false);
    expect(run({ ...base, type: 'quiz', options: ['a', 'b'], correctIndex: 0 }).candidate).not.toHaveProperty('concept');
  });
});
