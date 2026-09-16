import type { Roadmap } from '../../types';
import { MDN, PG, book, course, docs, link, practice, roadmapSh } from './helpers';

export const backend: Roadmap = {
  slug: 'backend',
  title: 'Backend Developer',
  kind: 'role',
  icon: '⚙️',
  description: 'Servers, APIs, databases, authentication, caching, queues and the operational habits that keep them running.',
  roadmapShUrl: 'https://roadmap.sh/backend',
  sections: [
    {
      id: 'foundations',
      title: 'Foundations',
      nodes: [
        {
          id: 'language',
          title: 'Pick a language',
          description: 'JavaScript/TypeScript on Node, Python, Go, Java or C#. Depth in one beats breadth in five - the concepts transfer.',
          stageId: 'stage-1',
          resources: [docs('Node.js - Learn', 'https://nodejs.org/en/learn'), docs('The Python Tutorial', 'https://docs.python.org/3/tutorial/'), docs('A Tour of Go', 'https://go.dev/tour/'), link('nodejs roadmap on roadmap.sh', 'https://roadmap.sh/nodejs', 'roadmap')]
        },
        {
          id: 'internet-http',
          title: 'Internet and HTTP',
          description: 'TCP/IP, DNS, TLS and the HTTP request/response cycle you will implement a thousand times.',
          stageId: 'stage-6',
          tags: ['http', 'http-methods', 'status-codes', 'headers'],
          resources: [docs('HTTP (MDN)', `${MDN}/Web/HTTP`), link('What is TLS? (Cloudflare Learning)', 'https://www.cloudflare.com/learning/ssl/transport-layer-security-tls/')]
        },
        {
          id: 'terminal-os',
          title: 'Terminal, Linux and OS basics',
          description: 'Processes, memory, file permissions, the shell, SSH - servers are Linux boxes and you will live in them.',
          resources: [link('Linux Journey', 'https://linuxjourney.com/'), docs('Bash reference manual', 'https://www.gnu.org/software/bash/manual/'), link('linux roadmap on roadmap.sh', 'https://roadmap.sh/linux', 'roadmap')]
        },
        {
          id: 'git',
          title: 'Git',
          description: 'Branching, rebasing, resolving conflicts and reviewing diffs.',
          stageId: 'stage-8',
          tags: ['git'],
          resources: [book('Pro Git', 'https://git-scm.com/book/en/v2'), practice('Learn Git Branching', 'https://learngitbranching.js.org/')]
        }
      ]
    },
    {
      id: 'apis',
      title: 'Building APIs',
      nodes: [
        {
          id: 'rest',
          title: 'REST API design',
          description: 'Resources, verbs, status codes, pagination, versioning and error shapes that clients can rely on.',
          stageId: 'stage-6',
          tags: ['rest', 'api-design', 'pagination', 'status-codes'],
          resources: [link('api-design roadmap on roadmap.sh', 'https://roadmap.sh/api-design', 'roadmap'), docs('HTTP methods (MDN)', `${MDN}/Web/HTTP/Methods`), link('Microsoft REST API guidelines', 'https://github.com/microsoft/api-guidelines/blob/vNext/Guidelines.md')]
        },
        {
          id: 'framework',
          title: 'A web framework',
          description: 'Express or Fastify (Node), FastAPI or Django (Python), Gin (Go), Spring (Java): routing, middleware, request parsing.',
          stageId: 'stage-6',
          tags: ['express', 'middleware', 'routing'],
          resources: [docs('Express', 'https://expressjs.com/'), docs('Fastify', 'https://fastify.dev/docs/latest/'), docs('FastAPI', 'https://fastapi.tiangolo.com/'), docs('Django', 'https://docs.djangoproject.com/en/stable/')]
        },
        {
          id: 'validation',
          title: 'Input validation',
          description: 'Every byte from the network is untrusted. Validate shape and type at the edge with a schema library.',
          stageId: 'stage-6',
          tags: ['input-validation', 'parsing'],
          resources: [docs('Zod', 'https://zod.dev/'), docs('JSON Schema', 'https://json-schema.org/learn'), docs('Pydantic', 'https://docs.pydantic.dev/latest/')]
        },
        {
          id: 'auth',
          title: 'Authentication and authorization',
          description: 'Sessions vs JWTs, OAuth 2 / OpenID Connect, password hashing, and checking permissions per resource.',
          stageId: 'stage-6',
          tags: ['authentication', 'jwt', 'sessions', 'password-hashing'],
          resources: [docs('OAuth 2.0', 'https://oauth.net/2/'), link('Introduction to JSON Web Tokens', 'https://jwt.io/introduction'), docs('Password storage cheat sheet (OWASP)', 'https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html')]
        },
        {
          id: 'graphql-grpc',
          title: 'GraphQL and gRPC',
          description: 'Alternatives to REST: a typed query language for clients, and a binary RPC protocol for service-to-service calls.',
          optional: true,
          resources: [docs('GraphQL', 'https://graphql.org/learn/'), docs('gRPC', 'https://grpc.io/docs/what-is-grpc/introduction/'), link('graphql roadmap on roadmap.sh', 'https://roadmap.sh/graphql', 'roadmap')]
        }
      ]
    },
    {
      id: 'data',
      title: 'Databases',
      nodes: [
        {
          id: 'sql',
          title: 'Relational databases and SQL',
          description: 'PostgreSQL or MySQL: queries, joins, indexes, transactions and schema design. The default choice for most systems.',
          stageId: 'stage-7',
          tags: ['sql', 'join', 'indexes', 'transactions'],
          resources: [docs('PostgreSQL tutorial', `${PG}/tutorial.html`), practice('SQLBolt', 'https://sqlbolt.com/'), link('sql roadmap on roadmap.sh', 'https://roadmap.sh/sql', 'roadmap')]
        },
        {
          id: 'orms-migrations',
          title: 'ORMs and migrations',
          description: 'Query builders and ORMs speed up the common case; migrations version the schema alongside the code.',
          stageId: 'stage-7',
          tags: ['migrations', 'n-plus-one'],
          resources: [docs('Prisma', 'https://www.prisma.io/docs'), docs('Drizzle ORM', 'https://orm.drizzle.team/docs/overview'), docs('SQLAlchemy', 'https://docs.sqlalchemy.org/')]
        },
        {
          id: 'nosql',
          title: 'NoSQL: documents and key-value',
          description: 'MongoDB, DynamoDB, Redis: when a flexible document or a fast key-value store fits better than tables.',
          resources: [docs('MongoDB manual', 'https://www.mongodb.com/docs/manual/'), docs('Redis docs', 'https://redis.io/docs/latest/'), link('mongodb roadmap on roadmap.sh', 'https://roadmap.sh/mongodb', 'roadmap')]
        },
        {
          id: 'db-internals',
          title: 'Indexes, transactions and the planner',
          description: 'B-trees, EXPLAIN, isolation levels and the N+1 problem - what separates a working query from a fast one.',
          stageId: 'stage-7',
          tags: ['indexes', 'explain', 'isolation-levels', 'acid'],
          resources: [book('Use The Index, Luke', 'https://use-the-index-luke.com/'), docs('Transaction isolation (PostgreSQL)', `${PG}/transaction-iso.html`), docs('Using EXPLAIN (PostgreSQL)', `${PG}/using-explain.html`)]
        }
      ]
    },
    {
      id: 'scale',
      title: 'Scaling and reliability',
      nodes: [
        {
          id: 'caching',
          title: 'Caching',
          description: 'HTTP caching headers, CDN caching, and application caches with Redis: cache-aside, TTLs, invalidation.',
          stageId: 'stage-9',
          tags: ['caching', 'cache-aside', 'invalidation'],
          resources: [docs('HTTP caching (MDN)', `${MDN}/Web/HTTP/Caching`), docs('Redis as a cache', 'https://redis.io/docs/latest/develop/use/client-side-caching/')]
        },
        {
          id: 'queues',
          title: 'Message queues and background jobs',
          description: 'RabbitMQ, Kafka, SQS or a Redis-backed job queue for anything slow, bursty or retryable.',
          stageId: 'stage-9',
          tags: ['message-queues', 'back-pressure'],
          resources: [docs('RabbitMQ tutorials', 'https://www.rabbitmq.com/tutorials'), docs('Apache Kafka introduction', 'https://kafka.apache.org/intro'), docs('BullMQ', 'https://docs.bullmq.io/')]
        },
        {
          id: 'rate-limiting-idempotency',
          title: 'Rate limiting and idempotency',
          description: 'Token buckets to protect the service; idempotency keys so clients can safely retry.',
          stageId: 'stage-9',
          tags: ['rate-limiting', 'idempotency', 'retries'],
          resources: [docs('Idempotent requests (Stripe API)', 'https://docs.stripe.com/api/idempotent_requests'), docs('Rate limiting (Cloudflare Learning)', 'https://www.cloudflare.com/learning/bots/what-is-rate-limiting/')]
        },
        {
          id: 'architecture',
          title: 'Monoliths, services and system design',
          description: 'Start with a modular monolith; split into services when the organisation, not the code, demands it.',
          stageId: 'stage-9',
          tags: ['system-design', 'scaling'],
          resources: [link('Microservices (Martin Fowler)', 'https://martinfowler.com/articles/microservices.html'), link('system-design roadmap on roadmap.sh', 'https://roadmap.sh/system-design', 'roadmap'), link('System Design Primer', 'https://github.com/donnemartin/system-design-primer')]
        }
      ]
    },
    {
      id: 'operate',
      title: 'Operating it',
      nodes: [
        {
          id: 'testing',
          title: 'Testing',
          description: 'Unit tests for logic, integration tests against a real database, contract tests for APIs.',
          stageId: 'stage-8',
          tags: ['testing', 'test-doubles'],
          resources: [docs('Vitest', 'https://vitest.dev/guide/'), docs('pytest', 'https://docs.pytest.org/en/stable/'), docs('Testcontainers', 'https://testcontainers.com/getting-started/')]
        },
        {
          id: 'security',
          title: 'Security',
          description: 'OWASP Top Ten, injection, IDOR, secrets handling, dependency auditing and security headers.',
          stageId: 'stage-6',
          tags: ['owasp', 'sql-injection', 'idor'],
          resources: [docs('OWASP Top Ten', 'https://owasp.org/www-project-top-ten/'), docs('OWASP Cheat Sheet Series', 'https://cheatsheetseries.owasp.org/')]
        },
        {
          id: 'containers',
          title: 'Containers',
          description: 'Docker images for reproducible builds and deploys; compose for local multi-service setups.',
          resources: [docs('Docker - Get started', 'https://docs.docker.com/get-started/'), link('docker roadmap on roadmap.sh', 'https://roadmap.sh/docker', 'roadmap')]
        },
        {
          id: 'ci-cd',
          title: 'CI/CD and deployment',
          description: 'Pipelines that lint, test and build on every push; rolling, blue-green and canary deploys with a rollback plan.',
          stageId: 'stage-10',
          tags: ['ci-cd', 'deployment', 'rollback'],
          resources: [docs('GitHub Actions', 'https://docs.github.com/en/actions'), link('The Twelve-Factor App', 'https://12factor.net/')]
        },
        {
          id: 'observability',
          title: 'Logging, metrics and tracing',
          description: 'Structured logs with request ids, latency percentiles, distributed traces, and alerts on symptoms.',
          stageId: 'stage-10',
          tags: ['observability', 'metrics', 'structured-logging'],
          resources: [docs('OpenTelemetry', 'https://opentelemetry.io/docs/'), docs('Prometheus overview', 'https://prometheus.io/docs/introduction/overview/'), book('Google SRE book', 'https://sre.google/sre-book/table-of-contents/')]
        },
        {
          id: 'backend-more',
          title: 'Keep going',
          description: 'WebSockets, search engines, event-driven architecture, and the full community roadmap.',
          resources: [roadmapSh('backend'), course('Full Stack Open', 'https://fullstackopen.com/en/')]
        }
      ]
    }
  ]
};
