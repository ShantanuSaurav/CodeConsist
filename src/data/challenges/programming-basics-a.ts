import { Challenge } from '../../types';

/**
 * Stage 01 - Programming Basics, batch A.
 * Reference batch: demonstrates every challenge type.
 */
export const challenges: Challenge[] = [
  {
    id: 'stage-1-a01',
    stageId: 'stage-1',
    title: 'Hoisting and var',
    type: 'output_prediction',
    difficulty: 'easy',
    language: 'javascript',
    prompt: 'What does this program print?',
    codeSnippet:
      'console.log(typeof score);\n' +
      'var score = 100;\n' +
      'console.log(typeof score);',
    options: [
      'undefined then number',
      'number then number',
      'ReferenceError on the first line',
      'null then number'
    ],
    correctIndex: 0,
    hints: [
      'A var declaration is moved to the top of its scope, but the assignment is not.',
      'typeof never throws for a declared-but-unassigned variable.'
    ],
    explanation:
      'The declaration `var score` is hoisted to the top of the scope and initialised to undefined, so the first typeof reports "undefined". After the assignment runs, score holds a number.',
    xpReward: 40,
    tags: ['hoisting', 'var', 'typeof']
  },
  {
    id: 'stage-1-a02',
    stageId: 'stage-1',
    title: 'Closures over a loop variable',
    type: 'output_prediction',
    difficulty: 'medium',
    language: 'javascript',
    prompt: 'What does this program print?',
    codeSnippet:
      'const fns = [];\n' +
      'for (var i = 0; i < 3; i++) {\n' +
      '  fns.push(() => i);\n' +
      '}\n' +
      'console.log(fns.map(f => f()).join(","));',
    options: ['3,3,3', '0,1,2', '2,2,2', '0,0,0'],
    correctIndex: 0,
    hints: ['var has one binding for the whole loop, not one per iteration.'],
    explanation:
      'With var there is a single binding of i shared by every closure. By the time the functions run the loop has finished and i is 3, so all three return 3. Swapping var for let creates a fresh binding per iteration and prints 0,1,2.',
    xpReward: 70,
    tags: ['closures', 'scope', 'let']
  },
  {
    id: 'stage-1-a03',
    stageId: 'stage-1',
    title: 'Strict equality',
    type: 'quiz',
    difficulty: 'easy',
    language: 'javascript',
    prompt: 'Which comparison evaluates to false?',
    codeSnippet:
      '// == may convert its operands; === never does\n' +
      'const a = [] == false;\n' +
      'const b = [] === false;\n' +
      'const c = "" == 0;\n' +
      'const d = null == undefined;',
    options: ['[] == false', '[] === false', '"" == 0', 'null == undefined'],
    correctIndex: 1,
    hints: ['=== compares types first and stops there if they differ.'],
    explanation:
      'Only `[] === false` puts an object next to a boolean under ===, which returns false the moment the types differ. `[] == false` and `"" == 0` both convert their operands to numbers and end up comparing 0 with 0, while `null == undefined` is true by a special rule that converts nothing at all.',
    xpReward: 40,
    tags: ['equality', 'coercion']
  },
  {
    id: 'stage-1-a04',
    stageId: 'stage-1',
    title: 'Truthiness rules',
    type: 'multi_select',
    difficulty: 'medium',
    language: 'javascript',
    prompt: 'Which of these values are falsy in JavaScript? Select every one that applies.',
    options: ['0', '"0"', '[]', 'NaN', '""', '{}'],
    correctIndices: [0, 3, 4],
    hints: ['There are exactly eight falsy values, and every object is truthy.'],
    explanation:
      'The falsy values are false, 0, -0, 0n, "", null, undefined and NaN. The string "0" is a non-empty string, and [] and {} are objects, so all three are truthy.',
    xpReward: 70,
    tags: ['truthiness', 'coercion']
  },
  {
    id: 'stage-1-a05',
    stageId: 'stage-1',
    title: 'Complete the guard clause',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'javascript',
    prompt: 'Fill in the blanks so the function returns 0 for an empty or missing list.',
    codeSnippet:
      'function total(prices) {\n' +
      '  if (!prices || prices.___ === 0) ___ 0;\n' +
      '  return prices.reduce((sum, p) => sum + p, 0);\n' +
      '}',
    blanks: [
      { answer: 'length', choices: ['length', 'size', 'count'] },
      { answer: 'return', choices: ['return', 'throw', 'break'] }
    ],
    hints: ['Arrays report how many items they hold through a property, not a method.'],
    explanation:
      'Arrays expose `length`, not `size` (that is Map and Set). Returning early keeps the happy path unindented, which is the point of a guard clause.',
    xpReward: 40,
    tags: ['guard-clause', 'arrays']
  },
  {
    id: 'stage-1-a06',
    stageId: 'stage-1',
    title: 'Order the largest-value search',
    type: 'pseudocode_order',
    difficulty: 'easy',
    language: 'pseudocode',
    prompt: 'Put these pseudocode lines in the order that correctly returns the largest number in a list.',
    pseudocodeLines: [
      'IF numbers IS EMPTY THEN RETURN NULL',
      'SET largest TO first item IN numbers',
      'FOR EACH n IN numbers',
      '    IF n > largest THEN SET largest TO n',
      'END FOR',
      'RETURN largest'
    ],
    hints: [
      'Nothing may read the first item until you know there is one.',
      'The comparison inside the loop needs largest to already hold a real value.'
    ],
    explanation:
      'The empty check has to come first because the very next line reads the first item, which does not exist in an empty list. Seeding largest with that first item gives the comparison something real to test against on the first pass, and the answer is only known once every element has been seen, so the return follows END FOR.',
    xpReward: 40,
    tags: ['pseudocode', 'loops', 'edge-cases']
  },
  {
    id: 'stage-1-a07',
    stageId: 'stage-1',
    title: 'FizzBuzz',
    type: 'code_runner',
    difficulty: 'easy',
    language: 'javascript',
    prompt:
      'Return the FizzBuzz value for n: "FizzBuzz" when divisible by 3 and 5, "Fizz" for 3, "Buzz" for 5, otherwise n as a string.',
    starterCode:
      'function fizzbuzz(n) {\n' + '  // your code here\n' + '  return "";\n' + '}',
    entryFunction: 'fizzbuzz',
    testCases: [
      { input: '3', expected: '"Fizz"' },
      { input: '5', expected: '"Buzz"' },
      { input: '15', expected: '"FizzBuzz"' },
      { input: '7', expected: '"7"' }
    ],
    solutionCode:
      'function fizzbuzz(n) {\n' +
      '  if (n % 15 === 0) return "FizzBuzz";\n' +
      '  if (n % 3 === 0) return "Fizz";\n' +
      '  if (n % 5 === 0) return "Buzz";\n' +
      '  return String(n);\n' +
      '}',
    hints: [
      'Check the most specific case first, otherwise 15 never reaches the FizzBuzz branch.',
      'n % 15 === 0 is the same test as divisible by both 3 and 5.'
    ],
    explanation:
      'Order matters: test the combined case first. Checking n % 3 first would return "Fizz" for 15 and never reach the FizzBuzz branch.',
    xpReward: 40,
    tags: ['conditionals', 'modulo']
  },
  {
    id: 'stage-1-a08',
    stageId: 'stage-1',
    title: 'Fix the off-by-one',
    type: 'debug',
    difficulty: 'easy',
    language: 'javascript',
    prompt:
      'This function should return the sum of every element, but it drops one. Find the bug and fix it.',
    starterCode:
      'function sumAll(numbers) {\n' +
      '  let total = 0;\n' +
      '  for (let i = 0; i < numbers.length - 1; i++) {\n' +
      '    total += numbers[i];\n' +
      '  }\n' +
      '  return total;\n' +
      '}',
    entryFunction: 'sumAll',
    testCases: [
      { input: '[1, 2, 3]', expected: '6' },
      { input: '[10]', expected: '10' },
      { input: '[]', expected: '0' },
      { input: '[-2, 2, 5]', expected: '5' }
    ],
    solutionCode:
      'function sumAll(numbers) {\n' +
      '  let total = 0;\n' +
      '  for (let i = 0; i < numbers.length; i++) {\n' +
      '    total += numbers[i];\n' +
      '  }\n' +
      '  return total;\n' +
      '}',
    hints: ['Walk through [1, 2, 3] by hand and note which index the loop never visits.'],
    explanation:
      'The condition `i < numbers.length - 1` stops one element early, so the last item is never added. Array indices run from 0 to length - 1, so the loop condition should be `i < numbers.length`.',
    xpReward: 40,
    tags: ['off-by-one', 'loops', 'debugging']
  },
  {
    id: 'stage-1-a09',
    stageId: 'stage-1',
    title: 'Integer division and remainder',
    type: 'output_prediction',
    difficulty: 'easy',
    language: 'javascript',
    prompt: 'What does this program print?',
    codeSnippet:
      'const totalMinutes = 135;\n' +
      'const hours = Math.floor(totalMinutes / 60);\n' +
      'const minutes = totalMinutes % 60;\n' +
      'console.log(hours + "h " + minutes + "m");',
    options: ['2h 15m', '2h 25m', '2.25h 0m', '3h 15m'],
    correctIndex: 0,
    hints: ['Math.floor throws the fractional part away; % keeps what the division left behind.'],
    explanation:
      'JavaScript division always produces a float, so 135 / 60 is 2.25 and Math.floor is what turns it into 2 whole hours. The remainder operator returns what those whole hours left behind, 15, which is why dividing for the whole part and taking the remainder for the rest is the standard way to split a total into units.',
    xpReward: 40,
    tags: ['arithmetic', 'modulo']
  },
  {
    id: 'stage-1-a10',
    stageId: 'stage-1',
    title: 'Swap without a temporary',
    type: 'code_runner',
    difficulty: 'medium',
    language: 'javascript',
    prompt: 'Return a new array with the values at index i and index j swapped. Do not mutate the input.',
    starterCode:
      'function swap(arr, i, j) {\n' + '  // your code here\n' + '  return arr;\n' + '}',
    entryFunction: 'swap',
    testCases: [
      { input: '[1, 2, 3], 0, 2', expected: '[3, 2, 1]' },
      { input: '["a", "b"], 0, 1', expected: '["b", "a"]' },
      { input: '[5], 0, 0', expected: '[5]' },
      { input: '[1, 2, 3, 4], 1, 2', expected: '[1, 3, 2, 4]' },
      // The prompt forbids mutating the input, so one case has to enforce it.
      // Writing to a frozen array is a silent no-op, so an in-place solution
      // hands back the original order and fails here.
      { input: 'Object.freeze([7, 8, 9]), 0, 2', expected: '[9, 8, 7]' }
    ],
    solutionCode:
      'function swap(arr, i, j) {\n' +
      '  const copy = arr.slice();\n' +
      '  [copy[i], copy[j]] = [copy[j], copy[i]];\n' +
      '  return copy;\n' +
      '}',
    hints: [
      'slice() with no arguments gives you a shallow copy.',
      'Array destructuring can assign two variables at once.'
    ],
    explanation:
      'Copy first so the caller’s array is untouched, then use destructuring assignment to exchange the two slots in a single statement. Swapping an index with itself is a harmless no-op.',
    xpReward: 70,
    tags: ['arrays', 'destructuring', 'immutability']
  }
];
