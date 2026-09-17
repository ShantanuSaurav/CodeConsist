import { Challenge } from '../../types';

/**
 * Stage 03 - Data Structures, batch A.
 * Dynamic arrays and amortised cost, hash maps and collisions, set membership
 * and dedup, linked list pointers, stacks and balanced brackets, queues versus
 * stacks, and picking the right structure for the job.
 */
export const challenges: Challenge[] = [
  {
    id: 'stage-3-a01',
    stageId: 'stage-3',
    title: 'Why push is amortised O(1)',
    type: 'quiz',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'A dynamic array doubles its capacity whenever it runs out of room. What is the amortised cost of a single push?',
    codeSnippet:
      '// Sketch of how a dynamic array grows (capacity starts at 1)\n' +
      'function push(arr, value) {\n' +
      '  if (arr.length === arr.capacity) {\n' +
      '    arr.capacity = arr.capacity * 2;\n' +
      '    copyEveryItemIntoTheBiggerBlock(arr); // O(n) work\n' +
      '  }\n' +
      '  arr.store[arr.length] = value;\n' +
      '  arr.length = arr.length + 1;\n' +
      '}',
    options: [
      'O(1), because the rare O(n) copies are paid for by all the cheap pushes around them',
      'O(n), because any push might trigger a copy and the worst case is what counts',
      'O(log n), because there are log n resizes so every push carries a log n share',
      'O(n log n), because there are log n resizes and each one copies n items'
    ],
    correctIndex: 0,
    hints: [
      'Add up the copying done by the resizes: 1 + 2 + 4 + 8 + ... up to n.',
      'Amortised cost is total work divided by number of operations, not the worst single operation.'
    ],
    explanation:
      'Doubling means resizes happen at capacities 1, 2, 4, 8, ..., n, so the copying totals about 2n items for n pushes. Spread over n pushes that is a constant amount each, even though one unlucky push really does cost O(n).',
    xpReward: 70,
    tags: ['dynamic-array', 'amortised', 'complexity']
  },
  {
    id: 'stage-3-a02',
    stageId: 'stage-3',
    title: 'Two objects that look the same',
    type: 'output_prediction',
    difficulty: 'easy',
    language: 'javascript',
    prompt: 'What does this program print?',
    codeSnippet:
      'const first = { id: 1 };\n' +
      'const seen = new Set([first, { id: 1 }, first]);\n' +
      'console.log(seen.size + " " + seen.has({ id: 1 }));',
    options: ['2 false', '1 true', '2 true', '3 false'],
    correctIndex: 0,
    hints: [
      'Count how many separate objects the snippet actually creates.',
      'A Set asks whether it already holds this exact value, not whether it holds something that looks similar.'
    ],
    explanation:
      'A Set compares members by identity, so for objects that means the same object in memory: first and the separate { id: 1 } literal are two distinct members, while listing first twice adds nothing. has({ id: 1 }) builds a third, brand new object that the Set has never held, so the lookup reports false even though the contents match.',
    xpReward: 40,
    tags: ['set', 'reference-identity', 'objects']
  },
  {
    id: 'stage-3-a03',
    stageId: 'stage-3',
    title: 'Two keys, one bucket',
    type: 'output_prediction',
    difficulty: 'medium',
    language: 'javascript',
    prompt: 'This is a toy hash table with three buckets. What does it print?',
    codeSnippet:
      'const buckets = [[], [], []];\n' +
      'function hash(word) {\n' +
      '  return word.length % 3;\n' +
      '}\n' +
      'for (const w of ["cat", "dog", "bird", "ox"]) {\n' +
      '  buckets[hash(w)].push(w);\n' +
      '}\n' +
      'console.log(JSON.stringify(buckets));',
    options: [
      '[["cat","dog"],["bird"],["ox"]]',
      '[["dog"],["bird"],["ox"]]',
      '[["cat"],["dog","bird"],["ox"]]',
      '[["bird"],["ox"],["cat","dog"]]'
    ],
    correctIndex: 0,
    hints: [
      'Work out hash(w) for each word: the length of the word modulo 3.',
      'Two words that hash to the same bucket do not fight over the slot; the bucket is a list.'
    ],
    explanation:
      '"cat" and "dog" both have length 3, so both hash to bucket 0 and collide. A chained hash table stores colliding keys in a list inside the bucket rather than overwriting, so bucket 0 holds both. "bird" (length 4) goes to bucket 1 and "ox" (length 2) to bucket 2.',
    xpReward: 70,
    tags: ['hash-map', 'collisions', 'chaining']
  },
  {
    id: 'stage-3-a04',
    stageId: 'stage-3',
    title: 'Count words with a Map',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'javascript',
    prompt: 'Fill in the blanks so the function returns how many times each word appears.',
    codeSnippet:
      'function countWords(words) {\n' +
      '  const counts = new ___();\n' +
      '  for (const word of words) {\n' +
      '    const current = counts.___(word) || 0;\n' +
      '    counts.set(word, current + 1);\n' +
      '  }\n' +
      '  return counts;\n' +
      '}',
    blanks: [
      { answer: 'Map', choices: ['Map', 'Set', 'Array'] },
      { answer: 'get', choices: ['get', 'has', 'find'] }
    ],
    hints: [
      'A Set stores membership only; here every word needs a number attached to it.',
      'Reading a key that was never stored gives undefined, which is why the || 0 is there.'
    ],
    explanation:
      'A Map stores key to value pairs, which is exactly what a frequency table needs; a Set could only tell you whether a word appeared. counts.get(word) returns undefined the first time a word is seen, so || 0 turns that into a starting count of zero.',
    xpReward: 40,
    tags: ['hash-map', 'map', 'counting']
  },
  {
    id: 'stage-3-a05',
    stageId: 'stage-3',
    title: 'Reverse a linked list in place',
    type: 'fill_blank',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'Fill in the blanks so the function reverses a singly linked list and returns the new head. Every node is an object { value, next }, and the last node has next set to null.',
    codeSnippet:
      'function reverseList(head) {\n' +
      '  let prev = null;\n' +
      '  let node = head;\n' +
      '  while (node !== null) {\n' +
      '    const next = node.next;\n' +
      '    node.next = ___;\n' +
      '    prev = ___;\n' +
      '    node = ___;\n' +
      '  }\n' +
      '  return prev;\n' +
      '}',
    blanks: [
      { answer: 'prev', choices: ['prev', 'next', 'null'] },
      { answer: 'node', choices: ['node', 'next', 'head'] },
      { answer: 'next', choices: ['next', 'node.next', 'prev'] }
    ],
    hints: [
      'Three markers move rightwards together: the part already reversed, the node being rewired, and the part still to do.',
      'Once node.next has been pointed backwards it no longer leads to the rest of the original list.'
    ],
    explanation:
      'Each turn of the loop points the current node back at prev, then slides both markers one step along. The saved next is what makes that safe: reading node.next after the rewiring would hand back prev and walk into the part already reversed, so the traversal would stop after one node. prev ends up on the old tail, which is the new head.',
    xpReward: 70,
    tags: ['linked-list', 'pointers', 'iteration']
  },
  {
    id: 'stage-3-a06',
    stageId: 'stage-3',
    title: 'Order the one-pass pair finder',
    type: 'pseudocode_order',
    difficulty: 'easy',
    language: 'pseudocode',
    prompt:
      'Put these pseudocode lines in the order that returns the positions of the two numbers adding up to target, using a map and a single pass over the list.',
    pseudocodeLines: [
      'SET seen TO an empty map',
      'FOR EACH position i IN numbers',
      '    SET need TO target - numbers[i]',
      '    IF seen HAS KEY need THEN RETURN [seen[need], i]',
      '    SET seen[numbers[i]] TO i',
      'END FOR',
      'RETURN "no pair found"'
    ],
    hints: [
      'Work out which value would complete the pair before you look anything up.',
      'Ask what happens to a list like [3] with target 6 if the current number is stored before the lookup.'
    ],
    explanation:
      'Each element asks the map whether the value that completes the pair has already gone by, an average O(1) lookup that replaces a second loop. The lookup has to happen before the current number is stored: store first and a lone 3 with target 6 finds itself and returns [0, 0].',
    xpReward: 40,
    tags: ['pseudocode', 'hash-map', 'two-sum']
  },
  {
    id: 'stage-3-a07',
    stageId: 'stage-3',
    title: 'Picking the right structure',
    type: 'multi_select',
    difficulty: 'hard',
    language: 'javascript',
    prompt:
      'Which of these statements about choosing a data structure are true? Select every one that applies.',
    options: [
      'An array gives O(1) lookup by value, so scanning an unsorted array is as fast as a hash map lookup.',
      'A hash map gives average O(1) lookup by key, which beats scanning an array to find a record by id.',
      'A JavaScript Map keeps its keys sorted, so iterating it visits keys in ascending order.',
      'A Set is the right structure when the only question you ever ask is whether a value has been seen before.',
      'Inserting mid-array shifts every later element, while a linked list only re-points the two neighbouring nodes.',
      'Because a hash map is O(1) on average, its worst case is O(1) too.'
    ],
    correctIndices: [1, 3, 4],
    hints: [
      'Arrays are O(1) by index, which is not the same as O(1) by value.',
      'For each claim ask whether it describes an average, a guarantee, or merely the order things happen to be stored in.'
    ],
    explanation:
      'Arrays are constant time by index but linear when searching for a value, which is exactly the job a hash map does in average constant time, and a Set is that hash map with the values thrown away. Contiguous storage is also why inserting mid-array slides everything after the gap along, whereas a linked list node is spliced in by re-pointing its neighbours. A Map iterates in insertion order, not sorted order, and a hash map degrades to O(n) when every key collides into one bucket.',
    xpReward: 110,
    tags: ['trade-offs', 'hash-map', 'linked-list', 'set']
  },
  {
    id: 'stage-3-a08',
    stageId: 'stage-3',
    title: 'Dedupe but keep the order',
    type: 'code_runner',
    difficulty: 'easy',
    language: 'javascript',
    prompt:
      'Return a new array with duplicates removed, keeping each value at the position where it first appeared.',
    starterCode:
      'function dedupe(values) {\n' +
      '  // your code here\n' +
      '  return values;\n' +
      '}',
    entryFunction: 'dedupe',
    testCases: [
      { input: '[1, 2, 2, 3, 1]', expected: '[1, 2, 3]' },
      { input: '["a", "b", "a"]', expected: '["a", "b"]' },
      { input: '[]', expected: '[]' },
      { input: '[7, 7, 7]', expected: '[7]' },
      { input: '[3, 1, 3, 2, 1]', expected: '[3, 1, 2]' }
    ],
    solutionCode:
      'function dedupe(values) {\n' +
      '  const seen = new Set();\n' +
      '  const out = [];\n' +
      '  for (const v of values) {\n' +
      '    if (!seen.has(v)) {\n' +
      '      seen.add(v);\n' +
      '      out.push(v);\n' +
      '    }\n' +
      '  }\n' +
      '  return out;\n' +
      '}',
    hints: [
      'Keep a Set of the values already emitted and check it before pushing.',
      'Set.has is average O(1), so the whole pass stays O(n) instead of O(n squared).'
    ],
    explanation:
      'A Set answers "have I seen this?" in average constant time, so one pass builds the result in O(n). Checking out.includes(v) instead would rescan the output for every element and turn the function into O(n squared).',
    xpReward: 40,
    tags: ['set', 'dedup', 'arrays']
  },
  {
    id: 'stage-3-a09',
    stageId: 'stage-3',
    title: 'Balanced brackets, three kinds',
    type: 'code_runner',
    difficulty: 'hard',
    language: 'javascript',
    prompt:
      'Return true when every bracket in the text is closed by the matching kind in the right order. Handle (), [] and {}, and ignore any other character.',
    starterCode:
      'function isBalanced(text) {\n' +
      '  // your code here\n' +
      '  return false;\n' +
      '}',
    entryFunction: 'isBalanced',
    testCases: [
      { input: '"()"', expected: 'true' },
      { input: '"([{}])"', expected: 'true' },
      { input: '"(]"', expected: 'false' },
      { input: '"(("', expected: 'false' },
      { input: '")("', expected: 'false' },
      { input: '"a(b)c"', expected: 'true' },
      { input: '""', expected: 'true' }
    ],
    solutionCode:
      'function isBalanced(text) {\n' +
      '  const pairs = { ")": "(", "]": "[", "}": "{" };\n' +
      '  const stack = [];\n' +
      '  for (const ch of text) {\n' +
      '    if (ch === "(" || ch === "[" || ch === "{") {\n' +
      '      stack.push(ch);\n' +
      '    } else if (pairs[ch]) {\n' +
      '      if (stack.pop() !== pairs[ch]) return false;\n' +
      '    }\n' +
      '  }\n' +
      '  return stack.length === 0;\n' +
      '}',
    hints: [
      'Map each closing bracket to the opening bracket it must match, then compare against what you pop.',
      'Popping an empty array gives undefined, which will never equal an opening bracket.'
    ],
    explanation:
      'Push every opener and, on a closer, pop the most recent opener and check it is the matching kind. Keeping three separate counters instead of one stack would wrongly accept "([)]", because counters lose the nesting order. A non-empty stack at the end means something was never closed.',
    xpReward: 110,
    tags: ['stack', 'brackets', 'parsing']
  },
  {
    id: 'stage-3-a10',
    stageId: 'stage-3',
    title: 'The print queue runs backwards',
    type: 'debug',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'Jobs should be printed in the order they were submitted, but this function returns them reversed. Find the bug and fix it.',
    starterCode:
      'function processJobs(jobs) {\n' +
      '  const queue = [];\n' +
      '  const printed = [];\n' +
      '  for (const job of jobs) {\n' +
      '    queue.push(job);\n' +
      '  }\n' +
      '  while (queue.length > 0) {\n' +
      '    printed.push(queue.pop());\n' +
      '  }\n' +
      '  return printed;\n' +
      '}',
    entryFunction: 'processJobs',
    testCases: [
      { input: '["a", "b", "c"]', expected: '["a", "b", "c"]' },
      { input: '[1, 2]', expected: '[1, 2]' },
      { input: '[]', expected: '[]' },
      { input: '["only"]', expected: '["only"]' },
      { input: '["x", "y", "z", "w"]', expected: '["x", "y", "z", "w"]' }
    ],
    solutionCode:
      'function processJobs(jobs) {\n' +
      '  const queue = [];\n' +
      '  const printed = [];\n' +
      '  for (const job of jobs) {\n' +
      '    queue.push(job);\n' +
      '  }\n' +
      '  while (queue.length > 0) {\n' +
      '    printed.push(queue.shift());\n' +
      '  }\n' +
      '  return printed;\n' +
      '}',
    hints: [
      'push and pop both work on the end of the array, which is stack behaviour.',
      'A queue removes from the front, so you need the array method that takes the first element.'
    ],
    explanation:
      'push plus pop both act on the back of the array, making it a last in first out stack, so the newest job prints first. A queue is first in first out: pair push with shift, which removes from the front. Note that shift is O(n) on a JavaScript array, so a real high-volume queue keeps a head index instead.',
    xpReward: 70,
    tags: ['queue', 'stack', 'fifo', 'debugging']
  }
];
