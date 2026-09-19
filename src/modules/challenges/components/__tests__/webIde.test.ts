import { describe, expect, it } from 'vitest';
import { bundleWebCode, parseWebCode, WebFiles } from '../WebIde';

describe('WebIde multi-file parsing and bundling', () => {
  it('correctly splits combined HTML, CSS, and JS into 3 separate files', () => {
    const combined = `
<div class="card">
  <h1 id="title">Hello World</h1>
  <button id="btn">Click me</button>
</div>

<style>
  .card { padding: 16px; background: #222; }
  #title { color: #fff; }
</style>

<script>
  const btn = document.getElementById("btn");
  btn.addEventListener("click", () => alert("clicked"));
</script>
`.trim();

    const parsed = parseWebCode(combined);

    expect(parsed.html).toContain('<div class="card">');
    expect(parsed.html).toContain('<h1 id="title">Hello World</h1>');
    expect(parsed.html).not.toContain('<style>');
    expect(parsed.html).not.toContain('<script>');

    expect(parsed.css).toContain('.card { padding: 16px; background: #222; }');
    expect(parsed.css).not.toContain('<style>');

    expect(parsed.js).toContain('const btn = document.getElementById("btn");');
    expect(parsed.js).not.toContain('<script>');
  });

  it('correctly handles code without style or script tags', () => {
    const htmlOnly = '<p id="message">Simple Paragraph</p>';
    const parsed = parseWebCode(htmlOnly);
    expect(parsed.html).toBe('<p id="message">Simple Paragraph</p>');
    expect(parsed.css).toBe('');
    expect(parsed.js).toBe('');
  });

  it('bundles separate files into valid combined executable document', () => {
    const files: WebFiles = {
      html: '<button id="counter">0</button>',
      css: '#counter { font-size: 18px; color: blue; }',
      js: 'document.getElementById("counter").onclick = () => {};'
    };

    const bundled = bundleWebCode(files);
    expect(bundled).toContain('<button id="counter">0</button>');
    expect(bundled).toContain('<style>\n#counter { font-size: 18px; color: blue; }\n</style>');
    expect(bundled).toContain('<script>\ndocument.getElementById("counter").onclick = () => {};\n</script>');

    // Re-parsing the bundled code should round-trip cleanly
    const reParsed = parseWebCode(bundled);
    expect(reParsed.html).toBe(files.html);
    expect(reParsed.css).toBe(files.css);
    expect(reParsed.js).toBe(files.js);
  });
});
