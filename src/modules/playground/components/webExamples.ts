/**
 * Starter sets for the HTML/CSS/JS playground.
 *
 * Every example is a complete three-file page that looks like something the
 * moment it renders - a blank editor teaches nothing, and "Hello World" in a
 * web playground is a wasted screen. Each one is short enough to read without
 * scrolling and demonstrates exactly one idea.
 *
 * Two hard rules, both forced by where these run. The preview frame is
 * sandboxed WITHOUT `allow-same-origin`, so it has an opaque origin: it cannot
 * reach the network, and `localStorage` throws inside it. So: no CDN links, no
 * webfonts, no fetch, no storage. Everything here works offline and in memory.
 */

export interface WebFiles {
  html: string;
  css: string;
  js: string;
}

/** Which of the three files the single editor is showing. */
export type WebTab = 'html' | 'css' | 'js';

export interface WebExample {
  id: string;
  /** Shown in the picker. */
  name: string;
  /** One line under the picker saying what the example is for. */
  blurb: string;
  files: WebFiles;
}

export const WEB_EXAMPLES: WebExample[] = [
  {
    id: 'profile-card',
    name: 'Profile card',
    blurb: 'Box model, border-radius and a soft shadow.',
    files: {
      html: `<article class="card">
  <div class="avatar">AR</div>
  <h1>Ada R.</h1>
  <p class="role">Front-end learner</p>
  <p class="bio">Building small things on purpose, every day.</p>
  <button class="follow" id="follow" type="button">Follow</button>
</article>`,
      css: `body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #f4f5f7;
  font-family: system-ui, sans-serif;
}

.card {
  width: 260px;
  padding: 28px 24px;
  text-align: center;
  background: #ffffff;
  border-radius: 14px;
  /* Offset + blur, no spread: the shadow reads as height, not as an outline. */
  box-shadow: 0 10px 30px rgb(15 23 42 / 0.12);
}

.avatar {
  width: 72px;
  height: 72px;
  margin: 0 auto 14px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #22d3ee);
  color: #ffffff;
  font-size: 26px;
  font-weight: 700;
}

h1 { margin: 0; font-size: 19px; }
.role { margin: 4px 0 12px; color: #64748b; font-size: 13px; }
.bio { margin: 0 0 18px; color: #475569; font-size: 14px; line-height: 1.5; }

.follow {
  width: 100%;
  padding: 10px;
  border: 0;
  border-radius: 8px;
  background: #4f46e5;
  color: #ffffff;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

.follow[data-following="true"] {
  background: #e2e8f0;
  color: #334155;
}`,
      js: `const button = document.getElementById('follow');
let following = false;

button.addEventListener('click', () => {
  following = !following;
  // A data attribute, not a class: the CSS above already styles [data-following].
  button.dataset.following = String(following);
  button.textContent = following ? 'Following' : 'Follow';
  console.log('following:', following);
});`
    }
  },
  {
    id: 'flex-centre',
    name: 'Flexbox centring',
    blurb: 'One container, two properties, anything centred.',
    files: {
      html: `<div class="controls">
  <button type="button" data-value="flex-start">flex-start</button>
  <button type="button" data-value="center">center</button>
  <button type="button" data-value="space-between">space-between</button>
  <button type="button" data-value="space-around">space-around</button>
</div>

<main class="stage">
  <div class="box">1</div>
  <div class="box">2</div>
  <div class="box">3</div>
</main>`,
      css: `body {
  margin: 0;
  padding: 20px;
  background: #0f172a;
  color: #e2e8f0;
  font-family: system-ui, sans-serif;
}

.controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.controls button {
  padding: 6px 12px;
  border: 1px solid #334155;
  border-radius: 6px;
  background: #1e293b;
  color: inherit;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.controls button.is-active {
  background: #6366f1;
  border-color: #6366f1;
}

.stage {
  /* justify-content walks the main axis, align-items the cross axis. */
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  height: 200px;
  padding: 12px;
  border: 1px dashed #334155;
  border-radius: 12px;
}

.box {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: 10px;
  background: linear-gradient(135deg, #22d3ee, #6366f1);
  font-weight: 700;
}`,
      js: `const stage = document.querySelector('.stage');
const buttons = document.querySelectorAll('.controls button');

function apply(value) {
  stage.style.justifyContent = value;
  buttons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.value === value);
  });
  console.log('justify-content:', value);
}

buttons.forEach((button) => {
  button.addEventListener('click', () => apply(button.dataset.value));
});

apply('center');`
    }
  },
  {
    id: 'grid-gallery',
    name: 'Grid gallery',
    blurb: 'auto-fit + minmax: columns that reflow with no media query.',
    files: {
      html: `<h1>Auto-fitting grid</h1>
<p>Make the preview narrower - the columns re-flow on their own.</p>

<section class="gallery">
  <figure style="--hue: 200"><figcaption>200</figcaption></figure>
  <figure style="--hue: 240"><figcaption>240</figcaption></figure>
  <figure style="--hue: 280"><figcaption>280</figcaption></figure>
  <figure style="--hue: 320"><figcaption>320</figcaption></figure>
  <figure style="--hue: 10"><figcaption>10</figcaption></figure>
  <figure style="--hue: 40"><figcaption>40</figcaption></figure>
  <figure style="--hue: 90"><figcaption>90</figcaption></figure>
  <figure style="--hue: 150"><figcaption>150</figcaption></figure>
</section>`,
      css: `body {
  margin: 0;
  padding: 20px;
  background: #fafafa;
  color: #18181b;
  font-family: system-ui, sans-serif;
}

h1 { margin: 0 0 4px; font-size: 20px; }
p { margin: 0 0 18px; color: #71717a; font-size: 13px; }

.gallery {
  display: grid;
  /* auto-fit fills the row with as many >=120px columns as fit, then shares
     the leftover space between them. No breakpoints involved. */
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 14px;
}

figure {
  margin: 0;
  aspect-ratio: 1;
  display: flex;
  align-items: flex-end;
  padding: 10px;
  border-radius: 12px;
  background: linear-gradient(160deg, hsl(var(--hue) 85% 62%), hsl(var(--hue) 85% 42%));
  color: #ffffff;
  cursor: pointer;
  transition: transform 160ms ease;
}

figure:hover { transform: translateY(-4px); }

figcaption {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
}`,
      js: `const tiles = document.querySelectorAll('figure');
console.log('tiles:', tiles.length);

tiles.forEach((tile) => {
  tile.addEventListener('click', () => {
    console.log('hue', tile.style.getPropertyValue('--hue').trim());
  });
});`
    }
  },
  {
    id: 'hover-button',
    name: 'Hover transitions',
    blurb: 'Three ways to animate a button, and how to respect reduced motion.',
    files: {
      html: `<div class="row">
  <button class="btn lift" type="button">Lift</button>
  <button class="btn fill" type="button">Fill</button>
  <button class="btn glow" type="button">Glow</button>
</div>`,
      css: `body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #111827;
  font-family: system-ui, sans-serif;
}

.row { display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; }

.btn {
  padding: 12px 22px;
  border: 0;
  border-radius: 10px;
  color: #ffffff;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  /* Name the properties instead of using "all": the browser only has to
     watch what actually changes. */
  transition: transform 180ms ease, box-shadow 180ms ease, background-position 320ms ease;
}

.lift { background: #4f46e5; }
.lift:hover { transform: translateY(-3px); box-shadow: 0 10px 20px rgb(79 70 229 / 0.4); }

.fill {
  background-image: linear-gradient(90deg, #0ea5e9 50%, #1e293b 50%);
  background-size: 200% 100%;
  background-position: 100% 0;
}
.fill:hover { background-position: 0 0; }

.glow { background: #db2777; }
.glow:hover { box-shadow: 0 0 0 4px rgb(219 39 119 / 0.25), 0 0 26px rgb(219 39 119 / 0.55); }

.btn:focus-visible { outline: 2px solid #f8fafc; outline-offset: 3px; }

/* Some people get motion sick. Honour the OS setting. */
@media (prefers-reduced-motion: reduce) {
  .btn { transition: none; }
  .lift:hover { transform: none; }
}`,
      js: `document.querySelectorAll('.btn').forEach((button) => {
  button.addEventListener('click', () => {
    console.log('clicked:', button.textContent);
  });
});

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
console.log('reduced motion requested:', reduced.matches);`
    }
  },
  {
    id: 'todo-list',
    name: 'To-do list',
    blurb: 'Forms, events and rebuilding a list from state.',
    files: {
      html: `<section class="app">
  <h1>Today</h1>

  <form id="new-todo">
    <input id="todo-text" type="text" placeholder="What needs doing?" autocomplete="off" />
    <button type="submit">Add</button>
  </form>

  <ul id="list"></ul>
  <p id="count" class="count"></p>
</section>`,
      css: `body {
  margin: 0;
  padding: 24px;
  background: #f8fafc;
  color: #0f172a;
  font-family: system-ui, sans-serif;
}

.app { max-width: 380px; margin: 0 auto; }
h1 { margin: 0 0 14px; font-size: 20px; }

form { display: flex; gap: 8px; margin-bottom: 14px; }

input[type="text"] {
  flex: 1;
  min-width: 0;
  padding: 9px 11px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font: inherit;
  font-size: 14px;
}

form button {
  padding: 9px 16px;
  border: 0;
  border-radius: 8px;
  background: #0f172a;
  color: #ffffff;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }

li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
}

li span { flex: 1; min-width: 0; }
li.is-done span { color: #94a3b8; text-decoration: line-through; }

.remove {
  border: 0;
  background: none;
  color: #94a3b8;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}
.remove:hover { color: #ef4444; }

.count { margin: 14px 0 0; color: #64748b; font-size: 13px; }`,
      js: `const form = document.getElementById('new-todo');
const input = document.getElementById('todo-text');
const list = document.getElementById('list');
const count = document.getElementById('count');

// State first, DOM second. render() is the only thing that touches the list,
// so there is never a half-updated screen to debug.
const todos = [
  { text: 'Read one page of the docs', done: true },
  { text: 'Ship something small', done: false }
];

function render() {
  list.textContent = '';

  todos.forEach((todo, index) => {
    const item = document.createElement('li');
    item.className = todo.done ? 'is-done' : '';

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = todo.done;
    box.addEventListener('change', () => {
      todo.done = box.checked;
      render();
    });

    const label = document.createElement('span');
    // textContent, never innerHTML: typed text is not markup.
    label.textContent = todo.text;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.textContent = '\\u00d7';
    remove.addEventListener('click', () => {
      todos.splice(index, 1);
      render();
    });

    item.append(box, label, remove);
    list.append(item);
  });

  const left = todos.filter((todo) => !todo.done).length;
  count.textContent = left + ' left of ' + todos.length;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  todos.push({ text: text, done: false });
  input.value = '';
  console.log('added:', text);
  render();
});

render();`
    }
  },
  {
    id: 'responsive-nav',
    name: 'Responsive nav',
    blurb: 'A menu that collapses, with the aria state kept honest.',
    files: {
      html: `<header class="bar">
  <span class="brand">codeconsist</span>

  <button class="toggle" id="toggle" type="button" aria-expanded="false" aria-controls="menu">
    Menu
  </button>

  <nav class="menu" id="menu">
    <a href="#" class="is-current">Learn</a>
    <a href="#">Practice</a>
    <a href="#">Roadmaps</a>
    <a href="#">Account</a>
  </nav>
</header>

<main>
  <p>Make the preview narrower than 560px - the links collapse behind the Menu button.</p>
</main>`,
      css: `* { box-sizing: border-box; }

body {
  margin: 0;
  background: #ffffff;
  color: #111827;
  font-family: system-ui, sans-serif;
}

.bar {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 12px 18px;
  border-bottom: 1px solid #e5e7eb;
}

.brand { font-weight: 700; letter-spacing: -0.01em; }

.menu { display: flex; gap: 18px; margin-left: auto; }
.menu a { color: #4b5563; text-decoration: none; font-size: 14px; }
.menu a:hover { color: #111827; }
.menu a.is-current { color: #4f46e5; font-weight: 600; }

.toggle {
  display: none;
  margin-left: auto;
  padding: 6px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #ffffff;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

main { padding: 24px 18px; color: #6b7280; font-size: 14px; }

@media (max-width: 560px) {
  .toggle { display: block; }

  .menu {
    display: none;
    width: 100%;
    flex-direction: column;
    gap: 10px;
    margin-left: 0;
  }

  .menu.is-open { display: flex; }
}`,
      js: `const toggle = document.getElementById('toggle');
const menu = document.getElementById('menu');
const narrow = window.matchMedia('(max-width: 560px)');

function setOpen(open) {
  menu.classList.toggle('is-open', open);
  // The class alone would leave screen readers reading a stale "collapsed".
  toggle.setAttribute('aria-expanded', String(open));
}

toggle.addEventListener('click', () => {
  setOpen(!menu.classList.contains('is-open'));
});

narrow.addEventListener('change', (event) => {
  console.log('narrow layout:', event.matches);
  // Growing back to a wide layout should not leave the menu stuck open.
  if (!event.matches) setOpen(false);
});

console.log('narrow layout:', narrow.matches);`
    }
  }
];

/** Opened on a first visit, and what Reset falls back to. */
export const DEFAULT_EXAMPLE_ID = 'profile-card';

export function exampleById(id: string | null): WebExample | undefined {
  if (!id) return undefined;
  return WEB_EXAMPLES.find((example) => example.id === id);
}

export function defaultExample(): WebExample {
  return exampleById(DEFAULT_EXAMPLE_ID) ?? WEB_EXAMPLES[0];
}

/** The example whose three files match these exactly, if any. */
export function matchingExample(files: WebFiles): string | null {
  const hit = WEB_EXAMPLES.find(
    (example) =>
      example.files.html === files.html && example.files.css === files.css && example.files.js === files.js
  );
  return hit ? hit.id : null;
}
