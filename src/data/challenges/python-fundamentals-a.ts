import { Challenge } from '../../types';

/**
 * Stage 02 - Python Fundamentals, batch A.
 * Lists and slicing, negative indices, dicts, tuples, sets,
 * string methods, f-strings and comprehensions.
 */
export const challenges: Challenge[] = [
  {
    id: 'stage-2-a01',
    stageId: 'stage-2',
    title: 'Where a slice starts and stops',
    type: 'output_prediction',
    difficulty: 'easy',
    language: 'python',
    prompt: 'What does this program print?',
    codeSnippet:
      'nums = [0, 1, 2, 3, 4, 5, 6, 7]\n' +
      '\n' +
      '# take a window out of the middle\n' +
      'window = nums[2:6]\n' +
      'print(window, len(window))',
    options: [
      '[2, 3, 4, 5] 4',
      '[2, 3, 4, 5, 6] 5',
      '[3, 4, 5, 6] 4',
      '[2, 3, 4] 3'
    ],
    correctIndex: 0,
    hints: [
      'A slice runs from the start index up to but not including the stop index.',
      'The length of nums[a:b] is b - a when both are inside the list.'
    ],
    explanation:
      'Python slices are half-open: nums[2:6] begins at index 2 and stops just before index 6, so it collects indices 2, 3, 4 and 5. That makes the length exactly 6 - 2 = 4.',
    xpReward: 40,
    tags: ['lists', 'slicing', 'indexing']
  },
  {
    id: 'stage-2-a02',
    stageId: 'stage-2',
    title: 'Counting backwards with negative indices',
    type: 'output_prediction',
    difficulty: 'easy',
    language: 'python',
    prompt: 'What does this program print?',
    codeSnippet:
      'items = ["red", "green", "blue", "yellow"]\n' +
      '\n' +
      'last = items[-1]\n' +
      'middle = items[1:-1]\n' +
      'print(last, middle)',
    options: [
      "yellow ['green', 'blue']",
      "yellow ['green', 'blue', 'yellow']",
      "blue ['green', 'blue']",
      "yellow ['red', 'green']"
    ],
    correctIndex: 0,
    hints: [
      'Index -1 is the last element, -2 the one before it.',
      'A negative stop index is still exclusive, just counted from the end.'
    ],
    explanation:
      'items[-1] is the final element, "yellow". In items[1:-1] the stop index -1 points at "yellow" and, like every stop index, is excluded, so the slice keeps indices 1 and 2 only.',
    xpReward: 40,
    tags: ['lists', 'negative-index', 'slicing']
  },
  {
    id: 'stage-2-a03',
    stageId: 'stage-2',
    title: 'Tuples versus lists',
    type: 'quiz',
    difficulty: 'easy',
    language: 'python',
    prompt: 'Which statement about this code is true?',
    codeSnippet:
      'point = (3, 4)\n' +
      'coords = [3, 4]\n' +
      '\n' +
      'coords[0] = 9\n' +
      'locations = {point: "origin area"}',
    options: [
      'Both coords[0] = 9 and the dict literal succeed: lists support item assignment and a tuple of numbers is hashable.',
      'The dict literal fails because a tuple cannot be a dictionary key.',
      'coords[0] = 9 fails because Python sequences are immutable.',
      'Both coords[0] = 9 and the dict literal fail: only strings and numbers can be dictionary keys.'
    ],
    correctIndex: 0,
    hints: [
      'Ask which of the two containers can be changed after it is built.',
      'A dictionary key has to hash to the same value forever.'
    ],
    explanation:
      'Lists are mutable, so coords[0] = 9 rebinds a slot in place. A tuple cannot be modified after it is built, so a tuple whose elements are themselves hashable, like (3, 4), is hashable and can be a dictionary key; a tuple holding a list is not. Swapping the two containers would raise TypeError twice: tuples reject item assignment, and a list cannot be hashed into a key.',
    xpReward: 40,
    tags: ['tuples', 'lists', 'mutability', 'hashing']
  },
  {
    id: 'stage-2-a04',
    stageId: 'stage-2',
    title: 'Look a key up without a KeyError',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'python',
    prompt:
      'Fill in the blanks so the program prints "4 0" instead of raising KeyError on a missing item.',
    codeSnippet:
      'inventory = {"apple": 4, "pear": 2}\n' +
      '\n' +
      'def stock_count(item):\n' +
      '    # missing items should count as zero\n' +
      '    return inventory.___(item, ___)\n' +
      '\n' +
      'print(stock_count("apple"), stock_count("kiwi"))',
    blanks: [
      { answer: 'get', choices: ['get', 'find', 'fetch', 'lookup'] },
      { answer: '0', choices: ['0', 'None', 'False', 'KeyError'] }
    ],
    hints: [
      'Square-bracket lookup raises when the key is absent; a dict method does not.',
      'The caller wants a number back so it can keep adding, not a placeholder object.'
    ],
    explanation:
      'dict.get(key, default) returns default when the key is absent, while inventory[key] raises KeyError. Returning 0 rather than None keeps the result a number the caller can go on doing arithmetic with.',
    xpReward: 40,
    tags: ['dicts', 'get', 'defaults']
  },
  {
    id: 'stage-2-a05',
    stageId: 'stage-2',
    title: 'What sets actually guarantee',
    type: 'multi_select',
    difficulty: 'medium',
    language: 'python',
    prompt: 'Which statements about Python sets are true? Select every one that applies.',
    codeSnippet:
      'a = {1, 2, 3}\n' +
      'b = {3, 4}\n' +
      'empty = {}\n' +
      '\n' +
      'print(a | b, a & b)\n' +
      'print(len({1, 1, 2}))',
    options: [
      'a | b evaluates to {1, 2, 3, 4}',
      'a & b evaluates to {3}',
      'len({1, 1, 2}) is 3',
      'A set preserves the order in which elements were added',
      'A list cannot be stored in a set because lists are unhashable',
      'empty = {} creates an empty set'
    ],
    correctIndices: [0, 1, 4],
    hints: [
      'A set literal collapses duplicates the moment it is built.',
      'Look carefully at what {} on its own actually constructs.'
    ],
    explanation:
      'The | operator is union and & is intersection. Duplicates collapse, so {1, 1, 2} has length 2; sets are unordered, so you cannot rely on insertion order; {} builds an empty dict and set() builds an empty set; and only hashable values such as numbers, strings and tuples may be stored.',
    xpReward: 70,
    tags: ['sets', 'hashing', 'operators']
  },
  {
    id: 'stage-2-a06',
    stageId: 'stage-2',
    title: 'Format a number inside an f-string',
    type: 'fill_blank',
    difficulty: 'medium',
    language: 'python',
    prompt: 'Fill in the blanks so the program prints exactly "Ada: 92.46".',
    codeSnippet:
      'name = "Ada"\n' +
      'score = 92.4567\n' +
      '\n' +
      'label = ___"{name}: {score___}"\n' +
      'print(label)',
    blanks: [
      { answer: 'f', choices: ['f', 'r', 'b', 'u'] },
      { answer: ':.2f', choices: [':.2f', '.2f', '%.2f', ':2f'] }
    ],
    hints: [
      'Without the right one-letter prefix the braces stay in the output as literal text.',
      'Inside a placeholder, everything after the colon is the format spec.'
    ],
    explanation:
      'The f prefix makes the literal an f-string, so each {...} is evaluated instead of printed verbatim. Inside a placeholder a colon starts the format spec, and .2f means fixed-point with two decimals, which rounds 92.4567 to 92.46.',
    xpReward: 70,
    tags: ['f-strings', 'formatting', 'strings']
  },
  {
    id: 'stage-2-a07',
    stageId: 'stage-2',
    title: 'Order the word-frequency routine',
    type: 'pseudocode_order',
    difficulty: 'medium',
    language: 'pseudocode',
    prompt:
      'Put these pseudocode lines in the order that counts each word and returns the most common one.',
    pseudocodeLines: [
      'SET counts TO an empty dictionary',
      'FOR EACH word IN words',
      '    IF word IS NOT A KEY OF counts THEN SET counts[word] TO 0',
      '    INCREASE counts[word] BY 1',
      'END FOR',
      'SET best TO the key of counts with the largest value',
      'RETURN best'
    ],
    hints: [
      'A counter has to exist before you can add one to it.',
      'You can only pick a winner once every word has been seen.'
    ],
    explanation:
      'Create the dictionary once, then for each word make sure a counter exists before incrementing it, otherwise the increment reads a missing key. Only after the loop has ended does the dictionary hold the final totals, so the winner is chosen last.',
    xpReward: 70,
    tags: ['pseudocode', 'dicts', 'counting']
  },
  {
    id: 'stage-2-a08',
    stageId: 'stage-2',
    title: 'Clean up a comma-separated tag line',
    type: 'code_runner',
    difficulty: 'medium',
    language: 'python',
    prompt:
      'Split raw on commas and return a list of the tags, each stripped of surrounding whitespace and lowercased. Drop any tag that is empty after stripping.',
    starterCode:
      'def normalize_tags(raw):\n' +
      '    # your code here\n' +
      '    return []',
    entryFunction: 'normalize_tags',
    testCases: [
      { input: '"Python, Web , data"', expected: '["python", "web", "data"]' },
      { input: '"  A,,B  "', expected: '["a", "b"]' },
      { input: '""', expected: '[]' },
      { input: '"SQL"', expected: '["sql"]' }
    ],
    solutionCode:
      'def normalize_tags(raw):\n' +
      '    tags = []\n' +
      '    for part in raw.split(","):\n' +
      '        cleaned = part.strip().lower()\n' +
      '        if cleaned:\n' +
      '            tags.append(cleaned)\n' +
      '    return tags',
    hints: [
      'str.split(",") keeps every field, including the empty ones between two commas.',
      'str.strip() removes whitespace from both ends and returns a new string.'
    ],
    explanation:
      'split(",") never discards anything, so "A,,B" yields three fields and "" yields one empty field. Stripping and lowercasing each field and then testing its truthiness removes the blanks, because an empty string is falsy in Python.',
    xpReward: 70,
    tags: ['strings', 'split', 'strip', 'lists']
  },
  {
    id: 'stage-2-a09',
    stageId: 'stage-2',
    title: 'Filter tuples with a comprehension',
    type: 'code_runner',
    difficulty: 'hard',
    language: 'python',
    prompt:
      'rows is a list of (name, score) tuples. Return the uppercased names of every row whose score is greater than or equal to cutoff, keeping the original order.',
    starterCode:
      'def top_names(rows, cutoff):\n' +
      '    # your code here\n' +
      '    return []',
    entryFunction: 'top_names',
    testCases: [
      { input: '[("ada", 91), ("bob", 70), ("cy", 88)], 85', expected: '["ADA", "CY"]' },
      { input: '[("ada", 91)], 95', expected: '[]' },
      { input: '[], 50', expected: '[]' },
      { input: '[("zoe", 50), ("max", 50)], 50', expected: '["ZOE", "MAX"]' }
    ],
    solutionCode:
      'def top_names(rows, cutoff):\n' +
      '    return [name.upper() for name, score in rows if score >= cutoff]',
    hints: [
      'A for clause can unpack a tuple directly: for name, score in rows.',
      'The cutoff itself counts as passing, so pick the comparison operator with care.'
    ],
    explanation:
      'A list comprehension reads as expression, then for, then if: the for clause unpacks each tuple into name and score, the if clause keeps only the qualifying rows, and the expression transforms what survives. Comprehensions preserve the order of the source list.',
    xpReward: 110,
    tags: ['comprehensions', 'tuples', 'unpacking', 'filtering']
  },
  {
    id: 'stage-2-a10',
    stageId: 'stage-2',
    title: 'The tail slice that returns everything',
    type: 'debug',
    difficulty: 'hard',
    language: 'python',
    prompt:
      'last_n should return the final n items of items, in order. It is right for every positive n but returns the whole list when n is 0. Fix it.',
    starterCode:
      'def last_n(items, n):\n' +
      '    return items[-n:]',
    entryFunction: 'last_n',
    testCases: [
      { input: '[1, 2, 3, 4, 5], 2', expected: '[4, 5]' },
      { input: '[1, 2, 3], 0', expected: '[]' },
      { input: '[1, 2, 3], 5', expected: '[1, 2, 3]' },
      { input: '[], 3', expected: '[]' },
      { input: '["a", "b", "c"], 1', expected: '["c"]' }
    ],
    solutionCode:
      'def last_n(items, n):\n' +
      '    if n <= 0:\n' +
      '        return []\n' +
      '    return items[-n:]',
    hints: [
      'Work out by hand what -n becomes when n is 0, then what that slice means.',
      'A guard clause before the slice is cheaper than trying to make the slice clever.'
    ],
    explanation:
      'When n is 0, -n is also 0, so items[-0:] is items[0:], which is the entire list. Negative zero does not exist for indices, so the tail slice cannot express "take nothing"; guarding with if n <= 0 handles it explicitly. Asking for more items than exist is safe, because slice bounds are clamped to the list.',
    xpReward: 110,
    tags: ['slicing', 'negative-index', 'edge-cases', 'debugging']
  }
];
