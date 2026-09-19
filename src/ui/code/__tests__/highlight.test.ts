import { describe, it, expect } from 'vitest';
import { tokenize, tokenizeLine } from '../highlight';

describe('Syntax Highlighter & Tokenizer', () => {
  it('tokenizes JavaScript keywords, control flow, functions, strings and numbers', () => {
    const code = 'const count = 42;\nfunction getStatus(user) {\n  if (count > 0) return "Active";\n}';
    const lines = tokenize(code, 'javascript');

    expect(lines).toHaveLength(4);

    // Line 1: const count = 42;
    const l1 = lines[0];
    expect(l1.some((t) => t.text === 'const' && t.kind === 'keyword')).toBe(true);
    expect(l1.some((t) => t.text === '42' && t.kind === 'number')).toBe(true);

    // Line 2: function getStatus(user) {
    const l2 = lines[1];
    expect(l2.some((t) => t.text === 'function' && t.kind === 'keyword')).toBe(true);
    expect(l2.some((t) => t.text === 'getStatus' && t.kind === 'function')).toBe(true);

    // Line 3: if (count > 0) return "Active";
    const l3 = lines[2];
    expect(l3.some((t) => t.text === 'if' && t.kind === 'control')).toBe(true);
    expect(l3.some((t) => t.text === 'return' && t.kind === 'control')).toBe(true);
    expect(l3.some((t) => t.text === '"Active"' && t.kind === 'string')).toBe(true);
  });

  it('tokenizes HTML tags, attributes, and content', () => {
    const html = '<button id="submit-btn" class="btn-primary">Click Me</button>';
    const tokens = tokenizeLine(html, 'html');

    expect(tokens.some((t) => t.text === 'button' && t.kind === 'tag')).toBe(true);
    expect(tokens.some((t) => t.text === 'id' && t.kind === 'attribute')).toBe(true);
    expect(tokens.some((t) => t.text === '"submit-btn"' && t.kind === 'string')).toBe(true);
    expect(tokens.some((t) => t.text === 'class' && t.kind === 'attribute')).toBe(true);
    expect(tokens.some((t) => t.text === 'Click Me' && t.kind === 'plain')).toBe(true);
  });

  it('tokenizes CSS selectors, properties, numbers, units, and values', () => {
    const css = '.profile-card { display: flex; padding: 20px; background: #1e293b; }';
    const tokens = tokenizeLine(css, 'css');

    expect(tokens.some((t) => t.text === '.profile-card' && t.kind === 'selector')).toBe(true);
    expect(tokens.some((t) => t.text === 'display' && t.kind === 'property')).toBe(true);
    expect(tokens.some((t) => t.text === 'flex' && t.kind === 'keyword')).toBe(true);
    expect(tokens.some((t) => t.text === '20' && t.kind === 'number')).toBe(true);
    expect(tokens.some((t) => t.text === 'px' && t.kind === 'keyword')).toBe(true);
    expect(tokens.some((t) => t.text === '#1e293b' && t.kind === 'number')).toBe(true);
  });

  it('handles multi-line HTML with embedded <style> and <script> sections', () => {
    const doc = [
      '<div class="app">',
      '<style>',
      '  .app { color: red; }',
      '</style>',
      '<script>',
      '  const x = 10;',
      '</script>',
      '</div>'
    ].join('\n');

    const lines = tokenize(doc, 'html');
    expect(lines).toHaveLength(8);

    // CSS line inside <style>
    const cssLine = lines[2];
    expect(cssLine.some((t) => t.text === '.app' && t.kind === 'selector')).toBe(true);
    expect(cssLine.some((t) => t.text === 'color' && t.kind === 'property')).toBe(true);

    // JS line inside <script>
    const jsLine = lines[5];
    expect(jsLine.some((t) => t.text === 'const' && t.kind === 'keyword')).toBe(true);
    expect(jsLine.some((t) => t.text === '10' && t.kind === 'number')).toBe(true);
  });

  it('tokenizes Python def, if, elif, strings, and comments', () => {
    const py = 'def solve(n):\n    # check value\n    if n > 0:\n        return True';
    const lines = tokenize(py, 'python');

    expect(lines[0].some((t) => t.text === 'def' && t.kind === 'keyword')).toBe(true);
    expect(lines[1].some((t) => t.kind === 'comment')).toBe(true);
    expect(lines[2].some((t) => t.text === 'if' && t.kind === 'control')).toBe(true);
    expect(lines[3].some((t) => t.text === 'return' && t.kind === 'control')).toBe(true);
    expect(lines[3].some((t) => t.text === 'True' && t.kind === 'boolean')).toBe(true);
  });
});
