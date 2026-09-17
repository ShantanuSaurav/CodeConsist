import { Challenge } from '../../types';

/**
 * Stage 02 - Python Fundamentals, batch B.
 * Covers the two division operators, string immutability, identity versus
 * equality, truthiness, sorting with key=, exceptions, sequencing a
 * calculation, enumerate/zip, default arguments, and lazy iteration.
 */
export const challenges: Challenge[] = [
  {
    id: 'stage-2-b01',
    stageId: 'stage-2',
    title: 'Two kinds of division',
    type: 'output_prediction',
    difficulty: 'medium',
    language: 'python',
    prompt: 'What does this program print?',
    codeSnippet:
      'total = 7\n' +
      'debt = -7\n' +
      '\n' +
      'print(total / 2)\n' +
      'print(total // 2)\n' +
      'print(debt // 2)\n' +
      'print(debt % 2)',
    options: [
      '3.5 then 3 then -4 then 1',
      '3.5 then 3 then -3 then -1',
      '3.5 then 3.5 then -3.5 then 1',
      '3 then 3 then -4 then 1'
    ],
    correctIndex: 0,
    hints: [
      'One of these operators always hands back a float, whatever the operands are.',
      'Floor division rounds down, and for a negative result down means away from zero.'
    ],
    explanation:
      'In Python 3 the / operator always produces a float, so 7 / 2 is 3.5 rather than 3. The // operator floors toward negative infinity instead of truncating toward zero, which makes -7 // 2 equal -4, and % takes the sign of the right-hand operand, so -7 % 2 is 1. The two stay consistent, because (-7 // 2) * 2 + (-7 % 2) is -7.',
    xpReward: 70,
    tags: ['arithmetic', 'floor-division', 'modulo']
  },
  {
    id: 'stage-2-b02',
    stageId: 'stage-2',
    title: 'The method call that changed nothing',
    type: 'output_prediction',
    difficulty: 'easy',
    language: 'python',
    prompt: 'What does this program print?',
    codeSnippet:
      'name = "python basics"\n' +
      '\n' +
      'name.title()\n' +
      'shouty = name.upper()\n' +
      '\n' +
      'print(name)\n' +
      'print(shouty)',
    options: [
      'python basics then PYTHON BASICS',
      'Python Basics then PYTHON BASICS',
      'PYTHON BASICS then PYTHON BASICS',
      'Python Basics then Python Basics'
    ],
    correctIndex: 0,
    hints: [
      'Nothing in Python can change a string in place.',
      'Ask what becomes of a returned value that nobody assigns to a name.'
    ],
    explanation:
      'Strings are immutable, so a string method never edits its receiver: it builds and returns a new string. The bare `name.title()` line creates "Python Basics" and immediately throws it away because no name is bound to it, leaving `name` untouched, while `shouty` keeps the result of the call that was assigned.',
    xpReward: 40,
    tags: ['strings', 'immutability', 'methods']
  },
  {
    id: 'stage-2-b03',
    stageId: 'stage-2',
    title: 'Identity is not equality',
    type: 'quiz',
    difficulty: 'medium',
    language: 'python',
    prompt: 'What are the values of x, y and z after this code runs?',
    codeSnippet:
      'a = [1, 2, 3]\n' +
      'b = [1, 2, 3]\n' +
      'c = a\n' +
      '\n' +
      'x = a == b\n' +
      'y = a is b\n' +
      'z = c is a',
    options: [
      'x True, y True, z True',
      'x True, y False, z True',
      'x False, y False, z True',
      'x True, y False, z False'
    ],
    correctIndex: 1,
    hints: [
      'One operator asks about contents, the other asks about the object in memory.',
      'Assignment binds a second name to the same object; it does not copy.'
    ],
    explanation:
      '== compares contents, so a == b is True. `is` compares object identity, and the two list literals build two separate objects, so a is b is False. c = a binds another name to the very same list, which makes c is a True.',
    xpReward: 70,
    tags: ['identity', 'equality', 'references']
  },
  {
    id: 'stage-2-b04',
    stageId: 'stage-2',
    title: 'What counts as falsy',
    type: 'multi_select',
    difficulty: 'easy',
    language: 'python',
    prompt: 'Which of these values are falsy in Python? Select every one that applies.',
    options: ['0', '"0"', '[]', '[0]', '{}', '" "'],
    correctIndices: [0, 2, 4],
    hints: ['Ask what an empty container looks like, and whether the container is empty at all.'],
    explanation:
      'Python treats zero-valued numbers and every empty container as falsy: 0, 0.0, "", [], {}, set(), None and False. Anything with content is truthy, so the string "0", the single-space string and the list [0] are all true.',
    xpReward: 40,
    tags: ['truthiness', 'conditionals']
  },
  {
    id: 'stage-2-b05',
    stageId: 'stage-2',
    title: 'Sort by length, longest first',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'python',
    prompt: 'Fill in the blanks so the list is ordered from longest word to shortest.',
    codeSnippet:
      'words = ["kiwi", "fig", "banana", "date"]\n' +
      '\n' +
      'longest_first = sorted(words, ___=len, ___=True)\n' +
      '\n' +
      'print(longest_first[0])   # banana',
    blanks: [
      { answer: 'key', choices: ['key', 'by', 'cmp'] },
      { answer: 'reverse', choices: ['reverse', 'descending', 'desc'] }
    ],
    hints: ['sorted() takes a function that turns each item into the value it should be ranked by.'],
    explanation:
      'key=len calls len once per word and sorts by the numbers that come back, which is why you pass the function itself rather than calling it. reverse=True flips the finished order, putting "banana" first.',
    xpReward: 40,
    tags: ['sorting', 'key-function', 'built-ins']
  },
  {
    id: 'stage-2-b06',
    stageId: 'stage-2',
    title: 'Handle the bad input',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'python',
    prompt:
      'Fill in the blanks so the function returns -1 for unparseable text and always logs a line.',
    codeSnippet:
      'def read_age(text):\n' +
      '    try:\n' +
      '        return int(text)\n' +
      '    ___ ValueError:\n' +
      '        return -1\n' +
      '    ___:\n' +
      '        print("checked", text)',
    blanks: [
      { answer: 'except', choices: ['except', 'catch', 'rescue'] },
      { answer: 'finally', choices: ['finally', 'else', 'ensure'] }
    ],
    hints: [
      'Python does not use the keyword `catch`.',
      'One block must run whether the try body returned a value or raised.'
    ],
    explanation:
      'Python spells the handler `except` and names the exception class it should catch, so unrelated errors still propagate. A `finally` block runs on the way out of the try statement no matter what happened, even when the body already executed a return.',
    xpReward: 40,
    tags: ['exceptions', 'try-except', 'error-handling']
  },
  {
    id: 'stage-2-b07',
    stageId: 'stage-2',
    title: 'Order the checkout total',
    type: 'pseudocode_order',
    difficulty: 'medium',
    language: 'pseudocode',
    prompt:
      'Put these lines in order so the cart total is worked out with the discount applied before any tax is charged.',
    pseudocodeLines: [
      'SET subtotal TO sum of price FOR EACH item IN cart',
      'SET discount TO subtotal * discount_rate',
      'SET taxable TO subtotal - discount',
      'SET tax TO taxable * tax_rate',
      'SET total TO taxable + tax',
      'RETURN total ROUNDED TO 2 DECIMAL PLACES'
    ],
    hints: [
      'Every line except the first reads a value that an earlier line produced.',
      'Tax is charged on the amount the customer actually pays.'
    ],
    explanation:
      'Each line consumes the value produced by the line before it, so the chain has exactly one workable order: nothing can discount a subtotal that has not been summed yet, and tax cannot be computed before the taxable amount exists. Charging tax on the full subtotal instead of the discounted amount would overcharge every discounted order.',
    xpReward: 70,
    tags: ['pseudocode', 'arithmetic', 'sequencing']
  },
  {
    id: 'stage-2-b08',
    stageId: 'stage-2',
    title: 'Build a ranked roster',
    type: 'code_runner',
    difficulty: 'medium',
    language: 'python',
    prompt:
      'Return one string per entry formatted as "<rank>. <name> - <score>", numbering from 1. Stop as soon as either list runs out.',
    starterCode:
      'def roster(names, scores):\n' +
      '    # your code here\n' +
      '    return []',
    entryFunction: 'roster',
    testCases: [
      { input: '["Ana", "Ben"], [90, 75]', expected: '["1. Ana - 90", "2. Ben - 75"]' },
      { input: '["Cy"], [100]', expected: '["1. Cy - 100"]' },
      { input: '["A", "B", "C"], [1, 2]', expected: '["1. A - 1", "2. B - 2"]' },
      { input: '[], [5, 6]', expected: '[]' }
    ],
    solutionCode:
      'def roster(names, scores):\n' +
      '    lines = []\n' +
      '    for rank, (name, score) in enumerate(zip(names, scores), start=1):\n' +
      '        lines.append(f"{rank}. {name} - {score}")\n' +
      '    return lines',
    hints: [
      'zip(names, scores) already stops at the shorter list for you.',
      'enumerate can wrap the zip, and each item it hands back is a pair you can unpack.'
    ],
    explanation:
      'zip walks two sequences in step and ends with the shortest one, so the mismatched-length cases need no extra guard. Wrapping it in enumerate(..., start=1) supplies the rank, and unpacking `rank, (name, score)` pulls the pair apart in the for statement itself.',
    xpReward: 70,
    tags: ['enumerate', 'zip', 'strings']
  },
  {
    id: 'stage-2-b09',
    stageId: 'stage-2',
    title: 'The basket that never empties',
    type: 'debug',
    difficulty: 'hard',
    language: 'python',
    prompt:
      'add_item should start a new basket whenever the caller does not supply one, but old items keep reappearing. Fix it.',
    starterCode:
      'def add_item(item, basket=[]):\n' +
      '    basket.append(item)\n' +
      '    return basket',
    entryFunction: 'add_item',
    testCases: [
      { input: '"apple"', expected: '["apple"]' },
      { input: '"bread"', expected: '["bread"]' },
      { input: '"milk", ["eggs"]', expected: '["eggs", "milk"]' },
      { input: '"tea"', expected: '["tea"]' }
    ],
    solutionCode:
      'def add_item(item, basket=None):\n' +
      '    if basket is None:\n' +
      '        basket = []\n' +
      '    basket.append(item)\n' +
      '    return basket',
    hints: [
      'The default is built once, at definition time, and every default-using call shares it.',
      'Use an immutable sentinel as the default and create the real list inside the body.'
    ],
    explanation:
      'basket=[] evaluates the empty list once when the def runs, so every call that omits basket mutates that same list. The standard fix is a None sentinel: check `if basket is None` and build a fresh list inside the function, which gives each call its own container while still honouring a basket the caller passes in.',
    xpReward: 110,
    tags: ['default-arguments', 'mutability', 'debugging']
  },
  {
    id: 'stage-2-b10',
    stageId: 'stage-2',
    title: 'Take only what you need',
    type: 'code_runner',
    difficulty: 'hard',
    language: 'python',
    prompt:
      'Return the first k values from any iterable as a list. Pull no more values than you need: the source may be a generator whose later items would raise.',
    starterCode:
      'def take(source, k):\n' +
      '    # your code here\n' +
      '    return []',
    entryFunction: 'take',
    testCases: [
      { input: '[1, 2, 3, 4, 5], 2', expected: '[1, 2]' },
      { input: '(n * n for n in range(1, 6)), 3', expected: '[1, 4, 9]' },
      { input: '(10 // d for d in [5, 2, 1, 0]), 3', expected: '[2, 5, 10]' },
      { input: '[7, 8], 5', expected: '[7, 8]' },
      { input: '[1, 2, 3], 0', expected: '[]' }
    ],
    solutionCode:
      'def take(source, k):\n' +
      '    out = []\n' +
      '    if k <= 0:\n' +
      '        return out\n' +
      '    for value in source:\n' +
      '        out.append(value)\n' +
      '        if len(out) == k:\n' +
      '            break\n' +
      '    return out',
    hints: [
      'list(source)[:k] reads the whole source first, which is exactly what one test punishes.',
      'Loop over the source and break the moment you have collected k items.'
    ],
    explanation:
      'A generator computes each item only when it is asked for, so breaking out of the loop after k items means the rest is never evaluated. list(source)[:k] would drain the whole generator first and hit the 10 // 0 term, which is why the lazy loop is not just faster but the only version that survives.',
    xpReward: 110,
    tags: ['generators', 'lazy-evaluation', 'iterables']
  }
];
