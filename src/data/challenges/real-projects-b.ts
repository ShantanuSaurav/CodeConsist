import { Challenge } from '../../types';

/**
 * Stage 10 - Build Real Projects, batch B.
 * Operating what you shipped: structured logging, metrics and alerting,
 * error tracking, performance budgets, security hardening, incident response.
 */
export const challenges: Challenge[] = [
  {
    id: 'stage-10-b01',
    stageId: 'stage-10',
    title: 'A log field that clobbers its own level',
    type: 'output_prediction',
    difficulty: 'easy',
    language: 'javascript',
    prompt: 'What does this program print?',
    codeSnippet:
      'function log(level, msg, fields) {\n' +
      '  const line = { level, msg, ...fields };\n' +
      '  console.log(JSON.stringify(line));\n' +
      '}\n' +
      '\n' +
      'log("info", "order placed", { orderId: 7, level: "debug" });',
    options: [
      '{"level":"debug","msg":"order placed","orderId":7}',
      '{"level":"info","msg":"order placed","orderId":7}',
      '{"level":"info","msg":"order placed","orderId":7,"level":"debug"}',
      '{"msg":"order placed","orderId":7,"level":"debug"}'
    ],
    correctIndex: 0,
    hints: [
      'The spread runs after level and msg have already been placed.',
      'An object cannot hold the same key twice, and re-assigning a key does not move it.'
    ],
    explanation:
      'Spreading the caller fields last lets them overwrite reserved keys, so level becomes "debug". Re-assigning an existing key updates the value but keeps the key in its original position, which is why level still serialises first. Real loggers guard against this by nesting caller data under a fields key.',
    xpReward: 40,
    tags: ['structured-logging', 'spread', 'json']
  },
  {
    id: 'stage-10-b02',
    stageId: 'stage-10',
    title: 'Redact before you log',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'javascript',
    prompt:
      'Fill in the blanks so every sensitive field is replaced before the log line is written.',
    codeSnippet:
      'const REDACT = new Set(["password", "token", "ssn"]);\n' +
      '\n' +
      'function safeFields(fields) {\n' +
      '  const out = {};\n' +
      '  for (const [key, value] of Object.___(fields)) {\n' +
      '    out[key] = REDACT.___(key) ? "[REDACTED]" : value;\n' +
      '  }\n' +
      '  return out;\n' +
      '}',
    blanks: [
      { answer: 'entries', choices: ['entries', 'keys', 'values'] },
      { answer: 'has', choices: ['has', 'includes', 'get'] }
    ],
    hints: [
      'The loop destructures a pair, so the iteration must hand back pairs.',
      'A Set and an Array answer the membership question with different method names.'
    ],
    explanation:
      'Object.entries yields [key, value] pairs, which is what the destructuring pattern expects; Object.keys would give plain strings. Membership on a Set is has, not includes (that is Array), and it stays constant time as the deny list grows.',
    xpReward: 40,
    tags: ['structured-logging', 'redaction', 'objects', 'sets']
  },
  {
    id: 'stage-10-b03',
    stageId: 'stage-10',
    title: 'An alert that pages on one slow request',
    type: 'quiz',
    difficulty: 'easy',
    language: 'bash',
    prompt:
      'This rule pages on-call whenever any single request takes over a second. Which change turns it into a useful alert?',
    codeSnippet:
      'groups:\n' +
      '  - name: api\n' +
      '    rules:\n' +
      '      - alert: HighLatency\n' +
      '        expr: http_request_duration_seconds > 1\n' +
      '        for: 0s\n' +
      '        labels:\n' +
      '          severity: page',
    options: [
      'Alert on the p99 over a five minute window, and hold it with for: 5m',
      'Lower the threshold to 0.5 seconds so slow requests are caught sooner',
      'Raise the threshold to 10 seconds so only truly slow requests page',
      'Change severity from page to ticket so the rule stops waking anyone'
    ],
    correctIndex: 0,
    hints: [
      'One slow request is normal traffic, not an outage.',
      'Ask what the alert should measure, and for how long it must hold before a human is worth waking.'
    ],
    explanation:
      'A raw per-request comparison fires on ordinary tail latency, so it is pure noise. Alerting on an aggregate (a percentile over a window) and holding it with a for: duration means a page only happens when many users are affected for long enough to matter. Moving the threshold or downgrading the severity hides the noise instead of fixing what is measured.',
    xpReward: 40,
    tags: ['alerting', 'metrics', 'percentiles', 'on-call']
  },
  {
    id: 'stage-10-b04',
    stageId: 'stage-10',
    title: 'Nearest-rank percentile',
    type: 'code_runner',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'Return the nearest-rank percentile of a list of latency samples: sort ascending, take the sample at rank ceil(p / 100 * n), clamped into range. Return null for an empty list.',
    starterCode:
      'function percentile(samples, p) {\n' +
      '  // your code here\n' +
      '  return null;\n' +
      '}',
    entryFunction: 'percentile',
    testCases: [
      { input: '[10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 95', expected: '100' },
      { input: '[5, 1, 3, 2, 4], 50', expected: '3' },
      { input: '[120, 30, 9, 400, 75], 50', expected: '75' },
      { input: '[], 99', expected: 'null' },
      { input: '[7, 7, 7], 100', expected: '7' },
      { input: '[1, 2, 3, 4], 0', expected: '1' },
      { input: '[1, 2, 3, 4], 50', expected: '2' },
      { input: '[2, 4, 6, 8, 10, 12, 14, 16], 25', expected: '4' }
    ],
    solutionCode:
      'function percentile(samples, p) {\n' +
      '  if (samples.length === 0) return null;\n' +
      '  const sorted = samples.slice().sort((a, b) => a - b);\n' +
      '  const rank = Math.ceil((p / 100) * sorted.length);\n' +
      '  const index = Math.min(Math.max(rank - 1, 0), sorted.length - 1);\n' +
      '  return sorted[index];\n' +
      '}',
    hints: [
      'Array.prototype.sort compares as text unless you pass a numeric comparator.',
      'Ranks are 1-based but array indices are 0-based, so subtract one and clamp.'
    ],
    explanation:
      'Sorting without a comparator orders 9 after 400 because it compares strings, which quietly ruins every percentile. Nearest rank converts a percentile into a 1-based position with ceil, then clamps so p = 0 and p = 100 land on the first and last sample instead of running off the array.',
    xpReward: 70,
    tags: ['metrics', 'percentiles', 'latency', 'sorting']
  },
  {
    id: 'stage-10-b05',
    stageId: 'stage-10',
    title: 'Harden this response',
    type: 'multi_select',
    difficulty: 'medium',
    language: 'bash',
    prompt:
      'This is the response your app returns today. Which changes actually harden it? Select every one that applies.',
    codeSnippet:
      'HTTP/1.1 200 OK\n' +
      'Content-Type: text/html; charset=utf-8\n' +
      'Server: nginx/1.24.0\n' +
      'X-Powered-By: Express\n' +
      'Set-Cookie: sid=abc123; Path=/',
    options: [
      'Add Strict-Transport-Security: max-age=31536000; includeSubDomains',
      "Add Content-Security-Policy: default-src 'self'",
      'Add Secure; HttpOnly; SameSite=Lax to the Set-Cookie',
      'Add Access-Control-Allow-Origin: * so browsers stop blocking cross-origin calls',
      'Add X-XSS-Protection: 1; mode=block to switch on the browser XSS filter',
      'Keep X-Powered-By: Express so proxies can route the response correctly'
    ],
    correctIndices: [0, 1, 2],
    hints: [
      'Two of the wrong answers make the app more exposed, not less.',
      'One header only toggles a browser feature that no longer exists.'
    ],
    explanation:
      'HSTS forces future visits onto TLS, a CSP limits where scripts may be loaded from, and Secure/HttpOnly/SameSite stop the session cookie being read by script or sent from another site. A wildcard CORS header widens access rather than restricting it, X-XSS-Protection controls an auditor that browsers have removed, and X-Powered-By only tells an attacker what stack to target.',
    xpReward: 70,
    tags: ['security-headers', 'hardening', 'cookies', 'csp']
  },
  {
    id: 'stage-10-b06',
    stageId: 'stage-10',
    title: 'Grouping errors into issues',
    type: 'output_prediction',
    difficulty: 'medium',
    language: 'javascript',
    prompt: 'What does this program print?',
    codeSnippet:
      'function fingerprint(err) {\n' +
      '  const normalized = err.message.replace(/\\d+/g, "N");\n' +
      '  return err.name + ":" + normalized;\n' +
      '}\n' +
      '\n' +
      'const errs = [\n' +
      '  new TypeError("user 8123 has no id"),\n' +
      '  new TypeError("user 9074 has no id"),\n' +
      '  new RangeError("user 8123 has no id")\n' +
      '];\n' +
      'const groups = new Set(errs.map(fingerprint));\n' +
      'console.log([...groups].join(" | "));',
    options: [
      'TypeError:user N has no id | TypeError:user N has no id | RangeError:user N has no id',
      'TypeError:user N has no id | RangeError:user N has no id',
      'RangeError:user N has no id | TypeError:user N has no id',
      'TypeError:user 8123 has no id | TypeError:user 9074 has no id | RangeError:user 8123 has no id'
    ],
    correctIndex: 1,
    hints: [
      'The regex strips the part of the message that differs between reports.',
      'A Set drops repeats but keeps the order in which values were first added.'
    ],
    explanation:
      'Replacing digit runs with N turns the two TypeError messages into the same fingerprint, so the Set stores it once; the RangeError keeps a separate fingerprint because the error name is part of the key. This is how error trackers collapse thousands of reports of one bug into a single issue instead of one issue per request id.',
    xpReward: 70,
    tags: ['error-tracking', 'fingerprinting', 'sets', 'regex']
  },
  {
    id: 'stage-10-b07',
    stageId: 'stage-10',
    title: 'Order the incident response',
    type: 'pseudocode_order',
    difficulty: 'easy',
    language: 'pseudocode',
    prompt:
      'Put these steps in the order a well-run team follows from the moment the page fires.',
    pseudocodeLines: [
      'ACKNOWLEDGE the page so it stops escalating to the next responder',
      'DECLARE an incident and name one incident commander',
      'POST the first status update in the commander\'s name: investigating, impact not yet known',
      'MITIGATE before diagnosing - roll back the last deploy, then change the status to fix in progress',
      'VERIFY error rate and latency have returned to baseline after the rollback',
      'RESOLVE the incident and post the all-clear update',
      'RUN a blameless postmortem and file action items with owners and dates'
    ],
    hints: [
      'Stopping the bleeding comes before understanding the wound.',
      'The postmortem is written after the all-clear, never during the outage.'
    ],
    explanation:
      'Acknowledging stops the escalation chain, and naming a commander stops five people debugging the same thing. Mitigation such as a rollback comes before diagnosis because users care about impact, not root cause; only once metrics are back at baseline do you resolve and write the blameless postmortem whose action items have owners and due dates.',
    xpReward: 40,
    tags: ['incident-response', 'postmortem', 'on-call', 'rollback']
  },
  {
    id: 'stage-10-b08',
    stageId: 'stage-10',
    title: 'Make the budget check fail the build',
    type: 'fill_blank',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'Fill in the blanks so this performance budget check measures the right number and actually fails CI.',
    codeSnippet:
      'const BUDGET_BYTES = 180 * 1024;\n' +
      '\n' +
      'function main(stats) {\n' +
      '  const size = stats.___;\n' +
      '  if (size > BUDGET_BYTES) {\n' +
      '    console.error("over budget by " + (size - BUDGET_BYTES) + " B");\n' +
      '    process.exit(___);\n' +
      '  }\n' +
      '  console.log("bundle within budget");\n' +
      '}',
    blanks: [
      { answer: 'gzipBytes', choices: ['gzipBytes', 'rawBytes', 'sourceMapBytes'] },
      { answer: '1', choices: ['1', '0', 'null'] }
    ],
    hints: [
      'A budget should track what travels over the network, not what sits on disk.',
      'CI decides pass or fail from the exit status the process returns, not from what it printed, and an absent status counts as success.'
    ],
    explanation:
      'Transfer size is what users wait for, so budget the compressed bytes rather than the raw or source-map bytes. Printing to stderr does not change the exit status, so the check must end the process with a non-zero code such as 1 for CI to mark the build failed. process.exit(0) reports success, and process.exit(null) falls back to process.exitCode, which is still 0.',
    xpReward: 70,
    tags: ['performance-budget', 'ci-cd', 'bundle-size']
  },
  {
    id: 'stage-10-b09',
    stageId: 'stage-10',
    title: 'The issue that is always brand new',
    type: 'debug',
    difficulty: 'hard',
    language: 'javascript',
    prompt:
      'This function groups raw error events (already in chronological order) into issues. The counts are right, but every issue that fired more than once reports the wrong firstSeen timestamp. Find the bug and fix it.',
    starterCode:
      'function groupErrors(events) {\n' +
      '  const groups = new Map();\n' +
      '  for (const e of events) {\n' +
      '    const key = e.name + ":" + e.message.replace(/\\d+/g, "N");\n' +
      '    if (!groups.has(key)) {\n' +
      '      groups.set(key, {\n' +
      '        fingerprint: key,\n' +
      '        count: 0,\n' +
      '        firstSeen: e.ts,\n' +
      '        lastSeen: e.ts\n' +
      '      });\n' +
      '    }\n' +
      '    const g = groups.get(key);\n' +
      '    g.count += 1;\n' +
      '    g.firstSeen = e.ts;\n' +
      '    g.lastSeen = e.ts;\n' +
      '  }\n' +
      '  return [...groups.values()].sort((a, b) => b.count - a.count);\n' +
      '}',
    entryFunction: 'groupErrors',
    testCases: [
      {
        input:
          '[{ name: "TypeError", message: "user 1 missing", ts: 10 }, ' +
          '{ name: "TypeError", message: "user 2 missing", ts: 20 }, ' +
          '{ name: "RangeError", message: "index 5 out of range", ts: 30 }]',
        expected:
          '[{"fingerprint":"TypeError:user N missing","count":2,"firstSeen":10,"lastSeen":20},' +
          '{"fingerprint":"RangeError:index N out of range","count":1,"firstSeen":30,"lastSeen":30}]'
      },
      {
        input: '[{ name: "Error", message: "boom 42", ts: 5 }]',
        expected: '[{"fingerprint":"Error:boom N","count":1,"firstSeen":5,"lastSeen":5}]'
      },
      { input: '[]', expected: '[]' },
      {
        input:
          '[{ name: "Error", message: "timeout after 30 s", ts: 1 }, ' +
          '{ name: "Error", message: "timeout after 45 s", ts: 2 }, ' +
          '{ name: "Error", message: "timeout after 60 s", ts: 3 }, ' +
          '{ name: "TypeError", message: "no id", ts: 4 }]',
        expected:
          '[{"fingerprint":"Error:timeout after N s","count":3,"firstSeen":1,"lastSeen":3},' +
          '{"fingerprint":"TypeError:no id","count":1,"firstSeen":4,"lastSeen":4}]'
      },
      {
        input:
          '[{ name: "Error", message: "a 1", ts: 100 }, ' +
          '{ name: "TypeError", message: "b 2", ts: 101 }, ' +
          '{ name: "TypeError", message: "b 3", ts: 102 }]',
        expected:
          '[{"fingerprint":"TypeError:b N","count":2,"firstSeen":101,"lastSeen":102},' +
          '{"fingerprint":"Error:a N","count":1,"firstSeen":100,"lastSeen":100}]'
      }
    ],
    solutionCode:
      'function groupErrors(events) {\n' +
      '  const groups = new Map();\n' +
      '  for (const e of events) {\n' +
      '    const key = e.name + ":" + e.message.replace(/\\d+/g, "N");\n' +
      '    if (!groups.has(key)) {\n' +
      '      groups.set(key, {\n' +
      '        fingerprint: key,\n' +
      '        count: 0,\n' +
      '        firstSeen: e.ts,\n' +
      '        lastSeen: e.ts\n' +
      '      });\n' +
      '    }\n' +
      '    const g = groups.get(key);\n' +
      '    g.count += 1;\n' +
      '    g.lastSeen = e.ts;\n' +
      '  }\n' +
      '  return [...groups.values()].sort((a, b) => b.count - a.count);\n' +
      '}',
    hints: [
      'Compare which fields have to change on every event and which are set exactly once.',
      'firstSeen is already correct at the moment the group is created.'
    ],
    explanation:
      'firstSeen is assigned when the group is created and must never be touched again, but the loop overwrites it on every event, so it always ends up equal to lastSeen. Only lastSeen and count belong in the per-event update, which is why an issue that has been firing for weeks looked like it appeared seconds ago.',
    xpReward: 110,
    tags: ['error-tracking', 'debugging', 'aggregation', 'maps']
  },
  {
    id: 'stage-10-b10',
    stageId: 'stage-10',
    title: 'Scan a config file for leaked secrets',
    type: 'code_runner',
    difficulty: 'hard',
    language: 'javascript',
    prompt:
      'Return the 1-based line numbers that leak a secret, each line at most once. A line leaks when it contains an AWS key id (AKIA followed by exactly 16 uppercase letters or digits, not more) or assigns a credential: a name ending in password, secret, token or api_key (case-insensitive), then = with optional spaces around it, then a value of 8 or more consecutive non-space characters. Lines whose trimmed text starts with # are comments and never count.',
    starterCode:
      'function findSecrets(lines) {\n' +
      '  // your code here\n' +
      '  return [];\n' +
      '}',
    entryFunction: 'findSecrets',
    testCases: [
      {
        input:
          '["DB_HOST=localhost", "AWS_KEY=AKIAIOSFODNN7EXAMPLE", "PORT=8080"]',
        expected: '[2]'
      },
      {
        input: '["# password=supersecret123", "password=supersecret123"]',
        expected: '[2]'
      },
      {
        input:
          '["api_key = abcdefgh1234", "DB_PASSWORD=short", "note: no secrets here"]',
        expected: '[1]'
      },
      { input: '[]', expected: '[]' },
      {
        input:
          '["TOKEN=aaaaaaaa", "  # AKIAIOSFODNN7EXAMPLE", "AKIAIOSFODNN7EXAMPLE"]',
        expected: '[1, 3]'
      },
      {
        input: '["AWS_SECRET=AKIAIOSFODNN7EXAMPLE", "x=1"]',
        expected: '[1]'
      },
      {
        input: '["KEY=AKIAIOSFODNN7EXAMPLE12", "KEY=AKIAIOSFODNN7EXAMPL"]',
        expected: '[]'
      },
      {
        input: '["password=abc defghij", "secret=12345678"]',
        expected: '[2]'
      }
    ],
    solutionCode:
      'function findSecrets(lines) {\n' +
      '  const awsKey = /\\bAKIA[A-Z0-9]{16}\\b/;\n' +
      '  const credential = /(password|secret|token|api_key)\\s*=\\s*\\S{8,}/i;\n' +
      '  const found = [];\n' +
      '  for (let i = 0; i < lines.length; i++) {\n' +
      '    const line = lines[i];\n' +
      '    if (line.trim().startsWith("#")) continue;\n' +
      '    if (awsKey.test(line) || credential.test(line)) {\n' +
      '      found.push(i + 1);\n' +
      '    }\n' +
      '  }\n' +
      '  return found;\n' +
      '}',
    hints: [
      'Skip comment lines before you test anything, or the scanner reports its own examples.',
      'Trim the line first: a comment can be indented.'
    ],
    explanation:
      'A secret scanner is a set of narrow rules run per line, with a comment skip so documented placeholders do not become alerts, and a line is reported once even when several rules match it. Word boundaries around the AKIA pattern enforce the exact length, and the length floor on the credential value (counted in non-space characters) keeps DB_PASSWORD=short and other obvious non-secrets out of the report; low false positives are the only reason anyone keeps a scanner in CI.',
    xpReward: 110,
    tags: ['secrets-scanning', 'security', 'regex', 'ci-cd']
  }
];
