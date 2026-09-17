import { Challenge } from '../../types';

/**
 * Stage 08 - Git, Tooling & Testing, batch B.
 * Test levels, arrange/act/assert, test doubles, flakiness, TDD,
 * semver and lockfiles, linting and formatting, CI pipelines.
 */
export const challenges: Challenge[] = [
  {
    id: 'stage-8-b01',
    stageId: 'stage-8',
    title: 'Unit, integration or end-to-end',
    type: 'quiz',
    difficulty: 'easy',
    language: 'javascript',
    prompt: 'Which labelling of these three tests is correct?',
    codeSnippet:
      '// A\n' +
      'test("formats a price", () => {\n' +
      '  expect(formatPrice(1999)).toBe("$19.99");\n' +
      '});\n' +
      '// B - real repository against a real database\n' +
      'test("saves and reloads an order", async () => {\n' +
      '  await orders.save({ id: 7 });\n' +
      '  expect(await orders.find(7)).toEqual({ id: 7 });\n' +
      '});\n' +
      '// C - drives a real browser\n' +
      'test("a shopper can buy a hat", async () => {\n' +
      '  await page.goto("/shop");\n' +
      '  await page.click("#buy-now");\n' +
      '});',
    options: [
      'A unit, B integration, C end-to-end',
      'A integration, B unit, C end-to-end',
      'A unit, B end-to-end, C integration',
      'A end-to-end, B integration, C unit'
    ],
    correctIndex: 0,
    hints: [
      'Count how many real collaborators each test touches.',
      'Only one of them starts a browser and clicks like a user would.'
    ],
    explanation:
      'A unit test exercises one piece of logic with no real collaborators, so A is a unit test. B wires two real components together through a real database, which is integration. C drives the whole system through the user interface, which is end-to-end.',
    xpReward: 40,
    tags: ['testing', 'test-levels', 'unit-tests']
  },
  {
    id: 'stage-8-b02',
    stageId: 'stage-8',
    title: 'Label the three phases',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'javascript',
    prompt:
      'Label each phase of this test with the arrange/act/assert step it performs.',
    codeSnippet:
      'test("total sums the line items", () => {\n' +
      '  // ___\n' +
      '  const cart = createCart([{ price: 200 }, { price: 300 }]);\n' +
      '  // ___\n' +
      '  const total = cart.total();\n' +
      '  // ___\n' +
      '  expect(total).toBe(500);\n' +
      '});',
    blanks: [
      { answer: 'Arrange', choices: ['Arrange', 'Act', 'Assert'] },
      { answer: 'Act', choices: ['Arrange', 'Act', 'Assert'] },
      { answer: 'Assert', choices: ['Arrange', 'Act', 'Assert'] }
    ],
    hints: [
      'Each comment labels only the single line directly under it.',
      'Exactly one of the three lines calls the method the test is named after.'
    ],
    explanation:
      'Arrange builds the world the test needs, act performs exactly one operation on it, and assert checks the result of that operation. Keeping the three separate makes it obvious what the test drives and what it verifies, and a test with two act phases is usually two tests.',
    xpReward: 40,
    tags: ['testing', 'arrange-act-assert', 'test-structure']
  },
  {
    id: 'stage-8-b03',
    stageId: 'stage-8',
    title: 'The red-green-refactor loop',
    type: 'pseudocode_order',
    difficulty: 'easy',
    language: 'pseudocode',
    prompt: 'Put these steps in the order of one test-driven development cycle.',
    pseudocodeLines: [
      'WRITE a test for the next small behaviour',
      'RUN the suite AND watch the new test fail',
      'WRITE the simplest code that makes it pass',
      'RUN the suite AND watch every test pass',
      'REFACTOR the code while the suite stays green',
      'REPEAT with the next behaviour'
    ],
    hints: [
      'The cycle is named after the colours the runner shows: red, then green, then a cleanup.'
    ],
    explanation:
      'Seeing the test fail first proves the test can actually detect the missing behaviour, so a test that never went red may be asserting nothing. Only once the suite is green is it safe to refactor, because the tests are the safety net that tells you the cleanup changed no behaviour.',
    xpReward: 40,
    tags: ['tdd', 'testing', 'workflow']
  },
  {
    id: 'stage-8-b04',
    stageId: 'stage-8',
    title: 'Sources of flakiness',
    type: 'multi_select',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'A flaky test passes on one run and fails on the next with no code change. Which of these cause flakiness? Select every one that applies.',
    options: [
      'Comparing against the current date, so the test breaks after midnight',
      'Two tests writing to the same database row, with no fixed run order',
      'Sleeping a fixed 200ms instead of waiting for the element to appear',
      'Seeding the random data generator with the same value on every run',
      'Sorting a list whose order the database does not guarantee before asserting',
      'Naming the file checkout.spec.js instead of checkout.test.js'
    ],
    correctIndices: [0, 1, 2],
    hints: [
      'Ask which of these hands control of the result to something the test does not own.'
    ],
    explanation:
      'Wall-clock time, state shared between tests, and fixed sleeps all let something outside the test change the result between runs. A fixed seed and a sort before asserting do the opposite - they remove a source of variation - and a filename is not a source of variation at all.',
    xpReward: 70,
    tags: ['flaky-tests', 'testing', 'determinism']
  },
  {
    id: 'stage-8-b05',
    stageId: 'stage-8',
    title: 'What the spy recorded',
    type: 'output_prediction',
    difficulty: 'medium',
    language: 'javascript',
    prompt: 'What does this program print?',
    codeSnippet:
      'function createSpy(returnValue) {\n' +
      '  function spy(...args) {\n' +
      '    spy.calls.push(args);\n' +
      '    return returnValue;\n' +
      '  }\n' +
      '  spy.calls = [];\n' +
      '  return spy;\n' +
      '}\n' +
      'const sendEmail = createSpy(true);\n' +
      'sendEmail("ana@example.com");\n' +
      'sendEmail("bo@example.com", { retry: 3 });\n' +
      'console.log(sendEmail.calls.length);\n' +
      'console.log(sendEmail.calls[1][0]);',
    options: [
      '2 then bo@example.com',
      '2 then ana@example.com',
      '3 then bo@example.com',
      '2 then [object Object]'
    ],
    correctIndex: 0,
    hints: [
      'Each entry in calls is the whole argument list of one call, stored as an array.',
      'createSpy itself is not a recorded call.'
    ],
    explanation:
      'The spy pushes one array per call, so after two calls calls.length is 2. calls[1] is the argument list of the second call, ["bo@example.com", { retry: 3 }], and index 0 of that list is the address. This record of calls is what a mocking library asserts on with helpers like toHaveBeenCalledWith.',
    xpReward: 70,
    tags: ['test-doubles', 'spies', 'mocking']
  },
  {
    id: 'stage-8-b06',
    stageId: 'stage-8',
    title: 'Why CI runs npm ci',
    type: 'quiz',
    difficulty: 'medium',
    language: 'bash',
    prompt:
      'This pipeline runs npm ci rather than npm install. What does npm ci do?',
    codeSnippet:
      '# .github/workflows/ci.yml\n' +
      'steps:\n' +
      '  - uses: actions/checkout@v4\n' +
      '  - run: npm ci\n' +
      '  - run: npm test',
    options: [
      'Installs the exact versions the lockfile pins, and fails if the lockfile and package.json disagree',
      'Rewrites the lockfile to the newest version that each range in package.json currently allows',
      'Ignores the lockfile completely and resolves every range in package.json from scratch again',
      'Installs the production dependencies only, and always skips every entry under devDependencies'
    ],
    correctIndex: 0,
    hints: [
      'The two letters stand for continuous integration, so ask what a build machine needs that a laptop does not.',
      'One of these commands is allowed to change package-lock.json and the other is not.'
    ],
    explanation:
      'npm ci treats the lockfile as the source of truth: it installs the pinned tree verbatim and aborts if package.json asks for something the lockfile does not satisfy, so two runs a month apart install byte-identical dependencies. npm install is the opposite tool - it is allowed to resolve ranges and rewrite the lockfile, which is exactly the non-determinism a build machine must not have.',
    xpReward: 70,
    tags: ['npm', 'lockfiles', 'ci', 'reproducibility']
  },
  {
    id: 'stage-8-b07',
    stageId: 'stage-8',
    title: 'Lint and format in CI',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'bash',
    prompt:
      'Fill in the two flags: one auto-repairs what it can, the other only reports and fails the build.',
    codeSnippet:
      '# package.json scripts\n' +
      '#   "lint":   "eslint src"\n' +
      '#   "format": "prettier --write src"\n' +
      '$ npx eslint src --___    # rewrite the violations it can repair\n' +
      '$ npx prettier --___ src  # exit non-zero if a file is unformatted',
    blanks: [
      { answer: 'fix', choices: ['fix', 'write', 'check', 'repair'] },
      { answer: 'check', choices: ['check', 'write', 'fix', 'verify'] }
    ],
    hints: [
      'CI must never rewrite the checked-out files; it only reports whether they are already clean.'
    ],
    explanation:
      'A linter looks for likely mistakes and eslint --fix rewrites the ones it knows how to repair, while a formatter only reshapes layout. prettier --write is the local command that reformats files; prettier --check leaves them alone and exits non-zero, which is what makes it usable as a CI gate.',
    xpReward: 40,
    tags: ['linting', 'formatting', 'ci', 'tooling']
  },
  {
    id: 'stage-8-b08',
    stageId: 'stage-8',
    title: 'Resolve a caret range',
    type: 'code_runner',
    difficulty: 'hard',
    language: 'javascript',
    prompt:
      'Given published version strings like "1.9.3" and a currently pinned version, return the highest version a caret range on the pinned version allows: same major, and not lower than the pinned version. Return null if none qualifies. The pinned version always has a major of 1 or higher, and every version string has exactly three numeric parts.',
    starterCode:
      'function highestCompatible(versions, current) {\n' +
      '  // your code here\n' +
      '  return null;\n' +
      '}',
    entryFunction: 'highestCompatible',
    testCases: [
      { input: '["1.4.2", "1.5.0", "1.9.3", "2.0.0"], "1.4.2"', expected: '"1.9.3"' },
      { input: '["1.4.2", "2.0.0", "2.1.0"], "1.4.2"', expected: '"1.4.2"' },
      { input: '["1.0.0", "1.0.9", "1.0.10"], "1.0.0"', expected: '"1.0.10"' },
      { input: '["3.2.1", "3.10.0", "3.9.9"], "3.2.1"', expected: '"3.10.0"' },
      { input: '["0.9.0", "2.0.0"], "1.0.0"', expected: 'null' }
    ],
    solutionCode:
      'function highestCompatible(versions, current) {\n' +
      '  const parse = (v) => v.split(".").map(Number);\n' +
      '  const compare = (a, b) => {\n' +
      '    const x = parse(a);\n' +
      '    const y = parse(b);\n' +
      '    for (let i = 0; i < 3; i++) {\n' +
      '      if (x[i] !== y[i]) return x[i] - y[i];\n' +
      '    }\n' +
      '    return 0;\n' +
      '  };\n' +
      '  const major = parse(current)[0];\n' +
      '  let best = null;\n' +
      '  for (const v of versions) {\n' +
      '    if (parse(v)[0] !== major) continue;\n' +
      '    if (compare(v, current) < 0) continue;\n' +
      '    if (best === null || compare(v, best) > 0) best = v;\n' +
      '  }\n' +
      '  return best;\n' +
      '}',
    hints: [
      'Split each version on "." and turn the three parts into numbers before comparing.',
      'Sorting the strings directly puts "1.10.0" before "1.9.0", which is wrong.'
    ],
    explanation:
      'Semver compares major, then minor, then patch as numbers, so the parts must be parsed before comparing. Sorting version strings lexicographically is the classic bug: it ranks "1.10.0" below "1.9.0" because the character "1" comes before "9".',
    xpReward: 110,
    tags: ['semver', 'versioning', 'comparison']
  },
  {
    id: 'stage-8-b09',
    stageId: 'stage-8',
    title: 'The stub that vanished',
    type: 'debug',
    difficulty: 'hard',
    language: 'javascript',
    prompt:
      'resolveDeps should return the stubbed value for every name present in stubs, and "real:" + name for the rest. It works until a test stubs a falsy value. Fix it.',
    starterCode:
      'function resolveDeps(names, stubs) {\n' +
      '  return names.map((name) => stubs[name] || "real:" + name);\n' +
      '}',
    entryFunction: 'resolveDeps',
    testCases: [
      {
        input: '["clock", "db"], {"clock": "2024-01-01"}',
        expected: '["2024-01-01", "real:db"]'
      },
      { input: '["featureFlag"], {"featureFlag": false}', expected: '[false]' },
      { input: '["retries"], {"retries": 0}', expected: '[0]' },
      { input: '["label"], {"label": ""}', expected: '[""]' },
      { input: '["a", "b"], {}', expected: '["real:a", "real:b"]' }
    ],
    solutionCode:
      'function resolveDeps(names, stubs) {\n' +
      '  return names.map((name) =>\n' +
      '    Object.prototype.hasOwnProperty.call(stubs, name)\n' +
      '      ? stubs[name]\n' +
      '      : "real:" + name\n' +
      '  );\n' +
      '}',
    hints: [
      'Ask whether the key exists, not whether its value is truthy.',
      'false, 0 and "" are all perfectly good stub values.'
    ],
    explanation:
      'The || operator falls through on any falsy value, so stubbing false, 0 or "" silently handed the test the real dependency instead. Checking for the presence of the key with hasOwnProperty separates "no stub registered" from "a stub whose value happens to be falsy".',
    xpReward: 110,
    tags: ['mocking', 'test-doubles', 'debugging', 'falsy']
  },
  {
    id: 'stage-8-b10',
    stageId: 'stage-8',
    title: 'Order the CI pipeline',
    type: 'pseudocode_order',
    difficulty: 'medium',
    language: 'pseudocode',
    prompt:
      'Order the steps of a continuous integration job. Cheap checks run before expensive ones, and nothing is uploaded before it exists.',
    pseudocodeLines: [
      'CHECK OUT the commit that triggered the pipeline',
      'RESTORE the cache keyed by the hash of package-lock.json',
      'INSTALL the exact versions the lockfile pins',
      'RUN the linter the install just provided, the cheapest check',
      'RUN the test suite, which takes minutes rather than seconds',
      'BUILD the production bundle, but only once the suite is green',
      'UPLOAD the bundle as a downloadable artifact'
    ],
    hints: [
      'The cache key is computed from a file in the repository, so something must happen before the cache can be looked up.',
      'Every later step needs something an earlier step put on the machine.'
    ],
    explanation:
      'Each step consumes what the step before it produced: the checkout supplies the lockfile that keys the cache, the install supplies the linter and test runner, and the build supplies the file the upload sends. Fail-fast ordering then puts the seconds-long linter ahead of the minutes-long suite, and this job only spends time bundling once the tests have gone green.',
    xpReward: 70,
    tags: ['ci', 'pipelines', 'automation', 'lockfiles']
  }
];
