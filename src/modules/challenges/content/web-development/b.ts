import { Challenge } from '@/types';

/**
 * Stage 05 - Web Development, batch B.
 * Covers CSS units, the box model, flexbox vs grid, stacking contexts,
 * specificity, fetch and CORS, client-side storage, semantic HTML and
 * escaping untrusted text.
 */
export const challenges: Challenge[] = [
  {
    id: 'stage-5-b01',
    stageId: 'stage-5',
    title: 'Sizing text with em and rem',
    type: 'quiz',
    difficulty: 'easy',
    language: 'css',
    prompt:
      'The markup is <div class="card"><p>Hi</p></div>. What font-size does the paragraph compute to?',
    codeSnippet:
      'html { font-size: 16px; }\n' +
      '\n' +
      '.card { font-size: 1.5rem; }\n' +
      '.card p { font-size: 0.5em; }',
    options: ['12px', '8px', '24px', '16px'],
    correctIndex: 0,
    hints: [
      'Only one of these two units ignores where the element sits in the tree.',
      'Resolve the rules outermost first; the paragraph is not a child of html.'
    ],
    explanation:
      'rem always measures against the root element, so 1.5rem on .card is 1.5 x 16 = 24px. For the font-size property em measures against the size the element inherits, which is that 24px, so 0.5em lands on 12px rather than the 8px that 0.5rem would give.',
    xpReward: 40,
    tags: ['css', 'units', 'em', 'rem']
  },
  {
    id: 'stage-5-b02',
    stageId: 'stage-5',
    title: 'Measuring a border-box card',
    type: 'quiz',
    difficulty: 'medium',
    language: 'css',
    prompt:
      'How wide is the content area of .card, and how much horizontal space does the element take up in its parent?',
    codeSnippet:
      '.card {\n' +
      '  box-sizing: border-box;\n' +
      '  width: 320px;\n' +
      '  padding: 24px;\n' +
      '  border: 4px solid #333;\n' +
      '  margin: 16px;\n' +
      '}',
    options: [
      'Content 320px wide; the element occupies 408px including margins',
      'Content 264px wide; the element occupies 352px including margins',
      'Content 272px wide; the element occupies 352px including margins',
      'Content 264px wide; the element occupies 320px including margins'
    ],
    correctIndex: 1,
    hints: [
      'Decide first which parts of the box the declared 320px is measuring.',
      'Margins sit outside the border box but still consume space in the parent.'
    ],
    explanation:
      'box-sizing: border-box makes width cover content plus padding plus border, so the content area is 320 - 48 - 8 = 264px. Margins are never inside that box, so the element still claims 320 + 16 + 16 = 352px of horizontal space.',
    xpReward: 70,
    tags: ['css', 'box-model', 'box-sizing']
  },
  {
    id: 'stage-5-b03',
    stageId: 'stage-5',
    title: 'Reading back from sessionStorage',
    type: 'output_prediction',
    difficulty: 'easy',
    language: 'javascript',
    prompt: 'What does this program print?',
    codeSnippet:
      'sessionStorage.setItem("count", 1);\n' +
      'const raw = sessionStorage.getItem("count");\n' +
      'console.log(typeof raw, raw + 1);\n' +
      'console.log(sessionStorage.getItem("missing"));',
    options: [
      'string 11 then undefined',
      'number 2 then null',
      'string 11 then null',
      'string 2 then null'
    ],
    correctIndex: 2,
    hints: [
      'The value went in as a number literal - check what comes back out.',
      'Look up what getItem returns for a key that was never set.'
    ],
    explanation:
      'setItem coerces the value to a string, so getItem returns "1" and "1" + 1 concatenates to "11". A key that is absent yields null, not undefined, which is why storage reads are usually wrapped in JSON.parse with a fallback.',
    xpReward: 40,
    tags: ['storage', 'sessionStorage', 'coercion']
  },
  {
    id: 'stage-5-b04',
    stageId: 'stage-5',
    title: 'Changes that help a screen reader',
    type: 'multi_select',
    difficulty: 'medium',
    language: 'html',
    prompt:
      'Which of these changes genuinely improve the experience for keyboard and screen reader users? Select every one that applies.',
    options: [
      'Replacing a clickable <div onclick> with a real <button> element',
      'Giving an informative image alt text that describes what it shows',
      'Adding role="button" to an element that is already a <button>',
      'Wrapping the primary content of the page in a <main> element',
      'Using <div class="title-xl"> styled like a heading instead of <h1>',
      'Setting outline: none on links and adding no other focus style'
    ],
    correctIndices: [0, 1, 3],
    hints: [
      'Native elements already carry a role, keyboard behaviour and focus.',
      'Ask what a user gains who never sees the page at all.'
    ],
    explanation:
      'A real button is focusable, activates on Enter and Space, and announces its role for free, and <main> gives a landmark to jump to. Redundant ARIA adds nothing, a styled div is announced as plain text with no heading level, and removing the focus ring leaves keyboard users with no idea where they are.',
    xpReward: 70,
    tags: ['accessibility', 'semantic-html', 'aria']
  },
  {
    id: 'stage-5-b05',
    stageId: 'stage-5',
    title: 'Pick the right layout mode',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'css',
    prompt:
      'The gallery needs three equal columns; the toolbar is a single row whose items must sit on the same centre line. Fill in the blanks.',
    codeSnippet:
      '.gallery {\n' +
      '  display: ___;\n' +
      '  grid-template-columns: repeat(3, 1fr);\n' +
      '  gap: 16px;\n' +
      '}\n' +
      '\n' +
      '.toolbar {\n' +
      '  display: flex;\n' +
      '  justify-content: space-between;\n' +
      '  ___: center;\n' +
      '}',
    blanks: [
      { answer: 'grid', choices: ['grid', 'flex', 'block', 'inline-flex'] },
      {
        answer: 'align-items',
        choices: ['align-items', 'align-content', 'justify-items', 'text-align']
      }
    ],
    hints: [
      'Three equal columns is a two-dimensional layout; a single row is one-dimensional.',
      'In a flex row, justify-content works along the main axis; the other axis needs its own property.'
    ],
    explanation:
      'Grid lays out two axes at once, which is what repeat(3, 1fr) needs, while flex is the natural fit for one row of items. In a flex row align-items centres on the cross axis; align-content only does anything once the container wraps onto multiple lines.',
    xpReward: 40,
    tags: ['css', 'flexbox', 'grid']
  },
  {
    id: 'stage-5-b06',
    stageId: 'stage-5',
    title: 'A fetch that notices failure',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'javascript',
    prompt:
      'Complete the helper so a 404 or 500 response raises an error instead of being parsed as data.',
    codeSnippet:
      'async function loadUser(id) {\n' +
      '  const res = await fetch("/api/users/" + id);\n' +
      '  if (!res.___) {\n' +
      '    throw new Error("Request failed: " + res.status);\n' +
      '  }\n' +
      '  return res.___();\n' +
      '}',
    blanks: [
      { answer: 'ok', choices: ['ok', 'success', 'error', 'done'] },
      { answer: 'json', choices: ['json', 'parse', 'body', 'toJSON'] }
    ],
    hints: [
      'A 404 is still a delivered response, so the promise resolves normally.',
      'Reading the body is itself asynchronous and returns a promise.'
    ],
    explanation:
      'A fetch promise resolves for every HTTP response, including 404 and 500, so the status has to be checked explicitly; res.ok is true only for statuses in the 200-299 range. res.json() reads the body stream and returns a promise for the parsed value.',
    xpReward: 40,
    tags: ['fetch', 'http', 'async']
  },
  {
    id: 'stage-5-b07',
    stageId: 'stage-5',
    title: 'Order the CORS preflight',
    type: 'pseudocode_order',
    difficulty: 'medium',
    language: 'pseudocode',
    prompt:
      'Put these steps in the order a browser follows when a page on one origin sends a cross-origin request that is not a simple request.',
    pseudocodeLines: [
      'SET request TO PUT /api/orders WITH header X-Auth-Token',
      'IF the request is not a simple request THEN',
      '    SEND an OPTIONS preflight to the same URL',
      '    READ Access-Control-Allow-Origin from the preflight response',
      '    IF the origin is not allowed THEN ABORT with a CORS error',
      'END IF',
      'SEND the actual PUT request',
      'HAND the response body to the calling page'
    ],
    hints: [
      'The browser asks for permission before it sends the real request.',
      'The page only ever sees a body once the check has passed.'
    ],
    explanation:
      'A custom header or a method beyond GET, HEAD and POST makes the request non-simple, so the browser first sends an OPTIONS preflight and reads the Access-Control-Allow-* headers. Only if the server approves does the real request go out, and only then is the response exposed to the page.',
    xpReward: 70,
    tags: ['cors', 'http', 'browser']
  },
  {
    id: 'stage-5-b08',
    stageId: 'stage-5',
    title: 'Which box is painted on top',
    type: 'pseudocode_order',
    difficulty: 'hard',
    language: 'pseudocode',
    prompt:
      'Two positioned boxes overlap. Put these steps in the order the browser uses to decide which one is painted on top.',
    pseudocodeLines: [
      'FIND the nearest ancestor of each box that creates a stacking context',
      'IF both boxes share the same stacking context THEN',
      '    COMPARE the z-index values of the two boxes',
      '    IF those values are equal THEN prefer the box later in the DOM',
      'ELSE',
      '    COMPARE the two ancestor contexts instead of the boxes themselves',
      'END IF',
      'PAINT the losing box first, then paint the winner over it'
    ],
    hints: [
      'z-index is only ever compared inside one stacking context, never across two.',
      'A parent with opacity or transform can trap a huge z-index inside itself.'
    ],
    explanation:
      'z-index is meaningful only among children of one stacking context, so the ancestors are resolved first: a child with z-index 9999 still loses if its parent context sits below the other box. Within a context, higher z-index wins and DOM order breaks ties.',
    xpReward: 110,
    tags: ['css', 'stacking-context', 'z-index', 'positioning']
  },
  {
    id: 'stage-5-b09',
    stageId: 'stage-5',
    title: 'Resolve the cascade',
    type: 'code_runner',
    difficulty: 'hard',
    language: 'javascript',
    prompt:
      'Each rule is { selector: [ids, classes, elements], color }, listed in source order. Return the colour of the rule that wins the cascade, or null when there are no rules.',
    starterCode:
      'function pickWinner(rules) {\n' + '  // your code here\n' + '  return null;\n' + '}',
    entryFunction: 'pickWinner',
    testCases: [
      {
        input: '[{ selector: [0, 0, 1], color: "red" }, { selector: [0, 1, 0], color: "blue" }]',
        expected: '"blue"'
      },
      {
        input: '[{ selector: [0, 1, 0], color: "blue" }, { selector: [0, 1, 0], color: "green" }]',
        expected: '"green"'
      },
      {
        input: '[{ selector: [1, 0, 0], color: "teal" }, { selector: [0, 5, 5], color: "gray" }]',
        expected: '"teal"'
      },
      { input: '[{ selector: [0, 0, 0], color: "black" }]', expected: '"black"' },
      { input: '[]', expected: 'null' }
    ],
    solutionCode:
      'function atLeastAsStrong(a, b) {\n' +
      '  for (let i = 0; i < 3; i++) {\n' +
      '    if (a[i] !== b[i]) return a[i] > b[i];\n' +
      '  }\n' +
      '  return true;\n' +
      '}\n' +
      '\n' +
      'function pickWinner(rules) {\n' +
      '  let best = null;\n' +
      '  for (const rule of rules) {\n' +
      '    if (best === null || atLeastAsStrong(rule.selector, best.selector)) {\n' +
      '      best = rule;\n' +
      '    }\n' +
      '  }\n' +
      '  return best === null ? null : best.color;\n' +
      '}',
    hints: [
      'Compare the three numbers left to right and stop at the first difference.',
      'A later rule should replace the current winner on an exact tie.'
    ],
    explanation:
      'Specificity is a three-part tuple compared left to right, so the first differing component decides the whole comparison and 1-0-0 beats 0-5-5 outright. Only an exact tie falls through to source order, which is why the later rule replaces the winner when every component matches.',
    xpReward: 110,
    tags: ['css', 'specificity', 'cascade', 'comparison']
  },
  {
    id: 'stage-5-b10',
    stageId: 'stage-5',
    title: 'Fix the HTML escaper',
    type: 'debug',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'escapeHtml should make untrusted text safe to insert with innerHTML, but any input containing a tag comes back mangled. Find the bug and fix it.',
    starterCode:
      'function escapeHtml(text) {\n' +
      '  return text\n' +
      '    .replace(/</g, "&lt;")\n' +
      '    .replace(/>/g, "&gt;")\n' +
      '    .replace(/&/g, "&amp;");\n' +
      '}',
    entryFunction: 'escapeHtml',
    testCases: [
      { input: '"<b>hi</b>"', expected: '"&lt;b&gt;hi&lt;/b&gt;"' },
      { input: '"Tom & Jerry"', expected: '"Tom &amp; Jerry"' },
      { input: '"5 > 3"', expected: '"5 &gt; 3"' },
      { input: '"plain text"', expected: '"plain text"' }
    ],
    solutionCode:
      'function escapeHtml(text) {\n' +
      '  return text\n' +
      '    .replace(/&/g, "&amp;")\n' +
      '    .replace(/</g, "&lt;")\n' +
      '    .replace(/>/g, "&gt;");\n' +
      '}',
    hints: [
      'Push "<b>" through the three replacements by hand and read what comes out.',
      'Each replacement writes a character that one of the other replacements also matches.'
    ],
    explanation:
      'Every entity these replacements produce starts with an ampersand, so escaping & last re-escapes the ones that &lt; and &gt; just introduced and "<b>" turns into "&amp;lt;b&amp;gt;". The ampersand has to go first, while no entity exists for it to corrupt.',
    xpReward: 70,
    tags: ['security', 'xss', 'strings', 'debugging']
  },
  {
    id: 'stage-5-b11',
    stageId: 'stage-5',
    title: 'Frontend Assessment: Interactive Product Card & Cart Controller',
    type: 'code_runner',
    difficulty: 'hard',
    language: 'html',
    uiPreview: true,
    prompt:
      'Front-End Coding Assessment: Build an interactive e-commerce product card with real-time state and boundary validation: (1) #product-title with "Wireless Pro Headphones" and #unit-price with "$99", (2) A quantity controller with #qty-decrement, #qty-val (starting at "1"), and #qty-increment. Decrement must not go below 1; increment must not exceed 10. (3) #subtotal displaying the total price ($99 * quantity, e.g. "$99", "$198"), (4) #add-to-cart button that on click adds the selected quantity to cart badge #cart-count and displays #status-msg with text "Added to cart!".',
    starterCode:
      '<div class="shop-widget">\n' +
      '  <header class="shop-header">\n' +
      '    <span>DevStore</span>\n' +
      '    <div class="cart-badge">Cart: <span id="cart-count">0</span></div>\n' +
      '  </header>\n\n' +
      '  <div class="product-card">\n' +
      '    <h3 id="product-title">Wireless Pro Headphones</h3>\n' +
      '    <div class="price-row">\n' +
      '      <span>Unit Price:</span>\n' +
      '      <span id="unit-price">$99</span>\n' +
      '    </div>\n\n' +
      '    <div class="qty-control">\n' +
      '      <button id="qty-decrement" type="button">-</button>\n' +
      '      <span id="qty-val">1</span>\n' +
      '      <button id="qty-increment" type="button">+</button>\n' +
      '    </div>\n\n' +
      '    <div class="subtotal-row">\n' +
      '      <span>Subtotal:</span>\n' +
      '      <strong id="subtotal">$99</strong>\n' +
      '    </div>\n\n' +
      '    <button id="add-to-cart" class="btn-primary" type="button">Add to Cart</button>\n' +
      '    <p id="status-msg" class="status-hidden"></p>\n' +
      '  </div>\n' +
      '</div>\n\n' +
      '<style>\n' +
      '  .shop-widget { font-family: sans-serif; max-width: 360px; background: #0f172a; color: #f8fafc; border-radius: 14px; padding: 20px; border: 1px solid #334155; }\n' +
      '  .shop-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 12px; margin-bottom: 16px; font-weight: 600; }\n' +
      '  .cart-badge { background: #3b82f6; padding: 4px 10px; border-radius: 999px; font-size: 13px; }\n' +
      '  .price-row, .subtotal-row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; color: #cbd5e1; }\n' +
      '  .subtotal-row strong { font-size: 18px; color: #38bdf8; }\n' +
      '  .qty-control { display: flex; align-items: center; justify-content: center; gap: 16px; margin: 16px 0; }\n' +
      '  .qty-control button { width: 36px; height: 36px; font-size: 18px; font-weight: bold; border-radius: 8px; border: 1px solid #475569; background: #1e293b; color: #fff; cursor: pointer; }\n' +
      '  .qty-control span { font-size: 18px; font-weight: 600; min-width: 24px; text-align: center; }\n' +
      '  .btn-primary { width: 100%; padding: 10px; background: #10b981; color: #fff; border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; }\n' +
      '  #status-msg { margin-top: 10px; text-align: center; font-size: 13px; color: #34d399; min-height: 20px; }\n' +
      '</style>\n\n' +
      '<script>\n' +
      '  // TODO: Select elements: qty-decrement, qty-increment, qty-val, subtotal, add-to-cart, cart-count, status-msg\n' +
      '  // TODO: Maintain state: qty = 1, unitPrice = 99, cartTotal = 0\n' +
      '  // TODO: Handle decrement (min 1) and increment (max 10), updating #qty-val and #subtotal\n' +
      '  // TODO: Handle add-to-cart, adding quantity to #cart-count and displaying "Added to cart!" in #status-msg\n' +
      '</script>',
    solutionCode:
      '<div class="shop-widget">\n' +
      '  <header class="shop-header">\n' +
      '    <span>DevStore</span>\n' +
      '    <div class="cart-badge">Cart: <span id="cart-count">0</span></div>\n' +
      '  </header>\n\n' +
      '  <div class="product-card">\n' +
      '    <h3 id="product-title">Wireless Pro Headphones</h3>\n' +
      '    <div class="price-row">\n' +
      '      <span>Unit Price:</span>\n' +
      '      <span id="unit-price">$99</span>\n' +
      '    </div>\n\n' +
      '    <div class="qty-control">\n' +
      '      <button id="qty-decrement" type="button">-</button>\n' +
      '      <span id="qty-val">1</span>\n' +
      '      <button id="qty-increment" type="button">+</button>\n' +
      '    </div>\n\n' +
      '    <div class="subtotal-row">\n' +
      '      <span>Subtotal:</span>\n' +
      '      <strong id="subtotal">$99</strong>\n' +
      '    </div>\n\n' +
      '    <button id="add-to-cart" class="btn-primary" type="button">Add to Cart</button>\n' +
      '    <p id="status-msg" class="status-hidden"></p>\n' +
      '  </div>\n' +
      '</div>\n\n' +
      '<style>\n' +
      '  .shop-widget { font-family: sans-serif; max-width: 360px; background: #0f172a; color: #f8fafc; border-radius: 14px; padding: 20px; border: 1px solid #334155; }\n' +
      '  .shop-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 12px; margin-bottom: 16px; font-weight: 600; }\n' +
      '  .cart-badge { background: #3b82f6; padding: 4px 10px; border-radius: 999px; font-size: 13px; }\n' +
      '  .price-row, .subtotal-row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; color: #cbd5e1; }\n' +
      '  .subtotal-row strong { font-size: 18px; color: #38bdf8; }\n' +
      '  .qty-control { display: flex; align-items: center; justify-content: center; gap: 16px; margin: 16px 0; }\n' +
      '  .qty-control button { width: 36px; height: 36px; font-size: 18px; font-weight: bold; border-radius: 8px; border: 1px solid #475569; background: #1e293b; color: #fff; cursor: pointer; }\n' +
      '  .qty-control span { font-size: 18px; font-weight: 600; min-width: 24px; text-align: center; }\n' +
      '  .btn-primary { width: 100%; padding: 10px; background: #10b981; color: #fff; border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; }\n' +
      '  #status-msg { margin-top: 10px; text-align: center; font-size: 13px; color: #34d399; min-height: 20px; }\n' +
      '</style>\n\n' +
      '<script>\n' +
      '  const unitPrice = 99;\n' +
      '  let quantity = 1;\n' +
      '  let cartCount = 0;\n\n' +
      '  const decBtn = document.getElementById("qty-decrement");\n' +
      '  const incBtn = document.getElementById("qty-increment");\n' +
      '  const qtyVal = document.getElementById("qty-val");\n' +
      '  const subtotal = document.getElementById("subtotal");\n' +
      '  const addBtn = document.getElementById("add-to-cart");\n' +
      '  const cartSpan = document.getElementById("cart-count");\n' +
      '  const statusMsg = document.getElementById("status-msg");\n\n' +
      '  function updateDisplay() {\n' +
      '    qtyVal.textContent = String(quantity);\n' +
      '    subtotal.textContent = "$" + (quantity * unitPrice);\n' +
      '  }\n\n' +
      '  decBtn.addEventListener("click", () => {\n' +
      '    if (quantity > 1) {\n' +
      '      quantity -= 1;\n' +
      '      updateDisplay();\n' +
      '    }\n' +
      '  });\n\n' +
      '  incBtn.addEventListener("click", () => {\n' +
      '    if (quantity < 10) {\n' +
      '      quantity += 1;\n' +
      '      updateDisplay();\n' +
      '    }\n' +
      '  });\n\n' +
      '  addBtn.addEventListener("click", () => {\n' +
      '    cartCount += quantity;\n' +
      '    cartSpan.textContent = String(cartCount);\n' +
      '    statusMsg.textContent = "Added to cart!";\n' +
      '  });\n' +
      '</script>',
    testCases: [
      {
        input:
          '(() => {\n' +
          '  const title = document.querySelector("#product-title");\n' +
          '  const price = document.querySelector("#unit-price");\n' +
          '  const qty = document.querySelector("#qty-val");\n' +
          '  const subtotal = document.querySelector("#subtotal");\n' +
          '  return Boolean(title && title.textContent.includes("Wireless Pro Headphones") && price && price.textContent.includes("99") && qty && qty.textContent.trim() === "1" && subtotal && subtotal.textContent.includes("99"));\n' +
          '})()',
        expected: 'true'
      },
      {
        input:
          '(() => {\n' +
          '  const inc = document.querySelector("#qty-increment");\n' +
          '  const qty = document.querySelector("#qty-val");\n' +
          '  const sub = document.querySelector("#subtotal");\n' +
          '  inc?.click();\n' +
          '  inc?.click();\n' +
          '  return Boolean(qty && qty.textContent.trim() === "3" && sub && sub.textContent.includes("297"));\n' +
          '})()',
        expected: 'true'
      },
      {
        input:
          '(() => {\n' +
          '  const dec = document.querySelector("#qty-decrement");\n' +
          '  const qty = document.querySelector("#qty-val");\n' +
          '  const sub = document.querySelector("#subtotal");\n' +
          '  for (let i = 0; i < 10; i++) dec?.click();\n' +
          '  return Boolean(qty && qty.textContent.trim() === "1" && sub && sub.textContent.includes("99"));\n' +
          '})()',
        expected: 'true'
      },
      {
        input:
          '(() => {\n' +
          '  const inc = document.querySelector("#qty-increment");\n' +
          '  inc?.click();\n' +
          '  const addBtn = document.querySelector("#add-to-cart");\n' +
          '  addBtn?.click();\n' +
          '  const cart = document.querySelector("#cart-count");\n' +
          '  const msg = document.querySelector("#status-msg");\n' +
          '  return Boolean(cart && cart.textContent.trim() === "2" && msg && msg.textContent.includes("Added to cart!"));\n' +
          '})()',
        expected: 'true'
      }
    ],
    hints: [
      'Store quantity in a variable initialized to 1. In click listeners, check boundary conditions (quantity > 1 before decrementing, quantity < 10 before incrementing).',
      'Compute subtotal with "$" + (quantity * unitPrice) and write it into #subtotal.textContent.',
      'On #add-to-cart click, add quantity to cartCount and update #cart-count.textContent and #status-msg.textContent.'
    ],
    explanation:
      'This challenge mirrors real-world front-end technical coding assessments. It evaluates DOM manipulation, event listener handling, state synchronization, input boundary limits, and user feedback mechanisms.',
    xpReward: 250,
    tags: ['dom', 'events', 'ui', 'mutation']
  }
];
