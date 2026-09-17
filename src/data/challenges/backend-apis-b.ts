import { Challenge } from '../../types';

/**
 * Stage 06 - Backend & APIs, batch B.
 * Auth state (sessions vs JWT), password hashing, input validation,
 * middleware ordering, rate limiting, server-side CORS, common OWASP
 * failures (injection, IDOR, mass assignment), pagination and error
 * response design.
 */
export const challenges: Challenge[] = [
  {
    id: 'stage-6-b01',
    stageId: 'stage-6',
    title: 'Banning a user who holds a JWT',
    type: 'quiz',
    difficulty: 'easy',
    language: 'javascript',
    prompt:
      'The API replaced server-side sessions with stateless JWTs. A moderator bans account u_8412 at 10:00. What happens to the token that account is already holding?',
    codeSnippet:
      '// Decoded payload of the token the client still holds\n' +
      '{\n' +
      '  "sub": "u_8412",\n' +
      '  "role": "member",\n' +
      '  "iat": 1735725300,   // issued 09:55\n' +
      '  "exp": 1735728900    // expires 10:55\n' +
      '}\n' +
      '\n' +
      '// Every request is checked with only this:\n' +
      'jwt.verify(token, SECRET);',
    options: [
      'It stops working at once, because verify re-reads the banned user record.',
      'It keeps working until 10:55 unless the server checks a revocation list.',
      'It stops working at once, because a ban rotates the JWT signing secret.',
      'It keeps working until the client reloads the page and drops the token.'
    ],
    correctIndex: 1,
    hints: [
      'Write down every piece of data jwt.verify actually looks at.',
      'With sessions the ban works because the server owns the session row. Who owns the token?'
    ],
    explanation:
      'jwt.verify only recomputes the signature over the token the client sent and checks exp; it never touches the database, so the ban is invisible to it. Revoking early means adding state back - a denylist of token ids, or short-lived access tokens plus a refresh token you can revoke - which is the trade sessions gave you for free.',
    xpReward: 40,
    tags: ['jwt', 'sessions', 'authentication']
  },
  {
    id: 'stage-6-b02',
    stageId: 'stage-6',
    title: 'Hashing the same password twice',
    type: 'output_prediction',
    difficulty: 'medium',
    language: 'javascript',
    prompt: 'What do these three log statements print?',
    codeSnippet:
      'const bcrypt = require("bcrypt");\n' +
      '\n' +
      'async function main() {\n' +
      '  const a = await bcrypt.hash("hunter2", 12);\n' +
      '  const b = await bcrypt.hash("hunter2", 12);\n' +
      '\n' +
      '  console.log(a === b);\n' +
      '  console.log(a.length === b.length);\n' +
      '  console.log(await bcrypt.compare("hunter2", b));\n' +
      '}\n' +
      '\n' +
      'main();',
    options: [
      'false, true, true',
      'true, true, true',
      'false, false, true',
      'false, true, false'
    ],
    correctIndex: 0,
    hints: [
      'Ask what bcrypt mixes into the input before it starts the work factor rounds.',
      'Verification cannot redo the hash without that extra ingredient, so work out where it had to be kept.'
    ],
    explanation:
      'bcrypt draws a fresh random salt on every hash call and stores that salt inside its 60-character output, so two hashes of the same password never match as strings but always have the same length. compare reads the salt and cost back out of the stored digest and re-derives the hash, which is why you must call compare instead of hashing the input and testing for equality.',
    xpReward: 70,
    tags: ['password-hashing', 'bcrypt', 'salt']
  },
  {
    id: 'stage-6-b03',
    stageId: 'stage-6',
    title: 'Middleware registered after the route',
    type: 'output_prediction',
    difficulty: 'medium',
    language: 'javascript',
    prompt: 'A client sends GET /ping. What does the server log?',
    codeSnippet:
      'const app = express();\n' +
      '\n' +
      'app.use((req, res, next) => { console.log("A"); next(); });\n' +
      '\n' +
      'app.get("/ping", (req, res) => {\n' +
      '  console.log("B");\n' +
      '  res.send("pong");\n' +
      '});\n' +
      '\n' +
      'app.use((req, res, next) => { console.log("C"); next(); });\n' +
      '\n' +
      '// The client sends: GET /ping',
    options: ['A then B', 'A then B then C', 'A then C then B', 'B only'],
    correctIndex: 0,
    hints: [
      'Express walks its stack in registration order, one entry at a time.',
      'What has to happen for the stack to advance past a handler?'
    ],
    explanation:
      'Express walks the stack top to bottom and only advances when a handler calls next(). The route handler answers with res.send and never calls next(), so the middleware registered below it is never reached. This is why body parsers, CORS headers and auth checks must be app.use\'d above the routes that depend on them.',
    xpReward: 70,
    tags: ['middleware', 'express', 'ordering']
  },
  {
    id: 'stage-6-b04',
    stageId: 'stage-6',
    title: 'Answer the CORS preflight',
    type: 'fill_blank',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'The browser preflights a credentialed PATCH from https://app.shop.dev. Fill in the blanks so the preflight succeeds.',
    codeSnippet:
      '// OPTIONS /api/orders\n' +
      '// Origin: https://app.shop.dev\n' +
      '// Access-Control-Request-Method: PATCH\n' +
      '// Access-Control-Request-Headers: Authorization\n' +
      '\n' +
      'app.use((req, res, next) => {\n' +
      '  res.set("Access-Control-Allow-Origin", "___");\n' +
      '  res.set("Access-Control-Allow-Credentials", "true");\n' +
      '  res.set("Access-Control-Allow-Methods", "GET, PATCH");\n' +
      '  res.set("Access-Control-Allow-___", "Authorization");\n' +
      '  if (req.method === "___") return res.sendStatus(204);\n' +
      '  next();\n' +
      '});',
    blanks: [
      {
        answer: 'https://app.shop.dev',
        choices: ['https://app.shop.dev', '*', 'null', 'true']
      },
      { answer: 'Headers', choices: ['Headers', 'Origin', 'Methods', 'Credentials'] },
      { answer: 'OPTIONS', choices: ['OPTIONS', 'PATCH', 'GET', 'HEAD'] }
    ],
    hints: [
      'One of the four Allow-Origin values is rejected outright whenever credentials are allowed.',
      'A preflight is its own request with its own method, and it must be answered before the real one is sent.'
    ],
    explanation:
      'When Access-Control-Allow-Credentials is true the browser refuses the wildcard, so the server must echo one concrete origin (and add Vary: Origin so caches keep the answers apart). Authorization is not a simple header, so it has to be named in Access-Control-Allow-Headers, and the preflight itself arrives as OPTIONS and must get a 2xx with no body before the PATCH is sent.',
    xpReward: 70,
    tags: ['cors', 'preflight', 'headers']
  },
  {
    id: 'stage-6-b05',
    stageId: 'stage-6',
    title: 'Validate the signup body',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'javascript',
    prompt:
      'Fill in the blanks so validateSignup rejects an email that is not a string before it looks at the address shape, and rejects an age that is not a whole number of 13 or more.',
    codeSnippet:
      'function validateSignup(body) {\n' +
      '  const errors = [];\n' +
      '  if (typeof body.email !== "___") {\n' +
      '    errors.push("email must be a string");\n' +
      '  } else if (!/^[^@\\s]+@[^@\\s]+$/.___(body.email)) {\n' +
      '    errors.push("email is malformed");\n' +
      '  }\n' +
      '  const age = Number(body.age);\n' +
      '  if (!Number.___(age) || age < 13) {\n' +
      '    errors.push("age must be a whole number of 13 or more");\n' +
      '  }\n' +
      '  return errors;\n' +
      '}',
    blanks: [
      { answer: 'string', choices: ['string', 'String', 'text', 'object'] },
      { answer: 'test', choices: ['test', 'match', 'search', 'includes'] },
      { answer: 'isInteger', choices: ['isInteger', 'isNaN', 'isFinite', 'parseInt'] }
    ],
    hints: [
      'One blank wants the exact spelling typeof produces; another wants the method that belongs to the RegExp rather than to the string.',
      'body.age arrives as text, so after Number() it may still be NaN, 12.5 or Infinity - and all three have to fail.'
    ],
    explanation:
      'JSON bodies are attacker-controlled, so every field needs a type check before anything is done with it: RegExp.test does not throw on a non-string, it coerces first, so the array ["a@b.dev"] would sail through an email check that looks strict. test returns a plain boolean, and Number.isInteger rejects NaN, 12.5 and Infinity in a single call, where Number.isFinite would accept 12.5.',
    xpReward: 40,
    tags: ['input-validation', 'types', 'defensive-coding']
  },
  {
    id: 'stage-6-b06',
    stageId: 'stage-6',
    title: 'Order the login handler',
    type: 'pseudocode_order',
    difficulty: 'hard',
    language: 'pseudocode',
    prompt:
      'A password login endpoint must reject bad input, avoid telling an attacker which emails exist, and issue a session. Put these pseudocode lines in the correct order.',
    pseudocodeLines: [
      'READ email AND password FROM the request body',
      'IF either field is missing THEN RESPOND 400 AND STOP',
      'LOOK UP the user record BY email',
      'COMPARE the password AGAINST the stored hash, OR a dummy hash',
      'IF no user OR the comparison FAILED THEN RESPOND 401 AND STOP',
      'CREATE a session record AND STORE its id',
      'SET the session id IN an HttpOnly, Secure cookie',
      'RESPOND 200 WITH the public profile fields only'
    ],
    hints: [
      'Malformed input is a different failure from wrong credentials, and it is cheaper to detect.',
      'If the handler returns early when the email is unknown, the reply comes back far faster than a wrong-password reply.'
    ],
    explanation:
      'Shape errors are answered with 400 before any lookup, then the single 401 covers both "no such email" and "wrong password" so the response body never confirms an account exists. Hashing against a dummy digest when the user is missing keeps the timing of both failures similar, and the session id only leaves the server inside an HttpOnly, Secure cookie that script cannot read.',
    xpReward: 110,
    tags: ['authentication', 'sessions', 'user-enumeration']
  },
  {
    id: 'stage-6-b07',
    stageId: 'stage-6',
    title: 'Three flaws in two handlers',
    type: 'multi_select',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'Both routes already sit behind middleware that verified the caller is signed in. Which statements about this code are true? Select every one that applies.',
    codeSnippet:
      'app.get("/api/orders/:id", async (req, res) => {\n' +
      '  const sql = "SELECT * FROM orders WHERE id = " + req.params.id;\n' +
      '  res.json(await db.raw(sql));\n' +
      '});\n' +
      '\n' +
      'app.patch("/api/users/:id", async (req, res) => {\n' +
      '  await db("users").where({ id: req.params.id }).update(req.body);\n' +
      '  res.sendStatus(204);\n' +
      '});',
    options: [
      'The GET is injectable: :id is concatenated into SQL, so "1 OR 1=1" returns every order.',
      'The GET has no ownership check, so any signed-in user can read any order by guessing its id.',
      'The PATCH is a mass assignment hole: any column named in the body is written, including role.',
      'Rejecting ids that are not positive integers would also fix the missing ownership check.',
      'Moving the order id into a POST body would remove the injection, since bodies are not part of the URL.',
      'Signed-in middleware already covers this, because authentication and authorization are the same check.'
    ],
    correctIndices: [0, 1, 2],
    hints: [
      'Authentication answers "who are you"; authorization answers "may you touch this row".',
      'Ask which of these problems survives after the id has been proved to be a number.'
    ],
    explanation:
      'Concatenating a path segment into SQL is textbook injection - parameter binding, not string building, is the fix. Separately, proving the id is numeric says nothing about who owns the row, so the query still needs an AND user_id = ? clause. The PATCH hands req.body straight to update, so a caller can set columns the form never showed; an explicit allowlist of updatable fields is the defence, and it makes no difference whether the values arrived in a URL or a body.',
    xpReward: 70,
    tags: ['owasp', 'sql-injection', 'idor', 'mass-assignment']
  },
  {
    id: 'stage-6-b08',
    stageId: 'stage-6',
    title: 'Token bucket rate limiter',
    type: 'code_runner',
    difficulty: 'hard',
    language: 'javascript',
    prompt:
      'Implement a token bucket. The bucket starts full with capacity tokens and gains refillPerSecond tokens per second, never going above capacity. timestamps holds request times in seconds, in non-decreasing order. Return an array of booleans: true when a request finds at least one token and spends it, false when the bucket is empty and the request is rejected.',
    starterCode:
      'function rateLimit(timestamps, capacity, refillPerSecond) {\n' +
      '  // your code here\n' +
      '  return [];\n' +
      '}',
    entryFunction: 'rateLimit',
    testCases: [
      { input: '[0, 0, 0], 2, 1', expected: '[true, true, false]' },
      { input: '[0, 0, 1], 2, 1', expected: '[true, true, true]' },
      { input: '[0, 1, 2, 3], 1, 0.5', expected: '[true, false, true, false]' },
      { input: '[], 3, 1', expected: '[]' },
      { input: '[0, 10, 10, 10, 10], 2, 1', expected: '[true, true, true, false, false]' }
    ],
    solutionCode:
      'function rateLimit(timestamps, capacity, refillPerSecond) {\n' +
      '  let tokens = capacity;\n' +
      '  let last = null;\n' +
      '  const allowed = [];\n' +
      '  for (const t of timestamps) {\n' +
      '    if (last !== null) {\n' +
      '      const gained = (t - last) * refillPerSecond;\n' +
      '      tokens = Math.min(capacity, tokens + gained);\n' +
      '    }\n' +
      '    last = t;\n' +
      '    if (tokens >= 1) {\n' +
      '      tokens -= 1;\n' +
      '      allowed.push(true);\n' +
      '    } else {\n' +
      '      allowed.push(false);\n' +
      '    }\n' +
      '  }\n' +
      '  return allowed;\n' +
      '}',
    hints: [
      'No timer is needed. Each request knows how much time has passed since the previous one.',
      'A client that was idle for an hour must not come back with an hour of burst - the running total needs a ceiling.'
    ],
    explanation:
      'A token bucket is two numbers - the tokens on hand and the time they were last updated - so the refill is computed on demand rather than by a timer. Clamping at capacity caps the burst a returning client may spend at once, while refillPerSecond sets the sustained rate; a rejected request should be answered with 429 and a Retry-After header telling the client when a token will exist.',
    xpReward: 110,
    tags: ['rate-limiting', 'token-bucket', 'algorithms']
  },
  {
    id: 'stage-6-b09',
    stageId: 'stage-6',
    title: 'The pager skips a page',
    type: 'debug',
    difficulty: 'easy',
    language: 'javascript',
    prompt:
      'GET /api/orders?page=1&perPage=2 must return the first two orders, because page numbers in this API start at 1. Testers report that page 1 comes back holding the rows that belong on page 2, and the first two orders cannot be reached at all. Fix pageOf so every page number maps to the right slice.',
    starterCode:
      'function pageOf(items, page, perPage) {\n' +
      '  const start = page * perPage;\n' +
      '  return items.slice(start, start + perPage);\n' +
      '}',
    entryFunction: 'pageOf',
    testCases: [
      { input: '[10, 20, 30, 40, 50], 1, 2', expected: '[10, 20]' },
      { input: '[10, 20, 30, 40, 50], 2, 2', expected: '[30, 40]' },
      { input: '[10, 20, 30, 40, 50], 3, 2', expected: '[50]' },
      { input: '[10, 20, 30, 40, 50], 4, 2', expected: '[]' },
      { input: '["a", "b"], 1, 5', expected: '["a", "b"]' }
    ],
    solutionCode:
      'function pageOf(items, page, perPage) {\n' +
      '  const start = (page - 1) * perPage;\n' +
      '  return items.slice(start, start + perPage);\n' +
      '}',
    hints: [
      'Work out by hand what start has to be when the client asks for the very first page.',
      'slice already clamps a start past the end and a short final page, so the repair needs no extra length checks.'
    ],
    explanation:
      'A 1-based page number has to be shifted before it becomes a 0-based offset, so the first page starts at index 0, not at perPage - as written, page 1 silently returns page 2 and the first rows are unreachable. slice already clamps a past-the-end range to an empty array and a short final page to whatever is left, so no extra bounds checks are needed.',
    xpReward: 40,
    tags: ['pagination', 'off-by-one', 'debugging']
  },
  {
    id: 'stage-6-b10',
    stageId: 'stage-6',
    title: 'Shape the error response',
    type: 'code_runner',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'Map an internal error onto the response a client should see. Return {status, code, message}. kind "validation" gives status 400 with code "validation_error"; "unauthenticated" gives 401, "forbidden" gives 403 and "not_found" gives 404, each using the kind itself as the code. All four pass err.message through unchanged. Any other kind is a server fault: return status 500, code "internal_error" and the fixed message "Internal server error".',
    starterCode:
      'function toErrorResponse(err) {\n' +
      '  // your code here\n' +
      '  return { status: 500, code: "internal_error", message: "" };\n' +
      '}',
    entryFunction: 'toErrorResponse',
    testCases: [
      {
        input: '{"kind": "validation", "message": "email is required"}',
        expected: '{"status": 400, "code": "validation_error", "message": "email is required"}'
      },
      {
        input: '{"kind": "not_found", "message": "order 42 does not exist"}',
        expected: '{"status": 404, "code": "not_found", "message": "order 42 does not exist"}'
      },
      {
        input: '{"kind": "forbidden", "message": "you do not own this order"}',
        expected: '{"status": 403, "code": "forbidden", "message": "you do not own this order"}'
      },
      {
        input: '{"kind": "unauthenticated", "message": "token expired"}',
        expected: '{"status": 401, "code": "unauthenticated", "message": "token expired"}'
      },
      {
        input: '{"kind": "db_timeout", "message": "connect 10.0.0.7:5432 timed out"}',
        expected: '{"status": 500, "code": "internal_error", "message": "Internal server error"}'
      }
    ],
    solutionCode:
      'function toErrorResponse(err) {\n' +
      '  const known = {\n' +
      '    validation: [400, "validation_error"],\n' +
      '    unauthenticated: [401, "unauthenticated"],\n' +
      '    forbidden: [403, "forbidden"],\n' +
      '    not_found: [404, "not_found"]\n' +
      '  };\n' +
      '  const match = Object.prototype.hasOwnProperty.call(known, err.kind)\n' +
      '    ? known[err.kind]\n' +
      '    : null;\n' +
      '  if (!match) {\n' +
      '    return {\n' +
      '      status: 500,\n' +
      '      code: "internal_error",\n' +
      '      message: "Internal server error"\n' +
      '    };\n' +
      '  }\n' +
      '  return { status: match[0], code: match[1], message: err.message };\n' +
      '}',
    hints: [
      'A lookup table of kind to [status, code] keeps the branching flat and the codes stable.',
      'The unknown branch must not read err.message at all - that is the whole point of the default.'
    ],
    explanation:
      'Clients switch on a stable machine-readable code, not on prose, so the status and the code are chosen by the server rather than copied from whatever threw. Messages for 4xx are safe because the caller caused them, but a 5xx message comes from your infrastructure and can leak host names, ports and query text, so it is replaced with a fixed string and the real error is written to the log instead.',
    xpReward: 70,
    tags: ['error-handling', 'api-design', 'status-codes']
  }
];
