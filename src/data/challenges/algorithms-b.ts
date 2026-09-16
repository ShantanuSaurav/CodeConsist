import { Challenge } from '../../types';

/**
 * Stage 04 - Algorithms & Problem Solving, batch B.
 * Recursion, memoisation and DP, greedy choices, binary search,
 * merging sorted runs, BFS vs DFS, backtracking, and Big-O of
 * nested loops.
 */
export const challenges: Challenge[] = [
  {
    id: 'stage-4-b01',
    stageId: 'stage-4',
    title: 'Where the recursion stops',
    type: 'output_prediction',
    difficulty: 'easy',
    language: 'javascript',
    prompt: 'What does this program print, line by line from top to bottom?',
    codeSnippet:
      'function countdown(n) {\n' +
      '  if (n === 0) return "done";\n' +
      '  console.log(n);\n' +
      '  return countdown(n - 1);\n' +
      '}\n' +
      '\n' +
      'console.log(countdown(3));',
    options: [
      '3, 2, 1, done',
      '3, 2, 1, 0, done',
      '0, 1, 2, 3, done',
      '3, 2, 1 and then a stack overflow'
    ],
    correctIndex: 0,
    hints: [
      'Look at the order of the statements: which one runs first when n is 0?',
      'Ask yourself which value of n never gets printed.'
    ],
    explanation:
      'The base case is checked first, so when n reaches 0 the function returns "done" without printing 0. That gives 3, 2, 1 from the recursive calls and then "done" from the outer console.log.',
    xpReward: 40,
    tags: ['recursion', 'base-case']
  },
  {
    id: 'stage-4-b02',
    stageId: 'stage-4',
    title: 'Cost of a triangular loop',
    type: 'quiz',
    difficulty: 'easy',
    language: 'javascript',
    prompt:
      'Let n be items.length. What is the time complexity of countPairs in Big-O notation?',
    codeSnippet:
      'function countPairs(items) {\n' +
      '  let pairs = 0;\n' +
      '  for (let i = 0; i < items.length; i++) {\n' +
      '    for (let j = i + 1; j < items.length; j++) {\n' +
      '      pairs++;\n' +
      '    }\n' +
      '  }\n' +
      '  return pairs;\n' +
      '}',
    options: [
      'O(n^2)',
      'O(n)',
      'O(n log n)',
      'O(n^2) in the worst case but O(n) in the best case'
    ],
    correctIndex: 0,
    hints: [
      'Count how many times pairs++ runs in total, then ask which term of that count grows fastest.',
      'Neither loop bound looks at the values inside items, only at how many there are.'
    ],
    explanation:
      'The body runs n(n - 1)/2 times, which expands to (n^2 - n)/2. Big-O keeps only the fastest-growing term and drops constant factors, so the halving and the -n both disappear and the answer is O(n^2). There is also no cheaper best case: neither loop bound and no branch inside depends on the values in items, so the count is fixed by n alone.',
    xpReward: 40,
    tags: ['big-o', 'nested-loops', 'complexity']
  },
  {
    id: 'stage-4-b03',
    stageId: 'stage-4',
    title: 'When greedy picks wrong',
    type: 'output_prediction',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'This greedy routine walks the coin list from largest to smallest, taking as many of each coin as still fit. What does it print for a target of 6 with coins 4, 3 and 1?',
    codeSnippet:
      'function greedyCoins(target, coins) {\n' +
      '  let left = target;\n' +
      '  let used = 0;\n' +
      '  for (const c of coins) {\n' +
      '    while (left >= c) {\n' +
      '      left -= c;\n' +
      '      used++;\n' +
      '    }\n' +
      '  }\n' +
      '  return used;\n' +
      '}\n' +
      '\n' +
      'console.log(greedyCoins(6, [4, 3, 1]));',
    options: ['3', '2', '6', '1'],
    correctIndex: 0,
    hints: [
      'Follow the value of left after the 4 is taken.',
      'Compare the greedy result with the best answer you can find by hand.'
    ],
    explanation:
      'Greedy takes 4 first, leaving 2, which it can only pay with 1 + 1, so it returns 3. The optimal answer is 3 + 3 = 2 coins, so this coin set is a case where the locally best choice blocks the globally best solution.',
    xpReward: 70,
    tags: ['greedy', 'coin-change', 'optimality']
  },
  {
    id: 'stage-4-b04',
    stageId: 'stage-4',
    title: 'Add the memo table',
    type: 'fill_blank',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'countPaths(row, col) counts the routes to a cell row steps down and col steps right, moving only down or right. Fill in the blanks so each (row, col) pair is computed once and reused.',
    codeSnippet:
      'function countPaths(row, col, memo = new Map()) {\n' +
      '  if (row === 0 || col === 0) return 1;\n' +
      '  const key = row + "," + col;\n' +
      '  if (memo.___(key)) return memo.get(key);\n' +
      '  const total =\n' +
      '    countPaths(row - 1, col, memo) +\n' +
      '    countPaths(row, col - 1, memo);\n' +
      '  memo.___(key, total);\n' +
      '  return total;\n' +
      '}',
    blanks: [
      { answer: 'has', choices: ['has', 'includes', 'contains', 'hasKey'] },
      { answer: 'set', choices: ['set', 'put', 'add', 'push'] }
    ],
    hints: [
      'A Map answers "do I already know this key?" with one method and records a new entry with another.',
      'Map keeps to its own small vocabulary and borrows no method names from Array.'
    ],
    explanation:
      'A Map tests membership with has(key) and stores with set(key, value); includes belongs to Array, add to Set, and contains, hasKey and put come from other languages. The two coordinates are folded into one string key because a Map compares keys by identity, so a fresh [row, col] array would never match a stored one. With the cache in place each cell is expanded once instead of once per path that reaches it.',
    xpReward: 70,
    tags: ['memoisation', 'recursion', 'map']
  },
  {
    id: 'stage-4-b05',
    stageId: 'stage-4',
    title: 'Close the binary search window',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'javascript',
    prompt:
      'Fill in the blanks so binarySearch returns the index of target in an ascending array, or -1 when target is absent.',
    codeSnippet:
      'function binarySearch(sorted, target) {\n' +
      '  let lo = 0;\n' +
      '  let hi = sorted.length - 1;\n' +
      '  while (lo ___ hi) {\n' +
      '    const mid = Math.floor((lo + hi) / 2);\n' +
      '    if (sorted[mid] === target) return mid;\n' +
      '    if (sorted[mid] < target) lo = mid + 1;\n' +
      '    else hi = ___;\n' +
      '  }\n' +
      '  return -1;\n' +
      '}',
    blanks: [
      { answer: '<=', choices: ['<=', '<', '===', '>'] },
      { answer: 'mid - 1', choices: ['mid - 1', 'mid', 'mid + 1', 'lo - 1'] }
    ],
    hints: [
      'Picture the moment lo and hi land on the same index: is that element already ruled out?',
      'Every pass has to make the window strictly smaller, or the loop never ends.'
    ],
    explanation:
      'When lo and hi meet there is still one unchecked element at that index, so the guard must be lo <= hi; with lo < hi a target sitting alone in the final window is reported missing. The element at mid has just been compared and ruled out, so the surviving half is everything strictly below it, hi = mid - 1. Leaving mid inside the window keeps lo and hi unchanged on the next pass and the loop spins forever.',
    xpReward: 40,
    tags: ['binary-search', 'divide-and-conquer', 'loops']
  },
  {
    id: 'stage-4-b06',
    stageId: 'stage-4',
    title: 'Order a breadth-first search',
    type: 'pseudocode_order',
    difficulty: 'medium',
    language: 'pseudocode',
    prompt:
      'Put these pseudocode lines in the order that performs a breadth-first search from start.',
    pseudocodeLines: [
      'CREATE an empty queue AND an empty visited set',
      'ADD start TO queue AND MARK start AS visited',
      'WHILE queue IS NOT EMPTY',
      '    SET node TO REMOVE FROM FRONT OF queue',
      '    FOR EACH neighbour OF node THAT IS NOT VISITED',
      '        MARK neighbour AS visited AND ADD IT TO BACK OF queue',
      '    END FOR',
      'END WHILE'
    ],
    hints: [
      'A node is marked visited at the moment it enters the queue, not when it leaves.',
      'Breadth-first means the oldest node in the queue is processed next.'
    ],
    explanation:
      'BFS removes from the front and appends to the back, so nodes come out in order of distance from start. Marking a neighbour visited as it is enqueued stops the same node being queued twice; swapping the queue for a stack makes the same skeleton explore depth-first instead.',
    xpReward: 70,
    tags: ['bfs', 'graphs', 'queue']
  },
  {
    id: 'stage-4-b07',
    stageId: 'stage-4',
    title: 'BFS against DFS',
    type: 'multi_select',
    difficulty: 'medium',
    language: 'pseudocode',
    prompt:
      'Which statements about BFS and DFS on an unweighted graph are true? Select every one that applies.',
    options: [
      'BFS first reaches each node it visits by a path with the fewest edges.',
      'DFS is normally written with an explicit stack, or with the call stack via recursion.',
      'DFS finds the shortest path first because it reaches deep nodes quickly.',
      'On a very wide graph BFS can hold far more nodes in memory at once than DFS.',
      'BFS cannot be run on a graph that contains a cycle.',
      'BFS on an unweighted graph requires a priority queue rather than a plain queue.'
    ],
    correctIndices: [0, 1, 3],
    hints: [
      'Think about what the frontier of each search looks like at any moment.',
      'Test each claim twice: once on a deep, narrow graph and once on a shallow, very wide one.'
    ],
    explanation:
      'BFS expands nodes in distance order, so the first time it reaches a node it has used the fewest edges; DFS commits to one branch and may reach a node by a long path first. BFS stores the whole frontier, which is expensive on wide graphs, while DFS stores only the current path. A visited set handles cycles for both, and a plain FIFO queue is enough when every edge costs the same.',
    xpReward: 70,
    tags: ['bfs', 'dfs', 'graphs']
  },
  {
    id: 'stage-4-b08',
    stageId: 'stage-4',
    title: 'Merge two sorted runs',
    type: 'code_runner',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'Both inputs are already sorted ascending. Return one ascending array holding every element of both, keeping duplicates. Do it in a single pass: do not concatenate and re-sort.',
    starterCode:
      'function mergeSorted(a, b) {\n' +
      '  // your code here\n' +
      '  return [];\n' +
      '}',
    entryFunction: 'mergeSorted',
    testCases: [
      { input: '[1, 3, 5], [2, 4, 6]', expected: '[1, 2, 3, 4, 5, 6]' },
      { input: '[], [1, 2]', expected: '[1, 2]' },
      { input: '[1, 2], []', expected: '[1, 2]' },
      { input: '[1, 1, 4], [1, 3]', expected: '[1, 1, 1, 3, 4]' },
      { input: '[9], [2, 8]', expected: '[2, 8, 9]' }
    ],
    solutionCode:
      'function mergeSorted(a, b) {\n' +
      '  const out = [];\n' +
      '  let i = 0;\n' +
      '  let j = 0;\n' +
      '  while (i < a.length && j < b.length) {\n' +
      '    if (a[i] <= b[j]) out.push(a[i++]);\n' +
      '    else out.push(b[j++]);\n' +
      '  }\n' +
      '  while (i < a.length) out.push(a[i++]);\n' +
      '  while (j < b.length) out.push(b[j++]);\n' +
      '  return out;\n' +
      '}',
    hints: [
      'Keep one index into each array and advance only the one you just took from.',
      'The main loop stops as soon as either index runs off the end. What is still sitting in the other array at that moment?'
    ],
    explanation:
      'Because both inputs are sorted, the smallest element not yet taken is always at the front of one list or the other, so comparing just those two heads is enough to choose the next output. That makes the merge O(a + b) in one pass, while concatenating and re-sorting throws away the ordering you were handed and costs O(n log n). The tail loops are not optional: the main loop exits the moment one side empties, leaving the rest of the other side unwritten.',
    xpReward: 70,
    tags: ['merge', 'two-pointers', 'sorting']
  },
  {
    id: 'stage-4-b09',
    stageId: 'stage-4',
    title: 'Backtracking that never backtracks',
    type: 'debug',
    difficulty: 'hard',
    language: 'javascript',
    prompt:
      'This function should count every permutation of the input, but it always returns 1. Find the bug and fix it.',
    starterCode:
      'function countPermutations(nums) {\n' +
      '  const used = new Array(nums.length).fill(false);\n' +
      '  let count = 0;\n' +
      '  function walk(depth) {\n' +
      '    if (depth === nums.length) {\n' +
      '      count++;\n' +
      '      return;\n' +
      '    }\n' +
      '    for (let i = 0; i < nums.length; i++) {\n' +
      '      if (used[i]) continue;\n' +
      '      used[i] = true;\n' +
      '      walk(depth + 1);\n' +
      '    }\n' +
      '  }\n' +
      '  walk(0);\n' +
      '  return count;\n' +
      '}',
    entryFunction: 'countPermutations',
    testCases: [
      { input: '[1, 2]', expected: '2' },
      { input: '[1, 2, 3]', expected: '6' },
      { input: '[1, 2, 3, 4]', expected: '24' },
      { input: '[7]', expected: '1' }
    ],
    solutionCode:
      'function countPermutations(nums) {\n' +
      '  const used = new Array(nums.length).fill(false);\n' +
      '  let count = 0;\n' +
      '  function walk(depth) {\n' +
      '    if (depth === nums.length) {\n' +
      '      count++;\n' +
      '      return;\n' +
      '    }\n' +
      '    for (let i = 0; i < nums.length; i++) {\n' +
      '      if (used[i]) continue;\n' +
      '      used[i] = true;\n' +
      '      walk(depth + 1);\n' +
      '      used[i] = false;\n' +
      '    }\n' +
      '  }\n' +
      '  walk(0);\n' +
      '  return count;\n' +
      '}',
    hints: [
      'The used array is shared by every branch of the search.',
      'What has to happen to a choice once the recursive call built on it has finished?'
    ],
    explanation:
      'Backtracking is choose, explore, then undo. The loop marks used[i] = true but never clears it, so after the first full branch every slot is stuck at true and no other ordering can start. Restoring used[i] = false after the recursive call returns releases the choice for sibling branches.',
    xpReward: 110,
    tags: ['backtracking', 'recursion', 'debugging']
  },
  {
    id: 'stage-4-b10',
    stageId: 'stage-4',
    title: 'Fewest coins, done properly',
    type: 'code_runner',
    difficulty: 'hard',
    language: 'javascript',
    prompt:
      'Return the smallest number of coins that add up to amount, or -1 when it cannot be made. Coins may be reused any number of times. Greedy is not good enough here.',
    starterCode:
      'function minCoins(coins, amount) {\n' +
      '  // your code here\n' +
      '  return -1;\n' +
      '}',
    entryFunction: 'minCoins',
    testCases: [
      { input: '[1, 3, 4], 6', expected: '2' },
      { input: '[2], 3', expected: '-1' },
      { input: '[1, 5, 10, 25], 30', expected: '2' },
      { input: '[5, 7], 0', expected: '0' },
      { input: '[1, 3, 4], 11', expected: '3' }
    ],
    solutionCode:
      'function minCoins(coins, amount) {\n' +
      '  const best = new Array(amount + 1).fill(Infinity);\n' +
      '  best[0] = 0;\n' +
      '  for (let value = 1; value <= amount; value++) {\n' +
      '    for (const coin of coins) {\n' +
      '      if (coin <= value && best[value - coin] + 1 < best[value]) {\n' +
      '        best[value] = best[value - coin] + 1;\n' +
      '      }\n' +
      '    }\n' +
      '  }\n' +
      '  return best[amount] === Infinity ? -1 : best[amount];\n' +
      '}',
    hints: [
      'If you already knew the fewest coins for every amount below v, how would you work out v itself?',
      'You need a starting value that means "no way to make this yet" and that can never win a minimum comparison.'
    ],
    explanation:
      'Solving every smaller amount first turns the problem into best[v] = 1 + min(best[v - coin]) over the coins that fit. Amounts that stay at Infinity are unreachable and map to -1, and the loop is O(amount * coins.length) rather than the exponential search recursion alone would do.',
    xpReward: 110,
    tags: ['dynamic-programming', 'coin-change', 'bottom-up']
  }
];
