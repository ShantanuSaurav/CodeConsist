/**
 * The assistant's orchestration with a canned Gemini: what it asks for, and
 * how it folds whatever comes back onto the wizard's shape without ever
 * trusting it - bogus stages, over-long arrays, unknown ids, invalid kinds.
 */
import { describe, expect, it, vi } from 'vitest';
import { AiInputError, KINDS, draftQuestion, emptyDraft, findDuplicates, kindOf, kindToPreset, suggestQuestions } from '../ai-questions.js';

const STAGES = [
  { id: 'stage-1', index: '01', name: 'Programming Basics', language: 'javascript', description: 'Variables, types, operators, control flow.' },
  { id: 'stage-2', index: '02', name: 'Python Fundamentals', language: 'python', description: 'Lists, dicts, slicing, comprehensions.' },
  { id: 'stage-3', index: '03', name: 'Web Development', language: 'javascript', description: 'DOM, events, fetch and small pages.' }
];

const BANK = [
  { id: 'q-const', stageId: 'stage-1', type: 'quiz', language: 'javascript', title: 'Declare a constant', prompt: 'Which keyword declares a constant in JavaScript?', options: ['var', 'let', 'const'], correctIndex: 2 },
  { id: 'q-let', stageId: 'stage-1', type: 'quiz', language: 'javascript', title: 'Block scope keyword', prompt: 'Which keyword declares a block-scoped variable that can be reassigned?', options: ['var', 'let', 'const'], correctIndex: 1 },
  { id: 'q-sum', stageId: 'stage-2', type: 'code_runner', language: 'python', title: 'Sum a list', prompt: 'Write total(nums) that returns the sum of a list of numbers.', entryFunction: 'total', testCases: [{ input: '[1, 2, 3]', expected: '6' }] },
  { id: 'q-page', stageId: 'stage-3', type: 'code_runner', language: 'html', uiPreview: true, title: 'Counter button', prompt: 'Build a #counter button that counts clicks.', testCases: [{ input: '(() => true)()', expected: 'true' }] }
];

/** A Gemini that answers with a canned object and remembers what it was asked. */
const stubAi = (...answers) => {
  const generateJson = vi.fn(async () => {
    const next = answers.length > 1 ? answers.shift() : answers[0];
    return typeof next === 'function' ? next() : next;
  });
  return { configured: true, model: 'stub', generateJson };
};

const goodQuiz = {
  title: 'Declare a constant binding',
  prompt: 'Which keyword declares a value that cannot be reassigned?',
  explanation: 'const creates a binding that cannot be reassigned after initialisation.',
  difficulty: 'easy',
  xpReward: 35,
  language: 'javascript',
  hints: ['Think about which declarations forbid reassignment.'],
  tags: ['Variables', 'const'],
  options: ['var', 'let', 'const', 'static'],
  correctIndex: 2,
  fit: { stageId: 'stage-1', confidence: 0.92, reason: 'It is about variable declarations.', alternatives: [{ stageId: 'stage-3', reason: 'Also used in browser code.' }] }
};

describe('kindToPreset / kindOf / emptyDraft', () => {
  it('maps every kind the wizard knows and rejects the rest', () => {
    expect(kindToPreset('frontend')).toEqual({ type: 'code_runner', language: 'html', uiPreview: true });
    expect(kindToPreset('pseudocode_order')).toEqual({ type: 'pseudocode_order', language: 'pseudocode' });
    expect(kindToPreset('debug')).toEqual({ type: 'debug', language: 'javascript' });
    for (const kind of KINDS) expect(() => kindToPreset(kind)).not.toThrow();
    const err = (() => {
      try {
        kindToPreset('essay');
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(AiInputError);
    expect(err.status).toBe(400);
  });

  it('derives frontend from a code question in html', () => {
    expect(kindOf(BANK[3])).toBe('frontend');
    expect(kindOf(BANK[2])).toBe('code_runner');
    expect(kindOf(BANK[0])).toBe('quiz');
  });

  it('is the wizard\'s blank form', () => {
    expect(emptyDraft('stage-2')).toEqual({
      stageId: 'stage-2',
      type: 'quiz',
      title: '',
      prompt: '',
      explanation: '',
      language: 'javascript',
      difficulty: 'easy',
      xpReward: 40,
      hints: [],
      tags: [],
      codeSnippet: '',
      options: ['', '', '', ''],
      correctIndex: undefined,
      correctIndices: [],
      blanks: [],
      pseudocodeLines: ['', '', ''],
      starterCode: '',
      entryFunction: '',
      solutionCode: '',
      testCases: [
        { input: '', expected: '', hidden: false, description: '' },
        { input: '', expected: '', hidden: false, description: '' }
      ],
      uiPreview: false,
      examples: [],
      constraints: []
    });
  });
});

describe('draftQuestion', () => {
  it('returns a full blank-shaped draft with the kind preset and the fit Gemini named', async () => {
    const ai = stubAi(goodQuiz);
    const { draft, fit } = await draftQuestion({ ai, kind: 'quiz', text: 'Ask which keyword declares a constant. Correct: const.', stages: STAGES, bank: BANK });

    expect(Object.keys(draft).sort()).toEqual(Object.keys(emptyDraft('x')).sort());
    expect(draft).toMatchObject({
      stageId: 'stage-1',
      type: 'quiz',
      language: 'javascript',
      uiPreview: false,
      title: 'Declare a constant binding',
      difficulty: 'easy',
      xpReward: 35,
      options: ['var', 'let', 'const', 'static'],
      correctIndex: 2,
      correctIndices: [],
      tags: ['variables', 'const'],
      entryFunction: '',
      starterCode: ''
    });
    expect(fit).toEqual({ stageId: 'stage-1', confidence: 0.92, reason: 'It is about variable declarations.', alternatives: [{ stageId: 'stage-3', reason: 'Also used in browser code.' }] });

    const [{ system, user, schema, temperature }] = ai.generateJson.mock.calls[0];
    expect(temperature).toBe(0.3);
    expect(schema.required).toEqual(expect.arrayContaining(['title', 'prompt', 'explanation', 'difficulty', 'xpReward', 'fit']));
    expect(system).toContain('___');
    expect(system).toContain('(() => { ... })()');
    expect(system).toContain('FAIL at least one');
    expect(user).toContain('Kind: quiz');
    expect(user).toContain('stage-2 | 02 | Python Fundamentals | python');
    expect(user).toContain('Ask which keyword declares a constant.');
    expect(user).toContain('not chosen');
  });

  it('applies the frontend preset: html, uiPreview, no entry function, checks returning true', async () => {
    const ai = stubAi({
      title: 'Click counter',
      prompt: 'Build a #count element and a #add button that increments it.',
      explanation: 'Event listeners update the DOM in response to clicks.',
      difficulty: 'medium',
      xpReward: 60,
      language: 'javascript',
      entryFunction: 'shouldBeDropped',
      starterCode: '<div id="count">0</div>\r\n<button id="add">Add</button>\r\n<script>// TODO</script>',
      solutionCode: '<div id="count">0</div><button id="add">Add</button><script>add.onclick = () => count.textContent = Number(count.textContent) + 1;</script>',
      testCases: [
        { input: '(() => document.querySelector("#count") !== null)()', expected: 'true', hidden: false },
        { input: '(() => { document.querySelector("#add").click(); return document.querySelector("#count").textContent.trim() === "1"; })()', expected: 'true', hidden: true }
      ],
      fit: { stageId: 'stage-3', confidence: 0.8, reason: 'DOM work.', alternatives: [] }
    });
    const { draft } = await draftQuestion({ ai, kind: 'frontend', text: 'A counter button that increments a number on click.', stages: STAGES, bank: BANK });
    expect(draft).toMatchObject({ type: 'code_runner', language: 'html', uiPreview: true, entryFunction: '', stageId: 'stage-3' });
    expect(draft.starterCode).not.toContain('\r');
    expect(draft.testCases).toEqual([
      { input: '(() => document.querySelector("#count") !== null)()', expected: 'true', hidden: false, description: '' },
      { input: '(() => { document.querySelector("#add").click(); return document.querySelector("#count").textContent.trim() === "1"; })()', expected: 'true', hidden: true, description: '' }
    ]);
  });

  it('keeps the admin\'s stage but still reports the best fit, and tells Gemini which was chosen', async () => {
    const ai = stubAi(goodQuiz);
    const { draft, fit } = await draftQuestion({ ai, kind: 'quiz', text: 'Ask which keyword declares a constant.', stageId: 'stage-2', stages: STAGES, bank: BANK });
    expect(draft.stageId).toBe('stage-2');
    expect(fit.stageId).toBe('stage-1');
    expect(ai.generateJson.mock.calls[0][0].user).toContain('chosen stage: stage-2 (Python Fundamentals)');
  });

  it('falls back when Gemini names a stage that does not exist', async () => {
    const bogus = { ...goodQuiz, fit: { stageId: 'stage-99', confidence: 0.9, reason: 'Made up.', alternatives: [{ stageId: 'stage-2', reason: 'x' }, { stageId: 'nope', reason: 'y' }] } };
    const first = await draftQuestion({ ai: stubAi(bogus), kind: 'quiz', text: 'Ask which keyword declares a constant.', stages: STAGES, bank: BANK });
    expect(first.fit).toEqual({ stageId: 'stage-1', confidence: 0, reason: 'Gemini named a stage that does not exist.', alternatives: [] });
    expect(first.draft.stageId).toBe('stage-1');

    const chosen = await draftQuestion({ ai: stubAi(bogus), kind: 'quiz', text: 'Ask which keyword declares a constant.', stageId: 'stage-3', stages: STAGES, bank: BANK });
    expect(chosen.fit.stageId).toBe('stage-3');
    expect(chosen.draft.stageId).toBe('stage-3');

    const partly = { ...goodQuiz, fit: { stageId: 'stage-1', confidence: '1.7', reason: 'ok', alternatives: [{ stageId: 'nope' }, { stageId: 'stage-1' }, { stageId: 'stage-2', reason: 'r' }] } };
    const { fit } = await draftQuestion({ ai: stubAi(partly), kind: 'quiz', text: 'Ask which keyword declares a constant.', stages: STAGES, bank: BANK });
    expect(fit.confidence).toBe(1);
    expect(fit.alternatives).toEqual([{ stageId: 'stage-2', reason: 'r' }]);
  });

  it('caps arrays, coerces types and drops keys the wizard does not know', async () => {
    const ai = stubAi({
      ...goodQuiz,
      xpReward: '9999',
      difficulty: 'brutal',
      options: Array.from({ length: 12 }, (_, i) => `opt ${i}`),
      correctIndex: 11,
      hints: Array.from({ length: 9 }, (_, i) => `hint ${i}`),
      tags: Array.from({ length: 10 }, (_, i) => `t${i}`),
      surprise: 'nope',
      testCases: Array.from({ length: 25 }, () => ({ input: '1', expected: '1' })),
      pseudocodeLines: Array.from({ length: 25 }, (_, i) => `step ${i}`),
      blanks: Array.from({ length: 15 }, () => ({ answer: 'x' }))
    });
    const { draft } = await draftQuestion({ ai, kind: 'quiz', text: 'A quiz with far too much of everything in it.', stages: STAGES, bank: BANK });
    expect(draft).not.toHaveProperty('surprise');
    expect(draft.options).toHaveLength(8);
    expect(draft.correctIndex).toBeUndefined(); // pointed past the capped options
    expect(draft.hints).toHaveLength(6);
    expect(draft.tags).toHaveLength(8);
    expect(draft.xpReward).toBe(500);
    expect(draft.difficulty).toBe('easy');
    // A quiz never carries another kind's payload, whatever Gemini adds.
    expect(draft.testCases).toEqual(emptyDraft('x').testCases);
    expect(draft.pseudocodeLines).toEqual(['', '', '']);
    expect(draft.blanks).toEqual([]);

    const code = stubAi({
      ...goodQuiz,
      options: null,
      correctIndex: null,
      language: 'rust',
      entryFunction: 'add',
      starterCode: 'function add(a, b) {\n  // TODO\n}',
      solutionCode: 'function add(a, b) {\n  return a + b;\n}',
      testCases: Array.from({ length: 25 }, (_, i) => ({ input: `${i}, 1`, expected: String(i + 1), hidden: i > 20 })),
      examples: Array.from({ length: 8 }, () => ({ input: '1, 2', output: '3' })),
      constraints: Array.from({ length: 12 }, (_, i) => `c${i}`)
    });
    const coded = (await draftQuestion({ ai: code, kind: 'code_runner', text: 'Add two numbers together and return the sum.', stages: STAGES, bank: BANK })).draft;
    expect(coded).toMatchObject({ type: 'code_runner', language: 'javascript', entryFunction: 'add', options: ['', '', '', ''] });
    expect(coded.testCases).toHaveLength(20);
    expect(coded.testCases[0]).toEqual({ input: '0, 1', expected: '1', hidden: false, description: '' });
    expect(coded.examples).toHaveLength(6);
    expect(coded.examples[0]).toEqual({ input: '1, 2', output: '3', explanation: '' });
    expect(coded.constraints).toHaveLength(10);
  });

  it('keeps a runnable language for code and the stage language otherwise', async () => {
    const py = stubAi({ ...goodQuiz, language: 'python', entryFunction: 'total', starterCode: 'def total(nums):\n    pass', solutionCode: 'def total(nums):\n    return sum(nums)', testCases: [{ input: '[1, 2]', expected: '3' }] });
    expect((await draftQuestion({ ai: py, kind: 'debug', text: 'Sum a list but the loop skips the last item.', stages: STAGES, bank: BANK })).draft.language).toBe('python');

    const noLang = stubAi({ ...goodQuiz, language: null, fit: { ...goodQuiz.fit, stageId: 'stage-2' } });
    expect((await draftQuestion({ ai: noLang, kind: 'quiz', text: 'Ask what a list comprehension returns.', stages: STAGES, bank: BANK })).draft.language).toBe('python');

    const steps = stubAi({ ...goodQuiz, language: 'python', pseudocodeLines: ['SET total TO 0', 'FOR EACH n IN nums', '  ADD n TO total', 'RETURN total  '] });
    const ordered = (await draftQuestion({ ai: steps, kind: 'pseudocode_order', text: 'Steps to total a list of numbers.', stages: STAGES, bank: BANK })).draft;
    expect(ordered.language).toBe('pseudocode');
    expect(ordered.pseudocodeLines).toEqual(['SET total TO 0', 'FOR EACH n IN nums', '  ADD n TO total', 'RETURN total']);
  });

  it('refuses a bad kind, a short description and an unknown stage before calling Gemini', async () => {
    const ai = stubAi(goodQuiz);
    await expect(draftQuestion({ ai, kind: 'essay', text: 'long enough text here', stages: STAGES, bank: BANK })).rejects.toBeInstanceOf(AiInputError);
    await expect(draftQuestion({ ai, kind: 'quiz', text: 'short', stages: STAGES, bank: BANK })).rejects.toBeInstanceOf(AiInputError);
    await expect(draftQuestion({ ai, kind: 'quiz', text: 'long enough text here', stageId: 'stage-99', stages: STAGES, bank: BANK })).rejects.toMatchObject({ status: 400, message: 'No such stage.' });
    expect(ai.generateJson).not.toHaveBeenCalled();
  });
});

describe('findDuplicates', () => {
  const draft = { title: 'Declare a constant binding', prompt: 'Which keyword declares a value that cannot be reassigned?', type: 'quiz', language: 'javascript', options: ['var', 'let', 'const'], correctIndex: 2 };

  it('skips Gemini when nothing in the bank overlaps', async () => {
    const ai = stubAi({ items: [] });
    const result = await findDuplicates({ ai, draft: { title: 'Quantum flux', prompt: 'Explain tachyon reversal.', type: 'quiz' }, text: '', bank: BANK, stages: STAGES });
    expect(result).toEqual({ candidates: [], verdict: { push: 'yes', reason: 'Nothing in the bank overlaps with this question.' } });
    expect(ai.generateJson).not.toHaveBeenCalled();
  });

  it('answers no when Gemini labels a candidate duplicate, and ignores ids it invents', async () => {
    const ai = stubAi({ items: [{ id: 'q-const', verdict: 'duplicate', reason: 'Same keyword question.' }, { id: 'made-up', verdict: 'duplicate', reason: 'x' }] });
    const { candidates, verdict } = await findDuplicates({ ai, draft, text: 'which keyword declares a constant', bank: BANK, stages: STAGES });
    expect(verdict).toEqual({ push: 'no', reason: 'Already covered by "Declare a constant" (Programming Basics).' });
    expect(candidates.map((c) => c.id)).not.toContain('made-up');
    const top = candidates.find((c) => c.id === 'q-const');
    expect(top).toMatchObject({ title: 'Declare a constant', stageId: 'stage-1', stageName: 'Programming Basics', type: 'quiz', verdict: 'duplicate', reason: 'Same keyword question.' });
    expect(top.score).toBeGreaterThan(0.35);
    const other = candidates.find((c) => c.id === 'q-let');
    expect(other).toMatchObject({ verdict: 'distinct', reason: 'Not flagged.' });

    const [{ user, schema }] = ai.generateJson.mock.calls[0];
    expect(user).toContain('id: q-const');
    expect(user).toContain('Correct: const');
    expect(schema.properties.items.items.properties.verdict.enum).toEqual(['duplicate', 'similar', 'distinct']);
  });

  it('answers caution for a similar candidate with high overlap, and yes otherwise', async () => {
    const similar = stubAi({ items: [{ id: 'q-const', verdict: 'similar', reason: 'Same topic, different angle.' }] });
    const caution = await findDuplicates({ ai: similar, draft, text: 'which keyword declares a constant', bank: BANK, stages: STAGES });
    expect(caution.verdict).toEqual({ push: 'caution', reason: 'Close to "Declare a constant" - make sure it teaches something different.' });

    const distinct = stubAi({ items: [{ id: 'q-const', verdict: 'distinct', reason: 'Different thing.' }, { id: 'q-let', verdict: 'bogus', reason: '' }] });
    const yes = await findDuplicates({ ai: distinct, draft, text: 'which keyword declares a constant', bank: BANK, stages: STAGES });
    expect(yes.verdict).toEqual({ push: 'yes', reason: 'Nothing in the bank covers this - go ahead.' });
    expect(yes.candidates.find((c) => c.id === 'q-let')).toMatchObject({ verdict: 'distinct', reason: 'Not flagged.' });

    // A "similar" that only faintly overlaps in wording is not worth a warning.
    const faint = stubAi({ items: [{ id: 'q-let', verdict: 'similar', reason: 'Loosely related.' }] });
    const faintResult = await findDuplicates({ ai: faint, draft: { title: 'Variables', prompt: 'Which keyword can be reassigned?', type: 'quiz' }, text: '', bank: BANK, stages: STAGES });
    const flagged = faintResult.candidates.find((c) => c.id === 'q-let');
    expect(flagged.verdict).toBe('similar');
    expect(flagged.score).toBeLessThan(0.35);
    expect(faintResult.verdict.push).toBe('yes');
  });
});

describe('suggestQuestions', () => {
  const ideas = {
    suggestions: [
      { title: 'Declare a constant', prompt: 'Which keyword declares a constant in JavaScript?', kind: 'quiz', difficulty: 'easy', why: 'Repeats an existing one.' },
      { title: 'Ternary operator result', prompt: 'Predict what a ternary expression evaluates to.', kind: 'output_prediction', difficulty: 'medium', why: 'No operator questions yet.' },
      { title: 'Essay on loops', prompt: 'Write an essay.', kind: 'essay', difficulty: 'hard', why: 'Invalid kind.' },
      { title: 'Nested loop order', prompt: 'Order the steps of a nested loop.', kind: 'pseudocode_order', difficulty: 'weird', why: 'No ordering question.' },
      { title: '', prompt: 'No title.', kind: 'quiz', difficulty: 'easy', why: 'Dropped.' }
    ]
  };

  it('drops invalid kinds, fixes difficulty and flags novelty from the bank', async () => {
    const ai = stubAi(ideas);
    const { suggestions } = await suggestQuestions({ ai, stage: STAGES[0], kind: '', count: 5, bank: BANK });
    expect(suggestions.map((s) => s.kind)).toEqual(['quiz', 'output_prediction', 'pseudocode_order']);
    expect(suggestions[0]).toMatchObject({ novel: false });
    expect(suggestions[0].overlaps[0]).toMatchObject({ id: 'q-const', title: 'Declare a constant' });
    expect(suggestions[0].overlaps[0].score).toBeGreaterThanOrEqual(0.35);
    expect(suggestions[1]).toMatchObject({ novel: true, overlaps: [] });
    expect(suggestions[2].difficulty).toBe('medium');
    for (const s of suggestions) expect(Object.keys(s).sort()).toEqual(['difficulty', 'kind', 'novel', 'overlaps', 'prompt', 'title', 'why']);

    const [{ user, temperature }] = ai.generateJson.mock.calls[0];
    expect(temperature).toBe(0.9);
    expect(user).toContain('Questions wanted: 5');
    expect(user).toContain('[q-const] quiz');
    expect(user).toContain('- Sum a list'); // the other stages' titles
    expect(user).not.toContain('q-sum'); // ...but only their titles
  });

  it('clamps count and pins the kind when one was asked for', async () => {
    const many = { suggestions: Array.from({ length: 30 }, (_, i) => ({ title: `Idea ${i}`, prompt: `Do thing number ${i} with a loop.`, kind: 'quiz', difficulty: 'easy', why: 'gap' })) };
    const ai = stubAi(many);
    expect((await suggestQuestions({ ai, stage: STAGES[0], count: 99, bank: BANK })).suggestions).toHaveLength(10);
    expect(ai.generateJson.mock.calls[0][0].user).toContain('Questions wanted: 10');
    expect((await suggestQuestions({ ai, stage: STAGES[0], count: 0, bank: BANK })).suggestions).toHaveLength(1);
    expect((await suggestQuestions({ ai, stage: STAGES[0], count: 'lots', bank: BANK })).suggestions).toHaveLength(5);

    const pinned = await suggestQuestions({ ai: stubAi(ideas), stage: STAGES[0], kind: 'debug', count: 3, bank: BANK });
    expect(pinned.suggestions.every((s) => s.kind === 'debug')).toBe(true);
    expect(pinned.suggestions).toHaveLength(3);

    await expect(suggestQuestions({ ai: stubAi(ideas), stage: STAGES[0], kind: 'essay', count: 3, bank: BANK })).rejects.toBeInstanceOf(AiInputError);
    await expect(suggestQuestions({ ai: stubAi(ideas), stage: null, count: 3, bank: BANK })).rejects.toBeInstanceOf(AiInputError);
  });
});
