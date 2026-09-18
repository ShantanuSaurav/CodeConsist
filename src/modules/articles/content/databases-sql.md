# Databases & SQL: thinking in sets
<!-- stage: stage-7 -->

> SQL is declarative: you say *what* you want and the planner decides *how*. This article covers the query clauses and their order of evaluation, NULL, joins, aggregation, schema design and keys, indexes, transactions and the mistakes that make databases slow.

## SELECT, WHERE, ORDER BY and evaluation order
<!-- tags: select, where, order-by, query-execution, sorting, distinct -->

You write a query in this order, but the database **evaluates** it in a different one:

```sql
SELECT   department, COUNT(*) AS n     -- 5. pick and compute columns
FROM     employees                     -- 1. the source rows
WHERE    active = true                 -- 2. filter rows
GROUP BY department                    -- 3. collapse into groups
HAVING   COUNT(*) > 3                  -- 4. filter groups
ORDER BY n DESC                        -- 6. sort the result
LIMIT    10;                           -- 7. cut it off
```

Because `WHERE` runs before `SELECT`, you cannot reference a `SELECT` alias in `WHERE` - but you can in `ORDER BY`, which runs after. `DISTINCT` removes duplicate *rows* of the selected columns. Without `ORDER BY`, row order is **undefined**; that it looks stable in development is luck.

## NULL and three-valued logic
<!-- tags: null, three-valued-logic, not-null -->

`NULL` means *unknown*, not zero and not empty string. Any comparison with `NULL` yields `NULL` (unknown), which `WHERE` treats as false:

```sql
SELECT * FROM users WHERE phone = NULL;      -- always zero rows
SELECT * FROM users WHERE phone IS NULL;     -- correct
SELECT * FROM users WHERE phone <> '555';    -- rows with NULL phone are EXCLUDED
```

Consequences: `NOT IN (subquery)` returns nothing if the subquery contains a single `NULL`; `COUNT(column)` skips NULLs while `COUNT(*)` counts rows; `AVG` ignores NULLs; `NULL || 'x'` is `NULL`. `COALESCE(a, b)` returns the first non-null argument. Declare columns `NOT NULL` unless *unknown* is a state you genuinely need to represent.

## Joins
<!-- tags: join, joins, inner-join, left-join, hash-join, cardinality, fan-out -->

A join matches rows from two tables on a condition:

- **INNER JOIN** - only rows with a match on both sides.
- **LEFT JOIN** - every row from the left, plus the match or NULLs. "Users and their orders, including users with none" - and `WHERE o.id IS NULL` finds the ones with none.
- **RIGHT / FULL** - the mirror image / both sides.
- **CROSS JOIN** - every combination. Usually a mistake unless deliberate.

```sql
SELECT u.name, COUNT(o.id) AS orders
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
GROUP BY u.id, u.name;
```

**Cardinality** decides the row count: joining one user to their five orders yields five rows - a **fan-out**. Join two one-to-many relations at once and you get `5 × 3 = 15` rows and doubled sums; aggregate each side first, or use subqueries.

Under the hood a **hash join** builds a hash table from the smaller side and probes it with the larger: O(n + m), the same trick as a two-sum with a `Map`. Nested-loop joins are O(n × m) and appear when there is no usable index.

## Aggregation: GROUP BY and HAVING
<!-- tags: group-by, having, aggregates, count -->

`GROUP BY` collapses rows sharing the same values into one row per group; aggregate functions (`COUNT`, `SUM`, `AVG`, `MIN`, `MAX`) summarise each group. Every column in `SELECT` must be either grouped or aggregated - otherwise the database has no way to pick which row's value to show.

`WHERE` filters rows *before* grouping; `HAVING` filters groups *after*:

```sql
SELECT customer_id, SUM(total) AS spent
FROM orders
WHERE status = 'paid'            -- only paid orders count
GROUP BY customer_id
HAVING SUM(total) > 1000;        -- only big spenders remain
```

`COUNT(*)` counts rows; `COUNT(col)` counts non-null values; `COUNT(DISTINCT col)` counts distinct non-null values.

## Subqueries and IN
<!-- tags: subquery, in -->

A subquery is a query inside a query. Uncorrelated ones run once and act like a value or a list; correlated ones reference the outer row and run per row (the planner often rewrites them into joins).

```sql
SELECT name FROM products
WHERE id IN (SELECT product_id FROM order_items WHERE quantity > 10);

SELECT name FROM products p
WHERE EXISTS (SELECT 1 FROM order_items oi WHERE oi.product_id = p.id);
```

Prefer `EXISTS` over `IN` for large subqueries and whenever the subquery might yield NULLs. A **CTE** (`WITH tmp AS (...) SELECT ... FROM tmp`) names a subquery and makes multi-step queries readable.

## Schema design, keys and normalisation
<!-- tags: schema-design, schema, keys, primary-key, foreign-key, foreign-keys, constraints, normalisation, 2nf, ddl -->

A **primary key** uniquely identifies a row and is never NULL. A **foreign key** references another table's primary key and makes the database enforce that the referenced row exists (`ON DELETE CASCADE / RESTRICT / SET NULL` says what happens when it goes away).

**Normalisation** removes duplicated facts so they cannot disagree. First normal form: one value per cell, no repeating groups. Second: every non-key column depends on the *whole* key (a problem only with composite keys). Third: non-key columns depend on the key *only* - a `customer_city` column in `orders` violates it, because city belongs to the customer.

```sql
CREATE TABLE orders (
  id          BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  status      TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'shipped')),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`CHECK` and `UNIQUE` constraints put invariants where every application, script and admin console has to obey them. Store money as integers in the smallest unit, never as floats. Denormalise deliberately, later, for measured read performance - never by default.

## Indexes and the query planner
<!-- tags: indexes, query-planner, sargable, explain, composite-index, n-plus-one -->

An index is a sorted structure (usually a B-tree) on one or more columns that lets the database find rows without scanning the table: O(log n) instead of O(n). Every index costs write time and disk, so index what you filter, join and sort on - not everything.

A predicate is **sargable** (index-friendly) when the column stands alone on one side: `WHERE created_at >= '2024-01-01'`. Wrapping the column in a function - `WHERE YEAR(created_at) = 2024`, `WHERE LOWER(email) = ...` - defeats the index unless you create an index on that expression.

A **composite index** on `(a, b)` serves queries filtering on `a`, or on `a and b`, but not on `b` alone - the leftmost-prefix rule. Put equality columns first, range columns last.

`EXPLAIN` (or `EXPLAIN ANALYZE`) shows the plan: *Seq Scan* on a big table under a selective `WHERE` means a missing or unusable index. The **N+1 problem** is one query for a list followed by one query per row; fix it with a join or a single `WHERE id IN (...)`.

## Transactions and isolation
<!-- tags: transactions, acid, savepoint, isolation-levels, anomalies -->

A transaction groups statements so they succeed or fail together - **atomic**, **consistent**, **isolated**, **durable**.

```sql
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;     -- or ROLLBACK, and neither update happens
```

`SAVEPOINT name` marks a point you can `ROLLBACK TO` without abandoning the whole transaction.

**Isolation levels** trade correctness for concurrency. *Read committed* (the common default) never shows uncommitted data but can see different values if you read twice. *Repeatable read* fixes that. *Serializable* behaves as if transactions ran one after another and aborts those that conflict - retry on serialization failure. The anomalies these prevent have names: dirty read, non-repeatable read, phantom read, lost update. Keep transactions short; long ones hold locks and block everyone.

## Migrations
<!-- tags: migrations -->

Schema changes are code: versioned migration files applied in order, each with an up and (where possible) a down. Make them **backwards compatible** with the running application - add the new column nullable, deploy code that writes both, backfill, then make it `NOT NULL` and drop the old one. Adding an index on a large table should use the concurrent/online form so it does not lock writes.

## Debugging a slow or wrong query
<!-- tags: debugging, sql -->

1. Is the result wrong or just slow? For wrong: check NULL handling and join fan-out first - `COUNT(*)` before and after each join.
2. For slow: `EXPLAIN ANALYZE`. Look for sequential scans on big tables and nested loops with high row estimates.
3. Check that the predicate is sargable and that a matching index exists with the right column order.
4. Check whether you are fetching more than you use - `SELECT *`, missing `LIMIT`, N+1 from the application.
