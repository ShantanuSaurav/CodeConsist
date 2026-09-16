import { Challenge } from '../../types';

/**
 * Stage 07 - Databases & SQL, batch B.
 * Covers primary vs unique keys, when a b-tree index is skipped, normal forms,
 * foreign keys and constraints, transactions and savepoints, isolation levels,
 * online schema migrations and the N+1 query problem.
 */
export const challenges: Challenge[] = [
  {
    id: 'stage-7-b01',
    stageId: 'stage-7',
    title: 'Primary key versus unique constraint',
    type: 'quiz',
    difficulty: 'easy',
    language: 'sql',
    prompt: 'Which statement about this table is true?',
    codeSnippet:
      'CREATE TABLE users (\n' +
      '  id       INTEGER PRIMARY KEY,\n' +
      '  email    TEXT UNIQUE,\n' +
      '  username TEXT UNIQUE NOT NULL\n' +
      ');',
    options: [
      'A table has at most one primary key, but any number of unique constraints',
      'Declaring email UNIQUE also makes it NOT NULL',
      'A foreign key in another table may reference id but never username',
      'UNIQUE only rejects duplicates; it builds no index, so lookups by email stay slow'
    ],
    correctIndex: 0,
    hints: [
      'Count how many of each kind of constraint this one table already declares.',
      'Ask what each constraint promises: uniqueness, presence, or both.'
    ],
    explanation:
      'The primary key is the single chosen row identifier, so there is exactly one per table and it implies NOT NULL. UNIQUE can be declared as often as you like, does not imply NOT NULL on its own, is enforced with an index in every mainstream engine, and can be the target of a foreign key just like a primary key.',
    xpReward: 40,
    tags: ['keys', 'constraints', 'schema-design']
  },
  {
    id: 'stage-7-b02',
    stageId: 'stage-7',
    title: 'The index the planner refuses to use',
    type: 'quiz',
    difficulty: 'medium',
    language: 'sql',
    prompt:
      'The planner ignores idx_orders_created and scans the whole table. Which rewrite lets the query use the index?',
    codeSnippet:
      'CREATE INDEX idx_orders_created ON orders (created_at);\n' +
      '\n' +
      'SELECT id\n' +
      'FROM orders\n' +
      "WHERE date(created_at) = '2024-05-01';",
    options: [
      "WHERE created_at >= '2024-05-01' AND created_at < '2024-05-02'",
      "Cast the constant too: WHERE date(created_at) = date('2024-05-01')",
      'Recreate it as a UNIQUE index so the planner trusts it more',
      'Add LIMIT 100 so the planner can stop early instead of scanning'
    ],
    correctIndex: 0,
    hints: [
      'The index stores the values of created_at. What does the WHERE clause compare?',
      'A predicate is only seekable when the bare column sits on one side of it.'
    ],
    explanation:
      'A b-tree index stores created_at itself, not date(created_at), so wrapping the column in a function makes the stored keys unusable and forces a scan. A half-open range compares the bare column against two constants, which the index can seek and walk directly. Creating an expression index on date(created_at) would be the other fix.',
    xpReward: 70,
    tags: ['indexes', 'query-planner', 'sargable']
  },
  {
    id: 'stage-7-b03',
    stageId: 'stage-7',
    title: 'Which normal form breaks first',
    type: 'quiz',
    difficulty: 'medium',
    language: 'sql',
    prompt:
      'product_name is always the same for a given product_id. Which is the lowest normal form this table violates, and for what reason?',
    codeSnippet:
      'CREATE TABLE order_lines (\n' +
      '  order_id     INTEGER,\n' +
      '  product_id   INTEGER,\n' +
      '  quantity     INTEGER NOT NULL,\n' +
      '  product_name TEXT NOT NULL,\n' +
      '  PRIMARY KEY (order_id, product_id)\n' +
      ');',
    options: [
      'Second normal form: product_name depends on only part of the composite key',
      'Third normal form: product_name depends on another non-key column',
      'First normal form: the same product name repeats on many rows',
      'None of them: the composite primary key already normalises the table'
    ],
    correctIndex: 0,
    hints: [
      'Ask which columns of the key you actually need in order to know product_name.',
      'First normal form is about the shape of a single value, not repeated rows.'
    ],
    explanation:
      'Second normal form forbids a non-key column that depends on only part of a composite key. product_name is determined by product_id alone, half of (order_id, product_id), so it belongs in a products table that order_lines references. Failing 2NF means the table is not in 3NF either, but 3NF is specifically about depending on a non-key column, and 1NF is about atomic values rather than repetition across rows.',
    xpReward: 70,
    tags: ['normalisation', '2nf', 'schema-design']
  },
  {
    id: 'stage-7-b04',
    stageId: 'stage-7',
    title: 'Constrain the orders table',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'sql',
    prompt:
      'Fill the blanks so a total can never be negative, every order points at a real customer, and deleting a customer removes the orders belonging to that customer.',
    codeSnippet:
      'CREATE TABLE orders (\n' +
      '  id          INTEGER PRIMARY KEY,\n' +
      '  customer_id INTEGER NOT NULL,\n' +
      '  total_cents INTEGER NOT NULL ___ (total_cents >= 0),\n' +
      '  ___ KEY (customer_id) ___ customers (id)\n' +
      '    ON DELETE ___\n' +
      ');',
    blanks: [
      { answer: 'CHECK', choices: ['CHECK', 'UNIQUE', 'DEFAULT', 'ASSERT'] },
      { answer: 'FOREIGN', choices: ['FOREIGN', 'PRIMARY', 'UNIQUE', 'SECONDARY'] },
      { answer: 'REFERENCES', choices: ['REFERENCES', 'JOINS', 'POINTS TO', 'LINKS'] },
      { answer: 'CASCADE', choices: ['CASCADE', 'SET NULL', 'RESTRICT', 'NO ACTION'] }
    ],
    hints: [
      'One constraint validates a value, the other validates that a row exists elsewhere.',
      'customer_id is NOT NULL, so one of the ON DELETE actions could never succeed.'
    ],
    explanation:
      'CHECK validates every inserted or updated row against a boolean expression, while FOREIGN KEY ... REFERENCES makes the database reject any customer_id that has no matching customers row. ON DELETE CASCADE propagates the parent delete to the children; SET NULL would fail here because customer_id is declared NOT NULL.',
    xpReward: 40,
    tags: ['foreign-keys', 'constraints', 'ddl']
  },
  {
    id: 'stage-7-b05',
    stageId: 'stage-7',
    title: 'Rolling back to a savepoint',
    type: 'output_prediction',
    difficulty: 'medium',
    language: 'sql',
    prompt: 'Row 1 starts with balance = 100. What does the final SELECT return?',
    codeSnippet:
      '-- accounts(id INTEGER PRIMARY KEY, balance INTEGER)\n' +
      'BEGIN;\n' +
      'UPDATE accounts SET balance = balance - 30 WHERE id = 1;\n' +
      'SAVEPOINT after_fee;\n' +
      'UPDATE accounts SET balance = balance - 50 WHERE id = 1;\n' +
      'ROLLBACK TO SAVEPOINT after_fee;\n' +
      'COMMIT;\n' +
      '\n' +
      'SELECT balance FROM accounts WHERE id = 1;',
    options: ['70', '100', '20', '50'],
    hints: [
      'A savepoint marks a point inside the transaction, it does not end it.',
      'Work out which statements ran after the savepoint was taken.'
    ],
    correctIndex: 0,
    explanation:
      'ROLLBACK TO SAVEPOINT undoes only the work done after that savepoint, so the 50 deduction disappears while the earlier 30 deduction survives. COMMIT then makes 100 - 30 = 70 durable. Atomicity is all-or-nothing for the transaction as a whole; savepoints are the escape hatch for partial undo inside it.',
    xpReward: 70,
    tags: ['transactions', 'acid', 'savepoint']
  },
  {
    id: 'stage-7-b06',
    stageId: 'stage-7',
    title: 'What READ COMMITTED still allows',
    type: 'multi_select',
    difficulty: 'hard',
    language: 'sql',
    prompt:
      'Session A runs at READ COMMITTED. Which anomalies are still possible for it? Select every one that applies.',
    codeSnippet:
      '-- Session A, READ COMMITTED (the usual default)\n' +
      'BEGIN;\n' +
      'SELECT balance FROM accounts WHERE id = 1;  -- returns 100\n' +
      '\n' +
      '-- Session B now runs and commits:\n' +
      '--   UPDATE accounts SET balance = 40 WHERE id = 1;\n' +
      '--   INSERT INTO accounts (id, balance) VALUES (2, 500);\n' +
      '\n' +
      'SELECT balance FROM accounts WHERE id = 1;  -- ?\n' +
      'SELECT count(*) FROM accounts;              -- ?\n' +
      'COMMIT;',
    options: [
      'A non-repeatable read: re-reading row 1 returns a value committed since',
      'A dirty read: seeing a row written by a transaction that later rolls back',
      'A phantom read: re-running the range query returns a newly committed row',
      'A lost self-write: reading back a row without seeing its own uncommitted UPDATE',
      'Overwriting a row that another session has updated but not yet committed'
    ],
    correctIndices: [0, 2],
    hints: [
      'READ COMMITTED takes a fresh snapshot for every statement, not for the transaction.',
      'Ask of each option whether any isolation level permits it at all, or whether locking rules it out everywhere.'
    ],
    explanation:
      'READ COMMITTED reads a fresh snapshot of committed data per statement, so it never sees uncommitted rows but a repeated read can pick up anything committed in between: that is a non-repeatable read, and its range form is a phantom. A transaction always sees its own writes, and a row-level write lock blocks the second writer until the first commits or rolls back, so the last two can never happen.',
    xpReward: 110,
    tags: ['isolation-levels', 'transactions', 'anomalies']
  },
  {
    id: 'stage-7-b07',
    stageId: 'stage-7',
    title: 'Index for a filter plus a sort',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'sql',
    prompt:
      'Fill the blanks to create the composite index for the target query and then check that the planner actually picks it.',
    codeSnippet:
      '-- Target query:\n' +
      '--   SELECT id FROM events\n' +
      '--   WHERE tenant_id = 42\n' +
      '--   ORDER BY created_at DESC LIMIT 20;\n' +
      '\n' +
      'CREATE ___ idx_events_tenant_created\n' +
      '  ON events (tenant_id, created_at DESC);\n' +
      '\n' +
      '___ ANALYZE SELECT id FROM events\n' +
      '  WHERE tenant_id = 42\n' +
      '  ORDER BY created_at DESC LIMIT 20;',
    blanks: [
      { answer: 'INDEX', choices: ['INDEX', 'TABLE', 'VIEW', 'CONSTRAINT'] },
      { answer: 'EXPLAIN', choices: ['EXPLAIN', 'DESCRIBE', 'PROFILE', 'SHOW'] }
    ],
    hints: [
      'The equality column comes first in a composite index, the sort column second.',
      'One keyword makes the database show you the plan it chose instead of just the rows.'
    ],
    explanation:
      'A composite index that leads with the equality column lets the planner seek straight to tenant 42 and then walk the already-ordered created_at entries, so the LIMIT stops after 20 rows with no sort step. EXPLAIN ANALYZE runs the query and prints the plan it really used, which is the only reliable way to confirm an index is doing its job.',
    xpReward: 40,
    tags: ['indexes', 'explain', 'composite-index']
  },
  {
    id: 'stage-7-b08',
    stageId: 'stage-7',
    title: 'Add a NOT NULL column to a live table',
    type: 'pseudocode_order',
    difficulty: 'medium',
    language: 'pseudocode',
    prompt:
      'A busy table needs a new NOT NULL column while inserts keep arriving. Order these steps so no live insert is rejected and the final step cannot fail.',
    pseudocodeLines: [
      'ADD the column TO the live table AS nullable',
      'DEPLOY the application code that fills the column on every write',
      'BACKFILL the rows that already existed, IN small batches',
      'VERIFY that no row is left holding NULL in the column',
      'ADD the NOT NULL constraint TO the column'
    ],
    hints: [
      'Adding the constraint fails while even one row still holds NULL.',
      'If new rows can still arrive with the column empty, a finished backfill does not stay finished.'
    ],
    explanation:
      'Every step is the precondition of the next one: the column has to exist before any code can write it, the new writes have to be live before the backfill starts or rows inserted during the backfill would be left NULL, and the constraint can only be added once a check confirms that zero NULLs remain. Doing it in one shot instead makes the database validate every existing row while the table is locked against writes.',
    xpReward: 70,
    tags: ['migrations', 'schema-design', 'not-null']
  },
  {
    id: 'stage-7-b09',
    stageId: 'stage-7',
    title: 'Batch load instead of N+1',
    type: 'code_runner',
    difficulty: 'hard',
    language: 'javascript',
    prompt:
      'Return one object per post shaped { id, title, authorName }. Build a single lookup from authors rather than searching that array once per post. A post whose authorId is missing from authors gets authorName null.',
    starterCode:
      'function attachAuthors(posts, authors) {\n' +
      '  // your code here\n' +
      '  return [];\n' +
      '}',
    entryFunction: 'attachAuthors',
    testCases: [
      {
        input: '[{"id":1,"title":"A","authorId":7}], [{"id":7,"name":"Ada"}]',
        expected: '[{"id":1,"title":"A","authorName":"Ada"}]'
      },
      {
        input:
          '[{"id":1,"title":"A","authorId":7},{"id":2,"title":"B","authorId":8}], ' +
          '[{"id":7,"name":"Ada"},{"id":8,"name":"Grace"}]',
        expected:
          '[{"id":1,"title":"A","authorName":"Ada"},' +
          '{"id":2,"title":"B","authorName":"Grace"}]'
      },
      {
        input: '[{"id":1,"title":"A","authorId":9}], [{"id":7,"name":"Ada"}]',
        expected: '[{"id":1,"title":"A","authorName":null}]'
      },
      {
        input: '[], [{"id":7,"name":"Ada"}]',
        expected: '[]'
      }
    ],
    solutionCode:
      'function attachAuthors(posts, authors) {\n' +
      '  const byId = new Map();\n' +
      '  for (const author of authors) byId.set(author.id, author);\n' +
      '  return posts.map(post => ({\n' +
      '    id: post.id,\n' +
      '    title: post.title,\n' +
      '    authorName: byId.has(post.authorId)\n' +
      '      ? byId.get(post.authorId).name\n' +
      '      : null\n' +
      '  }));\n' +
      '}',
    hints: [
      'A Map from author id to author turns a per-post scan into one pass over authors.',
      'Build the map before the loop over posts, never inside it.'
    ],
    explanation:
      'Indexing the authors once by id costs a single pass and makes every post lookup constant time, so the whole join is O(posts + authors) instead of O(posts * authors). This is the in-memory shape of the same fix you apply in SQL: fetch the children in one IN query and join them to the parents by key.',
    xpReward: 110,
    tags: ['n-plus-one', 'joins', 'hash-map']
  },
  {
    id: 'stage-7-b10',
    stageId: 'stage-7',
    title: 'NULLs in a unique column',
    type: 'debug',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'This helper predicts whether inserting these rows would violate a UNIQUE constraint on the given column. It wrongly reports a violation when two rows leave the column NULL. Fix it.',
    starterCode:
      'function violatesUnique(rows, column) {\n' +
      '  const seen = new Set();\n' +
      '  for (const row of rows) {\n' +
      '    const value = row[column];\n' +
      '    if (seen.has(value)) return true;\n' +
      '    seen.add(value);\n' +
      '  }\n' +
      '  return false;\n' +
      '}',
    entryFunction: 'violatesUnique',
    testCases: [
      { input: '[{"email":"a@x.com"},{"email":"b@x.com"}], "email"', expected: 'false' },
      { input: '[{"email":"a@x.com"},{"email":"a@x.com"}], "email"', expected: 'true' },
      { input: '[{"email":null},{"email":null},{"email":"a@x.com"}], "email"', expected: 'false' },
      { input: '[{"email":null},{"email":"a@x.com"},{"email":"a@x.com"}], "email"', expected: 'true' },
      { input: '[], "email"', expected: 'false' }
    ],
    solutionCode:
      'function violatesUnique(rows, column) {\n' +
      '  const seen = new Set();\n' +
      '  for (const row of rows) {\n' +
      '    const value = row[column];\n' +
      '    if (value === null || value === undefined) continue;\n' +
      '    if (seen.has(value)) return true;\n' +
      '    seen.add(value);\n' +
      '  }\n' +
      '  return false;\n' +
      '}',
    hints: [
      'Ask what SQL says about comparing NULL with NULL.',
      'Some rows should never be recorded in the seen set at all.'
    ],
    explanation:
      'A UNIQUE constraint compares values with SQL three-valued logic, and NULL = NULL is unknown rather than true, so duplicate NULLs do not collide in standard SQL or in PostgreSQL, MySQL, Oracle and SQLite. Skipping NULL values before the duplicate check models that. A primary key behaves differently because it is UNIQUE plus NOT NULL.',
    xpReward: 70,
    tags: ['keys', 'null', 'constraints']
  }
];
