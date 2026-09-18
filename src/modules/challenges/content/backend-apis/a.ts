import { Challenge } from '@/types';

/**
 * Stage 06 - Backend & APIs, batch A.
 * HTTP method semantics, status codes, idempotency and safety, REST resource
 * design, parameter placement, content negotiation and caching headers.
 */
export const challenges: Challenge[] = [
  {
    id: 'stage-6-a01',
    stageId: 'stage-6',
    title: 'A method used against its meaning',
    type: 'quiz',
    difficulty: 'easy',
    language: 'bash',
    prompt:
      'These four requests come from the shop front end. Which one uses an HTTP method against its defined meaning?',
    codeSnippet:
      'GET    /api/carts/17/items?inStock=true\n' +
      'POST   /api/carts/17/items\n' +
      'DELETE /api/carts/17/items/9\n' +
      'GET    /api/carts/17/items/9/delete',
    options: [
      'GET /api/carts/17/items/9/delete',
      'GET /api/carts/17/items?inStock=true',
      'POST /api/carts/17/items',
      'DELETE /api/carts/17/items/9'
    ],
    correctIndex: 0,
    hints: [
      'Read what each path would actually make the server do, then check whether that method is allowed to do it.',
      'Ask which methods a browser, a crawler or a link prefetcher may fire on its own.'
    ],
    explanation:
      'GET is a safe method: it must only read, never change stored state. The last request hides a removal behind a GET, so a crawler or a link prefetcher walking the page would empty the cart without anyone clicking. That removal is already available as DELETE /api/carts/17/items/9, which is the method whose meaning matches the effect.',
    xpReward: 40,
    tags: ['http-methods', 'safety', 'rest']
  },
  {
    id: 'stage-6-a02',
    stageId: 'stage-6',
    title: 'The status line for a fresh resource',
    type: 'quiz',
    difficulty: 'easy',
    language: 'bash',
    prompt:
      'The server stores this article immediately and wants to tell the client where it now lives. Which response should it send?',
    codeSnippet:
      'POST /api/articles HTTP/1.1\n' +
      'Host: api.blog.dev\n' +
      'Content-Type: application/json\n' +
      '\n' +
      '{"title": "Caching 101", "body": "..."}',
    options: [
      'HTTP/1.1 200 OK with the article in the body',
      'HTTP/1.1 201 Created with Location: /api/articles/482',
      'HTTP/1.1 202 Accepted with Location: /api/articles/482',
      'HTTP/1.1 204 No Content with Location: /api/articles/482'
    ],
    correctIndex: 1,
    hints: [
      'Two of these codes describe work that is not finished yet, or a body that is deliberately not there.',
      'The client should not have to guess the new URL, so weigh what each response carries as well as its number.'
    ],
    explanation:
      '201 Created is the status for a request that brought a new resource into existence, and its Location header gives the URL of that resource. 200 OK reports a result without announcing a new resource, 202 Accepted means the work was only queued, and 204 promises there is no body at all.',
    xpReward: 40,
    tags: ['status-codes', 'post', 'rest']
  },
  {
    id: 'stage-6-a03',
    stageId: 'stage-6',
    title: 'What the URL API hands back',
    type: 'output_prediction',
    difficulty: 'medium',
    language: 'javascript',
    prompt: 'What do these three log statements print?',
    codeSnippet:
      'const url = new URL(\n' +
      '  "https://api.shop.dev/orders/42?page=2&sort=date"\n' +
      ');\n' +
      'console.log(url.pathname);\n' +
      'console.log(url.searchParams.get("page") + 1);\n' +
      'console.log(url.searchParams.get("limit"));',
    options: [
      '/orders/42 then 3 then null',
      '/orders/42 then 21 then undefined',
      '/orders/42 then 21 then null',
      'https://api.shop.dev/orders/42 then 3 then null'
    ],
    correctIndex: 2,
    hints: [
      'Decide what type each getter hands back before you decide whether + adds or joins.',
      'A parameter that is not in the query string still reports a value rather than throwing.'
    ],
    explanation:
      'pathname is only the path part, so the origin is not included. Query values arrive as text, so "2" + 1 concatenates into "21" instead of adding, and a missing key returns null rather than undefined. Server code must parse query parameters before doing arithmetic on them.',
    xpReward: 70,
    tags: ['query-params', 'url', 'parsing']
  },
  {
    id: 'stage-6-a04',
    stageId: 'stage-6',
    title: 'Safe, idempotent, or neither',
    type: 'multi_select',
    difficulty: 'medium',
    language: 'bash',
    prompt:
      'These endpoints back an invoicing API. Which statements about method safety and idempotency are true? Select every one that applies.',
    codeSnippet:
      'GET    /api/invoices/88\n' +
      'PUT    /api/invoices/88\n' +
      'PATCH  /api/invoices/88\n' +
      'DELETE /api/invoices/88\n' +
      'POST   /api/invoices',
    options: [
      'GET is both safe and idempotent, because every safe method is idempotent as well.',
      'POST is idempotent because servers deduplicate identical request bodies for you.',
      'GET is still safe when the server logs the request, because the client did not ask for that write.',
      'PATCH is always idempotent because it only carries the fields that changed.',
      'DELETE is idempotent even though the second call may answer 404 instead of 204.',
      'Idempotent means every repeated response must come back byte-for-byte identical.'
    ],
    correctIndices: [0, 2, 4],
    hints: [
      'Safety is about the first call; idempotency is about the second, third and fourth.',
      'For each statement ask two things: what the client asked the server to change, and what a second identical request would change on top of that.'
    ],
    explanation:
      'Safety asks whether the client requested a change of state, idempotency asks whether repeating the request changes that state any further, so a method that changes nothing on the first call cannot change anything more on the second: safe implies idempotent, while DELETE shows the reverse does not hold. Safety is judged by the semantics the client invoked and not by every byte the server happens to write, so an access-log row leaves GET safe, and DELETE leaves the resource gone however often it is repeated even if the second call answers 404. A PATCH body such as "add 10 to the balance" moves the state on every retry, nothing deduplicates POST for you, and idempotency constrains the stored state rather than the exact bytes of each response.',
    xpReward: 70,
    tags: ['idempotency', 'safety', 'http-methods']
  },
  {
    id: 'stage-6-a05',
    stageId: 'stage-6',
    title: 'Where each parameter arrives',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'javascript',
    prompt:
      'Fill in the blanks so each value is read from the part of the request that actually carries it.',
    codeSnippet:
      '// GET /api/users/17/orders?status=paid&limit=20\n' +
      'app.get("/api/users/:userId/orders", (req, res) => {\n' +
      '  const userId = req.___.userId;\n' +
      '  const status = req.___.status;\n' +
      '  res.json(listOrders(userId, status));\n' +
      '});\n' +
      '\n' +
      '// POST /api/users/17/orders - the new order travels as JSON\n' +
      'app.post("/api/users/:userId/orders", (req, res) => {\n' +
      '  const order = req.___;\n' +
      '  res.status(201).json(createOrder(order));\n' +
      '});',
    blanks: [
      { answer: 'params', choices: ['params', 'query', 'body', 'headers'] },
      { answer: 'query', choices: ['params', 'query', 'body', 'headers'] },
      { answer: 'body', choices: ['params', 'query', 'body', 'headers'] }
    ],
    hints: [
      'A :placeholder in the route pattern identifies which resource you are addressing.',
      'Everything after the ? filters or pages a collection; a payload too big for a URL goes elsewhere.'
    ],
    explanation:
      'Path segments identify the resource, so :userId is read from req.params. Query parameters filter, sort or page a collection and are read from req.query. A representation being created or replaced is too large and too structured for a URL, so it travels in the request body.',
    xpReward: 40,
    tags: ['rest', 'parameters', 'express']
  },
  {
    id: 'stage-6-a06',
    stageId: 'stage-6',
    title: 'Three caching headers',
    type: 'fill_blank',
    difficulty: 'medium',
    language: 'javascript',
    prompt: 'Fill in the blanks so each response carries the caching policy described in its comment.',
    codeSnippet:
      '// Fingerprinted bundle: any cache may keep it for a year\n' +
      'res.set("Cache-Control", "public, max-age=___, immutable");\n' +
      '\n' +
      '// Per-user dashboard: only the browser may store it, and it\n' +
      '// must ask the origin before reusing the stored copy\n' +
      'res.set("Cache-Control", "___, no-cache");\n' +
      '\n' +
      '// The gzip body and the plain body differ, so tell caches\n' +
      '// which request header decided this representation\n' +
      'res.set("___", "Accept-Encoding");',
    blanks: [
      { answer: '31536000', choices: ['31536000', '86400', '3600', '365'] },
      { answer: 'private', choices: ['private', 'public', 'immutable', 'must-revalidate'] },
      { answer: 'Vary', choices: ['Vary', 'ETag', 'Allow', 'Age'] }
    ],
    hints: [
      'Settle what unit max-age is expressed in before you pick a number for it.',
      'One directive limits who may store the response; a different header names the request headers that shaped it.'
    ],
    explanation:
      'max-age is measured in seconds, so a year is 365 * 86400 = 31536000. The private directive keeps a personalised response out of shared caches such as a CDN, while no-cache still stores it but forces revalidation before reuse. Vary lists the request headers the server negotiated on, so a cache never hands a gzip body to a client that did not ask for one.',
    xpReward: 70,
    tags: ['caching', 'cache-control', 'headers']
  },
  {
    id: 'stage-6-a07',
    stageId: 'stage-6',
    title: 'Order the idempotency-key flow',
    type: 'pseudocode_order',
    difficulty: 'hard',
    language: 'pseudocode',
    prompt:
      'A payments endpoint uses an idempotency key so a retried POST never charges twice. Put these pseudocode lines in the correct order.',
    pseudocodeLines: [
      'READ the Idempotency-Key header FROM the request',
      'LOOK UP that key IN the saved-response store',
      'IF a saved response EXISTS THEN REPLAY it AND STOP',
      'CHARGE the card AND capture the new payment id',
      'SAVE a 201 status AND that payment URL UNDER the key',
      'RESPOND WITH the entry just saved UNDER the key'
    ],
    hints: [
      'Trace a retry that arrives after the first request already succeeded, and mark the one line it must never reach.',
      'Every step consumes something the step before it produced, from the key itself to the entry that is finally sent back.'
    ],
    explanation:
      'POST is not idempotent on its own, so a retry after a timeout would charge the customer twice. Reading the key first, then checking the store, turns the retry into a lookup that replays the original 201 instead of creating a second payment. Storing the response before sending it means the first caller and every retry are answered from the same entry, so a retry that arrives moments after the payment succeeds still finds a record to replay.',
    xpReward: 110,
    tags: ['idempotency', 'post', 'api-design']
  },
  {
    id: 'stage-6-a08',
    stageId: 'stage-6',
    title: 'Negotiate the response media type',
    type: 'code_runner',
    difficulty: 'hard',
    language: 'javascript',
    prompt:
      'Given an Accept header and the media types the server can produce, return the supported type with the highest q value. A type with no q defaults to 1, q=0 means unacceptable, ties go to the type listed first in supported, and if nothing is acceptable return null. Ignore wildcards.',
    starterCode:
      'function bestMediaType(accept, supported) {\n' +
      '  // your code here\n' +
      '  return null;\n' +
      '}',
    entryFunction: 'bestMediaType',
    testCases: [
      {
        input: '"text/html, application/json;q=0.9", ["application/json", "text/html"]',
        expected: '"text/html"'
      },
      {
        input: '"application/json;q=0.9, text/plain;q=0.5", ["text/plain", "application/json"]',
        expected: '"application/json"'
      },
      {
        input: '"application/xml", ["application/json", "text/html"]',
        expected: 'null'
      },
      {
        input: '"text/html;q=0, application/json;q=0.8", ["text/html", "application/json"]',
        expected: '"application/json"'
      },
      {
        input: '"application/json, text/html", ["text/html", "application/json"]',
        expected: '"text/html"'
      },
      // q=0 is a refusal, not a low score: a solution that merely ranks it
      // below everything else still returns text/html here instead of null.
      {
        input: '"text/html;q=0", ["text/html", "application/json"]',
        expected: 'null'
      }
    ],
    solutionCode:
      'function bestMediaType(accept, supported) {\n' +
      '  const weights = new Map();\n' +
      '  for (const part of accept.split(",")) {\n' +
      '    const bits = part.split(";");\n' +
      '    const type = bits[0].trim();\n' +
      '    let q = 1;\n' +
      '    for (const param of bits.slice(1)) {\n' +
      '      const pair = param.split("=");\n' +
      '      if (pair[0].trim() === "q") q = parseFloat(pair[1]);\n' +
      '    }\n' +
      '    weights.set(type, q);\n' +
      '  }\n' +
      '  let best = null;\n' +
      '  let bestQ = 0;\n' +
      '  for (const type of supported) {\n' +
      '    const q = weights.get(type);\n' +
      '    if (q === undefined || q <= 0) continue;\n' +
      '    if (q > bestQ) {\n' +
      '      best = type;\n' +
      '      bestQ = q;\n' +
      '    }\n' +
      '  }\n' +
      '  return best;\n' +
      '}',
    hints: [
      'Split the header on commas first, then split each entry on ; to find its q parameter.',
      'Walk the supported list in order, keeping the best score seen so far, and decide what should happen when a later type merely ties that score.'
    ],
    explanation:
      'Content negotiation is a scored lookup: the client ranks media types with q values from 0 to 1, and the server picks the highest scoring type it can actually produce. q=0 is an explicit refusal, so a type carrying it can never be chosen, and when nothing overlaps the honest answer is 406 Not Acceptable rather than a body the client said it could not read.',
    xpReward: 110,
    tags: ['content-negotiation', 'accept-header', 'parsing']
  },
  {
    id: 'stage-6-a09',
    stageId: 'stage-6',
    title: 'Answer a conditional GET',
    type: 'code_runner',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'Return the status a GET should get back. currentTag is the ETag of the resource now; ifNoneMatch is the If-None-Match header, which may be null, "*", or a comma-separated list of tags. Return 304 when the client already holds a current copy, otherwise 200. Tags are written without their quotes here.',
    starterCode:
      'function conditionalGet(currentTag, ifNoneMatch) {\n' +
      '  // your code here\n' +
      '  return 200;\n' +
      '}',
    entryFunction: 'conditionalGet',
    testCases: [
      { input: '"v3", "v3"', expected: '304' },
      { input: '"v3", "v1, v2"', expected: '200' },
      { input: '"v3", null', expected: '200' },
      { input: '"v3", "*"', expected: '304' },
      { input: '"v3", "v1, v3"', expected: '304' },
      // A tag has to match whole, not as a substring: searching the raw header
      // for "v3" would wrongly find it inside "v30" and answer 304.
      { input: '"v3", "v30, v31"', expected: '200' }
    ],
    solutionCode:
      'function conditionalGet(currentTag, ifNoneMatch) {\n' +
      '  if (!ifNoneMatch) return 200;\n' +
      '  if (ifNoneMatch.trim() === "*") return 304;\n' +
      '  const tags = ifNoneMatch.split(",").map(t => t.trim());\n' +
      '  return tags.includes(currentTag) ? 304 : 200;\n' +
      '}',
    hints: [
      'A client with no If-None-Match header has nothing cached, so it always needs the full body.',
      'The header can carry several tags, so trim each one before comparing.'
    ],
    explanation:
      '304 Not Modified is the cheap answer to a conditional GET: the client already holds a matching representation, so the server sends headers and no body. A star matches any existing representation, and a header listing several tags matches if any of them is the current one.',
    xpReward: 70,
    tags: ['caching', 'etag', 'status-codes']
  },
  {
    id: 'stage-6-a10',
    stageId: 'stage-6',
    title: 'PUT that is not idempotent',
    type: 'debug',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'applyPuts replays a list of PUT requests against an inventory. Each [id, quantity] pair is a PUT that sets the stock level for that id. Retried PUTs currently corrupt the totals. Fix it without mutating the original state.',
    starterCode:
      'function applyPuts(state, puts) {\n' +
      '  const next = { ...state };\n' +
      '  for (const [id, quantity] of puts) {\n' +
      '    next[id] = (next[id] || 0) + quantity;\n' +
      '  }\n' +
      '  return next;\n' +
      '}',
    entryFunction: 'applyPuts',
    testCases: [
      { input: '{}, [["a", 3]]', expected: '{"a": 3}' },
      { input: '{}, [["a", 3], ["a", 3]]', expected: '{"a": 3}' },
      { input: '{"a": 10}, [["a", 4], ["b", 2]]', expected: '{"a": 4, "b": 2}' },
      { input: '{"a": 1}, []', expected: '{"a": 1}' },
      // The prompt forbids mutating the caller's state, so one case has to
      // enforce it. Writing to a frozen object is a silent no-op, so an
      // in-place fix hands back the untouched original and fails here.
      { input: 'Object.freeze({"a": 5}), [["a", 2], ["b", 1]]', expected: '{"a": 2, "b": 1}' }
    ],
    solutionCode:
      'function applyPuts(state, puts) {\n' +
      '  const next = { ...state };\n' +
      '  for (const [id, quantity] of puts) {\n' +
      '    next[id] = quantity;\n' +
      '  }\n' +
      '  return next;\n' +
      '}',
    hints: [
      'Send the same PUT twice by hand and compare the result with sending it once.',
      'Look closely at what the line inside the loop does with the value already stored for that id.'
    ],
    explanation:
      'Adding the quantity to the previous value turns PUT into an accumulator, so a client that retries after a timeout doubles the stock. PUT replaces the resource with the representation it carries, which is exactly what makes it idempotent: the second identical request leaves the state unchanged.',
    xpReward: 70,
    tags: ['idempotency', 'put', 'debugging']
  }
];
