import { Challenge } from '../../types';

/**
 * Stage 09 - System Design, batch A.
 * Caching and invalidation, cache stampede, load balancing, scaling,
 * the CAP theorem, and queues with back-pressure.
 */
export const challenges: Challenge[] = [
  {
    id: 'stage-9-a01',
    stageId: 'stage-9',
    title: 'Name the caching strategy',
    type: 'quiz',
    difficulty: 'easy',
    language: 'javascript',
    prompt: 'Which caching strategy does this read path implement?',
    codeSnippet:
      'async function getUser(id) {\n' +
      '  const hit = await cache.get("user:" + id);\n' +
      '  if (hit) return hit;\n' +
      '\n' +
      '  const user = await db.findUser(id);\n' +
      '  await cache.set("user:" + id, user, { ttl: 300 });\n' +
      '  return user;\n' +
      '}',
    options: [
      'Cache-aside: the application checks the cache and loads from the database on a miss',
      'Read-through: the cache client owns the miss path and loads from the database itself',
      'Write-through: every write updates the cache and the database in one operation',
      'Write-behind: writes land in the cache first and are flushed to the database later'
    ],
    correctIndex: 0,
    hints: [
      'Look at who is responsible for talking to the database on a miss.',
      'Nothing here is writing new data, so the write strategies are not in play.'
    ],
    explanation:
      'This is cache-aside (lazy loading): the application code, not the cache, decides to query the database on a miss and then populates the cache. In read-through the cache library owns that miss path, so the application only ever calls the cache.',
    xpReward: 40,
    tags: ['caching', 'cache-aside', 'strategies']
  },
  {
    id: 'stage-9-a02',
    stageId: 'stage-9',
    title: 'Absolute TTL and database reads',
    type: 'output_prediction',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'clock is a fake timestamp in seconds. What are the four printed lines, in order?',
    codeSnippet:
      'const cache = new Map();\n' +
      'let clock = 0;\n' +
      'let dbReads = 0;\n' +
      '\n' +
      'function read(key) {\n' +
      '  const e = cache.get(key);\n' +
      '  if (e && e.expires > clock) return e.value;\n' +
      '  dbReads++;\n' +
      '  cache.set(key, { value: "v" + dbReads, expires: clock + 20 });\n' +
      '  return "v" + dbReads;\n' +
      '}\n' +
      '\n' +
      'console.log(read("a"));\n' +
      'clock = 15;\n' +
      'console.log(read("a"));\n' +
      'clock = 25;\n' +
      'console.log(read("a"));\n' +
      'console.log("dbReads: " + dbReads);',
    options: [
      'v1, v1, v2, dbReads: 2',
      'v1, v2, v3, dbReads: 3',
      'v1, v1, v1, dbReads: 1',
      'v1, v1, v1, dbReads: 2'
    ],
    correctIndex: 0,
    hints: [
      'Check whether a cache hit ever rewrites the stored expires value.',
      'Work out expires for each write, then compare it with clock at each read.'
    ],
    explanation:
      'The first read misses, stores v1 with expires 20, and prints v1. At clock 15 the entry is still live (20 > 15) so it is served from cache with no database read. At clock 25 it has expired, so a second database read produces v2. The TTL is absolute, not sliding: a cache hit never extends the expiry.',
    xpReward: 70,
    tags: ['caching', 'ttl', 'invalidation']
  },
  {
    id: 'stage-9-a03',
    stageId: 'stage-9',
    title: 'Scaling out a stateful service',
    type: 'quiz',
    difficulty: 'easy',
    language: 'javascript',
    prompt:
      'Four replicas of this service now run behind a round-robin load balancer, and GET /me usually answers with null. What is the cause, and the fix?',
    codeSnippet:
      'const sessions = new Map();  // lives in this process only\n' +
      '\n' +
      'app.post("/login", (req, res) => {\n' +
      '  const token = createToken();\n' +
      '  sessions.set(token, req.body.userId);\n' +
      '  res.json({ token });\n' +
      '});\n' +
      '\n' +
      'app.get("/me", (req, res) => {\n' +
      '  const token = req.header("token");\n' +
      '  res.json({ userId: sessions.get(token) || null });\n' +
      '});',
    options: [
      'Each replica has its own sessions Map; move session state into a shared store such as Redis',
      'The load balancer strips custom headers, so the token never arrives; forward the token header',
      'Four replicas quadruple memory use and the Map gets evicted; give each replica a larger heap',
      'Round-robin spreads load unevenly; least-connections would pin each user to one replica'
    ],
    correctIndex: 0,
    hints: [
      'Ask what the login request wrote, and where exactly that data lives.',
      'A plain round-robin balancer has no idea which replica served a user last.'
    ],
    explanation:
      'Each replica is a separate process with its own heap, so the Map written during login exists only on the replica that handled it. Round-robin sends the follow-up request to a different replica, whose Map has never seen that token, so the lookup misses. Moving session state to a store every replica can reach makes the replicas stateless and interchangeable.',
    xpReward: 40,
    tags: ['scaling', 'horizontal-scaling', 'statelessness']
  },
  {
    id: 'stage-9-a04',
    stageId: 'stage-9',
    title: 'Round-robin with a health check',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'javascript',
    prompt:
      'Fill in the blanks so the picker scans the pool once, wrapping around from the start index, and returns null when every backend is unhealthy.',
    codeSnippet:
      'function nextHealthy(pool, start) {\n' +
      '  for (let step = 0; step < pool.length; step++) {\n' +
      '    const server = pool[(start + step) ___ pool.length];\n' +
      '    if (server.healthy) return server;\n' +
      '  }\n' +
      '  return ___;\n' +
      '}',
    blanks: [
      { answer: '%', choices: ['%', '/', '+', '-'] },
      { answer: 'null', choices: ['null', '0', 'pool[0]', 'start'] }
    ],
    hints: [
      'The index has to wrap back to 0 once it walks past the end of the pool.',
      'The loop runs exactly pool.length times, so falling out of it means nothing was healthy.'
    ],
    explanation:
      'Round-robin advances a counter and maps it onto the pool with modulo, so index pool.length wraps back to 0. Bounding the scan at pool.length stops it looping forever when every backend is failing its health check, and returning null lets the caller shed the request instead of routing to a dead server.',
    xpReward: 40,
    tags: ['load-balancing', 'round-robin', 'health-checks']
  },
  {
    id: 'stage-9-a05',
    stageId: 'stage-9',
    title: 'Cache-aside write path',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'javascript',
    prompt:
      'Complete the write path so a stale price cannot outlive the update. The database is the source of truth.',
    codeSnippet:
      'async function setPrice(sku, price) {\n' +
      '  await ___.update(sku, price);\n' +
      '  await cache.___("price:" + sku);\n' +
      '}',
    blanks: [
      { answer: 'db', choices: ['db', 'cache', 'queue'] },
      { answer: 'del', choices: ['set', 'del', 'get', 'expire'] }
    ],
    hints: [
      'Only one of the two writes is durable; decide which one has to happen first.',
      'Ask what two overlapping setPrice calls for the same sku could leave behind in the cache.'
    ],
    explanation:
      'Doing the durable write first means a crash between the steps only leaves a stale cache entry, which its TTL will clear; the other order can lose the price update entirely. The second step removes the key rather than overwriting it because two concurrent writers that each store their own value can interleave and leave the loser cached indefinitely, whereas a delete just forces the next read to repopulate from the database.',
    xpReward: 40,
    tags: ['caching', 'invalidation', 'cache-aside']
  },
  {
    id: 'stage-9-a06',
    stageId: 'stage-9',
    title: 'Order the stampede-safe read',
    type: 'pseudocode_order',
    difficulty: 'hard',
    language: 'pseudocode',
    prompt:
      'A hot key expires and thousands of requests miss at once. Order these lines so exactly one worker rebuilds the entry and the rest wait for it.',
    pseudocodeLines: [
      'READ value FROM cache FOR key',
      'IF value IS PRESENT THEN RETURN value',
      'ACQUIRE THE REBUILD LOCK FOR key, WAITING IF ANOTHER WORKER HOLDS IT',
      'READ value FROM cache AGAIN',
      'IF value IS PRESENT THEN RELEASE THE LOCK AND RETURN value',
      'LOAD value FROM THE DATABASE',
      'WRITE value TO cache WITH A FRESH TTL',
      'RELEASE THE LOCK AND RETURN value'
    ],
    hints: [
      'The fast path, when the key is present, must not touch the lock at all.',
      'Everyone queued behind the lock arrives after the winner has already repopulated the cache.'
    ],
    explanation:
      'The first read keeps ordinary cache hits lock-free. The lock funnels every concurrent miss into a single rebuild, and the second read inside the lock is the critical step: without it, each waiter would query the database again after the winner had already written the value. Releasing the lock only after the cache write means no waiter can observe an empty cache.',
    xpReward: 110,
    tags: ['cache-stampede', 'locking', 'caching']
  },
  {
    id: 'stage-9-a07',
    stageId: 'stage-9',
    title: 'CAP during a partition',
    type: 'multi_select',
    difficulty: 'medium',
    language: 'pseudocode',
    prompt:
      'A network partition splits a replicated key-value store into two halves that cannot reach each other. Select every statement that is true.',
    options: [
      'A CP store refuses reads or writes on at least one side rather than answer from a replica it cannot confirm',
      'An AP store keeps answering on both sides and may serve values that disagree until the partition heals',
      'A CA store is a realistic choice for a cluster spread across several data centres',
      'Partition tolerance can be dropped once the network hardware is reliable enough',
      'While no partition exists, a CP store can serve both reads and writes normally',
      'CAP says a distributed system may provide only one of consistency, availability and partition tolerance'
    ],
    correctIndices: [0, 1, 4],
    hints: [
      'CAP only forces a choice while the partition is actually happening.',
      'Any system that talks over a network will eventually see a partition, so P is not optional.'
    ],
    explanation:
      'CAP is a statement about behaviour during a partition: you must give up either consistency or availability while the halves cannot talk. Partitions are a fact of networks rather than a design option, so CA is not something you can build across machines, and outside a partition a CP system is free to be both consistent and available.',
    xpReward: 70,
    tags: ['cap-theorem', 'consistency', 'availability']
  },
  {
    id: 'stage-9-a08',
    stageId: 'stage-9',
    title: 'Least-connections balancer',
    type: 'code_runner',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'Return the name of the healthy backend with the fewest active connections. On a tie, return the one that appears first in the list. Return null when no backend is healthy.',
    starterCode:
      'function pickServer(servers) {\n' +
      '  // your code here\n' +
      '  return null;\n' +
      '}',
    entryFunction: 'pickServer',
    testCases: [
      {
        input:
          '[{ name: "a", connections: 5, healthy: true }, { name: "b", connections: 2, healthy: true }]',
        expected: '"b"'
      },
      {
        input:
          '[{ name: "a", connections: 3, healthy: true }, { name: "b", connections: 3, healthy: true }]',
        expected: '"a"'
      },
      {
        input:
          '[{ name: "a", connections: 9, healthy: true }, { name: "b", connections: 0, healthy: false }]',
        expected: '"a"'
      },
      {
        input: '[{ name: "a", connections: 1, healthy: false }]',
        expected: 'null'
      }
    ],
    solutionCode:
      'function pickServer(servers) {\n' +
      '  let best = null;\n' +
      '  for (const s of servers) {\n' +
      '    if (!s.healthy) continue;\n' +
      '    if (best === null || s.connections < best.connections) {\n' +
      '      best = s;\n' +
      '    }\n' +
      '  }\n' +
      '  return best === null ? null : best.name;\n' +
      '}',
    hints: [
      'Skip unhealthy backends before you compare connection counts.',
      'Using a strict less-than keeps the first backend on a tie.'
    ],
    explanation:
      'Least-connections routes to whichever healthy backend is currently doing the least work, which handles uneven request costs far better than round-robin. Comparing with < rather than <= preserves the first entry on a tie, and skipping unhealthy backends first stops a failing server from looking attractive precisely because it is serving nothing.',
    xpReward: 70,
    tags: ['load-balancing', 'least-connections', 'health-checks']
  },
  {
    id: 'stage-9-a09',
    stageId: 'stage-9',
    title: 'Bounded queue with back-pressure',
    type: 'code_runner',
    difficulty: 'hard',
    language: 'javascript',
    prompt:
      'Simulate a bounded queue tick by tick. For each count in arrivals, admit as many messages as fit within capacity and count the rest as rejected, then let the consumer remove up to drainRate messages. Return { depth, rejected } after the last tick.',
    starterCode:
      'function simulateQueue(capacity, drainRate, arrivals) {\n' +
      '  let depth = 0;\n' +
      '  let rejected = 0;\n' +
      '  // your code here\n' +
      '  return { depth, rejected };\n' +
      '}',
    entryFunction: 'simulateQueue',
    testCases: [
      { input: '5, 2, [3, 3, 3]', expected: '{ "depth": 3, "rejected": 0 }' },
      { input: '2, 1, [5, 5]', expected: '{ "depth": 1, "rejected": 7 }' },
      { input: '10, 4, [4, 4, 4]', expected: '{ "depth": 0, "rejected": 0 }' },
      { input: '3, 0, [1, 1, 1, 1]', expected: '{ "depth": 3, "rejected": 1 }' }
    ],
    solutionCode:
      'function simulateQueue(capacity, drainRate, arrivals) {\n' +
      '  let depth = 0;\n' +
      '  let rejected = 0;\n' +
      '  for (const n of arrivals) {\n' +
      '    const room = capacity - depth;\n' +
      '    const accepted = Math.min(n, room);\n' +
      '    depth += accepted;\n' +
      '    rejected += n - accepted;\n' +
      '    depth -= Math.min(depth, drainRate);\n' +
      '  }\n' +
      '  return { depth, rejected };\n' +
      '}',
    hints: [
      'Room left in the queue is capacity minus the current depth, never a negative number.',
      'The consumer cannot drain more messages than the queue is holding.'
    ],
    explanation:
      'A bounded queue is what turns an overloaded system into a degraded one instead of a dead one: once depth reaches capacity the producer is rejected, which is back-pressure. An unbounded queue would accept everything, grow until memory runs out, and hide the fact that arrivals permanently exceed drainRate.',
    xpReward: 110,
    tags: ['message-queues', 'back-pressure', 'capacity']
  },
  {
    id: 'stage-9-a10',
    stageId: 'stage-9',
    title: 'Fix the LRU eviction order',
    type: 'debug',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'This LRU cache should evict the least recently used key, but it evicts hot keys instead. Given a capacity and a list of accessed keys, return the remaining keys from oldest to newest. Find the bug and fix it.',
    starterCode:
      'function lruCache(capacity, accesses) {\n' +
      '  const cache = new Map();\n' +
      '  for (const key of accesses) {\n' +
      '    cache.set(key, true);\n' +
      '    if (cache.size > capacity) {\n' +
      '      const oldest = cache.keys().next().value;\n' +
      '      cache.delete(oldest);\n' +
      '    }\n' +
      '  }\n' +
      '  return Array.from(cache.keys());\n' +
      '}',
    entryFunction: 'lruCache',
    testCases: [
      { input: '2, ["a", "b", "a", "c"]', expected: '["a", "c"]' },
      { input: '3, ["x", "y", "z"]', expected: '["x", "y", "z"]' },
      { input: '1, ["a", "b", "b", "c"]', expected: '["c"]' },
      { input: '3, ["a", "b", "c", "a", "d"]', expected: '["c", "a", "d"]' }
    ],
    solutionCode:
      'function lruCache(capacity, accesses) {\n' +
      '  const cache = new Map();\n' +
      '  for (const key of accesses) {\n' +
      '    if (cache.has(key)) cache.delete(key);\n' +
      '    cache.set(key, true);\n' +
      '    if (cache.size > capacity) {\n' +
      '      const oldest = cache.keys().next().value;\n' +
      '      cache.delete(oldest);\n' +
      '    }\n' +
      '  }\n' +
      '  return Array.from(cache.keys());\n' +
      '}',
    hints: [
      'A Map iterates its keys in insertion order. What does set do to a key that is already there?',
      'Trace capacity 2 with a, b, a, c and note which key gets thrown away.'
    ],
    explanation:
      'Map iterates in insertion order, so the first key it yields is the oldest insertion, not the least recently used one. Calling set on a key that already exists updates the value but leaves its position alone, so re-reading a key never refreshes it. Deleting and re-inserting on every access moves the key to the back and makes the front genuinely the least recently used entry.',
    xpReward: 70,
    tags: ['caching', 'lru', 'eviction', 'debugging']
  }
];
