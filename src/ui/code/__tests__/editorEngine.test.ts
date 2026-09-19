import { describe, it, expect } from 'vitest';
import {
  handleAutoCloseKey,
  handleSmartBackspace,
  handleSmartEnter,
  toggleLineComment,
  moveLines,
  duplicateLines,
  getAutocompleteSuggestions,
  getWordPrefixAtCursor,
  isInsideStringOrComment
} from '../editorEngine';

describe('editorEngine - Auto-closing and Smart Editing', () => {
  it('auto-closes opening brackets and puts cursor in between', () => {
    const resParen = handleAutoCloseKey('(', 'const a = ', 10, 10);
    expect(resParen).not.toBeNull();
    expect(resParen?.value).toBe('const a = ()');
    expect(resParen?.selectionStart).toBe(11);
    expect(resParen?.selectionEnd).toBe(11);

    const resBrace = handleAutoCloseKey('{', '', 0, 0);
    expect(resBrace?.value).toBe('{}');
    expect(resBrace?.selectionStart).toBe(1);

    const resBracket = handleAutoCloseKey('[', 'arr = ', 6, 6);
    expect(resBracket?.value).toBe('arr = []');
    expect(resBracket?.selectionStart).toBe(7);
  });

  it('wraps selected text when typing an opening character', () => {
    const text = 'foo + bar';
    const res = handleAutoCloseKey('(', text, 0, 9);
    expect(res).not.toBeNull();
    expect(res?.value).toBe('(foo + bar)');
    expect(res?.selectionStart).toBe(1);
    expect(res?.selectionEnd).toBe(10);
  });

  it('skips over closing character when typed in front of it', () => {
    const text = 'const x = (10)';
    // Cursor is right before ')'
    const res = handleAutoCloseKey(')', text, 13, 13);
    expect(res).not.toBeNull();
    expect(res?.value).toBe(text); // value unchanged
    expect(res?.selectionStart).toBe(14); // cursor moved forward
  });

  it('deletes both opening and closing character on smart backspace', () => {
    const text = 'const x = ()';
    // Cursor is between '(' and ')' at index 11
    const res = handleSmartBackspace(text, 11, 11);
    expect(res).not.toBeNull();
    expect(res?.value).toBe('const x = ');
    expect(res?.selectionStart).toBe(10);
  });

  it('expands brackets on Enter with proper middle indentation', () => {
    const text = 'function test() {}';
    // Cursor is between '{' and '}' at index 17
    const res = handleSmartEnter(text, 17, 17, '  ');
    expect(res).not.toBeNull();
    expect(res?.value).toBe('function test() {\n  \n}');
    expect(res?.selectionStart).toBe(20); // inside the indented middle line
  });
});

describe('editorEngine - Keyboard Shortcuts', () => {
  it('toggles single-line and multiline comments in JavaScript', () => {
    const code = 'const a = 1;\nconst b = 2;';
    const commented = toggleLineComment(code, 0, 12, 'javascript');
    expect(commented.value).toBe('// const a = 1;\nconst b = 2;');

    const uncommented = toggleLineComment(commented.value, 0, 15, 'javascript');
    expect(uncommented.value).toBe('const a = 1;\nconst b = 2;');
  });

  it('toggles comments in Python with #', () => {
    const py = 'x = 42';
    const commented = toggleLineComment(py, 0, 6, 'python');
    expect(commented.value).toBe('# x = 42');
  });

  it('moves lines up and down (Alt+Up / Alt+Down)', () => {
    const code = 'line 1\nline 2\nline 3';
    // Move line 2 up
    const movedUp = moveLines(code, 8, 13, 'up');
    expect(movedUp?.value).toBe('line 2\nline 1\nline 3');

    // Move line 2 down
    const movedDown = moveLines(code, 8, 13, 'down');
    expect(movedDown?.value).toBe('line 1\nline 3\nline 2');
  });

  it('duplicates lines (Shift+Alt+Down)', () => {
    const code = 'console.log("hello");';
    const duplicated = duplicateLines(code, 0, code.length, 'down');
    expect(duplicated.value).toBe('console.log("hello");\nconsole.log("hello");');
  });
});

describe('editorEngine - IntelliSense Autocomplete', () => {
  it('detects word prefix at cursor position', () => {
    const text = 'const count = in';
    const prefixInfo = getWordPrefixAtCursor(text, 16);
    expect(prefixInfo?.prefix).toBe('in');
    expect(prefixInfo?.start).toBe(14);
  });

  it('returns "int" keyword/type completion when typing "in" or "int"', () => {
    const cppSuggestions = getAutocompleteSuggestions('in', 'cpp');
    const intMatch = cppSuggestions.find((s) => s.label === 'int');
    expect(intMatch).toBeDefined();
    expect(intMatch?.kind).toBe('type');

    const exactInt = getAutocompleteSuggestions('int', 'cpp');
    expect(exactInt[0].label).toBe('int');
  });

  it('provides HTML tag and attribute completions', () => {
    const htmlSuggestions = getAutocompleteSuggestions('div', 'html');
    expect(htmlSuggestions.some((s) => s.label === 'div')).toBe(true);

    const attrSuggestions = getAutocompleteSuggestions('class', 'html');
    expect(attrSuggestions.some((s) => s.label === 'class')).toBe(true);
  });

  it('suppresses autocomplete when cursor is inside a string literal or comment', () => {
    const pyCode = 'print("fibonacci: \\n", fibonacci(10))';
    // Offset inside the string "fibonacci: \n"
    const offsetInsideStr = 17; // right around '\n'
    expect(isInsideStringOrComment(pyCode, offsetInsideStr, 'python')).toBe(true);
    expect(getWordPrefixAtCursor(pyCode, offsetInsideStr, 'python')).toBeNull();

    const commentCode = '# Real CPython, compiled to WebAssembly.\ndef fib():';
    expect(isInsideStringOrComment(commentCode, 10, 'python')).toBe(true);
    expect(getWordPrefixAtCursor(commentCode, 10, 'python')).toBeNull();

    // Outside string / comment
    const offsetOutside = pyCode.indexOf('fibonacci(10)') + 3; // 'fib'
    expect(isInsideStringOrComment(pyCode, offsetOutside, 'python')).toBe(false);
    expect(getWordPrefixAtCursor(pyCode, offsetOutside, 'python')?.prefix).toBe('fib');
  });

  it('provides Python method completions like append, extend, and pop', () => {
    const suggestions = getAutocompleteSuggestions('app', 'python');
    expect(suggestions.some((s) => s.label === 'append')).toBe(true);

    const extSuggestions = getAutocompleteSuggestions('ext', 'python');
    expect(extSuggestions.some((s) => s.label === 'extend')).toBe(true);
  });
});
