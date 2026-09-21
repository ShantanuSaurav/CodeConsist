/**
 * Turning what the admin console sends into a Challenge the schema can judge.
 *
 * The console's form is deliberately looser than the schema (a blank option
 * is a row the admin has not filled in yet, not a crash), so this module does
 * the tidying and the friendly, field-level checks first, and only then is
 * the result handed to the zod ChallengeSchema (compiled from
 * src/modules/challenges/schema.ts by server/index.js) for the authoritative
 * verdict. Every message here names the field it is about, in the words the
 * form uses, so the console can show it next to the right input.
 *
 * Pure functions, no I/O - see server/__tests__/custom-challenges.test.mjs.
 */

export const CHALLENGE_TYPES = ['quiz', 'multi_select', 'output_prediction', 'fill_blank', 'pseudocode_order', 'debug', 'code_runner'];
export const DIFFICULTIES = ['easy', 'medium', 'hard'];
export const LANGUAGES = ['javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'go', 'sql', 'html', 'css', 'bash', 'pseudocode'];
/** Languages whose solutions the server can actually execute. */
export const EXECUTABLE_LANGUAGES = ['javascript', 'typescript', 'python'];

export const MAX_OPTIONS = 8;
export const MAX_TEST_CASES = 20;
export const MAX_LINES = 20;
export const MAX_BLANKS = 12;
export const MAX_EXAMPLES = 6;
export const MAX_CONSTRAINTS = 10;

/**
 * Fields the console's wizard does not manage. When an authored question is
 * modified (replaced under its own id), these are carried over from the
 * authored original so a Learn-mode concept or a stage test's role survives
 * the edit. `examples`/`constraints` are NOT here: the wizard edits them, so
 * what the body sends wins.
 */
export const PRESERVED_FIELDS = ['concept', 'isStageTest', 'uiTemplate'];
/** Generous, but bounded: the whole request is capped at 256kb by the app's body parser. */
export const MAX_TEXT = 4000;
export const MAX_CODE = 20000;

/**
 * Same rule as the grader (src/platform/grading-engine/grading.ts checkBlank):
 * whitespace is trimmed and collapsed, and case is ignored only when the
 * accepted answer is a single plain word.
 */
export function blankMatches(given, accepted) {
  const norm = (s) => String(s).trim().replace(/\s+/g, ' ');
  const g = norm(given);
  const a = norm(accepted);
  return /^[a-z0-9_]+$/i.test(a) ? g.toLowerCase() === a.toLowerCase() : g === a;
}

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const trimmed = (v) => str(v).trim();
const list = (v) => (Array.isArray(v) ? v : []);
const strings = (v) => list(v).map(trimmed).filter(Boolean);
const bool = (v) => v === true || v === 'true';

/**
 * Build the candidate challenge from a request body. Returns
 * { candidate, issues } where `issues` are the problems worth telling the
 * admin about before the schema even looks (it would only say "needs
 * correctIndex"). `candidate` never carries a key the strict schema does not
 * know, and never carries `undefined` values.
 *
 * `preserve` is the authored original when an authored question is being
 * modified: its PRESERVED_FIELDS are copied onto the candidate, it must keep
 * its stageId, and a stage test is held to the schema's stage-test rules with
 * a friendlier message.
 */
export function normalizeChallengeInput(body, { stageIds, id, preserve }) {
  const issues = [];
  const need = (cond, path, message) => {
    if (!cond) issues.push({ path, message });
  };
  const b = body && typeof body === 'object' ? body : {};

  const type = trimmed(b.type);
  const language = trimmed(b.language);
  const difficulty = trimmed(b.difficulty) || 'easy';
  const stageId = trimmed(b.stageId);

  need(CHALLENGE_TYPES.includes(type), 'type', 'Pick a question type.');
  need(stageIds.includes(stageId), 'stageId', 'Pick the stage this question belongs to.');
  need(LANGUAGES.includes(language), 'language', 'Pick the language the question is about.');
  need(DIFFICULTIES.includes(difficulty), 'difficulty', 'Difficulty must be easy, medium or hard.');

  const title = trimmed(b.title);
  need(title.length >= 3, 'title', 'Give the question a short title (at least 3 characters).');
  need(title.length <= 120, 'title', 'Keep the title under 120 characters.');

  const prompt = trimmed(b.prompt);
  need(prompt.length >= 10, 'prompt', 'Write the question itself - what the learner has to answer or do (at least 10 characters).');
  need(prompt.length <= MAX_TEXT, 'prompt', `Keep the prompt under ${MAX_TEXT} characters.`);

  const explanation = trimmed(b.explanation);
  need(explanation.length >= 10, 'explanation', 'Write the explanation shown after answering - why the right answer is right (at least 10 characters).');
  need(explanation.length <= MAX_TEXT, 'explanation', `Keep the explanation under ${MAX_TEXT} characters.`);

  const xpReward = Number(b.xpReward);
  need(Number.isInteger(xpReward) && xpReward >= 5 && xpReward <= 500, 'xpReward', 'XP must be a whole number between 5 and 500.');

  const candidate = {
    id,
    stageId,
    title,
    type,
    difficulty,
    language,
    prompt,
    explanation,
    xpReward: Number.isInteger(xpReward) ? xpReward : 0
  };

  const hints = strings(b.hints).slice(0, 6);
  if (hints.length) candidate.hints = hints;
  const tags = strings(b.tags).slice(0, 8);
  if (tags.length) candidate.tags = tags;

  const codeSnippet = str(b.codeSnippet).replace(/\r\n/g, '\n');
  need(codeSnippet.length <= MAX_CODE, 'codeSnippet', `Keep the code under ${MAX_CODE} characters.`);
  if (codeSnippet.trim()) candidate.codeSnippet = codeSnippet;

  switch (type) {
    case 'quiz':
    case 'output_prediction':
    case 'multi_select': {
      const options = list(b.options).map(trimmed);
      need(options.length >= 2, 'options', 'Add at least two answer options.');
      need(options.length <= MAX_OPTIONS, 'options', `At most ${MAX_OPTIONS} options.`);
      options.forEach((o, i) => need(Boolean(o), `options.${i}`, `Option ${String.fromCharCode(65 + i)} is empty - write the option text or remove it.`));
      options.forEach((o, i) => need(o.length <= MAX_TEXT, `options.${i}`, `Option ${String.fromCharCode(65 + i)} is too long (max ${MAX_TEXT} characters).`));
      // Exact (trimmed) matches only: options that differ by case alone are a
      // legitimate question about case sensitivity, not a repeat.
      const seen = new Set();
      options.forEach((o, i) => {
        if (o && seen.has(o)) issues.push({ path: `options.${i}`, message: `Option ${String.fromCharCode(65 + i)} repeats another option.` });
        seen.add(o);
      });
      candidate.options = options;
      if (type === 'multi_select') {
        const correct = [...new Set(list(b.correctIndices).map(Number).filter((n) => Number.isInteger(n)))].sort((a, c) => a - c);
        need(correct.length >= 1, 'correctIndices', 'Tick every option that is correct (at least one).');
        need(correct.every((i) => i >= 0 && i < options.length), 'correctIndices', 'A ticked option no longer exists - tick the correct option(s) again.');
        candidate.correctIndices = correct;
      } else {
        const correct = Number(b.correctIndex);
        need(Number.isInteger(correct) && correct >= 0, 'correctIndex', 'Choose which option is the correct answer.');
        need(!Number.isInteger(correct) || correct < options.length, 'correctIndex', 'The correct option no longer exists - choose the correct option again.');
        if (Number.isInteger(correct)) candidate.correctIndex = correct;
      }
      if (type === 'output_prediction') need(Boolean(candidate.codeSnippet), 'codeSnippet', 'Predict-the-output needs the code whose output the learner predicts.');
      break;
    }

    case 'fill_blank': {
      const holes = (candidate.codeSnippet?.match(/___/g) ?? []).length;
      need(Boolean(candidate.codeSnippet), 'codeSnippet', 'Paste the code and write ___ (three underscores) where each blank goes.');
      need(holes >= 1, 'codeSnippet', 'The code has no blanks yet - write ___ (three underscores) where the learner should type.');
      need(holes <= MAX_BLANKS, 'codeSnippet', `At most ${MAX_BLANKS} blanks.`);
      const blanks = list(b.blanks).map((raw) => {
        const blank = { answer: trimmed(raw?.answer) };
        const alternatives = strings(raw?.alternatives);
        if (alternatives.length) blank.alternatives = alternatives;
        const choices = strings(raw?.choices);
        if (choices.length) blank.choices = choices;
        return blank;
      });
      need(blanks.length === holes, 'blanks', `The code has ${holes} blank${holes === 1 ? '' : 's'} (___) but ${blanks.length} answer${blanks.length === 1 ? '' : 's'} - give exactly one answer per blank.`);
      blanks.forEach((blank, i) => {
        need(Boolean(blank.answer), `blanks.${i}.answer`, `Blank ${i + 1} needs its correct answer.`);
        if (blank.choices) {
          const accepted = [blank.answer, ...(blank.alternatives ?? [])];
          need(blank.choices.some((c) => accepted.some((a) => blankMatches(c, a))), `blanks.${i}.choices`, `Blank ${i + 1}: the correct answer must be one of its dropdown choices (spelled the same way), or the blank can never be solved.`);
          need(blank.choices.length >= 2, `blanks.${i}.choices`, `Blank ${i + 1}: a dropdown needs at least two choices (leave it empty for a typed answer).`);
        }
      });
      candidate.blanks = blanks;
      break;
    }

    case 'pseudocode_order': {
      const lines = list(b.pseudocodeLines).map((l) => str(l).replace(/\s+$/, ''));
      need(lines.length >= 3, 'pseudocodeLines', 'Add at least three steps - the learner puts them back in order.');
      need(lines.length <= MAX_LINES, 'pseudocodeLines', `At most ${MAX_LINES} steps.`);
      lines.forEach((l, i) => need(Boolean(l.trim()), `pseudocodeLines.${i}`, `Step ${i + 1} is empty - write it or remove it.`));
      candidate.pseudocodeLines = lines;
      delete candidate.codeSnippet;
      break;
    }

    case 'code_runner':
    case 'debug': {
      const uiPreview = bool(b.uiPreview);
      const isUi = uiPreview || language === 'html';
      const starterCode = str(b.starterCode).replace(/\r\n/g, '\n');
      const solutionCode = str(b.solutionCode).replace(/\r\n/g, '\n');
      const entryFunction = trimmed(b.entryFunction);
      // A code question a learner can never get credit for is worse than none:
      // only the languages with a real engine (or the browser, for HTML) are allowed.
      need(isUi || EXECUTABLE_LANGUAGES.includes(language), 'language', 'Code questions can only be graded in JavaScript, TypeScript or Python (or HTML for a frontend question) - pick one of those.');
      need(starterCode.length <= MAX_CODE, 'starterCode', `Keep the starter code under ${MAX_CODE} characters.`);
      need(solutionCode.length <= MAX_CODE, 'solutionCode', `Keep the solution under ${MAX_CODE} characters.`);
      need(Boolean(starterCode.trim()), 'starterCode', type === 'debug' ? 'Paste the broken code the learner has to fix.' : 'Write the starter code the learner begins from (a function signature with a TODO is ideal).');
      need(Boolean(solutionCode.trim()), 'solutionCode', 'Paste a working solution - the server runs it against the test cases before saving.');
      if (isUi) {
        need(language === 'html', 'language', 'A frontend question must use the HTML language (it is written as one HTML document with <style> and <script>).');
      } else {
        need(Boolean(entryFunction), 'entryFunction', 'Name the function the tests call, exactly as written in the code (e.g. fizzbuzz).');
        need(!entryFunction || /^[A-Za-z_$][\w$]*$/.test(entryFunction), 'entryFunction', 'The function name can only contain letters, digits and underscores.');
        need(!entryFunction || solutionCode.includes(entryFunction), 'entryFunction', `The solution does not define a function called "${entryFunction}".`);
      }
      const testCases = list(b.testCases).map((raw) => {
        const tc = { input: str(raw?.input).trim(), expected: str(raw?.expected).trim() };
        if (bool(raw?.hidden)) tc.hidden = true;
        const description = trimmed(raw?.description);
        if (description) tc.description = description;
        return tc;
      });
      need(testCases.length >= 1, 'testCases', 'Add at least one test case - the learner\'s code is graded by running them.');
      need(testCases.length <= MAX_TEST_CASES, 'testCases', `At most ${MAX_TEST_CASES} test cases.`);
      testCases.forEach((tc, i) => {
        need(tc.input.length <= MAX_TEXT && tc.expected.length <= MAX_TEXT, `testCases.${i}.input`, `Test ${i + 1} is too long (max ${MAX_TEXT} characters per field).`);
        need(Boolean(tc.input), `testCases.${i}.input`, isUi ? `Test ${i + 1}: write the JavaScript check to run against the page.` : `Test ${i + 1}: give the argument(s) to call the function with.`);
        need(Boolean(tc.expected), `testCases.${i}.expected`, isUi ? `Test ${i + 1}: the expected result (usually true).` : `Test ${i + 1}: give the expected return value.`);
      });
      candidate.starterCode = starterCode;
      candidate.solutionCode = solutionCode;
      candidate.testCases = testCases;
      if (entryFunction && !isUi) candidate.entryFunction = entryFunction;
      if (uiPreview) candidate.uiPreview = true;
      delete candidate.codeSnippet;

      // Worked examples and constraints: shown to learners instead of hints on
      // a stage test (PracticeModal), optional everywhere else.
      const examples = list(b.examples).map((raw) => {
        const example = { input: trimmed(raw?.input), output: trimmed(raw?.output) };
        const explanation = trimmed(raw?.explanation);
        if (explanation) example.explanation = explanation;
        return example;
      });
      need(examples.length <= MAX_EXAMPLES, 'examples', `At most ${MAX_EXAMPLES} worked examples.`);
      examples.forEach((ex, i) => {
        need(Boolean(ex.input), `examples.${i}.input`, `Example ${i + 1} needs the input the learner would be given.`);
        need(Boolean(ex.output), `examples.${i}.output`, `Example ${i + 1} needs the output a correct solution produces.`);
        need(ex.input.length <= MAX_TEXT, `examples.${i}.input`, `Example ${i + 1}: keep the input under ${MAX_TEXT} characters.`);
        need(ex.output.length <= MAX_TEXT, `examples.${i}.output`, `Example ${i + 1}: keep the output under ${MAX_TEXT} characters.`);
        need((ex.explanation ?? '').length <= MAX_TEXT, 'examples', `Example ${i + 1}: keep the explanation under ${MAX_TEXT} characters.`);
      });
      if (examples.length) candidate.examples = examples;
      const constraints = strings(b.constraints);
      need(constraints.length <= MAX_CONSTRAINTS, 'constraints', `At most ${MAX_CONSTRAINTS} constraints.`);
      constraints.forEach((c, i) => need(c.length <= MAX_TEXT, 'constraints', `Constraint ${i + 1} is too long (max ${MAX_TEXT} characters).`));
      if (constraints.length) candidate.constraints = constraints;
      break;
    }

    default:
      break;
  }

  if (preserve) {
    // The replacement is served in the original's position (server/content.js
    // mergeBank), so a stage move would leave the lesson - or the stage's
    // final test - in the wrong stage.
    need(stageId === preserve.stageId, 'stageId', 'A built-in question stays in its stage - hide it here and write a new one in the other stage instead.');
    for (const field of PRESERVED_FIELDS) if (preserve[field] !== undefined) candidate[field] = preserve[field];
    if (preserve.isStageTest) {
      // Mirrors the schema's stage-test rule (src/modules/challenges/schema.ts)
      // in the console's words: the schema would only say "a stage test is a code_runner".
      if (EXECUTABLE_LANGUAGES.includes(language)) {
        need(type === 'code_runner', 'type', "This is the stage's final test, so it has to stay a code question.");
        need(type !== 'code_runner' || (candidate.examples?.length ?? 0) >= 1, 'examples', 'A stage test needs at least one worked example - learners see it instead of hints.');
      } else {
        need(type !== 'code_runner' && type !== 'debug', 'type', `This is the stage's final test and ${language} cannot be run here, so it has to stay an answer-graded question (not a code question).`);
      }
    }
  }

  return { candidate, issues };
}

/**
 * A stable id for a new admin-authored question. It must satisfy the schema's
 * id rule (lowercase letters, digits, dashes) and never collide - option and
 * line shuffles are seeded from it, so it is never regenerated on edit.
 */
export function generateChallengeId(stageId, title, existingIds, random = Math.random) {
  const slug = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'question';
  const taken = new Set(existingIds);
  for (let attempt = 0; attempt < 50; attempt++) {
    const suffix = Math.floor(random() * 36 ** 4).toString(36).padStart(4, '0');
    const id = `custom-${stageId}-${slug}-${suffix}`;
    if (!taken.has(id)) return id;
  }
  throw new Error('Could not allocate a unique challenge id.');
}

/** Sort issues by field so the console lists them in form order. */
export function mergeIssues(...lists) {
  const seen = new Set();
  const out = [];
  for (const issue of lists.flat()) {
    const key = `${issue.path}|${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}
