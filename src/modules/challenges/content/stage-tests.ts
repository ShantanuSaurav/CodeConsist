import { Challenge } from '@/types';

/**
 * Stage tests - one mandatory coding problem per stage.
 *
 * These unlock once every lesson in the stage is solved, and the next stage
 * stays locked until the test is passed. They are presented LeetCode-style:
 * a problem statement, worked examples, constraints, and a mix of visible and
 * hidden test cases. Hints exist but are only offered after a failed attempt.
 *
 * Each problem is deliberately ON the stage's topic: the point is to prove the
 * lessons transferred, not to spring an unrelated puzzle.
 */
export const challenges: Challenge[] = [
  /* ------------------------------------------------------------ stage 1 */
  {
    id: 'stage-1-test',
    stageId: 'stage-1',
    isStageTest: true,
    title: 'Run-length encode a string',
    type: 'code_runner',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'Compress a string by replacing each run of the same character with the character followed by the run length. A run of length 1 is written as the character alone. Return the compressed string.',
    examples: [
      { input: '"aaabccdddd"', output: '"a3bc2d4"', explanation: 'aaa -> a3, b -> b, cc -> c2, dddd -> d4.' },
      { input: '"abc"', output: '"abc"', explanation: 'Every run has length 1, so nothing gains a count.' },
      { input: '""', output: '""' }
    ],
    constraints: [
      'The input contains only printable ASCII characters.',
      '0 <= length <= 10 000.',
      'Counts may be more than one digit (a run of 12 x becomes x12).'
    ],
    starterCode:
      'function compress(text) {\n' + '  // your code here\n' + '  return "";\n' + '}',
    entryFunction: 'compress',
    testCases: [
      { input: '"aaabccdddd"', expected: '"a3bc2d4"' },
      { input: '"abc"', expected: '"abc"' },
      { input: '""', expected: '""' },
      { input: '"a"', expected: '"a"' },
      { input: '"aabbaa"', expected: '"a2b2a2"', hidden: true },
      { input: '"xxxxxxxxxxxx"', expected: '"x12"', hidden: true },
      { input: '"  !!"', expected: '" 2!2"', hidden: true }
    ],
    solutionCode:
      'function compress(text) {\n' +
      '  let out = "";\n' +
      '  let i = 0;\n' +
      '  while (i < text.length) {\n' +
      '    const ch = text[i];\n' +
      '    let j = i;\n' +
      '    while (j < text.length && text[j] === ch) j++;\n' +
      '    const run = j - i;\n' +
      '    out += run === 1 ? ch : ch + run;\n' +
      '    i = j;\n' +
      '  }\n' +
      '  return out;\n' +
      '}',
    hints: [
      'Walk the string with two indices: one marking where the current run starts, one advancing while the character repeats.',
      'Decide what to append only once the run has ended, when you know its length.'
    ],
    explanation:
      'Two indices do all the work: i marks the start of a run and j advances while the character matches, so j - i is the run length. Appending happens once per run, not once per character, which is what keeps runs of length 1 unnumbered and lets counts grow past a single digit.',
    xpReward: 150,
    tags: ['strings', 'loops', 'two-pointers', 'stage-test']
  },

  /* ------------------------------------------------------------ stage 2 */
  {
    id: 'stage-2-test',
    stageId: 'stage-2',
    isStageTest: true,
    title: 'Merge overlapping intervals',
    type: 'code_runner',
    difficulty: 'medium',
    language: 'python',
    prompt:
      'Given a list of closed intervals [start, end], merge every pair that overlaps or touches and return the merged intervals sorted by start.',
    examples: [
      {
        input: '[[1, 3], [2, 6], [8, 10], [15, 18]]',
        output: '[[1, 6], [8, 10], [15, 18]]',
        explanation: '[1,3] and [2,6] overlap, so they become [1,6].'
      },
      { input: '[[1, 4], [4, 5]]', output: '[[1, 5]]', explanation: 'Touching at 4 counts as overlapping.' },
      { input: '[]', output: '[]' }
    ],
    constraints: [
      'Each interval has start <= end.',
      'The input is NOT guaranteed to be sorted.',
      '0 <= number of intervals <= 10 000.'
    ],
    starterCode:
      'def merge_intervals(intervals):\n' + '    # your code here\n' + '    return []\n',
    entryFunction: 'merge_intervals',
    testCases: [
      { input: '[[1, 3], [2, 6], [8, 10], [15, 18]]', expected: '[[1, 6], [8, 10], [15, 18]]' },
      { input: '[[1, 4], [4, 5]]', expected: '[[1, 5]]' },
      { input: '[]', expected: '[]' },
      { input: '[[5, 7], [1, 3]]', expected: '[[1, 3], [5, 7]]' },
      { input: '[[1, 10], [2, 3], [4, 5]]', expected: '[[1, 10]]', hidden: true },
      { input: '[[3, 4], [1, 2], [2, 3]]', expected: '[[1, 4]]', hidden: true },
      { input: '[[1, 1]]', expected: '[[1, 1]]', hidden: true }
    ],
    solutionCode:
      'def merge_intervals(intervals):\n' +
      '    merged = []\n' +
      '    for start, end in sorted(intervals):\n' +
      '        if merged and start <= merged[-1][1]:\n' +
      '            merged[-1][1] = max(merged[-1][1], end)\n' +
      '        else:\n' +
      '            merged.append([start, end])\n' +
      '    return merged\n',
    hints: [
      'Sorting by start first turns the problem into a single left-to-right pass.',
      'When the current start is within the last merged interval, extend that interval rather than adding a new one.'
    ],
    explanation:
      'Sorted by start, an interval can only overlap the most recently merged one, so a single pass suffices: either extend the last interval\'s end (taking the max, since the new interval may end earlier) or start a new one. sorted() on lists of lists compares element-wise, which is exactly the order needed.',
    xpReward: 150,
    tags: ['python', 'sorting', 'intervals', 'stage-test']
  },

  /* ------------------------------------------------------------ stage 3 */
  {
    id: 'stage-3-test',
    stageId: 'stage-3',
    isStageTest: true,
    title: 'Simulate an LRU cache',
    type: 'code_runner',
    difficulty: 'hard',
    language: 'javascript',
    prompt:
      'Simulate a least-recently-used cache of the given capacity. Apply the operations in order: ["put", key, value] stores a value and ["get", key] reads one. Return an array holding the result of every get, in order, using -1 for a missing key. Both a get and a put count as using the key; when the cache is full, a put evicts the least recently used key.',
    examples: [
      {
        input: '2, [["put", 1, 1], ["put", 2, 2], ["get", 1], ["put", 3, 3], ["get", 2], ["get", 3]]',
        output: '[1, -1, 3]',
        explanation: 'get 1 makes key 1 recent, so putting 3 evicts key 2. The later get 2 therefore misses.'
      },
      {
        input: '1, [["put", 5, 50], ["get", 5], ["put", 6, 60], ["get", 5]]',
        output: '[50, -1]'
      }
    ],
    constraints: [
      '1 <= capacity <= 1000.',
      'Keys and values are integers.',
      'Putting an existing key updates its value and makes it most recently used.',
      '1 <= operations <= 10 000, so an O(n) scan per operation is too slow in spirit; aim for O(1) per operation.'
    ],
    starterCode:
      'function simulateLRU(capacity, operations) {\n' +
      '  const results = [];\n' +
      '  // your code here\n' +
      '  return results;\n' +
      '}',
    entryFunction: 'simulateLRU',
    testCases: [
      {
        input: '2, [["put", 1, 1], ["put", 2, 2], ["get", 1], ["put", 3, 3], ["get", 2], ["get", 3]]',
        expected: '[1, -1, 3]'
      },
      { input: '1, [["put", 5, 50], ["get", 5], ["put", 6, 60], ["get", 5]]', expected: '[50, -1]' },
      { input: '2, [["get", 1]]', expected: '[-1]' },
      { input: '2, [["put", 1, 1], ["put", 1, 10], ["get", 1]]', expected: '[10]' },
      {
        input: '2, [["put", 1, 1], ["put", 2, 2], ["put", 1, 100], ["put", 3, 3], ["get", 2], ["get", 1]]',
        expected: '[-1, 100]',
        hidden: true
      },
      {
        input: '3, [["put", 1, 1], ["put", 2, 2], ["put", 3, 3], ["get", 1], ["get", 2], ["put", 4, 4], ["get", 3], ["get", 4]]',
        expected: '[1, 2, -1, 4]',
        hidden: true
      }
    ],
    solutionCode:
      'function simulateLRU(capacity, operations) {\n' +
      '  const results = [];\n' +
      '  const cache = new Map(); // insertion order = recency order\n' +
      '  for (const [op, key, value] of operations) {\n' +
      '    if (op === "get") {\n' +
      '      if (!cache.has(key)) {\n' +
      '        results.push(-1);\n' +
      '        continue;\n' +
      '      }\n' +
      '      const v = cache.get(key);\n' +
      '      cache.delete(key);\n' +
      '      cache.set(key, v); // move to most recent\n' +
      '      results.push(v);\n' +
      '    } else {\n' +
      '      if (cache.has(key)) cache.delete(key);\n' +
      '      else if (cache.size >= capacity) {\n' +
      '        const oldest = cache.keys().next().value;\n' +
      '        cache.delete(oldest);\n' +
      '      }\n' +
      '      cache.set(key, value);\n' +
      '    }\n' +
      '  }\n' +
      '  return results;\n' +
      '}',
    hints: [
      'A Map remembers insertion order, and deleting then re-inserting a key moves it to the end.',
      'The least recently used key is therefore always the first one a Map iterator yields.'
    ],
    explanation:
      'A JavaScript Map iterates in insertion order, so it can stand in for the doubly linked list a textbook LRU uses: touching a key is delete-then-set (moving it to the back), and the victim is always the first key. Every operation is O(1). The trap is updating an existing key: it must not trigger an eviction.',
    xpReward: 150,
    tags: ['hash-map', 'lru', 'data-structures', 'stage-test']
  },

  /* ------------------------------------------------------------ stage 4 */
  {
    id: 'stage-4-test',
    stageId: 'stage-4',
    isStageTest: true,
    title: 'Longest substring without repeating characters',
    type: 'code_runner',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'Return the length of the longest substring of s that contains no repeated character.',
    examples: [
      { input: '"abcabcbb"', output: '3', explanation: 'The answer is "abc".' },
      { input: '"bbbbb"', output: '1' },
      { input: '"pwwkew"', output: '3', explanation: '"wke" - note "pwke" is a subsequence, not a substring.' }
    ],
    constraints: ['0 <= length <= 50 000, so the solution should be linear.', 'Any printable characters may appear.'],
    starterCode:
      'function lengthOfLongestSubstring(s) {\n' + '  // your code here\n' + '  return 0;\n' + '}',
    entryFunction: 'lengthOfLongestSubstring',
    testCases: [
      { input: '"abcabcbb"', expected: '3' },
      { input: '"bbbbb"', expected: '1' },
      { input: '"pwwkew"', expected: '3' },
      { input: '""', expected: '0' },
      { input: '"abba"', expected: '2', hidden: true },
      { input: '"dvdf"', expected: '3', hidden: true },
      { input: '"tmmzuxt"', expected: '5', hidden: true }
    ],
    solutionCode:
      'function lengthOfLongestSubstring(s) {\n' +
      '  const lastSeen = new Map();\n' +
      '  let best = 0;\n' +
      '  let left = 0;\n' +
      '  for (let right = 0; right < s.length; right++) {\n' +
      '    const ch = s[right];\n' +
      '    if (lastSeen.has(ch) && lastSeen.get(ch) >= left) {\n' +
      '      left = lastSeen.get(ch) + 1;\n' +
      '    }\n' +
      '    lastSeen.set(ch, right);\n' +
      '    best = Math.max(best, right - left + 1);\n' +
      '  }\n' +
      '  return best;\n' +
      '}',
    hints: [
      'Keep a window [left, right] that never contains a duplicate, and record where each character was last seen.',
      'When the character at right was last seen INSIDE the window, jump left to just past it - never move left backwards.'
    ],
    explanation:
      'A sliding window with a last-seen index per character runs in one pass. The subtle case is "abba": when the second a arrives, its last-seen index (0) is already behind left (2), so left must not jump back to 1 - hence the `>= left` check. "tmmzuxt" has the same trap with the final t.',
    xpReward: 150,
    tags: ['sliding-window', 'hash-map', 'strings', 'stage-test']
  },

  /* ------------------------------------------------------------ stage 5 */
  {
    id: 'stage-5-test',
    stageId: 'stage-5',
    isStageTest: true,
    title: 'Compute an event bubbling path',
    type: 'code_runner',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'A DOM-like tree is given as nested objects of the form { id, children }. Return the ids an event dispatched on the node with targetId would visit while bubbling: the target first, then each ancestor up to and including the root. Return an empty array if the id is not in the tree.',
    examples: [
      {
        input:
          '{ id: "app", children: [{ id: "toolbar", children: [{ id: "save", children: [] }] }, { id: "main", children: [] }] }, "save"',
        output: '["save", "toolbar", "app"]'
      },
      { input: '{ id: "root", children: [] }, "root"', output: '["root"]' },
      { input: '{ id: "root", children: [] }, "ghost"', output: '[]' }
    ],
    constraints: [
      'ids are unique within the tree.',
      'Depth is at most 200.',
      'children is always an array (possibly empty).'
    ],
    starterCode:
      'function bubblePath(tree, targetId) {\n' + '  // your code here\n' + '  return [];\n' + '}',
    entryFunction: 'bubblePath',
    testCases: [
      {
        input:
          '{ id: "app", children: [{ id: "toolbar", children: [{ id: "save", children: [] }] }, { id: "main", children: [] }] }, "save"',
        expected: '["save", "toolbar", "app"]'
      },
      { input: '{ id: "root", children: [] }, "root"', expected: '["root"]' },
      { input: '{ id: "root", children: [] }, "ghost"', expected: '[]' },
      {
        input: '{ id: "a", children: [{ id: "b", children: [] }, { id: "c", children: [{ id: "d", children: [] }] }] }, "d"',
        expected: '["d", "c", "a"]'
      },
      {
        input: '{ id: "a", children: [{ id: "b", children: [] }, { id: "c", children: [{ id: "d", children: [] }] }] }, "b"',
        expected: '["b", "a"]',
        hidden: true
      },
      {
        input: '{ id: "a", children: [{ id: "b", children: [{ id: "c", children: [{ id: "d", children: [{ id: "e", children: [] }] }] }] }] }, "e"',
        expected: '["e", "d", "c", "b", "a"]',
        hidden: true
      }
    ],
    solutionCode:
      'function bubblePath(tree, targetId) {\n' +
      '  const walk = (node, ancestors) => {\n' +
      '    if (node.id === targetId) return [node.id, ...ancestors];\n' +
      '    for (const child of node.children) {\n' +
      '      const found = walk(child, [node.id, ...ancestors]);\n' +
      '      if (found) return found;\n' +
      '    }\n' +
      '    return null;\n' +
      '  };\n' +
      '  return walk(tree, []) ?? [];\n' +
      '}',
    hints: [
      'A depth-first search that carries the list of ancestors down with it has the answer ready the moment it finds the target.',
      'Build the path with the nearest ancestor first, since bubbling goes from the target outwards.'
    ],
    explanation:
      'Bubbling visits the target and then each ancestor outward, which is the reverse of the path from the root. A DFS that passes its ancestor chain down (nearest first) can return [target, ...ancestors] directly on a hit, and null on a miss so siblings keep being searched. This is exactly the propagation path the browser computes before dispatching an event.',
    xpReward: 150,
    tags: ['dom', 'events', 'trees', 'recursion', 'stage-test']
  },

  /* ------------------------------------------------------------ stage 6 */
  {
    id: 'stage-6-test',
    stageId: 'stage-6',
    isStageTest: true,
    title: 'Match a route pattern',
    type: 'code_runner',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'Match a request path against a route pattern. Segments starting with ":" are parameters and match any single non-empty segment; every other segment must match exactly. Return an object of parameter names to values when the path matches, or null when it does not.',
    examples: [
      { input: '"/users/:id", "/users/42"', output: '{ "id": "42" }' },
      {
        input: '"/users/:id/posts/:postId", "/users/7/posts/hello-world"',
        output: '{ "id": "7", "postId": "hello-world" }'
      },
      { input: '"/users/:id", "/users"', output: 'null', explanation: 'A parameter must match a segment; there is none.' }
    ],
    constraints: [
      'Patterns and paths start with "/" and have no query string.',
      'A trailing "/" on the path is ignored ("/users/" matches "/users").',
      'Parameter values are returned as strings, never converted.',
      'A pattern with no parameters that matches returns {}.'
    ],
    starterCode:
      'function matchRoute(pattern, path) {\n' + '  // your code here\n' + '  return null;\n' + '}',
    entryFunction: 'matchRoute',
    testCases: [
      { input: '"/users/:id", "/users/42"', expected: '{"id": "42"}' },
      { input: '"/users/:id/posts/:postId", "/users/7/posts/hello-world"', expected: '{"id": "7", "postId": "hello-world"}' },
      { input: '"/users/:id", "/users"', expected: 'null' },
      { input: '"/health", "/health"', expected: '{}' },
      { input: '"/users/:id", "/users/42/"', expected: '{"id": "42"}', hidden: true },
      { input: '"/users/:id", "/users/42/extra"', expected: 'null', hidden: true },
      { input: '"/a/:x", "/b/1"', expected: 'null', hidden: true },
      { input: '"/items/:id", "/items/007"', expected: '{"id": "007"}', hidden: true }
    ],
    solutionCode:
      'function matchRoute(pattern, path) {\n' +
      '  const split = (p) => p.replace(/\\/+$/, "").split("/").filter(Boolean);\n' +
      '  const want = split(pattern);\n' +
      '  const got = split(path);\n' +
      '  if (want.length !== got.length) return null;\n' +
      '  const params = {};\n' +
      '  for (let i = 0; i < want.length; i++) {\n' +
      '    if (want[i].startsWith(":")) params[want[i].slice(1)] = got[i];\n' +
      '    else if (want[i] !== got[i]) return null;\n' +
      '  }\n' +
      '  return params;\n' +
      '}',
    hints: [
      'Split both strings on "/" and compare segment by segment; a length mismatch is an immediate null.',
      'Strip a trailing slash before splitting, and drop empty segments so a leading "/" does not count.'
    ],
    explanation:
      'Routing is segment matching: split both sides, reject on a length mismatch, then either capture (":name") or compare literally. Keeping values as strings matters - "007" must survive as "007", and deciding types is the handler\'s job, not the router\'s. This is the core of what Express does with `/users/:id`.',
    xpReward: 150,
    tags: ['http', 'routing', 'parsing', 'stage-test']
  },

  /* ------------------------------------------------------------ stage 7 */
  {
    id: 'stage-7-test',
    stageId: 'stage-7',
    isStageTest: true,
    title: 'Implement an INNER JOIN',
    type: 'code_runner',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'Implement SQL\'s INNER JOIN in memory. Given two arrays of row objects and a key name for each, return one merged object for every pair of rows whose keys are equal. Preserve the order of the left table, and within a left row the order of the right table. When both rows have a column of the same name, the right row\'s value wins.',
    examples: [
      {
        input:
          '[{ id: 1, name: "Ada" }, { id: 2, name: "Linus" }], [{ userId: 1, title: "Notes" }, { userId: 1, title: "Ideas" }, { userId: 3, title: "Lost" }], "id", "userId"',
        output:
          '[{ id: 1, name: "Ada", userId: 1, title: "Notes" }, { id: 1, name: "Ada", userId: 1, title: "Ideas" }]',
        explanation: 'Linus has no posts and post 3 has no user, so neither appears - that is what INNER means.'
      }
    ],
    constraints: [
      'Keys are compared with ===.',
      'Either table may be empty.',
      'Rows are plain objects; do not mutate the inputs.',
      'Aim for O(n + m) using a lookup structure, not O(n * m) nested loops.'
    ],
    starterCode:
      'function innerJoin(left, right, leftKey, rightKey) {\n' + '  // your code here\n' + '  return [];\n' + '}',
    entryFunction: 'innerJoin',
    testCases: [
      {
        input:
          '[{ id: 1, name: "Ada" }, { id: 2, name: "Linus" }], [{ userId: 1, title: "Notes" }, { userId: 1, title: "Ideas" }, { userId: 3, title: "Lost" }], "id", "userId"',
        expected:
          '[{"id": 1, "name": "Ada", "userId": 1, "title": "Notes"}, {"id": 1, "name": "Ada", "userId": 1, "title": "Ideas"}]'
      },
      { input: '[], [{ k: 1 }], "k", "k"', expected: '[]' },
      { input: '[{ k: 1 }], [], "k", "k"', expected: '[]' },
      {
        input: '[{ k: 1, v: "left" }], [{ k: 1, v: "right" }], "k", "k"',
        expected: '[{"k": 1, "v": "right"}]'
      },
      {
        input: '[{ a: 2 }, { a: 1 }], [{ b: 1, x: "one" }, { b: 2, x: "two" }], "a", "b"',
        expected: '[{"a": 2, "b": 2, "x": "two"}, {"a": 1, "b": 1, "x": "one"}]',
        hidden: true
      },
      {
        input: '[{ a: 1 }, { a: 1 }], [{ b: 1, n: 1 }, { b: 1, n: 2 }], "a", "b"',
        expected: '[{"a": 1, "b": 1, "n": 1}, {"a": 1, "b": 1, "n": 2}, {"a": 1, "b": 1, "n": 1}, {"a": 1, "b": 1, "n": 2}]',
        hidden: true
      }
    ],
    solutionCode:
      'function innerJoin(left, right, leftKey, rightKey) {\n' +
      '  const byKey = new Map();\n' +
      '  for (const row of right) {\n' +
      '    const k = row[rightKey];\n' +
      '    if (!byKey.has(k)) byKey.set(k, []);\n' +
      '    byKey.get(k).push(row);\n' +
      '  }\n' +
      '  const out = [];\n' +
      '  for (const l of left) {\n' +
      '    for (const r of byKey.get(l[leftKey]) ?? []) {\n' +
      '      out.push({ ...l, ...r });\n' +
      '    }\n' +
      '  }\n' +
      '  return out;\n' +
      '}',
    hints: [
      'Index the right table by its key first, so each left row can find its matches without rescanning.',
      'A key can appear more than once on the right, so the index maps a key to a LIST of rows.'
    ],
    explanation:
      'This is a hash join: build a Map from the right key to all rows carrying it, then stream the left table once and emit a merged object per match. Spreading left then right makes the right value win on a shared column, and the two loops preserve left-then-right order. Rows on either side with no partner simply never meet - the defining property of an inner join.',
    xpReward: 150,
    tags: ['sql', 'joins', 'hash-map', 'stage-test']
  },

  /* ------------------------------------------------------------ stage 8 */
  {
    id: 'stage-8-test',
    stageId: 'stage-8',
    isStageTest: true,
    title: 'Compare semantic versions',
    type: 'code_runner',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'Compare two semantic version strings of the form MAJOR.MINOR.PATCH. Return -1 if a is lower, 1 if a is higher and 0 if they are equal. Missing components count as 0, so "1.2" equals "1.2.0". Components are compared numerically, not as text.',
    examples: [
      { input: '"1.2.10", "1.2.9"', output: '1', explanation: '10 > 9 numerically; as text "10" < "9" would be wrong.' },
      { input: '"1.2", "1.2.0"', output: '0' },
      { input: '"0.9.9", "1.0.0"', output: '-1' }
    ],
    constraints: [
      'Each component is a non-negative integer with no leading "+" or "-".',
      'Between one and three components are present.',
      'Leading zeros are allowed and mean the same number ("01" is 1).'
    ],
    starterCode:
      'function compareVersions(a, b) {\n' + '  // your code here\n' + '  return 0;\n' + '}',
    entryFunction: 'compareVersions',
    testCases: [
      { input: '"1.2.10", "1.2.9"', expected: '1' },
      { input: '"1.2", "1.2.0"', expected: '0' },
      { input: '"0.9.9", "1.0.0"', expected: '-1' },
      { input: '"2.0.0", "2.0.0"', expected: '0' },
      { input: '"1.10", "1.9.9"', expected: '1', hidden: true },
      { input: '"1.0.1", "1.0.01"', expected: '0', hidden: true },
      { input: '"3", "2.99.99"', expected: '1', hidden: true },
      { input: '"1.0.0", "1.0.0.0"', expected: '0', hidden: true }
    ],
    solutionCode:
      'function compareVersions(a, b) {\n' +
      '  const pa = a.split(".").map(Number);\n' +
      '  const pb = b.split(".").map(Number);\n' +
      '  const n = Math.max(pa.length, pb.length);\n' +
      '  for (let i = 0; i < n; i++) {\n' +
      '    const x = pa[i] ?? 0;\n' +
      '    const y = pb[i] ?? 0;\n' +
      '    if (x !== y) return x < y ? -1 : 1;\n' +
      '  }\n' +
      '  return 0;\n' +
      '}',
    hints: [
      'Split on "." and convert every part to a number before comparing - string comparison puts "10" before "9".',
      'Walk up to the LONGER length, treating a missing part as 0.'
    ],
    explanation:
      'Semver is compared component by component, numerically, from the left, and the first difference decides. Two things go wrong in naive versions: comparing as strings (so "1.2.10" < "1.2.9") and stopping at the shorter length (so "1.2" and "1.2.0" look different). Number() handles leading zeros; ?? 0 handles missing parts.',
    xpReward: 150,
    tags: ['semver', 'parsing', 'tooling', 'stage-test']
  },

  /* ------------------------------------------------------------ stage 9 */
  {
    id: 'stage-9-test',
    stageId: 'stage-9',
    isStageTest: true,
    title: 'Sliding-window rate limiter',
    type: 'code_runner',
    difficulty: 'hard',
    language: 'javascript',
    prompt:
      'Decide which requests a sliding-window rate limiter allows. Given request timestamps in milliseconds (non-decreasing), a limit, and a window length, return a boolean per request: true if fewer than `limit` requests were ALLOWED in the half-open window (t - windowMs, t], false otherwise. Rejected requests do not count towards the window.',
    examples: [
      {
        input: '[0, 100, 200, 300, 1100], 3, 1000',
        output: '[true, true, true, false, true]',
        explanation:
          'Three allowed by t=200. At t=300 the window (-700, 300] already holds three, so it is rejected. At t=1100 the window (100, 1100] holds only 200 (0 and 100 have aged out; 300 was rejected), so it is allowed.'
      },
      { input: '[0, 0, 0], 2, 1000', output: '[true, true, false]' }
    ],
    constraints: [
      '1 <= limit <= 10 000; 1 <= windowMs <= 86 400 000.',
      'Timestamps are non-decreasing; several may be equal.',
      'The window is half-open: a request exactly windowMs old has aged out.',
      'Only ALLOWED requests occupy the window.'
    ],
    starterCode:
      'function allowedRequests(timestamps, limit, windowMs) {\n' + '  // your code here\n' + '  return [];\n' + '}',
    entryFunction: 'allowedRequests',
    testCases: [
      { input: '[0, 100, 200, 300, 1100], 3, 1000', expected: '[true, true, true, false, true]' },
      { input: '[0, 0, 0], 2, 1000', expected: '[true, true, false]' },
      { input: '[], 5, 1000', expected: '[]' },
      { input: '[0, 1000], 1, 1000', expected: '[true, true]' },
      { input: '[0, 999], 1, 1000', expected: '[true, false]', hidden: true },
      // 999 is rejected (0 and 500 still inside (−1, 999]); at 1000 the request
      // from t=0 is exactly windowMs old and has aged out, so it is allowed.
      { input: '[0, 500, 999, 1000, 1500], 2, 1000', expected: '[true, true, false, true, true]', hidden: true },
      { input: '[10, 20, 30, 40, 50], 10, 5', expected: '[true, true, true, true, true]', hidden: true }
    ],
    solutionCode:
      'function allowedRequests(timestamps, limit, windowMs) {\n' +
      '  const allowed = []; // timestamps of accepted requests, oldest first\n' +
      '  let head = 0;       // index of the oldest still inside the window\n' +
      '  const out = [];\n' +
      '  for (const t of timestamps) {\n' +
      '    while (head < allowed.length && allowed[head] <= t - windowMs) head++;\n' +
      '    if (allowed.length - head < limit) {\n' +
      '      allowed.push(t);\n' +
      '      out.push(true);\n' +
      '    } else {\n' +
      '      out.push(false);\n' +
      '    }\n' +
      '  }\n' +
      '  return out;\n' +
      '}',
    hints: [
      'Keep the timestamps of ACCEPTED requests in order; before deciding, drop the ones that have aged out of (t - windowMs, t].',
      'Because timestamps never decrease, a single forward-moving index over that list is enough - nothing ever re-enters the window.'
    ],
    explanation:
      'A sliding-window log keeps only accepted timestamps. For each request, expire everything at or before t - windowMs (half-open, so exactly windowMs old is gone), then allow if the remaining count is under the limit. Since time only moves forward, a head index that advances monotonically gives amortised O(1) per request. The two classic mistakes are counting rejected requests, and using < instead of <= at the boundary.',
    xpReward: 150,
    tags: ['rate-limiting', 'sliding-window', 'system-design', 'stage-test']
  },

  /* ----------------------------------------------------------- stage 10 */
  {
    id: 'stage-10-test',
    stageId: 'stage-10',
    isStageTest: true,
    title: 'Rank endpoints by p95 latency',
    type: 'code_runner',
    difficulty: 'hard',
    language: 'javascript',
    prompt:
      'From request logs of the form { endpoint, ms }, compute each endpoint\'s p95 latency using nearest-rank (sort ascending, take the sample at position ceil(0.95 * n), 1-based) and return the k slowest endpoints as [endpoint, p95] pairs, highest p95 first. Break ties by endpoint name ascending. If k exceeds the number of endpoints, return them all.',
    examples: [
      {
        input:
          '[{ endpoint: "/a", ms: 100 }, { endpoint: "/a", ms: 300 }, { endpoint: "/b", ms: 50 }, { endpoint: "/b", ms: 60 }], 1',
        output: '[["/a", 300]]',
        explanation: '/a has samples [100, 300]; ceil(0.95 * 2) = 2, so its p95 is 300. /b\'s is 60.'
      },
      { input: '[{ endpoint: "/x", ms: 10 }], 5', output: '[["/x", 10]]' }
    ],
    constraints: [
      '1 <= logs <= 100 000; 1 <= k <= 1000.',
      'Latencies are positive integers.',
      'Every endpoint has at least one sample.'
    ],
    starterCode:
      'function slowestEndpoints(logs, k) {\n' + '  // your code here\n' + '  return [];\n' + '}',
    entryFunction: 'slowestEndpoints',
    testCases: [
      {
        input:
          '[{ endpoint: "/a", ms: 100 }, { endpoint: "/a", ms: 300 }, { endpoint: "/b", ms: 50 }, { endpoint: "/b", ms: 60 }], 1',
        expected: '[["/a", 300]]'
      },
      { input: '[{ endpoint: "/x", ms: 10 }], 5', expected: '[["/x", 10]]' },
      {
        input: '[{ endpoint: "/a", ms: 5 }, { endpoint: "/b", ms: 5 }, { endpoint: "/c", ms: 5 }], 2',
        expected: '[["/a", 5], ["/b", 5]]'
      },
      {
        input:
          '[{ endpoint: "/p", ms: 1 }, { endpoint: "/p", ms: 2 }, { endpoint: "/p", ms: 3 }, { endpoint: "/p", ms: 4 }, { endpoint: "/p", ms: 5 }, { endpoint: "/p", ms: 6 }, { endpoint: "/p", ms: 7 }, { endpoint: "/p", ms: 8 }, { endpoint: "/p", ms: 9 }, { endpoint: "/p", ms: 10 }, { endpoint: "/p", ms: 11 }, { endpoint: "/p", ms: 12 }, { endpoint: "/p", ms: 13 }, { endpoint: "/p", ms: 14 }, { endpoint: "/p", ms: 15 }, { endpoint: "/p", ms: 16 }, { endpoint: "/p", ms: 17 }, { endpoint: "/p", ms: 18 }, { endpoint: "/p", ms: 19 }, { endpoint: "/p", ms: 1000 }], 1',
        expected: '[["/p", 19]]',
        hidden: true
      },
      {
        input: '[{ endpoint: "/z", ms: 400 }, { endpoint: "/y", ms: 30 }, { endpoint: "/y", ms: 900 }, { endpoint: "/x", ms: 400 }], 3',
        expected: '[["/y", 900], ["/x", 400], ["/z", 400]]',
        hidden: true
      }
    ],
    solutionCode:
      'function slowestEndpoints(logs, k) {\n' +
      '  const samples = new Map();\n' +
      '  for (const { endpoint, ms } of logs) {\n' +
      '    if (!samples.has(endpoint)) samples.set(endpoint, []);\n' +
      '    samples.get(endpoint).push(ms);\n' +
      '  }\n' +
      '  const ranked = [];\n' +
      '  for (const [endpoint, list] of samples) {\n' +
      '    list.sort((a, b) => a - b);\n' +
      '    const rank = Math.ceil(0.95 * list.length);\n' +
      '    ranked.push([endpoint, list[rank - 1]]);\n' +
      '  }\n' +
      '  ranked.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));\n' +
      '  return ranked.slice(0, k);\n' +
      '}',
    hints: [
      'Group the samples per endpoint first; every percentile needs that endpoint\'s samples sorted.',
      'Sort the final list with a comparator that falls through to the name only when the p95 values tie.'
    ],
    explanation:
      'Group, then per endpoint sort ascending and take the nearest-rank sample at ceil(0.95n) - with 20 samples that is position 19, which is why the single 1000ms outlier does not become the p95. The final ordering is a two-key sort: descending by p95, then ascending by name for ties, exactly the kind of "top-N slowest" view an on-call dashboard shows. Sorting with a - b matters; the default sort would order 1000 before 19.',
    xpReward: 150,
    tags: ['percentiles', 'observability', 'sorting', 'stage-test']
  }
];
