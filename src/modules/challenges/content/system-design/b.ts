import { Challenge } from '@/types';

/**
 * Stage 09 - System Design, batch B.
 * Sharding and partition keys, replication and read replicas, eventual
 * consistency, idempotency keys, rate limiting, observability and
 * circuit breakers.
 */
export const challenges: Challenge[] = [
  {
    id: 'stage-9-b01',
    stageId: 'stage-9',
    title: 'Picking a partition key',
    type: 'quiz',
    difficulty: 'easy',
    language: 'javascript',
    prompt:
      'Orders are spread over 8 shards by this function, and two shards are permanently overloaded. What is happening, and what fixes it?',
    codeSnippet:
      '// 8 order shards, chosen by customer\n' +
      'function shardFor(order) {\n' +
      '  return hash(order.customerId) % 8;\n' +
      '}\n' +
      '\n' +
      '// Traffic report for last month:\n' +
      '//   3 enterprise customers -> 71% of all orders\n' +
      '//   40,000 other customers -> 29% of all orders',
    options: [
      'Every order for one customer lands on one shard, so three skewed keys own most of the data; partition on a high-cardinality key such as orderId instead',
      'The hash function is not uniform enough; replacing it with order.customerId.length % 8 spreads the customers evenly',
      'A shard count of 8 is not prime, so the modulo clusters hash values; switching to % 7 removes the hot shards',
      'The cluster is simply too small; adding more shards redistributes the enterprise customers across the new nodes'
    ],
    correctIndex: 0,
    hints: [
      'Ask how many distinct shard numbers those three enterprise customers can possibly produce.',
      'A perfectly uniform hash still sends every row with the same key value to the same place.'
    ],
    explanation:
      'A partition key is only as even as the distribution of its values: all of one customer id hashes to a single shard, so a skewed customer mix produces hot shards no matter how good the hash or how many shards you add. Partitioning on orderId gives many distinct values with even weight, at the cost of turning "all orders for this customer" into a scatter-gather query across every shard.',
    xpReward: 40,
    tags: ['sharding', 'partition-key', 'hot-shard']
  },
  {
    id: 'stage-9-b02',
    stageId: 'stage-9',
    title: 'Adding a shard to a modulo scheme',
    type: 'output_prediction',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'The cluster grows from 4 shards to 5. What does this program print?',
    codeSnippet:
      'const keys = ["u1", "u2", "u3", "u4"];\n' +
      '\n' +
      'function h(s) {\n' +
      '  let n = 0;\n' +
      '  for (const ch of s) n += ch.charCodeAt(0);\n' +
      '  return n;  // u=117, "1"=49, "2"=50, "3"=51, "4"=52\n' +
      '}\n' +
      '\n' +
      'const before = keys.map(k => h(k) % 4);\n' +
      'const after = keys.map(k => h(k) % 5);\n' +
      'let moved = 0;\n' +
      'for (let i = 0; i < keys.length; i++) {\n' +
      '  if (before[i] !== after[i]) moved++;\n' +
      '}\n' +
      'console.log(before.join(",") + " | " + after.join(",") + " | " + moved);',
    options: [
      '2,3,0,1 | 1,2,3,4 | 1',
      '2,3,0,1 | 1,2,3,4 | 2',
      '2,3,0,1 | 2,3,0,1 | 0',
      '2,3,0,1 | 1,2,3,4 | 4'
    ],
    correctIndex: 3,
    hints: [
      'The four hashes are 166, 167, 168 and 169. Work out each remainder twice.',
      'Do not assume that adding one shard only moves the keys that belong on it.'
    ],
    explanation:
      'The hashes are 166 to 169, giving 2,3,0,1 under mod 4 and 1,2,3,4 under mod 5, so all four keys change shard. Modulo sharding ties every key to the shard count, and a key only survives a resize when h % 4 equals h % 5, which is true for just 4 of every 20 hash values. Consistent hashing exists precisely to avoid this: it moves only about K/N keys when a node joins.',
    xpReward: 70,
    tags: ['sharding', 'resharding', 'consistent-hashing']
  },
  {
    id: 'stage-9-b03',
    stageId: 'stage-9',
    title: 'Routing reads to a replica',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'javascript',
    prompt:
      'Fill in the blanks so writes always reach the primary, a user who just wrote still sees their own change, and every other read is served by a replica.',
    codeSnippet:
      'const REPLICA_LAG_MS = 500;\n' +
      '\n' +
      'function route(query, session, now) {\n' +
      '  if (query.isWrite) return "___";\n' +
      '  if (now - session.lastWriteAt < REPLICA_LAG_MS) return "___";\n' +
      '  return "___";\n' +
      '}',
    blanks: [
      { answer: 'primary', choices: ['primary', 'replica'] },
      { answer: 'primary', choices: ['primary', 'replica'] },
      { answer: 'replica', choices: ['primary', 'replica'] }
    ],
    hints: [
      'Only one node in the cluster is allowed to accept writes.',
      'The middle branch exists because a replica may not have the newest write yet.'
    ],
    explanation:
      'Replicas apply the primary log asynchronously, so a read issued moments after a write can still return the old row. Writes go to the primary, and pinning that one session to the primary for longer than the usual lag buys read-your-writes consistency, while every other read still fans out to the replicas and scales the read load.',
    xpReward: 40,
    tags: ['replication', 'read-replicas', 'read-your-writes']
  },
  {
    id: 'stage-9-b04',
    stageId: 'stage-9',
    title: 'One read in twenty is stale',
    type: 'quiz',
    difficulty: 'easy',
    language: 'javascript',
    prompt:
      'Users rename their profile and are redirected straight to a page that reads it back. About one request in twenty shows the old name, and reloading always fixes it. What is the cause?',
    codeSnippet:
      '// POST /profile  -> primary\n' +
      'await db.primary.updateUser(userId, { name });\n' +
      'res.redirect("/profile");\n' +
      '\n' +
      '// GET /profile   -> one of three async replicas\n' +
      'const row = await db.replica.findUser(userId);\n' +
      'res.render("profile", row);',
    options: [
      'The write is never committed for those users, so the update is lost; wrapping the update in an explicit transaction fixes it',
      'The replicas apply the primary log asynchronously, so a read that arrives inside the replication window returns the pre-update row and converges a moment later',
      'The browser is caching the redirect target, so the old page is re-rendered from disk without hitting the server',
      'The replicas have permanently diverged from the primary and need a full resync before they can serve reads again'
    ],
    correctIndex: 1,
    hints: [
      'A reload always shows the new name, so the data really did reach durable storage.',
      'Ask how long it takes for a committed write to appear on a replica.'
    ],
    explanation:
      'This is ordinary replication lag, and the symptom of eventual consistency: given no new writes, every replica converges on the primary state, but there is a window in which one has not caught up. Nothing is lost or corrupted, so a resync or a transaction changes nothing; the fix is to route the reads that need the newest data to the primary.',
    xpReward: 40,
    tags: ['eventual-consistency', 'replication-lag', 'replication']
  },
  {
    id: 'stage-9-b05',
    stageId: 'stage-9',
    title: 'What an idempotency key guarantees',
    type: 'multi_select',
    difficulty: 'medium',
    language: 'bash',
    prompt:
      'A payments API accepts an Idempotency-Key header so a retried charge never bills twice. Select every statement that is true.',
    codeSnippet:
      'curl -X POST https://api.example.com/v1/charges \\\n' +
      '  -H "Idempotency-Key: 3f9a8c21-4e07-b5d6-11f2" \\\n' +
      '  -H "Content-Type: application/json" \\\n' +
      '  -d "{\\"amount\\": 4200, \\"currency\\": \\"usd\\"}"\n' +
      '\n' +
      '# the client sees a timeout and sends the exact same request again',
    options: [
      'The server has to store the key alongside the response it produced, so a replay can return that original response instead of charging again',
      'The client generates the key once, before the first attempt, and reuses it for every retry of that same request',
      'A replay that reuses the key with a different body should be rejected outright, because it is not the same request and must not receive the cached response',
      'GET is already idempotent, so attaching a key to a GET is what makes retrying it safe',
      'Generating a fresh key on each retry is fine as long as the request body is byte-for-byte identical',
      'The key can be skipped if the client only retries after a network timeout, because a timeout means the request never reached the server'
    ],
    correctIndices: [0, 1, 2],
    hints: [
      'Ask what the server must remember, and for how long, for a replay to be answerable.',
      'A timeout tells you nothing about whether the server processed the request.'
    ],
    explanation:
      'Idempotency is implemented by remembering the key and the outcome it produced: the first request does the work and stores its response, and any replay of that key returns the stored response. That only works if the client reuses one key across retries, and the server must also fingerprint the body, because a replay with a different payload under the same key is a client bug that should fail (typically 422), not silently receive someone else\'s charge. A timeout is ambiguous by nature, which is exactly why the key is needed, and GET was safe to retry before any header existed.',
    xpReward: 70,
    tags: ['idempotency', 'retries', 'apis']
  },
  {
    id: 'stage-9-b06',
    stageId: 'stage-9',
    title: 'Order the idempotent charge handler',
    type: 'pseudocode_order',
    difficulty: 'hard',
    language: 'pseudocode',
    prompt:
      'Order these lines so a charge endpoint is safe to retry, even when two retries of the same request arrive at the same instant.',
    pseudocodeLines: [
      'READ the Idempotency-Key header FROM the request',
      'IF the key IS MISSING THEN REJECT WITH 400 AND STOP',
      'TRY TO INSERT a row FOR the key WITH status "in_progress"',
      'IF THE INSERT HIT THE UNIQUE CONSTRAINT THEN RETURN the stored response, OR 409 IF that row IS STILL "in_progress"',
      'CHARGE the card, PASSING the key AS the provider reference',
      'STORE the response AND SET the key row TO status "done"',
      'RETURN the response'
    ],
    hints: [
      'Nothing can happen before the handler knows which key it is being asked to replay.',
      'The claim on the key has to be made before the money moves, not after.'
    ],
    explanation:
      'Claiming the key with an insert that a unique constraint can reject is the whole trick: the database decides which of two racing retries is the first attempt, and the loser either returns the stored response or, if the winner has not finished yet, a 409 telling the client to retry shortly rather than charge again. Charging before the key row exists would leave a successful charge with nothing recording it, so a later retry would bill the card a second time.',
    xpReward: 110,
    tags: ['idempotency', 'retries', 'payments']
  },
  {
    id: 'stage-9-b07',
    stageId: 'stage-9',
    title: 'Token bucket rate limiter',
    type: 'code_runner',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'Implement a token bucket. The bucket holds capacity tokens and starts full at time 0. requests is a non-decreasing list of arrival times in seconds. Before each request, add (elapsed * refillPerSec) tokens, capped at capacity. Allow the request and spend one token when at least one token is available. Return how many requests were allowed.',
    starterCode:
      'function tokenBucket(capacity, refillPerSec, requests) {\n' +
      '  let tokens = capacity;\n' +
      '  let last = 0;\n' +
      '  // your code here\n' +
      '  return 0;\n' +
      '}',
    entryFunction: 'tokenBucket',
    testCases: [
      { input: '3, 1, [0, 0, 0, 0]', expected: '3' },
      { input: '2, 1, [0, 0, 0, 1, 1]', expected: '3' },
      { input: '5, 0, [0, 1, 2, 3, 4, 5, 6]', expected: '5' },
      { input: '4, 2, [0, 10, 10, 10, 10, 10]', expected: '5' },
      { input: '1, 0.5, [0, 1, 2, 4]', expected: '3' },
      { input: '1, 0.5, [0, 1, 2, 3]', expected: '2' }
    ],
    solutionCode:
      'function tokenBucket(capacity, refillPerSec, requests) {\n' +
      '  let tokens = capacity;\n' +
      '  let last = 0;\n' +
      '  let allowed = 0;\n' +
      '  for (const t of requests) {\n' +
      '    tokens = Math.min(capacity, tokens + (t - last) * refillPerSec);\n' +
      '    last = t;\n' +
      '    if (tokens >= 1) {\n' +
      '      tokens -= 1;\n' +
      '      allowed++;\n' +
      '    }\n' +
      '  }\n' +
      '  return allowed;\n' +
      '}',
    hints: [
      'Refill lazily: instead of a background timer, work out how many tokens accrued since the previous request.',
      'Math.min against capacity is what stops a long idle period from banking unlimited burst.'
    ],
    explanation:
      'A token bucket allows bursts up to capacity and a sustained rate of refillPerSec, which is why the fourth case admits only 4 of the 5 requests that arrive at second 10: the 20 tokens accrued during the idle gap are clamped to capacity, so one request is refused. Refilling lazily on each arrival means the limiter needs no timer, just the last-seen timestamp and the current token count, and a half token is not enough to spend, which is why the last case refuses the requests at seconds 1 and 3.',
    xpReward: 70,
    tags: ['rate-limiting', 'token-bucket', 'throttling']
  },
  {
    id: 'stage-9-b08',
    stageId: 'stage-9',
    title: 'Fix the leaky bucket',
    type: 'debug',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'A leaky bucket drains at a constant leakPerSec and admits a request only if the bucket still has room. After a quiet period this one admits far more requests than capacity should allow. Find the bug and fix it.',
    starterCode:
      'function leakyBucket(capacity, leakPerSec, requests) {\n' +
      '  let level = 0;\n' +
      '  let last = 0;\n' +
      '  let admitted = 0;\n' +
      '  for (const t of requests) {\n' +
      '    level = level - (t - last) * leakPerSec;\n' +
      '    last = t;\n' +
      '    if (level + 1 <= capacity) {\n' +
      '      level += 1;\n' +
      '      admitted++;\n' +
      '    }\n' +
      '  }\n' +
      '  return admitted;\n' +
      '}',
    entryFunction: 'leakyBucket',
    testCases: [
      { input: '2, 1, [0, 0, 0]', expected: '2' },
      { input: '2, 1, [0, 10, 10, 10, 10]', expected: '3' },
      { input: '3, 0, [0, 1, 2, 3, 4]', expected: '3' },
      { input: '1, 2, [0, 5, 5, 6]', expected: '3' },
      { input: '2, 1, [0, 0, 0, 1, 1]', expected: '3' }
    ],
    solutionCode:
      'function leakyBucket(capacity, leakPerSec, requests) {\n' +
      '  let level = 0;\n' +
      '  let last = 0;\n' +
      '  let admitted = 0;\n' +
      '  for (const t of requests) {\n' +
      '    level = Math.max(0, level - (t - last) * leakPerSec);\n' +
      '    last = t;\n' +
      '    if (level + 1 <= capacity) {\n' +
      '      level += 1;\n' +
      '      admitted++;\n' +
      '    }\n' +
      '  }\n' +
      '  return admitted;\n' +
      '}',
    hints: [
      'Trace capacity 2, leak 1, arrivals at 0 then four at second 10, and print level each time.',
      'An empty bucket cannot drain any further than empty.'
    ],
    explanation:
      'Subtracting the elapsed leak without a floor lets level go negative, so an idle gap builds up credit that admits an unbounded burst later. Clamping with Math.max(0, ...) keeps the bucket at empty once it has drained, which is what makes a leaky bucket enforce a smooth output rate instead of the burst a token bucket deliberately permits.',
    xpReward: 70,
    tags: ['rate-limiting', 'leaky-bucket', 'debugging']
  },
  {
    id: 'stage-9-b09',
    stageId: 'stage-9',
    title: 'Instrumenting a cross-service call',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'javascript',
    prompt:
      'Fill in the blanks so the billing span joins the caller trace and the call duration can answer p95 questions later.',
    codeSnippet:
      '// One request, three signals: a span, a metric, a log line.\n' +
      'async function fetchInvoice(req, id) {\n' +
      '  const span = tracer.startSpan("fetchInvoice");\n' +
      '  const started = Date.now();\n' +
      '  const res = await fetch(BILLING_URL + "/invoice/" + id, {\n' +
      '    headers: { "___": req.traceId }\n' +
      '  });\n' +
      '  metrics.___("billing_call_ms", Date.now() - started);\n' +
      '  logger.info("billing call done", { traceId: req.traceId });\n' +
      '  span.end();\n' +
      '  return res.json();\n' +
      '}',
    blanks: [
      {
        answer: 'traceparent',
        choices: ['traceparent', 'content-type', 'authorization', 'user-agent']
      },
      { answer: 'histogram', choices: ['histogram', 'counter', 'gauge', 'increment'] }
    ],
    hints: [
      'The billing service has no way to know which trace it belongs to unless the request tells it.',
      'Ask which metric type still lets you ask for a percentile after the fact.'
    ],
    explanation:
      'A trace only crosses a service boundary if the trace context travels in the outbound request, which is what the standard traceparent header carries; without it the callee starts a fresh, disconnected trace. Durations belong in a histogram because counters and gauges collapse the distribution and cannot answer a p95 question, and stamping the same trace id on the log line is what lets one log entry be pivoted back to its trace.',
    xpReward: 40,
    tags: ['observability', 'tracing', 'metrics', 'logging']
  },
  {
    id: 'stage-9-b10',
    stageId: 'stage-9',
    title: 'Circuit breaker state machine',
    type: 'code_runner',
    difficulty: 'hard',
    language: 'javascript',
    prompt:
      'Implement a circuit breaker over a list of outcomes ("ok" or "fail"), one per attempted call. Start CLOSED. In CLOSED, run the call: "ok" resets the consecutive failure count, "fail" increments it and trips to OPEN once it reaches failureThreshold. While OPEN the next cooldown outcomes are rejected without running. The outcome after those runs as a HALF_OPEN trial: "ok" closes the breaker and resets the count, "fail" reopens it for another cooldown. Return { executed, rejected, state } after the last outcome.',
    starterCode:
      'function circuitBreaker(failureThreshold, cooldown, outcomes) {\n' +
      '  let state = "CLOSED";\n' +
      '  let executed = 0;\n' +
      '  let rejected = 0;\n' +
      '  // your code here\n' +
      '  return { executed, rejected, state };\n' +
      '}',
    entryFunction: 'circuitBreaker',
    testCases: [
      {
        input: '2, 2, ["fail", "fail", "fail", "fail", "ok"]',
        expected: '{ "executed": 3, "rejected": 2, "state": "CLOSED" }'
      },
      {
        input: '2, 1, ["fail", "fail", "ok", "fail", "fail", "fail"]',
        expected: '{ "executed": 4, "rejected": 2, "state": "OPEN" }'
      },
      {
        input: '3, 5, ["ok", "fail", "ok", "fail", "fail", "ok"]',
        expected: '{ "executed": 6, "rejected": 0, "state": "CLOSED" }'
      },
      {
        input: '1, 3, ["fail", "ok", "ok", "ok", "ok"]',
        expected: '{ "executed": 2, "rejected": 3, "state": "CLOSED" }'
      },
      {
        input: '2, 0, ["fail", "fail", "ok"]',
        expected: '{ "executed": 3, "rejected": 0, "state": "CLOSED" }'
      },
      {
        input: '2, 1, ["fail", "fail", "ok", "ok", "fail", "ok"]',
        expected: '{ "executed": 5, "rejected": 1, "state": "CLOSED" }'
      }
    ],
    solutionCode:
      'function circuitBreaker(failureThreshold, cooldown, outcomes) {\n' +
      '  let state = "CLOSED";\n' +
      '  let failures = 0;\n' +
      '  let skipped = 0;\n' +
      '  let executed = 0;\n' +
      '  let rejected = 0;\n' +
      '  for (const outcome of outcomes) {\n' +
      '    if (state === "OPEN") {\n' +
      '      if (skipped < cooldown) {\n' +
      '        skipped++;\n' +
      '        rejected++;\n' +
      '        continue;\n' +
      '      }\n' +
      '      state = "HALF_OPEN";\n' +
      '    }\n' +
      '    executed++;\n' +
      '    if (outcome === "ok") {\n' +
      '      state = "CLOSED";\n' +
      '      failures = 0;\n' +
      '    } else if (state === "HALF_OPEN") {\n' +
      '      state = "OPEN";\n' +
      '      skipped = 0;\n' +
      '      failures = 0;\n' +
      '    } else {\n' +
      '      failures++;\n' +
      '      if (failures >= failureThreshold) {\n' +
      '        state = "OPEN";\n' +
      '        skipped = 0;\n' +
      '        failures = 0;\n' +
      '      }\n' +
      '    }\n' +
      '  }\n' +
      '  return { executed, rejected, state };\n' +
      '}',
    hints: [
      'A rejected call never runs, so it must not touch the failure counter or the executed count.',
      'The trial call is just an ordinary execution whose failure sends the breaker straight back to OPEN, without waiting for the threshold again.'
    ],
    explanation:
      'The breaker exists to stop a caller from queueing work against a dependency that is already down: while OPEN it fails fast instead of burning a timeout per request. The counter must track consecutive failures, so a single success resets it, and the half-open trial is the cheap probe that decides whether the dependency has recovered without letting the full load back in at once.',
    xpReward: 110,
    tags: ['circuit-breaker', 'resilience', 'fault-tolerance']
  }
];
