# Web Development: how the browser actually works
<!-- stage: stage-5 -->

> HTML gives a page structure, CSS gives it shape, JavaScript makes it move - and the browser has rules for how the three interact. This article covers the DOM, events, the event loop, promises and fetch, CSS layout and the cascade, storage, accessibility and the security basics.

## The DOM: querying and mutating
<!-- tags: dom, querying, html-collection, mutation, appendchild, trees, recursion -->

The browser parses HTML into the **DOM**, a tree of nodes. JavaScript reads and changes the page by walking that tree.

```javascript
const item = document.querySelector(".item");         // first match or null
const all  = document.querySelectorAll(".item");      // static NodeList
const live = document.getElementsByClassName("item"); // live HTMLCollection

const li = document.createElement("li");
li.textContent = "New";              // textContent escapes; innerHTML does not
list.appendChild(li);                // moves li if it was already in the tree
```

`querySelectorAll` returns a **static** snapshot; `getElementsByClassName` returns a **live** collection that changes as the DOM does - looping over a live collection while removing its elements skips every other one. `appendChild` *moves* a node that is already somewhere in the document; a node can only be in one place.

Because the DOM is a tree, recursive walks are natural: visit a node, then each of its `children`.

## Events: bubbling, delegation, closest
<!-- tags: events, bubbling, delegation, stoppropagation, closest -->

An event fires on its target, then **bubbles** up through every ancestor to `document`. A handler on a parent therefore sees clicks on all of its children - which is **event delegation**: one listener on the list instead of one per item, and it keeps working for items added later.

```javascript
list.addEventListener("click", (e) => {
  const row = e.target.closest("li");   // walk up from whatever was clicked
  if (!row || !list.contains(row)) return;
  row.classList.toggle("done");
});
```

`e.target` is the deepest element clicked; `e.currentTarget` is the element the listener is on. `e.stopPropagation()` stops the bubble; `e.preventDefault()` stops the browser's default action (following a link, submitting a form) and does **not** stop propagation. Some events - `focus`, `blur`, `mouseenter` - do not bubble at all.

## The event loop, microtasks and timers
<!-- tags: event-loop, microtasks, settimeout, async -->

JavaScript runs one thing at a time. The **event loop** takes tasks from a queue - a click handler, a timer callback, a network response - and runs each to completion. Between tasks it drains the **microtask queue**, which is where promise callbacks go.

```javascript
console.log("1");
setTimeout(() => console.log("4"), 0);
Promise.resolve().then(() => console.log("3"));
console.log("2");
// 1 2 3 4 - microtasks run before the next task, even a 0ms timer
```

`setTimeout(fn, 0)` means "no sooner than 0ms, after the current task and all microtasks". Long synchronous work blocks everything - no clicks, no rendering - which is why heavy computation belongs in a Web Worker.

## Promises and async/await
<!-- tags: promises, async-await, allsettled, retry, error-handling -->

A **promise** is a value that will arrive later. It settles exactly once as *fulfilled* or *rejected*. `.then` chains transform the value; `.catch` handles a rejection anywhere upstream.

`async/await` is the same machinery with loop-and-try syntax:

```javascript
async function fetchWithRetry(url, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === attempts) throw err;
      await new Promise((r) => setTimeout(r, 200 * 2 ** i));   // back off
    }
  }
}
```

Combinators: `Promise.all` rejects as soon as any input rejects; `Promise.allSettled` waits for all and reports each outcome; `Promise.race` settles with the first to settle; `Promise.any` with the first to fulfil. A forgotten `await` returns a pending promise instead of a value - the most common async bug.

## fetch, HTTP and CORS
<!-- tags: fetch, http, url, query-string, cors, browser -->

`fetch` sends an HTTP request and resolves with a `Response` as soon as headers arrive. It **does not reject on 4xx or 5xx** - check `res.ok` or `res.status` yourself. The body is read separately (`res.json()`, `res.text()`) and only once.

Build URLs with the `URL` API rather than string concatenation; it encodes for you:

```javascript
const url = new URL("/search", location.origin);
url.searchParams.set("q", "a&b=c");     // ?q=a%26b%3Dc
url.searchParams.get("q");              // "a&b=c"
```

**CORS** is a browser rule: a page on one origin may only read responses from another origin if the server says so with `Access-Control-Allow-Origin`. Requests with custom headers or a JSON body trigger a **preflight** `OPTIONS` request first. CORS protects users from malicious pages reading their data on other sites; it is not a server security measure - `curl` ignores it.

## CSS: cascade, specificity, box model
<!-- tags: css, specificity, cascade, box-model, box-sizing, units, em, rem, comparison -->

When several rules target one element, the **cascade** decides: `!important` first, then origin (author beats browser default), then **specificity**, then source order. Specificity is counted as (ids, classes/attributes/pseudo-classes, elements): `#nav a` (1,0,1) beats `.nav .link` (0,2,0) beats `nav a` (0,0,2). Inline styles beat any selector.

The **box model**: content, then padding, then border, then margin. With the default `box-sizing: content-box`, `width: 200px` plus `padding: 20px` renders 240px wide. `box-sizing: border-box` makes `width` include padding and border, which is why nearly every stylesheet starts with it.

Units: `px` is absolute. `em` is relative to the element's own font size, so it compounds through nesting; `rem` is relative to the root font size and does not. Use `rem` for spacing and type scales, `em` when something should scale with its own text.

## Layout: flexbox, grid, positioning and stacking
<!-- tags: flexbox, grid, positioning, stacking-context, z-index -->

**Flexbox** lays children out along one axis. `justify-content` distributes along the main axis, `align-items` across it, `gap` spaces them, `flex: 1` lets an item grow. Its automatic minimum size (`min-width: auto`) is the source of many overflow bugs - `min-width: 0` fixes them.

**Grid** lays out in two dimensions: `grid-template-columns: repeat(3, 1fr)` and children fill cells. Use grid for the page and flexbox for the components inside it.

`position: relative` keeps an element in flow but offsets it and makes it the reference for absolutely positioned children. `position: absolute` removes it from flow and positions against the nearest positioned ancestor. `position: sticky` is relative until it hits a scroll threshold, then fixed.

`z-index` only works on positioned elements and only *within a stacking context*. An element with `z-index: 9999` inside a parent that created its own context (`transform`, `opacity < 1`, `position` with a z-index) can never appear above a sibling of that parent.

## Storage
<!-- tags: storage, sessionStorage, coercion -->

`localStorage` persists until cleared; `sessionStorage` lives for the tab. Both store **strings only** - `setItem("n", 5)` stores `"5"`, and `getItem` returns a string or `null`. Use `JSON.stringify` / `JSON.parse` for anything else, and wrap access in `try/catch`: private mode and blocked storage throw.

Cookies are sent with every request to their domain, so keep them small and mark session cookies `HttpOnly` and `Secure`. `IndexedDB` is the structured, asynchronous option for larger data.

## Accessibility and semantic HTML
<!-- tags: accessibility, semantic-html, aria -->

Semantic elements - `<button>`, `<nav>`, `<main>`, `<h1>`–`<h6>`, `<label>` - carry meaning that screen readers and keyboards understand for free. A `<div onclick>` is not focusable, not announced as a button, and does not respond to Enter or Space; a `<button>` does all three.

Rules of thumb: every image has `alt`; every form control has a label; the heading levels form an outline; anything clickable is reachable by keyboard and shows focus. **ARIA** fills gaps the native elements cannot (`aria-expanded`, `aria-live`, `role="dialog"`) - and the first rule of ARIA is *do not use ARIA* when a native element already does the job.

## Security basics: XSS
<!-- tags: security, xss -->

**Cross-site scripting** is user-supplied text being interpreted as HTML or script. The fix is at the boundary: treat all data as text.

```javascript
el.textContent = userInput;    // safe: rendered as text
el.innerHTML = userInput;      // unsafe: "<img onerror=...>" runs
```

Frameworks escape by default; the escape hatches (`dangerouslySetInnerHTML`, `v-html`) are named that way for a reason. A `Content-Security-Policy` header limits where scripts may load from and is the second line of defence. Stage 10 returns to headers and hardening.

## Debugging in the browser
<!-- tags: debugging, strings -->

The Elements panel shows the *live* DOM, not your source HTML - if something is missing, JavaScript removed it or never added it. The Network panel shows every request, its status and its response body; a `fetch` that "does nothing" usually has a red row there. `console.log` an object and you see its state *when you expand it*, not when you logged it - use `console.log(JSON.stringify(obj))` or `structuredClone(obj)` to freeze a snapshot.
