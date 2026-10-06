# Question reference and review notes

These are primary reference anchors for the newly authored material, not copied question banks. Prompts, examples, explanations and distractors were written for this application. Most elementary questions use stable language or algorithm knowledge. Documentation checks concentrate on ambiguous, version-sensitive and easily misstated contracts. A link does not constitute proof of every answer; runnable predictions have separate execution evidence.

| Question group | Primary references | Review focus |
| --- | --- | --- |
| stage-1-c01–c50 | [MDN JavaScript Guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide) | Scope, conversion, defaults, arrays, closures and errors; all 50 snippets execute in Node. |
| stage-2-c01–c50 | [Python tutorial](https://docs.python.org/3/tutorial/), [built-in types](https://docs.python.org/3/library/stdtypes.html) | Mutability, slicing, truthiness, division, sorting, generators and defaults; all 50 snippets execute in CPython. |
| stage-3-c01–c40; stage-4-c01–c40 | [MIT 6.006 algorithms course](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/) | Distinguish worst-case from amortized bounds; state sortedness, graph weights and data-structure assumptions. |
| stage-5-c18–c21 | [MDN Fetch guide](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch) | HTTP error responses versus rejected requests, asynchronous bodies, cancellation and browser CORS boundaries. |
| stage-5-c01–c17; c22–c40 | [MDN web documentation](https://developer.mozilla.org/en-US/docs/Web) | Native DOM/event behavior, CSS cascade context, storage, keyboard semantics and safe text rendering. |
| stage-6-c01–c22 | [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html), [MDN Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control) | Safe methods, intended effects versus identical responses, status meanings, content negotiation, no-store versus no-cache. |
| stage-6-c23–c40 | [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) | Authentication is not object authorization; no frontend-only security, secret-bearing errors or unverified token claims. |
| stage-7-c01–c40 | [PostgreSQL tutorial](https://www.postgresql.org/docs/current/tutorial.html), [table expressions](https://www.postgresql.org/docs/current/queries-table-expressions.html), [comparisons](https://www.postgresql.org/docs/current/functions-comparisons.html), [EXPLAIN](https://www.postgresql.org/docs/current/sql-explain.html) | SQL NULL/UNKNOWN, join multiplication, aggregate semantics, key constraints and explicit PostgreSQL execution behavior. |
| stage-8-c01–c16; c39 | [Git reference](https://git-scm.com/docs), [restore](https://git-scm.com/docs/git-restore), [stash](https://git-scm.com/docs/git-stash) | Index versus working tree, fetch versus integration, safe undo, untracked versus ignored files. |
| stage-8-c28–c34 | [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/), [SemVer 2.0.0](https://semver.org/) | Lockfile consistency, numeric version components, prerelease precedence and stable-API version rules. |
| stage-9-c21 | [Gilbert and Lynch CAP paper](https://groups.csail.mit.edu/tds/papers/Gilbert/Brewer2.pdf) | CAP is specifically about partitions, linearizable consistency and availability, not an unconditional “choose any two” slogan. |
| stage-9-c29–c36 | [AWS retry/backoff guidance](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/) | Bounded retries, jitter, uncertain remote outcomes and idempotency. The fetched page redirected to the AWS Builder site; do not treat an unreadable redirect as independent verification. |
| stage-9-c37–c40; stage-10-c20–c28 | [Google SRE monitoring](https://sre.google/sre-book/monitoring-distributed-systems/) | Tail latency, useful signals, correlation and actionable alerts rather than guarantees from a single metric. |
| stage-10-c29–c31 | [Google SRE postmortem culture](https://sre.google/sre-book/postmortem-culture/) | Systems-oriented learning and owned, measurable follow-ups. |
| stage-c1-b01–b40 | [WG14 N1570 C11 committee draft](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf) | Integer semantics, initialization, pointer/lifetime boundaries, allocation and formatted I/O. All 20 snippets compile as C11 and execute. |
| stage-cpp1-b01–b40 | [C++ working draft](https://eel.is/c++draft/), [moved-from library types](https://eel.is/c++draft/lib.types.movedfrom) | References versus copies, iterator validity, RAII, moved-from values and standard containers. All 20 snippets compile as C++14 and execute. No claim that compiler execution proves absence of undefined behavior in arbitrary code. |

## Deliberate qualifications

- No questions assume a universal byte width for `int`, the sign of plain `char`, signed-overflow wraparound, a particular pointer address or unordered-container iteration order.
- C++ output examples use separate statements when observation depends on mutation. The verifier caught a map insertion/size expression whose evaluation order was not suitable for C++14; insertion now happens first in its own statement.
- SQL questions use portable relational semantics except where PostgreSQL is named. They do not claim every database implements every indexing optimization identically.
- Distributed-system choices describe a stated workload or guarantee. They do not promise that replicas are instantaneous, retries are harmless, or adding machines always scales linearly.
- C/C++ questions remain in their own tracks. There are no fabricated C/C++ reading pages or roadmap nodes.
- The expansion is **360 conceptual quizzes and 140 executable output predictions**. Existing fill-in, multiple-select, pseudocode, runner and debugging challenges remain intact. This expansion focuses on knowledge and tracing; it does not claim 500 new coding-runner problems.

## Review findings fixed before completion

1. Three production-performance questions initially used a tag not present in their article; use `performance-budget` instead.
2. Broad subject tags matched first article sections in data structures and system design, tying with the real topic. Category tags now have a `-practice` suffix and all reading links are tested through the real resolver.
3. A C string literal needed double escaping in TypeScript so learners see a literal `\\0`, not an embedded NUL byte.
4. The URL-fragment question now includes path and query alternatives from one explicit URL, avoiding ambiguity about other request components.
5. Distractor length and one answer-revealing prompt were corrected; content-lint rules remain unchanged.
6. Node schema parsing and browser loading order object keys differently. Preservation checks canonicalize object keys without changing array order or dropping field values.
