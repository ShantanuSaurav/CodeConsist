# System Design: scaling without breaking

> System design is deciding where state lives, how work is spread out and what happens when part of it fails. This article covers scaling, load balancing, caching, sharding and replication, consistency, queues, rate limiting, resilience patterns and observability.

## Scaling and statelessness
<!-- tags: scaling, horizontal-scaling, statelessness, system-design, capacity -->

**Vertical scaling** is a bigger machine: simple, but it has a ceiling and a single point of failure. **Horizontal scaling** is more machines behind a load balancer: no ceiling, but every request may land on a different server.

Horizontal scaling only works if servers are **stateless** - nothing a request needs lives only in one server's memory. Session data goes in a shared store (Redis, the database, a signed cookie); uploaded files go to object storage; anything cached locally must be safe to lose. The test: can you kill any one server at random with no user noticing?

**Capacity planning** is arithmetic. Estimate requests per second at peak, multiply by the cost of one request, add headroom (usually 2-3×), and you know how many instances you need and when the database becomes the bottleneck.

## Load balancing and health checks
<!-- tags: load-balancing, round-robin, least-connections, health-checks -->

A load balancer spreads requests over instances. **Round robin** rotates through them - fine when requests cost about the same. **Least connections** sends to the instance with the fewest in-flight requests - better when costs vary. **Consistent hashing** on a key (user id) sends the same user to the same instance, useful for local caches.

**Health checks** are how the balancer knows who to send to. A shallow check (`GET /health` returns 200) catches a dead process; a deep check (can I reach the database?) catches a half-alive one, but if the database has a blip, every instance fails its check at once and the balancer has nobody left - so deep checks should degrade rather than fail. Instances should also drain gracefully on shutdown: stop accepting, finish in-flight requests, exit.

## Caching
<!-- tags: caching, cache-aside, ttl, strategies, invalidation, lru, eviction, cache-stampede, locking -->

A cache trades freshness for speed. **Cache-aside** is the common pattern: look in the cache; on a miss, load from the source, store it, return it.

```javascript
async function getUser(id) {
  const hit = await cache.get(`user:${id}`);
  if (hit) return hit;
  const user = await db.users.find(id);
  await cache.set(`user:${id}`, user, { ttl: 300 });
  return user;
}
```

*Write-through* updates the cache on every write (always fresh, slower writes); *write-behind* batches writes to the source (fast, risks loss).

**Invalidation** is the hard part. A **TTL** bounds staleness without any coordination. Explicit invalidation on write is fresher but every write path must remember to do it. When the cache is full, an **eviction policy** picks the victim - **LRU** (least recently used) is the default because recent access predicts future access well.

A **cache stampede** happens when a popular key expires and thousands of requests miss at once, all hitting the database. Fixes: a short **lock** so one request refreshes while others wait or serve the stale value; *jittered* TTLs so keys do not expire together; refreshing ahead of expiry.

## Sharding and replication
<!-- tags: sharding, partition-key, hot-shard, resharding, consistent-hashing, replication, read-replicas, replication-lag -->

**Replication** copies the same data to several nodes. One primary takes writes; **read replicas** serve reads and stand by to take over. Reads scale out, writes do not.

**Sharding** splits data across nodes by a **partition key** - user id, tenant, region - so each node holds a slice. Writes scale out too, but any query without the key must ask every shard, and cross-shard transactions are painful. Choose a key with high cardinality and even load; a **hot shard** (one celebrity user, one busy tenant) defeats the point. **Consistent hashing** maps keys to a ring so that adding or removing a node moves only ~1/n of the keys instead of reshuffling everything - which is what makes **resharding** survivable.

Replication is asynchronous in practice, so a replica lags the primary by milliseconds to seconds. That is **replication lag**, and it is where "I just saved this and it is gone" bugs come from.

## Consistency, CAP and read-your-writes
<!-- tags: cap-theorem, consistency, availability, eventual-consistency, read-your-writes -->

The **CAP theorem**: when the network partitions, a distributed store must choose between staying **consistent** (every read sees the latest write, so some nodes refuse to answer) and staying **available** (every node answers, so some answers are stale). Partitions are not optional, so the real choice is CP or AP - and most systems make it per feature: a bank balance is CP, a like count is AP.

**Eventual consistency** means replicas converge if writes stop. It is fine for feeds and counters and wrong for inventory and money. **Read-your-writes** is the minimum users notice: after *I* write, *my* reads must see it. Achieve it by routing a user's reads to the primary for a few seconds after their write, or by sending the write's version along and waiting for a replica that has it.

## Message queues and back-pressure
<!-- tags: message-queues, back-pressure -->

A queue decouples producers from consumers: the web tier enqueues "send this email" in a millisecond and returns; workers drain the queue at their own pace. Queues absorb bursts, let you retry failures, and let you scale the slow part independently.

They introduce **at-least-once delivery** - a worker can crash after doing the work but before acknowledging, so the message is redelivered. Consumers must be idempotent. **Back-pressure** is what happens when producers outrun consumers for long: the queue grows without bound unless something pushes back - bounded queues, rejecting or slowing producers, shedding low-priority work. A queue that only ever grows is an outage with a delay.

## Idempotency and retries
<!-- tags: idempotency, retries, apis, payments -->

Networks fail after the request was processed as often as before. A client that times out does not know which, so it retries - and a non-idempotent operation runs twice: two charges, two emails.

The fix is an **idempotency key**: the client generates a unique id per logical operation and sends it with every attempt. The server stores the result under that key the first time and returns the stored result for repeats. Payment APIs are built this way. Retry with **exponential back-off and jitter** - `base × 2^attempt + random` - so a thousand clients retrying do not synchronise into waves.

## Rate limiting and throttling
<!-- tags: rate-limiting, token-bucket, leaky-bucket, sliding-window, throttling -->

Rate limiting protects a service from any single client. Algorithms:

- **Token bucket** - tokens refill at a steady rate up to a capacity; each request spends one. Allows bursts, caps the average.
- **Leaky bucket** - requests queue and drain at a fixed rate. Smooths bursts into a steady stream.
- **Fixed window** - count per minute. Simple, but allows 2× the limit across a window boundary.
- **Sliding window** - count requests in the last N seconds, or weight the previous window. Accurate, slightly more state.

Return `429` with `Retry-After`. In a distributed system the counter must live somewhere shared (Redis with atomic increments) or be approximate per node.

## Resilience: timeouts, circuit breakers, bulkheads
<!-- tags: circuit-breaker, resilience, fault-tolerance -->

Every remote call needs a **timeout**; without one, a slow dependency ties up every thread and a small failure becomes a total one. A **circuit breaker** watches failures to a dependency and, past a threshold, *opens* - calls fail immediately without trying - then after a cool-off lets a probe through and closes again if it succeeds. It turns a hanging dependency into a fast, handled error and gives it room to recover. **Bulkheads** isolate resource pools per dependency so one slow service cannot exhaust the connections another needs.

Design for **graceful degradation**: recommendations unavailable? Show the page without them. Search down? Show cached results with a notice. A system that is 90% working is not down.

## Observability: logs, metrics, traces
<!-- tags: observability, logging, metrics, tracing -->

**Logs** are events with context - structured (JSON with fields) so they can be searched, and carrying a request id so one request's lines can be pulled together. **Metrics** are numbers over time - request rate, error rate, latency percentiles, queue depth - cheap to store and the basis for alerts. **Traces** follow one request across services, showing where the time went.

The four golden signals: latency, traffic, errors, saturation. Alert on symptoms users feel (error rate, p99 latency) rather than causes (CPU), and make every alert actionable - if nobody would do anything about it at 3 a.m., it is a dashboard, not an alert.

## Debugging distributed systems
<!-- tags: debugging -->

Start from the user's symptom and the request id. Check the trace to find which hop is slow or failing. Compare metrics before and after the deploy or the traffic change. Suspect the network, clocks and retries before suspecting the code: most distributed bugs are a timeout that was too short, a retry that was not idempotent, or two nodes that disagreed about the time.
