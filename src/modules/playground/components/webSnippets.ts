import type { WebFiles } from './WebPreview';

/** Starter pages for the HTML / CSS / JS playground. The first one is the default. */
export const WEB_SNIPPETS: Record<string, WebFiles> = {
  'Hello World': {
    html: `<main class="card">
  <h1>Hello World</h1>
  <p>Edit the HTML, CSS and JS tabs - the preview updates as you type.</p>
  <button id="greet">Say hi</button>
</main>`,
    css: `body {
  font-family: system-ui, sans-serif;
  display: grid;
  place-items: center;
  min-height: 100vh;
  margin: 0;
  background: #f4f6f8;
}

.card {
  background: white;
  padding: 2rem 2.5rem;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  text-align: center;
}

button {
  padding: 0.6rem 1.2rem;
  border: 0;
  border-radius: 8px;
  background: #16a34a;
  color: white;
  font-size: 1rem;
  cursor: pointer;
}`,
    js: `const button = document.getElementById("greet");

button.addEventListener("click", () => {
  console.log("Button clicked at", new Date().toLocaleTimeString());
  button.textContent = "Hi there!";
});`
  },
  Counter: {
    html: `<div class="counter">
  <button id="dec">−</button>
  <output id="value">0</output>
  <button id="inc">+</button>
</div>`,
    css: `body {
  font-family: system-ui, sans-serif;
  display: grid;
  place-items: center;
  min-height: 100vh;
  margin: 0;
}

.counter {
  display: flex;
  align-items: center;
  gap: 1rem;
}

output {
  font-size: 3rem;
  min-width: 3ch;
  text-align: center;
}

button {
  width: 3rem;
  height: 3rem;
  font-size: 1.5rem;
  border-radius: 50%;
  border: 1px solid #ccc;
  background: white;
  cursor: pointer;
}`,
    js: `let count = 0;
const value = document.getElementById("value");

function render() {
  value.textContent = count;
  value.style.color = count < 0 ? "crimson" : "inherit";
}

document.getElementById("inc").onclick = () => { count++; render(); };
document.getElementById("dec").onclick = () => { count--; render(); };

render();`
  },
  'Flexbox cards': {
    html: `<h1>Flexbox cards</h1>
<section class="cards">
  <article>HTML</article>
  <article>CSS</article>
  <article>JavaScript</article>
</section>`,
    css: `body {
  font-family: system-ui, sans-serif;
  padding: 2rem;
}

.cards {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.cards article {
  flex: 1 1 140px;
  padding: 2rem 1rem;
  border-radius: 10px;
  background: linear-gradient(135deg, #22c55e, #0ea5e9);
  color: white;
  font-weight: bold;
  text-align: center;
  transition: transform 0.2s;
}

.cards article:hover {
  transform: translateY(-4px);
}`,
    js: `document.querySelectorAll(".cards article").forEach((card, i) => {
  card.addEventListener("click", () => console.log("Clicked card", i + 1, card.textContent));
});`
  },
  'To-do list': {
    html: `<h1>To-do</h1>
<form id="form">
  <input id="task" placeholder="What needs doing?" autocomplete="off" />
  <button>Add</button>
</form>
<ul id="list"></ul>`,
    css: `body {
  font-family: system-ui, sans-serif;
  max-width: 420px;
  margin: 2rem auto;
}

form {
  display: flex;
  gap: 0.5rem;
}

input {
  flex: 1;
  padding: 0.5rem;
}

li {
  cursor: pointer;
  padding: 0.25rem 0;
}

li.done {
  text-decoration: line-through;
  color: #888;
}`,
    js: `const form = document.getElementById("form");
const input = document.getElementById("task");
const list = document.getElementById("list");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  const item = document.createElement("li");
  item.textContent = text;
  item.onclick = () => item.classList.toggle("done");
  list.append(item);

  console.log("Added:", text);
  input.value = "";
});`
  }
};

export const WEB_STARTER: WebFiles = WEB_SNIPPETS['Hello World'];
