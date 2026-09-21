import type { Roadmap } from '@/types';
import { PG, book, docs, link, practice, roadmapSh } from './helpers';

export const roadmap: Roadmap = {
  slug: 'sql',
  order: 7,
  title: 'SQL & Databases',
  kind: 'skill',
  icon: '🗄️',
  description: 'Querying, modelling and tuning relational databases - and knowing when a different store fits better.',
  roadmapShUrl: 'https://roadmap.sh/sql',
  sections: [
    {
      id: 'querying',
      title: 'Querying',
      nodes: [
        {
          id: 'select',
          title: 'SELECT, WHERE, ORDER BY, LIMIT',
          description: 'The basic shape of a query and the order the database actually evaluates the clauses.',
          stageId: 'stage-7',
          tags: ['select', 'where', 'order-by', 'query-execution'],
          resources: [docs('SELECT (PostgreSQL)', `${PG}/sql-select.html`), practice('SQLBolt - interactive lessons', 'https://sqlbolt.com/'), practice('SQLZoo', 'https://sqlzoo.net/')]
        },
        {
          id: 'null',
          title: 'NULL and three-valued logic',
          description: 'Unknown is not zero: IS NULL, COALESCE, and why NOT IN with a NULL returns nothing.',
          stageId: 'stage-7',
          tags: ['null', 'three-valued-logic'],
          resources: [docs('Comparison functions (PostgreSQL)', `${PG}/functions-comparison.html`), link('NULL handling (Modern SQL)', 'https://modern-sql.com/concept/null')]
        },
        {
          id: 'joins',
          title: 'Joins',
          description: 'INNER, LEFT, FULL and CROSS joins; cardinality and fan-out; how a hash join works.',
          stageId: 'stage-7',
          tags: ['join', 'joins', 'inner-join', 'left-join', 'fan-out'],
          resources: [docs('Joins between tables (PostgreSQL tutorial)', `${PG}/tutorial-join.html`), link('A visual explanation of SQL joins', 'https://blog.codinghorror.com/a-visual-explanation-of-sql-joins/')]
        },
        {
          id: 'aggregation',
          title: 'GROUP BY, HAVING and aggregates',
          description: 'Collapsing rows into groups, COUNT vs COUNT(col), and filtering groups after the fact.',
          stageId: 'stage-7',
          tags: ['group-by', 'having', 'aggregates', 'count'],
          resources: [docs('Aggregate functions (PostgreSQL tutorial)', `${PG}/tutorial-agg.html`)]
        },
        {
          id: 'subqueries-ctes',
          title: 'Subqueries, EXISTS and CTEs',
          description: 'Queries inside queries, correlated vs not, and WITH clauses for readable multi-step logic.',
          stageId: 'stage-7',
          tags: ['subquery', 'in'],
          resources: [docs('WITH queries (PostgreSQL)', `${PG}/queries-with.html`), docs('Subquery expressions (PostgreSQL)', `${PG}/functions-subquery.html`)]
        },
        {
          id: 'window-functions',
          title: 'Window functions',
          description: 'ROW_NUMBER, RANK, LAG/LEAD and running totals without collapsing rows.',
          optional: true,
          resources: [docs('Window functions (PostgreSQL tutorial)', `${PG}/tutorial-window.html`), docs('Window functions (PostgreSQL)', `${PG}/functions-window.html`)]
        }
      ]
    },
    {
      id: 'modelling',
      title: 'Modelling',
      nodes: [
        {
          id: 'ddl',
          title: 'Tables, types and constraints',
          description: 'CREATE TABLE, choosing column types, NOT NULL, UNIQUE, CHECK and defaults as enforced invariants.',
          stageId: 'stage-7',
          tags: ['ddl', 'constraints', 'not-null', 'schema'],
          resources: [docs('Data definition (PostgreSQL)', `${PG}/ddl.html`), docs('Constraints (PostgreSQL)', `${PG}/ddl-constraints.html`)]
        },
        {
          id: 'keys',
          title: 'Primary and foreign keys',
          description: 'Identity, referential integrity and ON DELETE behaviour.',
          stageId: 'stage-7',
          tags: ['keys', 'primary-key', 'foreign-key', 'foreign-keys'],
          resources: [docs('Foreign keys (PostgreSQL tutorial)', `${PG}/tutorial-fk.html`)]
        },
        {
          id: 'normalisation',
          title: 'Normalisation',
          description: 'First to third normal form: one fact in one place, so facts cannot disagree.',
          stageId: 'stage-7',
          tags: ['normalisation', '2nf', 'schema-design'],
          resources: [link('Database normalization (Wikipedia)', 'https://en.wikipedia.org/wiki/Database_normalization')]
        },
        {
          id: 'migrations',
          title: 'Migrations',
          description: 'Versioned, backwards-compatible schema changes: expand, backfill, switch, contract.',
          stageId: 'stage-10',
          tags: ['migrations'],
          resources: [docs('Prisma Migrate', 'https://www.prisma.io/docs/orm/prisma-migrate'), docs('Flyway', 'https://documentation.red-gate.com/flyway'), docs('Alembic', 'https://alembic.sqlalchemy.org/en/latest/')]
        }
      ]
    },
    {
      id: 'performance',
      title: 'Performance',
      nodes: [
        {
          id: 'indexes',
          title: 'Indexes',
          description: 'B-trees, composite indexes and the leftmost-prefix rule, sargable predicates, the cost of writes.',
          stageId: 'stage-7',
          tags: ['indexes', 'composite-index', 'sargable'],
          resources: [book('Use The Index, Luke', 'https://use-the-index-luke.com/'), docs('Indexes (PostgreSQL)', `${PG}/indexes.html`)]
        },
        {
          id: 'explain',
          title: 'EXPLAIN and the query planner',
          description: 'Reading plans: sequential scans, index scans, nested loops vs hash joins, row estimates.',
          stageId: 'stage-7',
          tags: ['explain', 'query-planner', 'hash-join'],
          resources: [docs('Using EXPLAIN (PostgreSQL)', `${PG}/using-explain.html`), link('explain.depesz.com - plan visualiser', 'https://explain.depesz.com/')]
        },
        {
          id: 'n-plus-one',
          title: 'The N+1 problem and batching',
          description: 'One query per row is the most common performance bug in applications; joins and IN lists fix it.',
          stageId: 'stage-7',
          tags: ['n-plus-one'],
          resources: [link('N+1 queries (Prisma docs)', 'https://www.prisma.io/docs/orm/prisma-client/queries/query-optimization-performance')]
        }
      ]
    },
    {
      id: 'transactions',
      title: 'Transactions and concurrency',
      nodes: [
        {
          id: 'acid',
          title: 'ACID and transactions',
          description: 'BEGIN/COMMIT/ROLLBACK, savepoints, and keeping transactions short.',
          stageId: 'stage-7',
          tags: ['transactions', 'acid', 'savepoint'],
          resources: [docs('Transactions (PostgreSQL tutorial)', `${PG}/tutorial-transactions.html`)]
        },
        {
          id: 'isolation',
          title: 'Isolation levels and anomalies',
          description: 'Read committed, repeatable read, serializable - and the dirty, non-repeatable, phantom and lost-update anomalies they prevent.',
          stageId: 'stage-7',
          tags: ['isolation-levels', 'anomalies'],
          resources: [docs('Transaction isolation (PostgreSQL)', `${PG}/transaction-iso.html`), link('Consistency models (Jepsen)', 'https://jepsen.io/consistency')]
        },
        {
          id: 'locks',
          title: 'Locking and deadlocks',
          description: 'Row locks, SELECT ... FOR UPDATE, lock ordering to avoid deadlocks.',
          optional: true,
          resources: [docs('Explicit locking (PostgreSQL)', `${PG}/explicit-locking.html`)]
        }
      ]
    },
    {
      id: 'beyond',
      title: 'Beyond relational',
      nodes: [
        {
          id: 'postgres-deep',
          title: 'PostgreSQL in depth',
          description: 'JSONB, full-text search, extensions, replication and administration.',
          optional: true,
          resources: [docs('PostgreSQL documentation', 'https://www.postgresql.org/docs/current/'), link('postgresql-dba roadmap on roadmap.sh', 'https://roadmap.sh/postgresql-dba', 'roadmap')]
        },
        {
          id: 'other-stores',
          title: 'Key-value, document and search stores',
          description: 'Redis, MongoDB, Elasticsearch: different trade-offs for caching, flexible documents and text search.',
          optional: true,
          resources: [docs('Redis docs', 'https://redis.io/docs/latest/'), docs('MongoDB manual', 'https://www.mongodb.com/docs/manual/'), docs('Elasticsearch guide', 'https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html')]
        },
        {
          id: 'sql-more',
          title: 'Keep going',
          description: 'Sharding, replication and consistency continue in the System Design roadmap.',
          resources: [roadmapSh('sql'), practice('CodeConsist Stage 07 - Databases & SQL', '/dashboard/learn'), link('SQLite documentation', 'https://www.sqlite.org/docs.html', 'docs')]
        }
      ]
    }
  ]
};
