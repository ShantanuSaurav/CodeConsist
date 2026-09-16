import { Challenge } from '../../types';

/**
 * Stage 07 - Databases & SQL, batch A.
 * SELECT/WHERE/ORDER BY, joins, grouping, aggregates, NULL logic,
 * DISTINCT and subqueries. Executable challenges model SQL operators
 * as plain JavaScript, since the browser can only run JS and Python.
 */
export const challenges: Challenge[] = [
  {
    id: 'stage-7-a01',
    stageId: 'stage-7',
    title: 'Filter then sort',
    type: 'quiz',
    difficulty: 'easy',
    language: 'sql',
    prompt: 'Which rows does this query return, and in which order?',
    codeSnippet:
      '-- products\n' +
      '-- id | name    | price | stock\n' +
      '--  1 | Mouse   |    25 |     0\n' +
      '--  2 | Cable   |    10 |     8\n' +
      '--  3 | Monitor |   220 |     4\n' +
      '--  4 | Dock    |   150 |     0\n' +
      '\n' +
      'SELECT name FROM products\n' +
      'WHERE stock > 0\n' +
      'ORDER BY price DESC;',
    options: [
      'Monitor, Cable',
      'Cable, Monitor',
      'Monitor, Dock, Mouse, Cable',
      'Dock, Mouse'
    ],
    correctIndex: 0,
    hints: [
      'WHERE runs before ORDER BY, so only the surviving rows get sorted.',
      'DESC means largest first.'
    ],
    explanation:
      'WHERE stock > 0 keeps only Cable and Monitor; Mouse and Dock have zero stock. ORDER BY price DESC then puts the 220 before the 10, so the result is Monitor followed by Cable.',
    xpReward: 40,
    tags: ['select', 'where', 'order-by']
  },
  {
    id: 'stage-7-a02',
    stageId: 'stage-7',
    title: 'Comparing against NULL',
    type: 'output_prediction',
    difficulty: 'easy',
    language: 'sql',
    prompt: 'What single value does this query return?',
    codeSnippet:
      '-- employees\n' +
      '-- id | name | manager_id\n' +
      '--  1 | Ada  | NULL\n' +
      '--  2 | Brij | 1\n' +
      '--  3 | Cleo | NULL\n' +
      '--  4 | Dev  | 2\n' +
      '\n' +
      'SELECT COUNT(*) FROM employees\n' +
      'WHERE manager_id = NULL;',
    options: ['0', '2', '4', 'NULL'],
    correctIndex: 0,
    hints: [
      'NULL means "unknown", and unknown = unknown is not true.',
      'There is a dedicated operator for testing for NULL.'
    ],
    explanation:
      'SQL uses three-valued logic: any comparison with NULL evaluates to UNKNOWN, and WHERE keeps only rows where the condition is TRUE. So every row is discarded and COUNT(*) over an empty set is 0. Use IS NULL to match the two rows you actually wanted.',
    xpReward: 40,
    tags: ['null', 'three-valued-logic', 'where']
  },
  {
    id: 'stage-7-a03',
    stageId: 'stage-7',
    title: 'Join fan-out',
    type: 'output_prediction',
    difficulty: 'medium',
    language: 'sql',
    prompt: 'What number does this query return?',
    codeSnippet:
      '-- posts        -- comments        -- likes\n' +
      '-- id | title   -- id | post_id    -- id | post_id\n' +
      '--  1 | Hello   --  1 |       1    --  1 |       1\n' +
      '--  2 | World   --  2 |       1    --  2 |       1\n' +
      '--              --  3 |       2    --  3 |       1\n' +
      '--              --  4 |       2    --  4 |       2\n' +
      '--                                 --  5 |       2\n' +
      '\n' +
      'SELECT COUNT(*)\n' +
      'FROM posts p\n' +
      'JOIN comments c ON c.post_id = p.id\n' +
      'JOIN likes    l ON l.post_id = p.id;',
    options: ['10', '9', '5', '4'],
    correctIndex: 0,
    hints: [
      'Work post 1 out on its own, then post 2, then add the two totals.',
      'Read the two ON clauses and ask whether either of them ever mentions both comments and likes.'
    ],
    explanation:
      'A join emits one row per matching pair, and comments and likes are each joined only to posts, never to each other, so inside a post every comment is paired with every like: post 1 gives 2 x 3 = 6 rows and post 2 gives 2 x 2 = 4, for 10. This fan-out is why SUM over two one-to-many joins silently multiplies its input, and why each child table is normally aggregated in its own subquery first.',
    xpReward: 70,
    tags: ['join', 'cardinality', 'fan-out']
  },
  {
    id: 'stage-7-a04',
    stageId: 'stage-7',
    title: 'Aggregates and NULL',
    type: 'multi_select',
    difficulty: 'medium',
    language: 'sql',
    prompt: 'Which statements about this query are true? Select every one that applies.',
    codeSnippet:
      '-- reviews\n' +
      '-- id | product_id | rating\n' +
      '--  1 |         10 |      5\n' +
      '--  2 |         10 |   NULL\n' +
      '--  3 |         11 |      3\n' +
      '--  4 |         11 |      4\n' +
      '\n' +
      'SELECT product_id,\n' +
      '       COUNT(*)      AS rows_seen,\n' +
      '       COUNT(rating) AS rated,\n' +
      '       AVG(rating)   AS avg_rating\n' +
      'FROM reviews\n' +
      'GROUP BY product_id;',
    options: [
      'For product 10, rows_seen is 2 but rated is 1',
      'For product 10, avg_rating is 5 because AVG ignores NULL ratings',
      'For product 10, avg_rating is 2.5 because the NULL counts as zero',
      'For product 11, rows_seen and rated are both 2',
      'COUNT(*) and COUNT(column) always return the same number',
      'The query returns one row per review'
    ],
    correctIndices: [0, 1, 3],
    hints: [
      'Read each statement against the four rows in the table rather than against the query text.',
      'Ask what AVG can possibly do with a rating nobody ever filled in.'
    ],
    explanation:
      'COUNT(*) counts rows while COUNT(rating) counts only non-NULL ratings, so product 10 gives 2 and 1. AVG divides the sum of non-NULL values by how many there were, so product 10 averages 5 / 1 = 5, not 2.5. GROUP BY collapses the four reviews into one row per product_id, so the result has two rows.',
    xpReward: 70,
    tags: ['aggregates', 'group-by', 'null', 'count']
  },
  {
    id: 'stage-7-a05',
    stageId: 'stage-7',
    title: 'Keys that link two tables',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'sql',
    prompt:
      'Fill in the blanks so that orders.customer_id can only ever hold a value that already exists in customers.id.',
    codeSnippet:
      'CREATE TABLE customers (\n' +
      '  id   INTEGER ___ KEY,\n' +
      '  name TEXT NOT NULL\n' +
      ');\n' +
      '\n' +
      'CREATE TABLE orders (\n' +
      '  id          INTEGER PRIMARY KEY,\n' +
      '  customer_id INTEGER NOT NULL ___ customers(id)\n' +
      ');',
    blanks: [
      { answer: 'PRIMARY', choices: ['PRIMARY', 'FOREIGN', 'SECONDARY'] },
      { answer: 'REFERENCES', choices: ['REFERENCES', 'MATCHES', 'JOINS'] }
    ],
    hints: [
      'One table has to promise its ids are unique and never missing before another table can safely point at them.',
      'The second blank declares a foreign key inline, so it is followed by the table and column being pointed at.'
    ],
    explanation:
      'PRIMARY KEY makes customers.id unique and NOT NULL, which is exactly what a second table needs in order to treat it as a stable address. The inline REFERENCES clause turns customer_id into a foreign key, so the database itself rejects an order for a customer that does not exist and refuses to delete a customer that still has orders - integrity enforced by the engine rather than by every application that touches the data.',
    xpReward: 40,
    tags: ['schema', 'primary-key', 'foreign-key', 'constraints']
  },
  {
    id: 'stage-7-a06',
    stageId: 'stage-7',
    title: 'DISTINCT names from a subquery',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'sql',
    prompt:
      'Fill in the blanks so the query lists each customer who has placed at least one order, with no repeated names.',
    codeSnippet:
      '-- every buyer, listed once\n' +
      'SELECT ___ c.name\n' +
      'FROM customers c\n' +
      'WHERE c.id ___ (SELECT o.customer_id FROM orders o);',
    blanks: [
      { answer: 'DISTINCT', choices: ['DISTINCT', 'ALL', 'ONLY'] },
      { answer: 'IN', choices: ['IN', '=', 'LIKE'] }
    ],
    hints: [
      'The first blank is optional syntax: leave it out and the query still runs, it just stops promising each name appears once.',
      'Ask what each of the three operators does when the subquery hands back fifty customer_ids instead of one.'
    ],
    explanation:
      'IN tests membership in the whole set of values the subquery returns, so it works however many customer_ids come back; = only accepts a subquery guaranteed to return exactly one row. IN is a semi-join and so never repeats a customer, which means DISTINCT is earning its place here only for the case where two different customers share a name.',
    xpReward: 40,
    tags: ['distinct', 'subquery', 'in']
  },
  {
    id: 'stage-7-a07',
    stageId: 'stage-7',
    title: 'Logical order of a SELECT',
    type: 'pseudocode_order',
    difficulty: 'medium',
    language: 'pseudocode',
    prompt:
      'Put these steps in the order the database logically evaluates a SELECT statement.',
    pseudocodeLines: [
      'READ the rows produced by FROM and its JOINs',
      'KEEP only the rows where WHERE is TRUE',
      'COLLECT the surviving rows into GROUP BY buckets',
      'COMPUTE each aggregate over its bucket',
      'DISCARD the buckets where HAVING is not TRUE',
      'EVALUATE the SELECT list, then apply DISTINCT',
      'SORT with ORDER BY, then cut with LIMIT'
    ],
    hints: [
      'The clause you write first is not the clause that runs first.',
      'HAVING needs the aggregates to already exist; ORDER BY can use SELECT aliases.'
    ],
    explanation:
      'A query is written SELECT-first but evaluated FROM-first: rows are produced, filtered by WHERE, grouped, aggregated, filtered again by HAVING, projected through SELECT and DISTINCT, and only then sorted and limited. That order explains why WHERE cannot use an aggregate and why ORDER BY can use a SELECT alias.',
    xpReward: 70,
    tags: ['query-execution', 'group-by', 'having', 'order-by']
  },
  {
    id: 'stage-7-a08',
    stageId: 'stage-7',
    title: 'Implement an in-memory INNER JOIN',
    type: 'code_runner',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'Model an INNER JOIN. For every order whose userId matches a user id, return { name, total }. Keep the order of the orders array, and drop orders with no matching user.',
    starterCode:
      'function innerJoin(users, orders) {\n' +
      '  // your code here\n' +
      '  return [];\n' +
      '}',
    entryFunction: 'innerJoin',
    testCases: [
      {
        // orders deliberately run against the users order, so walking the
        // users array instead of the orders array fails this case.
        input:
          '[{ id: 1, name: "Ada" }, { id: 2, name: "Brij" }], ' +
          '[{ userId: 3, total: 20 }, { userId: 2, total: 30 }, { userId: 1, total: 50 }]',
        expected: '[{"name": "Brij", "total": 30}, {"name": "Ada", "total": 50}]'
      },
      { input: '[{ id: 1, name: "Ada" }], []', expected: '[]' },
      { input: '[], [{ userId: 1, total: 5 }]', expected: '[]' },
      {
        input: '[{ id: 7, name: "Cleo" }], [{ userId: 7, total: 10 }, { userId: 7, total: 40 }]',
        expected: '[{"name": "Cleo", "total": 10}, {"name": "Cleo", "total": 40}]'
      }
    ],
    solutionCode:
      'function innerJoin(users, orders) {\n' +
      '  const byId = new Map();\n' +
      '  for (const u of users) byId.set(u.id, u);\n' +
      '  const out = [];\n' +
      '  for (const o of orders) {\n' +
      '    const user = byId.get(o.userId);\n' +
      '    if (user) out.push({ name: user.name, total: o.total });\n' +
      '  }\n' +
      '  return out;\n' +
      '}',
    hints: [
      'Index the users by id first so each order is a single lookup.',
      'An unmatched order contributes nothing to an inner join.'
    ],
    explanation:
      'This is exactly what a hash join does: build a hash table on the smaller side, then probe it once per row of the other side. Rows that find no partner are dropped, which is the defining behaviour of INNER JOIN, and it runs in O(users + orders) instead of the O(users * orders) of a nested scan.',
    xpReward: 70,
    tags: ['join', 'inner-join', 'hash-join']
  },
  {
    id: 'stage-7-a09',
    stageId: 'stage-7',
    title: 'The LEFT JOIN that lost its NULLs',
    type: 'debug',
    difficulty: 'hard',
    language: 'javascript',
    prompt:
      'leftJoin should emit one row per matching order, and one row with total null for a customer that has no orders. Right now unmatched customers vanish. Fix it.',
    starterCode:
      'function leftJoin(customers, orders) {\n' +
      '  const out = [];\n' +
      '  for (const c of customers) {\n' +
      '    const matches = orders.filter(o => o.customerId === c.id);\n' +
      '    for (const o of matches) {\n' +
      '      out.push({ name: c.name, total: o.total });\n' +
      '    }\n' +
      '  }\n' +
      '  return out;\n' +
      '}',
    entryFunction: 'leftJoin',
    testCases: [
      {
        input: '[{ id: 1, name: "Ada" }, { id: 2, name: "Brij" }], [{ customerId: 1, total: 50 }]',
        expected: '[{"name": "Ada", "total": 50}, {"name": "Brij", "total": null}]'
      },
      {
        input: '[{ id: 1, name: "Ada" }], [{ customerId: 1, total: 10 }, { customerId: 1, total: 20 }]',
        expected: '[{"name": "Ada", "total": 10}, {"name": "Ada", "total": 20}]'
      },
      { input: '[{ id: 3, name: "Cleo" }], []', expected: '[{"name": "Cleo", "total": null}]' },
      { input: '[], [{ customerId: 1, total: 5 }]', expected: '[]' }
    ],
    solutionCode:
      'function leftJoin(customers, orders) {\n' +
      '  const out = [];\n' +
      '  for (const c of customers) {\n' +
      '    const matches = orders.filter(o => o.customerId === c.id);\n' +
      '    if (matches.length === 0) {\n' +
      '      out.push({ name: c.name, total: null });\n' +
      '      continue;\n' +
      '    }\n' +
      '    for (const o of matches) {\n' +
      '      out.push({ name: c.name, total: o.total });\n' +
      '    }\n' +
      '  }\n' +
      '  return out;\n' +
      '}',
    hints: [
      'Ask what the inner loop does when matches is empty.',
      'An unmatched left row still has to be emitted, with the right-hand columns padded.'
    ],
    explanation:
      'When matches is empty the inner loop body never runs, so the customer is silently dropped and the function behaves like an INNER JOIN. A LEFT JOIN must still emit the left row and fill the right-hand columns with NULL, which is why an unmatched customer comes back with total null rather than not at all.',
    xpReward: 110,
    tags: ['left-join', 'null', 'debugging']
  },
  {
    id: 'stage-7-a10',
    stageId: 'stage-7',
    title: 'GROUP BY with HAVING on a sum',
    type: 'code_runner',
    difficulty: 'hard',
    language: 'javascript',
    prompt:
      'Group rows by dept. For each group return { dept, headcount, total } where headcount is the number of rows in the group and total is the sum of their salaries. Keep only the groups whose total is at least minTotal, sorted by total descending, with ties broken by dept ascending.',
    starterCode:
      'function groupHaving(rows, minTotal) {\n' +
      '  // your code here\n' +
      '  return [];\n' +
      '}',
    entryFunction: 'groupHaving',
    testCases: [
      {
        input:
          '[{ dept: "eng", salary: 100 }, { dept: "eng", salary: 40 }, ' +
          '{ dept: "ops", salary: 50 }], 100',
        expected: '[{"dept": "eng", "headcount": 2, "total": 140}]'
      },
      {
        input:
          '[{ dept: "ops", salary: 60 }, { dept: "eng", salary: 60 }, ' +
          '{ dept: "hr", salary: 90 }], 50',
        expected:
          '[{"dept": "hr", "headcount": 1, "total": 90}, ' +
          '{"dept": "eng", "headcount": 1, "total": 60}, ' +
          '{"dept": "ops", "headcount": 1, "total": 60}]'
      },
      {
        input: '[{ dept: "sales", salary: 10 }, { dept: "sales", salary: 15 }], 30',
        expected: '[]'
      },
      // "at least minTotal" is inclusive, so a group landing exactly on the
      // threshold survives while the one a single unit below it does not.
      {
        input: '[{ dept: "eng", salary: 30 }, { dept: "ops", salary: 29 }], 30',
        expected: '[{"dept": "eng", "headcount": 1, "total": 30}]'
      },
      { input: '[], 1', expected: '[]' }
    ],
    solutionCode:
      'function groupHaving(rows, minTotal) {\n' +
      '  const groups = new Map();\n' +
      '  for (const r of rows) {\n' +
      '    if (!groups.has(r.dept)) {\n' +
      '      groups.set(r.dept, { dept: r.dept, headcount: 0, total: 0 });\n' +
      '    }\n' +
      '    const g = groups.get(r.dept);\n' +
      '    g.headcount += 1;\n' +
      '    g.total += r.salary;\n' +
      '  }\n' +
      '  const kept = Array.from(groups.values())\n' +
      '    .filter(g => g.total >= minTotal);\n' +
      '  kept.sort((a, b) => b.total - a.total ||\n' +
      '    (a.dept < b.dept ? -1 : a.dept > b.dept ? 1 : 0));\n' +
      '  return kept;\n' +
      '}',
    hints: [
      'A Map keyed by dept is the grouping step; one pass over the rows fills both counters.',
      'The minTotal test needs a finished total, so it cannot happen while you are still adding rows up.'
    ],
    explanation:
      'The Map is the GROUP BY and the two counters are the aggregates; filtering after the loop is exactly what HAVING does, and it can test a total precisely because the total already exists - WHERE sees individual rows before any group is formed, so it could never ask this question. Sorting last mirrors ORDER BY, and the dept tie-break is what makes the output deterministic when two groups sum to the same number.',
    xpReward: 110,
    tags: ['group-by', 'having', 'aggregates', 'sorting']
  }
];
