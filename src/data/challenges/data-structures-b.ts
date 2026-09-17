import { Challenge } from '../../types';

/**
 * Stage 03 - Data Structures, batch B.
 * Linked lists, binary trees, BSTs, heaps, tries and graph representations.
 */
export const challenges: Challenge[] = [
  {
    id: 'stage-3-b01',
    stageId: 'stage-3',
    title: 'Relinking a node',
    type: 'output_prediction',
    difficulty: 'easy',
    language: 'javascript',
    prompt: 'What does this program print?',
    codeSnippet:
      'const c = { value: 3, next: null };\n' +
      'const b = { value: 2, next: c };\n' +
      'const a = { value: 1, next: b };\n' +
      'a.next = c;\n' +
      'const out = [];\n' +
      'let node = a;\n' +
      'while (node !== null) {\n' +
      '  out.push(node.value);\n' +
      '  node = node.next;\n' +
      '}\n' +
      'console.log(out.join("->"));',
    options: ['1->3', '1->2->3', '1->2', '3->2->1'],
    correctIndex: 0,
    hints: [
      'Redraw the arrows after the line `a.next = c` runs.',
      'A node is only reachable if something still points at it.'
    ],
    explanation:
      'Assigning a.next = c overwrites the only pointer that led to b, so b is no longer on the list even though the variable b still exists. The walk goes a (1) then c (3) and stops at null.',
    xpReward: 40,
    tags: ['linked-list', 'pointers', 'traversal']
  },
  {
    id: 'stage-3-b02',
    stageId: 'stage-3',
    title: 'Which traversal is this?',
    type: 'quiz',
    difficulty: 'easy',
    language: 'pseudocode',
    prompt: 'Which listing is the pre-order traversal of this binary tree?',
    codeSnippet:
      '        5\n' +
      '       / \\\n' +
      '      3   8\n' +
      '     / \\   \\\n' +
      '    1   4   9',
    options: ['5 3 1 4 8 9', '1 3 4 5 8 9', '1 4 3 9 8 5', '5 3 8 1 4 9'],
    correctIndex: 0,
    hints: [
      'Two of the four listings start at 5, so the real question is what a traversal does immediately after visiting a node.'
    ],
    explanation:
      'Pre-order is node, left subtree, right subtree, giving 5 3 1 4 8 9. The other listings are in-order (1 3 4 5 8 9), post-order (1 4 3 9 8 5) and level-order (5 3 8 1 4 9).',
    xpReward: 40,
    tags: ['binary-tree', 'traversal', 'preorder']
  },
  {
    id: 'stage-3-b03',
    stageId: 'stage-3',
    title: 'Complete the BST insert',
    type: 'fill_blank',
    difficulty: 'medium',
    language: 'javascript',
    prompt: 'Fill in the blanks so values land on the correct side of each node.',
    codeSnippet:
      'function insert(node, value) {\n' +
      '  if (node === null) {\n' +
      '    return { value: value, left: null, right: null };\n' +
      '  }\n' +
      '  if (value ___ node.value) {\n' +
      '    node.left = insert(node.left, value);\n' +
      '  } else if (value > node.value) {\n' +
      '    node.___ = insert(node.right, value);\n' +
      '  }\n' +
      '  return node;\n' +
      '}',
    blanks: [
      { answer: '<', choices: ['<', '>', '>=', '==='] },
      { answer: 'right', choices: ['right', 'left', 'next', 'parent'] }
    ],
    hints: [
      'The branch that recurses into node.left must be the branch for smaller values.',
      'Each recursive call returns the subtree root, so store it back on the same side you descended.'
    ],
    explanation:
      'A BST keeps every value smaller than a node in its left subtree and every larger value on the right, so the first test is `value < node.value`. The recursive call returns the (possibly new) subtree root, which must be reattached to the same side it came from.',
    xpReward: 70,
    tags: ['bst', 'recursion', 'insert']
  },
  {
    id: 'stage-3-b04',
    stageId: 'stage-3',
    title: 'Order the iterative BST search',
    type: 'pseudocode_order',
    difficulty: 'easy',
    language: 'pseudocode',
    prompt:
      'Put these pseudocode lines in the order that searches a binary search tree without recursion.',
    pseudocodeLines: [
      'SET current TO root',
      'WHILE current IS NOT NULL',
      '    IF target EQUALS current.value THEN RETURN TRUE',
      '    IF target < current.value THEN SET current TO current.left',
      '    ELSE SET current TO current.right',
      'END WHILE',
      'RETURN FALSE'
    ],
    hints: [
      'Check for a hit before you decide which way to walk.',
      'Falling out of the loop means you reached a null link, so the value was never there.'
    ],
    explanation:
      'Start at the root, and while there is still a node to inspect, test for a match first, otherwise use the ordering to pick one child and discard the entire other subtree. Reaching null means the target is absent.',
    xpReward: 40,
    tags: ['bst', 'search', 'pseudocode']
  },
  {
    id: 'stage-3-b05',
    stageId: 'stage-3',
    title: 'What is true of a binary min-heap?',
    type: 'multi_select',
    difficulty: 'medium',
    language: 'javascript',
    prompt: 'Which statements about a binary min-heap are true? Select every one that applies.',
    options: [
      'The smallest element is always at the root.',
      'An in-order traversal of the heap lists its values in sorted order.',
      'Inserting one element costs O(log n) in the worst case.',
      'It is normally stored in a plain array, with the children of index i at 2i+1 and 2i+2.',
      'Finding the largest element takes O(log n).',
      'The underlying array is always fully sorted ascending.'
    ],
    correctIndices: [0, 2, 3],
    hints: [
      'The heap property only relates a parent to its own children, never one sibling to another.',
      'Which end of the heap does a min-heap say nothing useful about?'
    ],
    explanation:
      'The heap property (every parent is smaller than its children) puts the minimum at the root and costs at most one sift per level, so insertion is O(log n) on a complete tree stored in an array. It says nothing about siblings, so the array is not sorted, an in-order walk is meaningless, and the maximum can be any leaf, which takes O(n) to find.',
    xpReward: 70,
    tags: ['heap', 'priority-queue', 'complexity']
  },
  {
    id: 'stage-3-b06',
    stageId: 'stage-3',
    title: 'Count the nodes in a trie',
    type: 'code_runner',
    difficulty: 'hard',
    language: 'javascript',
    prompt:
      'Insert every word into a character trie built from nested objects and return the total number of nodes, counting the empty root. Words that share a prefix share the nodes for that prefix.',
    starterCode:
      'function trieNodeCount(words) {\n' +
      '  const root = {};\n' +
      '  // your code here\n' +
      '  return 0;\n' +
      '}',
    entryFunction: 'trieNodeCount',
    testCases: [
      { input: '["cat", "car"]', expected: '5' },
      { input: '["do", "dog", "dodge"]', expected: '7' },
      { input: '["a"]', expected: '2' },
      { input: '[]', expected: '1' },
      { input: '["ab", "cd"]', expected: '5' }
    ],
    solutionCode:
      'function trieNodeCount(words) {\n' +
      '  const root = {};\n' +
      '  let count = 1;\n' +
      '  for (let w = 0; w < words.length; w++) {\n' +
      '    let node = root;\n' +
      '    const word = words[w];\n' +
      '    for (let i = 0; i < word.length; i++) {\n' +
      '      const ch = word[i];\n' +
      '      if (!node[ch]) {\n' +
      '        node[ch] = {};\n' +
      '        count++;\n' +
      '      }\n' +
      '      node = node[ch];\n' +
      '    }\n' +
      '  }\n' +
      '  return count;\n' +
      '}',
    hints: [
      'Walk one character at a time from the root, creating a child object only when it is missing.',
      'The root exists before any word is inserted, so start the counter at 1.'
    ],
    explanation:
      'A trie stores one character per edge, so inserting "cat" then "car" creates c, a, t and only one extra node r: the shared prefix "ca" is reused. Counting a new node exactly when a child is missing gives 1 (root) plus the number of distinct prefixes.',
    xpReward: 110,
    tags: ['trie', 'prefix', 'strings']
  },
  {
    id: 'stage-3-b07',
    stageId: 'stage-3',
    title: 'Fix the list reversal',
    type: 'debug',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'This should reverse a singly linked list and return the new head, but it returns null. Find the bug and fix it.',
    starterCode:
      'function reverseList(head) {\n' +
      '  let prev = null;\n' +
      '  let current = head;\n' +
      '  while (current !== null) {\n' +
      '    const next = current.next;\n' +
      '    current.next = prev;\n' +
      '    prev = current;\n' +
      '    current = next;\n' +
      '  }\n' +
      '  return current;\n' +
      '}',
    entryFunction: 'reverseList',
    testCases: [
      {
        input: '{"value": 1, "next": {"value": 2, "next": {"value": 3, "next": null}}}',
        expected: '{"value": 3, "next": {"value": 2, "next": {"value": 1, "next": null}}}'
      },
      {
        input: '{"value": 1, "next": {"value": 2, "next": null}}',
        expected: '{"value": 2, "next": {"value": 1, "next": null}}'
      },
      { input: '{"value": 7, "next": null}', expected: '{"value": 7, "next": null}' },
      { input: 'null', expected: 'null' }
    ],
    solutionCode:
      'function reverseList(head) {\n' +
      '  let prev = null;\n' +
      '  let current = head;\n' +
      '  while (current !== null) {\n' +
      '    const next = current.next;\n' +
      '    current.next = prev;\n' +
      '    prev = current;\n' +
      '    current = next;\n' +
      '  }\n' +
      '  return prev;\n' +
      '}',
    hints: [
      'Write down the values of prev and current after the loop finishes.',
      'Only one of those two pointers still refers to a real node once the walk is over.'
    ],
    explanation:
      'The loop exits precisely when current is null, so returning current always yields null. The last node visited is left in prev, and that node is the head of the reversed list.',
    xpReward: 70,
    tags: ['linked-list', 'pointers', 'debugging']
  },
  {
    id: 'stage-3-b08',
    stageId: 'stage-3',
    title: 'Breadth-first over an adjacency list',
    type: 'output_prediction',
    difficulty: 'medium',
    language: 'javascript',
    prompt: 'What does this program print?',
    codeSnippet:
      'const graph = {\n' +
      '  A: ["B", "C"],\n' +
      '  B: ["D"],\n' +
      '  C: ["D"],\n' +
      '  D: []\n' +
      '};\n' +
      'const seen = new Set(["A"]);\n' +
      'const queue = ["A"];\n' +
      'const order = [];\n' +
      'while (queue.length > 0) {\n' +
      '  const node = queue.shift();\n' +
      '  order.push(node);\n' +
      '  for (const n of graph[node]) {\n' +
      '    if (!seen.has(n)) {\n' +
      '      seen.add(n);\n' +
      '      queue.push(n);\n' +
      '    }\n' +
      '  }\n' +
      '}\n' +
      'console.log(order.join(" "));',
    options: ['A B C D', 'A B D C', 'A C B D', 'A B C D D'],
    correctIndex: 0,
    hints: [
      'shift() removes from the front, so the queue is first in, first out.',
      'D is reachable from both B and C, but it is marked seen the first time it is enqueued.'
    ],
    explanation:
      'A dequeues and enqueues B and C, then B dequeues and enqueues D, then C finds D already in seen and skips it, then D dequeues. Marking a node when it is enqueued, not when it is dequeued, is what stops D from being visited twice.',
    xpReward: 70,
    tags: ['graph', 'bfs', 'adjacency-list']
  },
  {
    id: 'stage-3-b09',
    stageId: 'stage-3',
    title: 'Edge lookup in both representations',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'javascript',
    prompt:
      'The same undirected graph is stored as a matrix and as a list. Fill in the blanks so both edge tests work.',
    codeSnippet:
      'const matrix = [\n' +
      '  [0, 1, 1, 0],\n' +
      '  [1, 0, 0, 1],\n' +
      '  [1, 0, 0, 1],\n' +
      '  [0, 1, 1, 0]\n' +
      '];\n' +
      'const list = { 0: [1, 2], 1: [0, 3], 2: [0, 3], 3: [1, 2] };\n' +
      '\n' +
      'function hasEdgeMatrix(u, v) {\n' +
      '  return matrix[u][___] === 1;\n' +
      '}\n' +
      '\n' +
      'function hasEdgeList(u, v) {\n' +
      '  return list[u].___(v);\n' +
      '}',
    blanks: [
      { answer: 'v', choices: ['v', 'u', '0', '1'] },
      { answer: 'includes', choices: ['includes', 'has', 'contains', 'push'] }
    ],
    hints: [
      'Row u of the matrix holds one cell per possible neighbour.',
      'list[u] is a plain array, and arrays do not have a has() method.'
    ],
    explanation:
      'The matrix answers "is there an edge u-v?" by reading the single cell matrix[u][v] in O(1), while the adjacency list has to scan the neighbour array with includes, which costs O(degree of u). The matrix pays for that speed with n squared cells even when the graph is sparse.',
    xpReward: 40,
    tags: ['graph', 'adjacency-matrix', 'adjacency-list']
  },
  {
    id: 'stage-3-b10',
    stageId: 'stage-3',
    title: 'Extract the minimum from a heap',
    type: 'code_runner',
    difficulty: 'hard',
    language: 'javascript',
    prompt:
      'Given a valid binary min-heap stored as an array, remove the root and return the repaired heap array. Move the last element into the root, then sift it down, always swapping with the smaller child. An empty input has no root to remove, so return an empty array. Do not mutate the input.',
    starterCode:
      'function extractMin(heap) {\n' +
      '  const h = heap.slice();\n' +
      '  // your code here\n' +
      '  return h;\n' +
      '}',
    entryFunction: 'extractMin',
    testCases: [
      { input: '[1, 3, 5, 7, 9, 8]', expected: '[3, 7, 5, 8, 9]' },
      { input: '[1, 2, 3, 4, 5]', expected: '[2, 4, 3, 5]' },
      { input: '[2, 4]', expected: '[4]' },
      { input: '[5]', expected: '[]' },
      { input: '[]', expected: '[]' }
    ],
    solutionCode:
      'function extractMin(heap) {\n' +
      '  const h = heap.slice();\n' +
      '  if (h.length <= 1) return [];\n' +
      '  h[0] = h[h.length - 1];\n' +
      '  h.pop();\n' +
      '  let i = 0;\n' +
      '  while (true) {\n' +
      '    const left = 2 * i + 1;\n' +
      '    const right = 2 * i + 2;\n' +
      '    let smallest = i;\n' +
      '    if (left < h.length && h[left] < h[smallest]) smallest = left;\n' +
      '    if (right < h.length && h[right] < h[smallest]) smallest = right;\n' +
      '    if (smallest === i) break;\n' +
      '    const tmp = h[i];\n' +
      '    h[i] = h[smallest];\n' +
      '    h[smallest] = tmp;\n' +
      '    i = smallest;\n' +
      '  }\n' +
      '  return h;\n' +
      '}',
    hints: [
      'The children of index i live at 2i+1 and 2i+2, and either one may be past the end of the array.',
      'Stop as soon as the element is smaller than both of its children.'
    ],
    explanation:
      'Overwriting the root with the last element keeps the tree complete, and sifting that value down past the smaller child restores the heap property in O(log n) swaps. Swapping with the larger child instead would leave the bigger value above the smaller one and break the heap.',
    xpReward: 110,
    tags: ['heap', 'priority-queue', 'sift-down']
  }
];
