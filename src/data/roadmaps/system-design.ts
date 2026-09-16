import type { Roadmap } from '../../types';
import { book, docs, link, practice, roadmapSh } from './helpers';

const PRIMER = 'https://github.com/donnemartin/system-design-primer';

export const systemDesign: Roadmap = {
  slug: 'system-design',
  title: 'System Design',
  kind: 'skill',
  icon: '🏗️',
  description: 'How large systems stay fast, correct and available: scaling, caching, data distribution, messaging, resilience and observability.',
  roadmapShUrl: 'https://roadmap.sh/system-design',
  sections: [
    {
      id: 'fundamentals',
      title: 'Fundamentals',
      nodes: [
        {
          id: 'performance-vs-scalability',
          title: 'Performance, scalability, latency and throughput',
          description: 'Slow for one user vs slow under load; latency (how long) vs throughput (how many). Numbers every engineer should know.',
          stageId: 'stage-9',
          tags: ['scaling', 'capacity'],
          resources: [link('System Design Primer', PRIMER), link('Latency numbers every programmer should know', 'https://colin-scott.github.io/personal_website/research/interactive_latency.html')]
        },
        {
          id: 'availability',
          title: 'Availability and redundancy',
          description: 'Nines, single points of failure, failover, and the difference between availability and durability.',
          stageId: 'stage-9',
          tags: ['availability', 'fault-tolerance'],
          resources: [link('Availability patterns (System Design Primer)', `${PRIMER}#availability-patterns`), link('AWS Builders Library', 'https://aws.amazon.com/builders-library/')]
        },
        {
          id: 'cap',
          title: 'CAP, consistency models',
          description: 'Consistency vs availability under partition; strong, eventual, causal, read-your-writes.',
          stageId: 'stage-9',
          tags: ['cap-theorem', 'consistency', 'eventual-consistency', 'read-your-writes'],
          resources: [link('Consistency models (Jepsen)', 'https://jepsen.io/consistency'), link('CAP theorem (System Design Primer)', `${PRIMER}#cap-theorem`)]
        }
      ]
    },
    {
      id: 'traffic',
      title: 'Handling traffic',
      nodes: [
        {
          id: 'load-balancing',
          title: 'Load balancing',
          description: 'Round robin, least connections, consistent hashing; L4 vs L7; health checks and graceful draining.',
          stageId: 'stage-9',
          tags: ['load-balancing', 'round-robin', 'least-connections', 'health-checks'],
          resources: [link('Load balancer (System Design Primer)', `${PRIMER}#load-balancer`), docs('nginx load balancing', 'https://nginx.org/en/docs/http/load_balancing.html'), link('What is load balancing? (Cloudflare)', 'https://www.cloudflare.com/learning/performance/what-is-load-balancing/')]
        },
        {
          id: 'horizontal-scaling',
          title: 'Horizontal scaling and statelessness',
          description: 'Adding machines instead of bigger ones - and what has to move out of process memory to make it work.',
          stageId: 'stage-9',
          tags: ['horizontal-scaling', 'statelessness'],
          resources: [link('The Twelve-Factor App - processes', 'https://12factor.net/processes')]
        },
        {
          id: 'cdn',
          title: 'CDNs and edge',
          description: 'Serving static and cacheable content from near the user; push vs pull CDNs.',
          resources: [link('CDN (System Design Primer)', `${PRIMER}#content-delivery-network`), link('What is a CDN? (Cloudflare)', 'https://www.cloudflare.com/learning/cdn/what-is-a-cdn/')]
        },
        {
          id: 'rate-limiting',
          title: 'Rate limiting',
          description: 'Token bucket, leaky bucket, fixed and sliding windows; distributed counters.',
          stageId: 'stage-9',
          tags: ['rate-limiting', 'token-bucket', 'leaky-bucket', 'sliding-window'],
          resources: [link('Rate limiting (Cloudflare)', 'https://www.cloudflare.com/learning/bots/what-is-rate-limiting/'), docs('Rate limiting with Redis', 'https://redis.io/glossary/rate-limiting/')]
        }
      ]
    },
    {
      id: 'caching',
      title: 'Caching',
      nodes: [
        {
          id: 'cache-strategies',
          title: 'Cache-aside, write-through, write-behind',
          description: 'Where the cache sits relative to reads and writes, and the freshness each strategy gives.',
          stageId: 'stage-9',
          tags: ['caching', 'cache-aside', 'strategies'],
          resources: [link('Cache (System Design Primer)', `${PRIMER}#cache`), docs('HTTP caching (MDN)', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching')]
        },
        {
          id: 'invalidation-eviction',
          title: 'Invalidation, TTLs and eviction',
          description: 'TTLs bound staleness, explicit invalidation keeps freshness, LRU decides who leaves when the cache is full.',
          stageId: 'stage-9',
          tags: ['invalidation', 'ttl', 'lru', 'eviction'],
          resources: [docs('Redis eviction policies', 'https://redis.io/docs/latest/develop/reference/eviction/')]
        },
        {
          id: 'stampede',
          title: 'Cache stampedes and hot keys',
          description: 'Thundering herds on expiry; locks, jitter and early refresh.',
          stageId: 'stage-9',
          tags: ['cache-stampede', 'locking'],
          resources: [link('Cache stampede (Wikipedia)', 'https://en.wikipedia.org/wiki/Cache_stampede')]
        }
      ]
    },
    {
      id: 'data',
      title: 'Data at scale',
      nodes: [
        {
          id: 'replication',
          title: 'Replication',
          description: 'Primary/replica, read replicas, replication lag, failover and the bugs lag causes.',
          stageId: 'stage-9',
          tags: ['replication', 'read-replicas', 'replication-lag'],
          resources: [link('Replication (System Design Primer)', `${PRIMER}#master-slave-replication`), docs('High availability (PostgreSQL)', 'https://www.postgresql.org/docs/current/high-availability.html')]
        },
        {
          id: 'sharding',
          title: 'Sharding and consistent hashing',
          description: 'Partition keys, hot shards, resharding, and hashing onto a ring so nodes can come and go.',
          stageId: 'stage-9',
          tags: ['sharding', 'partition-key', 'hot-shard', 'consistent-hashing', 'resharding'],
          resources: [link('Sharding (System Design Primer)', `${PRIMER}#sharding`), link('Consistent hashing (Wikipedia)', 'https://en.wikipedia.org/wiki/Consistent_hashing')]
        },
        {
          id: 'sql-vs-nosql',
          title: 'SQL vs NoSQL',
          description: 'Relational, key-value, document, wide-column and graph stores - and picking by access pattern.',
          resources: [link('SQL or NoSQL (System Design Primer)', `${PRIMER}#sql-or-nosql`)]
        },
        {
          id: 'storage',
          title: 'Object storage and search',
          description: 'Blob storage for files, dedicated engines for full-text search, and keeping them consistent with the source of truth.',
          optional: true,
          resources: [docs('Amazon S3', 'https://docs.aws.amazon.com/s3/'), docs('Elasticsearch', 'https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html')]
        }
      ]
    },
    {
      id: 'communication',
      title: 'Communication',
      nodes: [
        {
          id: 'api-styles',
          title: 'REST, GraphQL, gRPC, WebSockets',
          description: 'Request/response vs streaming; text vs binary; when each fits.',
          stageId: 'stage-6',
          tags: ['rest', 'api-design'],
          resources: [link('Communication (System Design Primer)', `${PRIMER}#communication`), link('api-design roadmap on roadmap.sh', 'https://roadmap.sh/api-design', 'roadmap')]
        },
        {
          id: 'queues',
          title: 'Message queues and event streaming',
          description: 'Decoupling producers and consumers; at-least-once delivery; back-pressure; Kafka vs RabbitMQ vs SQS.',
          stageId: 'stage-9',
          tags: ['message-queues', 'back-pressure'],
          resources: [link('Asynchronism (System Design Primer)', `${PRIMER}#asynchronism`), docs('Apache Kafka introduction', 'https://kafka.apache.org/intro')]
        },
        {
          id: 'idempotency',
          title: 'Idempotency and retries',
          description: 'Idempotency keys, exponential back-off with jitter, exactly-once as an illusion built from at-least-once plus dedup.',
          stageId: 'stage-9',
          tags: ['idempotency', 'retries', 'payments'],
          resources: [docs('Idempotent requests (Stripe)', 'https://docs.stripe.com/api/idempotent_requests'), link('Timeouts, retries and backoff with jitter (AWS Builders Library)', 'https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/')]
        },
        {
          id: 'microservices',
          title: 'Monoliths, microservices and service discovery',
          description: 'Boundaries, ownership, the network as a failure domain, and why most teams should start monolithic.',
          resources: [link('Microservices (Martin Fowler)', 'https://martinfowler.com/articles/microservices.html'), link('Microservice patterns', 'https://microservices.io/patterns/index.html')]
        }
      ]
    },
    {
      id: 'reliability',
      title: 'Reliability and operations',
      nodes: [
        {
          id: 'resilience',
          title: 'Timeouts, circuit breakers, bulkheads',
          description: 'Failing fast, isolating failures, degrading gracefully.',
          stageId: 'stage-9',
          tags: ['circuit-breaker', 'resilience', 'fault-tolerance'],
          resources: [link('CircuitBreaker (Martin Fowler)', 'https://martinfowler.com/bliki/CircuitBreaker.html'), book('Release It! (Pragmatic Bookshelf)', 'https://pragprog.com/titles/mnee2/release-it-second-edition/')]
        },
        {
          id: 'observability',
          title: 'Observability',
          description: 'Structured logs, metrics and percentiles, distributed tracing, and alerting on symptoms.',
          stageId: 'stage-9',
          tags: ['observability', 'logging', 'metrics', 'tracing'],
          resources: [docs('OpenTelemetry', 'https://opentelemetry.io/docs/'), book('Google SRE book - monitoring', 'https://sre.google/sre-book/monitoring-distributed-systems/')]
        },
        {
          id: 'security-at-scale',
          title: 'Security',
          description: 'Auth at the edge, secrets, TLS everywhere, least privilege, and DDoS protection.',
          optional: true,
          resources: [link('Security (System Design Primer)', `${PRIMER}#security`), docs('OWASP Cheat Sheet Series', 'https://cheatsheetseries.owasp.org/')]
        },
        {
          id: 'sd-more',
          title: 'Keep going',
          description: 'Worked examples - URL shortener, feed, chat, search - and the full community roadmap.',
          resources: [roadmapSh('system-design'), link('System design interview questions (Primer)', `${PRIMER}#system-design-interview-questions-with-solutions`), practice('Devlingo Stage 09 - System Design', '/dashboard/learn')]
        }
      ]
    }
  ]
};
