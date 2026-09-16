import { Challenge } from '../../types';

/**
 * Stage 04 - Algorithms & Problem Solving, batch A.
 * Covers two pointers, sliding windows, binary search invariants,
 * sorting stability, prefix sums and in-place partitioning.
 */
export const challenges: Challenge[] = [
  {
    id: 'stage-4-a01',
    stageId: 'stage-4',
    title: 'Two pointers: dedupe a sorted array',
    type: 'output_prediction',
    difficulty: 'medium',
    language: 'javascript',
    prompt: 'What does this program print?',
    codeSnippet:
      'function dedupe(sorted) {\n' +
      '  let write = 1;\n' +
      '  for (let read = 1; read < sorted.length; read++) {\n' +
      '    if (sorted[read] !== sorted[write - 1]) {\n' +
      '      sorted[write] = sorted[read];\n' +
      '      write++;\n' +
      '    }\n' +
      '  }\n' +
      '  return sorted.slice(0, write);\n' +
      '}\n' +
      'console.log(dedupe([1, 1, 2, 2, 2, 3]).join(","));',
    options: ['1,2,3', '1,2,3,2,2,3', '1,1,2,2,2,3', '1,1,2'],
    correctIndex: 0,
    hints: [
      'read scans the array; write marks the next slot to overwrite.',
      'Only a prefix of the array is returned, so track how far write gets.'
    ],
    explanation:
      'The fast pointer read visits every element after the first, and the slow pointer write only advances when a new value is found, so the first write slots end up holding the distinct values. The assignments overwrite the array in place, so slice(0, write) reads back the rewritten prefix, not the original one, and drops the stale tail.',
    xpReward: 70,
    tags: ['two-pointers', 'arrays', 'in-place']
  },
  {
    id: 'stage-4-a02',
    stageId: 'stage-4',
    title: 'The half-open binary search invariant',
    type: 'quiz',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'In this lower-bound search hi is exclusive, so the answer always lies in [lo, hi). Why must the else branch set hi = mid instead of hi = mid - 1?',
    codeSnippet:
      'function lowerBound(arr, target) {\n' +
      '  let lo = 0;\n' +
      '  let hi = arr.length; // exclusive\n' +
      '  while (lo < hi) {\n' +
      '    const mid = lo + Math.floor((hi - lo) / 2);\n' +
      '    if (arr[mid] < target) lo = mid + 1;\n' +
      '    else hi = mid;\n' +
      '  }\n' +
      '  return lo;\n' +
      '}',
    options: [
      'arr[mid] >= target, so mid is itself a candidate answer; hi = mid - 1 would throw it away',
      'hi = mid - 1 could make hi negative and index out of bounds on the next pass',
      'hi = mid - 1 would loop forever once lo and hi become adjacent',
      'Both are correct; hi = mid is only a stylistic preference'
    ],
    correctIndex: 0,
    hints: [
      'Write down what you know about arr[mid] when the else branch runs.',
      'The range is half-open, so hi is one past the last candidate, not the last candidate.'
    ],
    explanation:
      'Reaching the else branch proves arr[mid] >= target, which makes mid a possible answer. Because hi is exclusive, hi = mid keeps mid inside [lo, hi); hi = mid - 1 discards it, so searching [1, 5] for 5 would end with lo = 0 instead of the correct 1.',
    xpReward: 70,
    tags: ['binary-search', 'invariants', 'off-by-one']
  },
  {
    id: 'stage-4-a03',
    stageId: 'stage-4',
    title: 'Prefix sums and range queries',
    type: 'output_prediction',
    difficulty: 'easy',
    language: 'javascript',
    prompt: 'What do these two log statements print?',
    codeSnippet:
      'const nums = [3, 1, 4, 1, 5];\n' +
      'const prefix = [0];\n' +
      'for (let i = 0; i < nums.length; i++) {\n' +
      '  prefix.push(prefix[i] + nums[i]);\n' +
      '}\n' +
      'console.log(prefix.join(","));\n' +
      'console.log(prefix[4] - prefix[1]);',
    options: [
      '0,3,4,8,9,14 then 6',
      '0,3,4,8,9,14 then 11',
      '3,4,8,9,14 then 6',
      '0,3,4,8,9,14 then 9'
    ],
    correctIndex: 0,
    hints: [
      'Each push adds the previous total to the current element, so count how many entries the array ends up with.',
      'The second log subtracts two prefix entries; work out which slice of nums is left behind.'
    ],
    explanation:
      'The leading 0 is a sentinel that makes prefix[i] mean "sum of the first i elements", so the array grows to [0,3,4,8,9,14]. prefix[4] - prefix[1] is 9 - 3 = 6, the sum of nums[1] through nums[3]; the right end is exclusive.',
    xpReward: 40,
    tags: ['prefix-sums', 'range-query', 'arrays']
  },
  {
    id: 'stage-4-a04',
    stageId: 'stage-4',
    title: 'Complete the shrinking window',
    type: 'fill_blank',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'nums holds positive numbers. This returns the length of the shortest subarray whose sum reaches target, or 0 if there is none. Fill in the blanks.',
    codeSnippet:
      'function shortestAtLeast(nums, target) {\n' +
      '  let left = 0;\n' +
      '  let sum = 0;\n' +
      '  let best = Infinity;\n' +
      '  for (let right = 0; right < nums.length; right++) {\n' +
      '    sum += nums[right];\n' +
      '    while (sum ___ target) {\n' +
      '      best = Math.min(best, right - left + 1);\n' +
      '      sum -= nums[___];\n' +
      '      left++;\n' +
      '    }\n' +
      '  }\n' +
      '  return best === Infinity ? 0 : best;\n' +
      '}',
    blanks: [
      { answer: '>=', choices: ['>=', '>', '<=', '==='] },
      { answer: 'left', choices: ['left', 'right', 'left - 1', 'right - 1'] }
    ],
    hints: [
      'Decide whether a window whose sum lands exactly on target already counts.',
      'Every element that was added to sum must later be subtracted exactly once, in the order it arrived.'
    ],
    explanation:
      'The window grows on the right one element per iteration and shrinks from the left while it is still valid, so every element is added once and removed once. Because every number is positive, dropping the leftmost element can only lower the sum, which is what makes shrinking while the sum still reaches target safe. Subtract nums[left] before incrementing left, otherwise you remove the wrong element and the running sum drifts.',
    xpReward: 70,
    tags: ['sliding-window', 'two-pointers', 'arrays']
  },
  {
    id: 'stage-4-a05',
    stageId: 'stage-4',
    title: 'Complete the maximum subarray scan',
    type: 'fill_blank',
    difficulty: 'hard',
    language: 'javascript',
    prompt:
      'maxSubarray returns the largest sum of any non-empty contiguous subarray, and must stay correct when every number is negative. Fill in the blanks.',
    codeSnippet:
      'function maxSubarray(nums) {\n' +
      '  let running = nums[0];\n' +
      '  let best = nums[0];\n' +
      '  for (let i = 1; i < nums.length; i++) {\n' +
      '    running = Math.max(___, running + nums[i]);\n' +
      '    best = Math.max(best, ___);\n' +
      '  }\n' +
      '  return ___;\n' +
      '}',
    blanks: [
      { answer: 'nums[i]', choices: ['nums[i]', '0', 'best', 'running'] },
      { answer: 'running', choices: ['running', 'best', 'nums[i]', 'best + running'] },
      { answer: 'best', choices: ['best', 'running', 'nums[nums.length - 1]'] }
    ],
    hints: [
      'At index i there are only two shapes a subarray ending at i can have: it continues the previous one, or it is brand new.',
      'One of the two trackers is allowed to fall again; the other one never may.'
    ],
    explanation:
      'running holds the best sum of a subarray that ends exactly at i, so each step picks the larger of extending the previous subarray or starting over at nums[i]. best is a separate high-water mark because running is allowed to drop, and seeding both with nums[0] instead of 0 is what keeps the result right when every element is negative.',
    xpReward: 110,
    tags: ['kadane', 'subarrays', 'dynamic-programming']
  },
  {
    id: 'stage-4-a06',
    stageId: 'stage-4',
    title: 'Order the Lomuto partition',
    type: 'pseudocode_order',
    difficulty: 'easy',
    language: 'pseudocode',
    prompt:
      'Put these lines in the order that partitions array[low..high] in place around the last element and returns the pivot position.',
    pseudocodeLines: [
      'SET pivot TO array[high] AND SET store TO low',
      'FOR i FROM low TO high - 1',
      '    IF array[i] <= pivot THEN',
      '        SWAP array[i] WITH array[store], THEN ADD 1 TO store',
      '    END IF',
      'END FOR',
      'SWAP array[store] WITH array[high]',
      'RETURN store'
    ],
    hints: [
      'Everything before store is already known to be smaller than the pivot.',
      'The pivot itself is parked at the end and only moved into place once the scan is over.'
    ],
    explanation:
      'store marks the boundary of the "less than or equal to pivot" region. The scan pushes every small element across that boundary, and the final swap drops the pivot into the gap so that everything left of store is <= pivot and everything right of it is greater.',
    xpReward: 40,
    tags: ['partitioning', 'quicksort', 'in-place']
  },
  {
    id: 'stage-4-a07',
    stageId: 'stage-4',
    title: 'What stability actually guarantees',
    type: 'multi_select',
    difficulty: 'medium',
    language: 'javascript',
    prompt: 'Which statements about sorting stability are true? Select every one that applies.',
    options: [
      'A stable sort preserves the original relative order of elements that compare equal',
      'Sorting by last name first and then by department with a stable sort leaves each department ordered by last name',
      'Array.prototype.sort has been required to be stable since ES2019',
      'Heapsort is stable because it always extracts the current maximum',
      'Quicksort with Lomuto partitioning is stable because it only swaps neighbouring elements',
      'Stability is only achievable by O(n log n) algorithms'
    ],
    correctIndices: [0, 1, 2],
    hints: [
      'Stability is a statement about ties only; it says nothing about elements with different keys.',
      'Ask which algorithms move elements over long distances in a single swap.'
    ],
    explanation:
      'Stability means ties keep their input order, which is what lets you build a multi-key ordering by sorting on the least significant key first. Heapsort and Lomuto quicksort both swap far-apart elements and reorder ties arbitrarily, while insertion sort is stable at O(n^2), so cost and stability are independent.',
    xpReward: 70,
    tags: ['sorting', 'stability', 'comparators']
  },
  {
    id: 'stage-4-a08',
    stageId: 'stage-4',
    title: 'Two-sum on a sorted array',
    type: 'code_runner',
    difficulty: 'easy',
    language: 'javascript',
    prompt:
      'nums is sorted ascending. Return [i, j] with i < j such that nums[i] + nums[j] === target, or [] if no such pair exists. Use two pointers, not nested loops.',
    starterCode:
      'function twoSumSorted(nums, target) {\n' + '  // your code here\n' + '  return [];\n' + '}',
    entryFunction: 'twoSumSorted',
    testCases: [
      { input: '[1, 3, 4, 6, 8, 10], 12', expected: '[2, 4]' },
      { input: '[2, 7, 11, 15], 9', expected: '[0, 1]' },
      { input: '[1, 2, 3], 7', expected: '[]' },
      { input: '[-3, 0, 2, 4], 1', expected: '[0, 3]' },
      { input: '[5], 5', expected: '[]' }
    ],
    solutionCode:
      'function twoSumSorted(nums, target) {\n' +
      '  let lo = 0;\n' +
      '  let hi = nums.length - 1;\n' +
      '  while (lo < hi) {\n' +
      '    const sum = nums[lo] + nums[hi];\n' +
      '    if (sum === target) return [lo, hi];\n' +
      '    if (sum < target) lo++;\n' +
      '    else hi--;\n' +
      '  }\n' +
      '  return [];\n' +
      '}',
    hints: [
      'Start with one pointer at each end and compare their sum against target.',
      'If the sum is too small the only way to grow it is to move the left pointer right.'
    ],
    explanation:
      'Because the array is sorted, moving the left pointer right can only increase the sum and moving the right pointer left can only decrease it. Each step rules out an entire row or column of the pair space, so the scan finishes in one pass instead of O(n^2).',
    xpReward: 40,
    tags: ['two-pointers', 'sorted-array', 'search']
  },
  {
    id: 'stage-4-a09',
    stageId: 'stage-4',
    title: 'The window that never closes',
    type: 'debug',
    difficulty: 'easy',
    language: 'javascript',
    prompt:
      'maxWindowSum should return the largest sum of any k consecutive elements, but it keeps growing the window instead of sliding it. Fix it.',
    starterCode:
      'function maxWindowSum(nums, k) {\n' +
      '  let sum = 0;\n' +
      '  for (let i = 0; i < k; i++) sum += nums[i];\n' +
      '  let best = sum;\n' +
      '  for (let i = k; i < nums.length; i++) {\n' +
      '    sum += nums[i];\n' +
      '    best = Math.max(best, sum);\n' +
      '  }\n' +
      '  return best;\n' +
      '}',
    entryFunction: 'maxWindowSum',
    testCases: [
      { input: '[1, 2, 3, 4, 5], 2', expected: '9' },
      { input: '[2, 1, 5, 1, 3, 2], 3', expected: '9' },
      { input: '[5, -1, -2, 6], 2', expected: '4' },
      { input: '[4, 4, 4], 3', expected: '12' }
    ],
    solutionCode:
      'function maxWindowSum(nums, k) {\n' +
      '  let sum = 0;\n' +
      '  for (let i = 0; i < k; i++) sum += nums[i];\n' +
      '  let best = sum;\n' +
      '  for (let i = k; i < nums.length; i++) {\n' +
      '    sum += nums[i] - nums[i - k];\n' +
      '    best = Math.max(best, sum);\n' +
      '  }\n' +
      '  return best;\n' +
      '}',
    hints: [
      'A window of size k gains one element on the right, so it must lose one on the left.',
      'When i enters the window, which index just left it?'
    ],
    explanation:
      'The loop only adds the incoming element, so sum becomes a running total of the whole prefix rather than a window of k items. Subtracting nums[i - k] evicts the element that just fell off the left edge, keeping the window exactly k wide in O(1) per step.',
    xpReward: 40,
    tags: ['sliding-window', 'debugging', 'off-by-one']
  },
  {
    id: 'stage-4-a10',
    stageId: 'stage-4',
    title: 'Three-way partition in one pass',
    type: 'code_runner',
    difficulty: 'hard',
    language: 'javascript',
    prompt:
      'nums contains only 0, 1 and 2. Sort it in place in a single pass using three pointers (low, mid, high) and return the same array. Do not call sort.',
    starterCode:
      'function sortColors(nums) {\n' + '  // your code here\n' + '  return nums;\n' + '}',
    entryFunction: 'sortColors',
    testCases: [
      { input: '[2, 0, 2, 1, 1, 0]', expected: '[0, 0, 1, 1, 2, 2]' },
      { input: '[2, 0, 1]', expected: '[0, 1, 2]' },
      { input: '[0]', expected: '[0]' },
      { input: '[1, 1, 1]', expected: '[1, 1, 1]' },
      { input: '[2, 2, 0, 0]', expected: '[0, 0, 2, 2]' }
    ],
    solutionCode:
      'function sortColors(nums) {\n' +
      '  let low = 0;\n' +
      '  let mid = 0;\n' +
      '  let high = nums.length - 1;\n' +
      '  while (mid <= high) {\n' +
      '    if (nums[mid] === 0) {\n' +
      '      const t = nums[low];\n' +
      '      nums[low] = nums[mid];\n' +
      '      nums[mid] = t;\n' +
      '      low++;\n' +
      '      mid++;\n' +
      '    } else if (nums[mid] === 2) {\n' +
      '      const t = nums[high];\n' +
      '      nums[high] = nums[mid];\n' +
      '      nums[mid] = t;\n' +
      '      high--;\n' +
      '    } else {\n' +
      '      mid++;\n' +
      '    }\n' +
      '  }\n' +
      '  return nums;\n' +
      '}',
    hints: [
      'Keep four regions: settled zeros, settled ones, unexamined, settled twos.',
      'Trace [2, 0, 1] by hand. After the first swap, ask whether the value now sitting under mid has been looked at yet.'
    ],
    explanation:
      'The invariant is that everything before low is 0, everything between low and mid is 1, and everything after high is 2, with [mid, high] still unknown. Swapping a 0 forward can only pull back a value that was already classified, so mid advances, but swapping a 2 backward pulls an unexamined value into mid, so mid must stay put and re-test it.',
    xpReward: 110,
    tags: ['partitioning', 'dutch-national-flag', 'in-place', 'invariants']
  }
];
