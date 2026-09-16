import { Challenge } from '../../types';

/**
 * Stage 05 - Web Development, batch A.
 * DOM querying and mutation, event bubbling and delegation, the event loop,
 * URL query strings, promises, async/await and error handling in
 * asynchronous code.
 */
export const challenges: Challenge[] = [
  {
    id: 'stage-5-a01',
    stageId: 'stage-5',
    title: 'Live collections versus static lists',
    type: 'quiz',
    difficulty: 'easy',
    language: 'html',
    prompt:
      'A script appends a fourth <li class="item"> after running one of these queries. Which query result grows to 4 entries on its own?',
    codeSnippet:
      '<ul id="menu">\n' +
      '  <li class="item">Home</li>\n' +
      '  <li class="item">Docs</li>\n' +
      '  <li class="item">About</li>\n' +
      '</ul>',
    options: [
      'document.getElementsByClassName("item")',
      'document.querySelectorAll(".item")',
      'document.querySelector(".item")',
      'Array.from(document.querySelectorAll(".item"))'
    ],
    correctIndex: 0,
    hints: [
      'Some query results keep re-checking the document; others are frozen the moment they are built.',
      'Two of the options are built from the very same snapshot, so neither can behave differently.'
    ],
    explanation:
      'getElementsByClassName returns a live HTMLCollection that keeps tracking the document, so a newly inserted matching element appears in it automatically. querySelectorAll returns a static NodeList snapshot, querySelector returns a single element, and Array.from copies the snapshot into a plain array.',
    xpReward: 40,
    tags: ['dom', 'querying', 'html-collection']
  },
  {
    id: 'stage-5-a02',
    stageId: 'stage-5',
    title: 'What appendChild does to an existing node',
    type: 'output_prediction',
    difficulty: 'medium',
    language: 'javascript',
    prompt: 'What does this program print?',
    codeSnippet:
      'const list = document.createElement("ul");\n' +
      'list.innerHTML = "<li>a</li><li>b</li>";\n' +
      'const first = list.querySelector("li");\n' +
      'list.appendChild(first);\n' +
      'console.log(list.textContent);\n' +
      'console.log(list.children.length);',
    options: ['ba then 2', 'ab then 2', 'aba then 3', 'ab then 3'],
    hints: [
      'A DOM node can only sit in one place at a time.',
      'Ask what happens to whatever was sitting at position 0 once the call finishes.'
    ],
    correctIndex: 0,
    explanation:
      'appendChild moves an existing node rather than cloning it, so the first <li> is detached from position 0 and re-attached at the end. The list becomes b then a, textContent reads "ba", and the child count stays at 2. Use cloneNode(true) when you actually want a copy.',
    xpReward: 70,
    tags: ['dom', 'mutation', 'appendchild']
  },
  {
    id: 'stage-5-a03',
    stageId: 'stage-5',
    title: 'Microtasks jump the timer queue',
    type: 'output_prediction',
    difficulty: 'medium',
    language: 'javascript',
    prompt: 'In what order does this program log its five messages?',
    codeSnippet:
      'console.log("start");\n' +
      'setTimeout(() => console.log("timeout"), 0);\n' +
      'Promise.resolve().then(() => console.log("promise"));\n' +
      'queueMicrotask(() => console.log("micro"));\n' +
      'console.log("end");',
    options: [
      'start, end, promise, micro, timeout',
      'start, end, timeout, promise, micro',
      'start, timeout, promise, micro, end',
      'start, end, micro, promise, timeout'
    ],
    correctIndex: 0,
    hints: [
      'All top-level synchronous code runs before any callback does.',
      'The microtask queue is drained completely before the next macrotask.'
    ],
    explanation:
      'The synchronous lines log "start" and "end" first. The engine then drains the microtask queue in the order things were queued, so the already-resolved promise callback runs before the queueMicrotask callback. Only when no microtasks remain does the loop pick up the setTimeout macrotask.',
    xpReward: 70,
    tags: ['event-loop', 'microtasks', 'settimeout']
  },
  {
    id: 'stage-5-a04',
    stageId: 'stage-5',
    title: 'What is true about bubbling and delegation',
    type: 'multi_select',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'Which statements about event bubbling and event delegation are true? Select every one that applies.',
    options: [
      'A click on a child element also triggers a click listener attached to an ancestor.',
      'A delegated listener also handles rows that were inserted after it was attached.',
      'A capturing listener on an ancestor runs before any listener on the target itself.',
      'The focus event bubbles, so it can be delegated from a listener on document.',
      'Delegation works by attaching one listener to every child element.',
      'event.preventDefault() stops the event from reaching ancestor listeners.'
    ],
    correctIndices: [0, 1, 2],
    hints: [
      'Delegation exists precisely so you do not need one listener per row.',
      'An event makes two passes over the ancestor chain, and not every event type travels both of them.'
    ],
    explanation:
      'An event runs down the ancestor chain in the capture phase and back up in the bubble phase, so a capturing ancestor listener fires before any listener on the target, and a single bubble-phase listener on a container can serve every row - including rows added later, since that listener never has to know they exist. focus does not bubble (focusin does), delegation deliberately uses one listener instead of many, and preventDefault only cancels the browser default action, never propagation.',
    xpReward: 70,
    tags: ['events', 'bubbling', 'delegation']
  },
  {
    id: 'stage-5-a05',
    stageId: 'stage-5',
    title: 'Complete the delegated click handler',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'javascript',
    prompt:
      'Fill in the blanks so one listener on the list toggles a "done" class on whichever <li> was clicked, even when the click lands on a nested <span>.',
    codeSnippet:
      'const list = document.getElementById("todos");\n' +
      'list.addEventListener("click", (event) => {\n' +
      '  const item = event.___.closest("li");\n' +
      '  if (!item || !list.___(item)) return;\n' +
      '  item.classList.___("done");\n' +
      '});',
    blanks: [
      { answer: 'target', choices: ['target', 'currentTarget', 'relatedTarget'] },
      { answer: 'contains', choices: ['contains', 'includes', 'matches'] },
      { answer: 'toggle', choices: ['toggle', 'add', 'replace'] }
    ],
    hints: [
      'Think about which property differs when the click lands on a nested <span> rather than on the row itself.',
      'The walk that closest() performs does not stop at the list, so the middle blank has to check where it ended up.'
    ],
    explanation:
      'event.target is the deepest element that was clicked, so closest("li") walks up from there to the row. That walk keeps climbing past the list, so when one list sits inside another list row it can return an <li> outside this list; list.contains(item) rejects exactly that case. classList.toggle then flips the class on or off with a single call.',
    xpReward: 40,
    tags: ['delegation', 'dom', 'closest']
  },
  {
    id: 'stage-5-a06',
    stageId: 'stage-5',
    title: 'Guard an await with try/catch',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'javascript',
    prompt:
      'Fill in the blanks so this function awaits the response, turns a non-2xx status into an error, and reports any failure instead of crashing.',
    codeSnippet:
      'async function loadUser(id) {\n' +
      '  try {\n' +
      '    const res = ___ fetch("/users/" + id);\n' +
      '    if (!res.ok) ___ new Error("HTTP " + res.status);\n' +
      '    return await res.json();\n' +
      '  } ___ (err) {\n' +
      '    console.log("failed: " + err.message);\n' +
      '    return null;\n' +
      '  }\n' +
      '}',
    blanks: [
      { answer: 'await', choices: ['await', 'async', 'yield'] },
      { answer: 'throw', choices: ['throw', 'return', 'reject'] },
      { answer: 'catch', choices: ['catch', 'finally', 'else'] }
    ],
    hints: [
      'Without the first keyword, res would be a Promise and res.ok would be undefined.',
      'A rejected promise inside an async function surfaces as an exception at the await.'
    ],
    explanation:
      'await unwraps the promise so res is a real Response, and because fetch only rejects on network failure you must throw yourself when res.ok is false. try/catch catches both cases, because an awaited rejection is rethrown as a normal exception in the async function.',
    xpReward: 40,
    tags: ['async-await', 'fetch', 'error-handling']
  },
  {
    id: 'stage-5-a07',
    stageId: 'stage-5',
    title: 'Order the retry-with-backoff routine',
    type: 'pseudocode_order',
    difficulty: 'hard',
    language: 'pseudocode',
    prompt:
      'Put these pseudocode lines in the order that retries a failing request with exponential backoff, rethrows as soon as the last attempt fails, and never sleeps after that last attempt.',
    pseudocodeLines: [
      'FOR attempt FROM 1 TO maxAttempts',
      '    TRY',
      '        RETURN AWAIT fetchData(url)',
      '    CATCH error',
      '        IF attempt IS maxAttempts THEN THROW error',
      '        AWAIT sleep(baseDelay * 2 ^ attempt)',
      '    END TRY',
      'END FOR'
    ],
    hints: [
      'A successful call should leave the loop immediately, so the return belongs inside the TRY.',
      'Check whether any attempts are left before you pay for another delay.'
    ],
    explanation:
      'Each attempt runs inside its own TRY so a success returns straight away. In the CATCH you first decide whether attempts remain: if this was the last one, rethrow so the caller sees the real error; otherwise wait a growing delay before the loop issues the next attempt. Sleeping before the last-attempt check would delay the failure for no reason.',
    xpReward: 110,
    tags: ['async', 'retry', 'error-handling', 'pseudocode']
  },
  {
    id: 'stage-5-a08',
    stageId: 'stage-5',
    title: 'Parse a URL query string',
    type: 'code_runner',
    difficulty: 'easy',
    language: 'javascript',
    prompt:
      'Turn a query string into an object of key/value pairs. Drop a leading "?", skip empty segments, give a key written without "=" the value "", split each pair at its FIRST "=" only, and let a repeated key keep its last value.',
    starterCode:
      'function parseQuery(qs) {\n' +
      '  // your code here\n' +
      '  return {};\n' +
      '}',
    entryFunction: 'parseQuery',
    testCases: [
      {
        input: '"?page=2&sort=asc"',
        expected: '{ "page": "2", "sort": "asc" }'
      },
      { input: '"q=hello"', expected: '{ "q": "hello" }' },
      { input: '""', expected: '{}' },
      { input: '"?flag&x=1"', expected: '{ "flag": "", "x": "1" }' },
      { input: '"?a=1&a=2"', expected: '{ "a": "2" }' },
      { input: '"?next=/a=b"', expected: '{ "next": "/a=b" }' },
      { input: '"?&a=1&"', expected: '{ "a": "1" }' }
    ],
    solutionCode:
      'function parseQuery(qs) {\n' +
      '  const out = {};\n' +
      '  const body = qs.startsWith("?") ? qs.slice(1) : qs;\n' +
      '  for (const pair of body.split("&")) {\n' +
      '    if (pair === "") continue;\n' +
      '    const eq = pair.indexOf("=");\n' +
      '    if (eq === -1) out[pair] = "";\n' +
      '    else out[pair.slice(0, eq)] = pair.slice(eq + 1);\n' +
      '  }\n' +
      '  return out;\n' +
      '}',
    hints: [
      'Split the whole string on "&" first, then deal with one pair at a time.',
      'indexOf tells you where a pair separates; split("=") would cut it everywhere.'
    ],
    explanation:
      'A query string is a flat list of pairs joined by "&", so parsing is one split followed by a single cut per pair. Cutting at the first "=" by index keeps a value that itself contains "=" intact, a key with no "=" has no value to take, and because each pair simply assigns onto the object a repeated key naturally ends up holding the last value seen.',
    xpReward: 40,
    tags: ['url', 'query-string', 'strings']
  },
  {
    id: 'stage-5-a09',
    stageId: 'stage-5',
    title: 'Trace the bubbling phase',
    type: 'code_runner',
    difficulty: 'hard',
    language: 'javascript',
    prompt:
      'chain lists the event target and then each of its ancestors, target first and root last. Each entry has an id, a handler flag saying whether a listener is attached, and a stops flag saying whether that listener calls stopPropagation(); a node carrying no listener stops nothing. Return the ids of the listeners that actually run, in bubbling order.',
    starterCode:
      'function bubbleOrder(chain) {\n' +
      '  // your code here\n' +
      '  return [];\n' +
      '}',
    entryFunction: 'bubbleOrder',
    testCases: [
      {
        input:
          '[{ id: "btn", handler: true, stops: false }, ' +
          '{ id: "div", handler: true, stops: false }, ' +
          '{ id: "body", handler: true, stops: false }]',
        expected: '["btn", "div", "body"]'
      },
      {
        input:
          '[{ id: "btn", handler: false, stops: false }, ' +
          '{ id: "div", handler: true, stops: true }, ' +
          '{ id: "body", handler: true, stops: false }]',
        expected: '["div"]'
      },
      {
        input:
          '[{ id: "span", handler: true, stops: true }, ' +
          '{ id: "p", handler: true, stops: false }]',
        expected: '["span"]'
      },
      {
        input:
          '[{ id: "li", handler: false, stops: false }, ' +
          '{ id: "ul", handler: true, stops: false }, ' +
          '{ id: "body", handler: true, stops: true }]',
        expected: '["ul", "body"]'
      },
      {
        input:
          '[{ id: "a", handler: false, stops: false }, ' +
          '{ id: "b", handler: false, stops: false }]',
        expected: '[]'
      },
      {
        input:
          '[{ id: "menu", handler: false, stops: true }, ' +
          '{ id: "nav", handler: true, stops: false }]',
        expected: '["nav"]'
      }
    ],
    solutionCode:
      'function bubbleOrder(chain) {\n' +
      '  const fired = [];\n' +
      '  for (const node of chain) {\n' +
      '    if (!node.handler) continue;\n' +
      '    fired.push(node.id);\n' +
      '    if (node.stops) break;\n' +
      '  }\n' +
      '  return fired;\n' +
      '}',
    hints: [
      'A node with no listener is simply skipped - the event still passes through it.',
      'For a node that stops propagation, which comes first: its own listener running, or the walk upwards halting?'
    ],
    explanation:
      'Bubbling visits every ancestor in turn but only fires the ones with a listener attached. stopPropagation does not cancel the listener that calls it, it prevents the event from reaching anything further up, which is why the id is recorded before the loop breaks.',
    xpReward: 110,
    tags: ['events', 'bubbling', 'stoppropagation']
  },
  {
    id: 'stage-5-a10',
    stageId: 'stage-5',
    title: 'Fix the settled-results collector',
    type: 'debug',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'allResults models Promise.allSettled: every task must produce a report, whether it succeeded or failed. This version behaves like Promise.all and gives up on the first failure. Fix it.',
    starterCode:
      'function allResults(tasks) {\n' +
      '  const out = [];\n' +
      '  for (const task of tasks) {\n' +
      '    if (!task.ok) return [{ status: "rejected", reason: task.value }];\n' +
      '    out.push({ status: "fulfilled", value: task.value });\n' +
      '  }\n' +
      '  return out;\n' +
      '}',
    entryFunction: 'allResults',
    testCases: [
      {
        input: '[{ ok: true, value: 1 }, { ok: true, value: 2 }]',
        expected:
          '[{ "status": "fulfilled", "value": 1 }, ' +
          '{ "status": "fulfilled", "value": 2 }]'
      },
      {
        input: '[{ ok: true, value: 1 }, { ok: false, value: "boom" }]',
        expected:
          '[{ "status": "fulfilled", "value": 1 }, ' +
          '{ "status": "rejected", "reason": "boom" }]'
      },
      {
        input: '[{ ok: false, value: "e1" }, { ok: false, value: "e2" }]',
        expected:
          '[{ "status": "rejected", "reason": "e1" }, ' +
          '{ "status": "rejected", "reason": "e2" }]'
      },
      { input: '[]', expected: '[]' }
    ],
    solutionCode:
      'function allResults(tasks) {\n' +
      '  const out = [];\n' +
      '  for (const task of tasks) {\n' +
      '    if (task.ok) out.push({ status: "fulfilled", value: task.value });\n' +
      '    else out.push({ status: "rejected", reason: task.value });\n' +
      '  }\n' +
      '  return out;\n' +
      '}',
    hints: [
      'A failure is a result to record, not a reason to leave the loop.',
      'Compare what Promise.all does on rejection with what Promise.allSettled does.'
    ],
    explanation:
      'Promise.all short-circuits: the first rejection settles the whole thing and the other outcomes are lost. Promise.allSettled waits for every input and reports each one as fulfilled with a value or rejected with a reason, so the loop must push a record for a failing task instead of returning early.',
    xpReward: 70,
    tags: ['promises', 'allsettled', 'error-handling', 'debugging']
  }
];
