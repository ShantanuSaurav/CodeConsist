import { SupportedLanguage } from '@/types';

export interface CompletionItem {
  label: string;
  kind: 'keyword' | 'type' | 'function' | 'snippet' | 'property' | 'tag' | 'variable';
  detail?: string;
  insertText?: string;
  cursorOffset?: number; // relative offset inside inserted text where cursor should be
}

export interface ReplaceResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

/* -------------------------------------------------------------------------- */
/*                               Auto-Closing Pairs                            */
/* -------------------------------------------------------------------------- */

export const AUTO_CLOSE_PAIRS: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '"': '"',
  "'": "'",
  '`': '`'
};

export const CLOSING_CHARS = new Set([')', ']', '}', '"', "'", '`']);

/**
 * Handles typing of bracket or quote characters.
 * - Wraps selection if text is selected.
 * - Auto-inserts closing partner if typing an opener.
 * - Skips over closing character if cursor is immediately before it.
 */
export function handleAutoCloseKey(
  char: string,
  value: string,
  selectionStart: number,
  selectionEnd: number
): ReplaceResult | null {
  // 1. Text is selected: wrap selection with opener and closer
  if (selectionStart !== selectionEnd && AUTO_CLOSE_PAIRS[char]) {
    const opener = char;
    const closer = AUTO_CLOSE_PAIRS[char];
    const selected = value.slice(selectionStart, selectionEnd);
    const wrapped = opener + selected + closer;
    const nextValue = value.slice(0, selectionStart) + wrapped + value.slice(selectionEnd);
    return {
      value: nextValue,
      selectionStart: selectionStart + 1,
      selectionEnd: selectionStart + 1 + selected.length
    };
  }

  // 2. Typing a closing character when cursor is already right before that exact character: skip over it
  if (selectionStart === selectionEnd && CLOSING_CHARS.has(char)) {
    if (value[selectionStart] === char) {
      return {
        value,
        selectionStart: selectionStart + 1,
        selectionEnd: selectionStart + 1
      };
    }
  }

  // 3. Typing an opening character with no selection: insert opener + closer, place cursor in between
  if (selectionStart === selectionEnd && AUTO_CLOSE_PAIRS[char]) {
    const closer = AUTO_CLOSE_PAIRS[char];

    // For quotes, don't auto-close if immediately preceded or followed by an alphanumeric character
    if (char === '"' || char === "'" || char === '`') {
      const charBefore = value[selectionStart - 1] ?? '';
      const charAfter = value[selectionStart] ?? '';
      if (/[a-zA-Z0-9_]/.test(charBefore) || /[a-zA-Z0-9_]/.test(charAfter)) {
        return null;
      }
    }

    const nextValue = value.slice(0, selectionStart) + char + closer + value.slice(selectionEnd);
    return {
      value: nextValue,
      selectionStart: selectionStart + 1,
      selectionEnd: selectionStart + 1
    };
  }

  return null;
}

/**
 * Handles backspace when cursor is between matching pairs: `()`, `[]`, `{}`, `""`, `''`, ` `` `
 * Deletes both the opening and closing character.
 */
export function handleSmartBackspace(
  value: string,
  selectionStart: number,
  selectionEnd: number
): ReplaceResult | null {
  if (selectionStart !== selectionEnd || selectionStart === 0) return null;

  const charBefore = value[selectionStart - 1];
  const charAfter = value[selectionStart];

  if (AUTO_CLOSE_PAIRS[charBefore] && AUTO_CLOSE_PAIRS[charBefore] === charAfter) {
    const nextValue = value.slice(0, selectionStart - 1) + value.slice(selectionStart + 1);
    return {
      value: nextValue,
      selectionStart: selectionStart - 1,
      selectionEnd: selectionStart - 1
    };
  }

  return null;
}

/**
 * Handles Enter key between matching brackets: `{|}`, `(|)`, `[|]`.
 * Expands with a newline, indented middle line, and the closing bracket on its own line.
 */
export function handleSmartEnter(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  indent: string
): ReplaceResult | null {
  if (selectionStart !== selectionEnd) return null;

  const charBefore = value[selectionStart - 1];
  const charAfter = value[selectionStart];

  const isBetweenBrackets =
    (charBefore === '{' && charAfter === '}') ||
    (charBefore === '(' && charAfter === ')') ||
    (charBefore === '[' && charAfter === ']');

  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const currentLine = value.slice(lineStart, selectionStart);
  const leadingIndent = currentLine.match(/^[ \t]*/)?.[0] ?? '';

  if (isBetweenBrackets) {
    const insertion = '\n' + leadingIndent + indent + '\n' + leadingIndent;
    const nextValue = value.slice(0, selectionStart) + insertion + value.slice(selectionStart);
    const newCursor = selectionStart + 1 + leadingIndent.length + indent.length;
    return {
      value: nextValue,
      selectionStart: newCursor,
      selectionEnd: newCursor
    };
  }

  // Standard smart indentation: carry forward current indent, +1 level if opens block
  const opensBlock = /[{([:]\s*$/.test(currentLine);
  if (leadingIndent || opensBlock) {
    const addition = '\n' + leadingIndent + (opensBlock ? indent : '');
    const nextValue = value.slice(0, selectionStart) + addition + value.slice(selectionStart);
    const newCursor = selectionStart + addition.length;
    return {
      value: nextValue,
      selectionStart: newCursor,
      selectionEnd: newCursor
    };
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/*                               Keyboard Shortcuts                           */
/* -------------------------------------------------------------------------- */

const LINE_COMMENT_TOKENS: Partial<Record<SupportedLanguage, string>> = {
  javascript: '// ',
  typescript: '// ',
  c: '// ',
  cpp: '// ',
  java: '// ',
  go: '// ',
  python: '# ',
  bash: '# ',
  sql: '-- ',
  pseudocode: '// ',
  css: '/* ',
  html: '<!-- '
};

/**
 * Toggles line comments for the selected lines (Ctrl+/ or Cmd+/).
 */
export function toggleLineComment(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  language: SupportedLanguage = 'javascript'
): ReplaceResult {
  const commentToken = LINE_COMMENT_TOKENS[language] ?? '// ';
  const isHtml = language === 'html';
  const isCss = language === 'css';

  const startOfFirst = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const nl = value.indexOf('\n', selectionEnd);
  const endOfLast = nl === -1 ? value.length : nl;
  const targetBlock = value.slice(startOfFirst, endOfLast);
  const lines = targetBlock.split('\n');

  if (isHtml) {
    // HTML comment toggle
    const trimmed = targetBlock.trim();
    if (trimmed.startsWith('<!--') && trimmed.endsWith('-->')) {
      const uncommented = targetBlock
        .replace(/^\s*<!--\s?/, '')
        .replace(/\s?-->\s*$/, '');
      const nextValue = value.slice(0, startOfFirst) + uncommented + value.slice(endOfLast);
      return {
        value: nextValue,
        selectionStart: startOfFirst,
        selectionEnd: startOfFirst + uncommented.length
      };
    } else {
      const commented = `<!-- ${targetBlock} -->`;
      const nextValue = value.slice(0, startOfFirst) + commented + value.slice(endOfLast);
      return {
        value: nextValue,
        selectionStart: startOfFirst,
        selectionEnd: startOfFirst + commented.length
      };
    }
  }

  if (isCss) {
    // CSS comment toggle
    const trimmed = targetBlock.trim();
    if (trimmed.startsWith('/*') && trimmed.endsWith('*/')) {
      const uncommented = targetBlock
        .replace(/^\s*\/\*\s?/, '')
        .replace(/\s?\*\/\s*$/, '');
      const nextValue = value.slice(0, startOfFirst) + uncommented + value.slice(endOfLast);
      return {
        value: nextValue,
        selectionStart: startOfFirst,
        selectionEnd: startOfFirst + uncommented.length
      };
    } else {
      const commented = `/* ${targetBlock} */`;
      const nextValue = value.slice(0, startOfFirst) + commented + value.slice(endOfLast);
      return {
        value: nextValue,
        selectionStart: startOfFirst,
        selectionEnd: startOfFirst + commented.length
      };
    }
  }

  const prefix = commentToken.trim();
  const allCommented = lines
    .filter((line) => line.trim().length > 0)
    .every((line) => line.trimStart().startsWith(prefix));

  const updatedLines = lines.map((line) => {
    if (line.trim().length === 0) return line;
    const indentMatch = line.match(/^[ \t]*/)?.[0] ?? '';
    const rest = line.slice(indentMatch.length);

    if (allCommented) {
      if (rest.startsWith(commentToken)) {
        return indentMatch + rest.slice(commentToken.length);
      }
      if (rest.startsWith(prefix)) {
        return indentMatch + rest.slice(prefix.length).replace(/^ /, '');
      }
      return line;
    } else {
      return indentMatch + commentToken + rest;
    }
  });

  const updatedBlock = updatedLines.join('\n');
  const nextValue = value.slice(0, startOfFirst) + updatedBlock + value.slice(endOfLast);

  return {
    value: nextValue,
    selectionStart: startOfFirst,
    selectionEnd: startOfFirst + updatedBlock.length
  };
}

/**
 * Move current line or selected lines up or down (Alt+Up / Alt+Down).
 */
export function moveLines(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  direction: 'up' | 'down'
): ReplaceResult | null {
  const startOfFirst = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const nl = value.indexOf('\n', selectionEnd);
  const endOfLast = nl === -1 ? value.length : nl;

  const currentBlock = value.slice(startOfFirst, endOfLast);

  if (direction === 'up') {
    if (startOfFirst === 0) return null; // already at top
    const prevLineStart = value.lastIndexOf('\n', startOfFirst - 2) + 1;
    const prevLine = value.slice(prevLineStart, startOfFirst - 1);

    const nextValue =
      value.slice(0, prevLineStart) +
      currentBlock +
      '\n' +
      prevLine +
      value.slice(endOfLast);

    return {
      value: nextValue,
      selectionStart: selectionStart - (prevLine.length + 1),
      selectionEnd: selectionEnd - (prevLine.length + 1)
    };
  } else {
    if (endOfLast >= value.length) return null; // already at bottom
    const nextLineEnd = (() => {
      const nextNl = value.indexOf('\n', endOfLast + 1);
      return nextNl === -1 ? value.length : nextNl;
    })();
    const nextLine = value.slice(endOfLast + 1, nextLineEnd);

    const nextValue =
      value.slice(0, startOfFirst) +
      nextLine +
      '\n' +
      currentBlock +
      value.slice(nextLineEnd);

    const offset = nextLine.length + 1;
    return {
      value: nextValue,
      selectionStart: selectionStart + offset,
      selectionEnd: selectionEnd + offset
    };
  }
}

/**
 * Duplicates current line or selected lines down or up (Shift+Alt+Down / Shift+Alt+Up).
 */
export function duplicateLines(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  direction: 'up' | 'down' = 'down'
): ReplaceResult {
  const startOfFirst = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const nl = value.indexOf('\n', selectionEnd);
  const endOfLast = nl === -1 ? value.length : nl;

  const currentBlock = value.slice(startOfFirst, endOfLast);

  if (direction === 'down') {
    const nextValue =
      value.slice(0, endOfLast) + '\n' + currentBlock + value.slice(endOfLast);
    const offset = currentBlock.length + 1;
    return {
      value: nextValue,
      selectionStart: selectionStart + offset,
      selectionEnd: selectionEnd + offset
    };
  } else {
    const nextValue =
      value.slice(0, startOfFirst) + currentBlock + '\n' + value.slice(startOfFirst);
    return {
      value: nextValue,
      selectionStart,
      selectionEnd
    };
  }
}

/* -------------------------------------------------------------------------- */
/*                           IntelliSense Autocomplete                        */
/* -------------------------------------------------------------------------- */

const COMMON_JS_TS_COMPLETIONS: CompletionItem[] = [
  // Keywords & Declarations
  { label: 'const', kind: 'keyword', detail: 'keyword' },
  { label: 'let', kind: 'keyword', detail: 'keyword' },
  { label: 'var', kind: 'keyword', detail: 'keyword' },
  { label: 'function', kind: 'keyword', detail: 'keyword', insertText: 'function name() {\n  \n}' },
  { label: 'return', kind: 'keyword', detail: 'keyword' },
  { label: 'if', kind: 'keyword', detail: 'keyword', insertText: 'if () {\n  \n}' },
  { label: 'else', kind: 'keyword', detail: 'keyword', insertText: 'else {\n  \n}' },
  { label: 'for', kind: 'keyword', detail: 'keyword', insertText: 'for (let i = 0; i < length; i++) {\n  \n}' },
  { label: 'while', kind: 'keyword', detail: 'keyword', insertText: 'while () {\n  \n}' },
  { label: 'switch', kind: 'keyword', detail: 'keyword' },
  { label: 'case', kind: 'keyword', detail: 'keyword' },
  { label: 'break', kind: 'keyword', detail: 'keyword' },
  { label: 'continue', kind: 'keyword', detail: 'keyword' },
  { label: 'try', kind: 'keyword', detail: 'keyword', insertText: 'try {\n  \n} catch (err) {\n  \n}' },
  { label: 'catch', kind: 'keyword', detail: 'keyword' },
  { label: 'finally', kind: 'keyword', detail: 'keyword' },
  { label: 'throw', kind: 'keyword', detail: 'keyword' },
  { label: 'import', kind: 'keyword', detail: 'keyword' },
  { label: 'export', kind: 'keyword', detail: 'keyword' },
  { label: 'class', kind: 'keyword', detail: 'keyword', insertText: 'class Name {\n  constructor() {\n    \n  }\n}' },
  { label: 'extends', kind: 'keyword', detail: 'keyword' },
  { label: 'async', kind: 'keyword', detail: 'keyword' },
  { label: 'await', kind: 'keyword', detail: 'keyword' },
  { label: 'new', kind: 'keyword', detail: 'keyword' },
  { label: 'typeof', kind: 'keyword', detail: 'keyword' },
  { label: 'instanceof', kind: 'keyword', detail: 'keyword' },
  { label: 'this', kind: 'keyword', detail: 'keyword' },
  { label: 'true', kind: 'keyword', detail: 'boolean' },
  { label: 'false', kind: 'keyword', detail: 'boolean' },
  { label: 'null', kind: 'keyword', detail: 'literal' },
  { label: 'undefined', kind: 'keyword', detail: 'literal' },

  // Types & Common Objects
  { label: 'int', kind: 'type', detail: 'type (integer)' },
  { label: 'number', kind: 'type', detail: 'type' },
  { label: 'string', kind: 'type', detail: 'type' },
  { label: 'boolean', kind: 'type', detail: 'type' },
  { label: 'interface', kind: 'type', detail: 'type declaration' },
  { label: 'type', kind: 'type', detail: 'type alias' },
  { label: 'any', kind: 'type', detail: 'type' },
  { label: 'void', kind: 'type', detail: 'type' },
  { label: 'Promise', kind: 'type', detail: 'built-in' },
  { label: 'Array', kind: 'type', detail: 'built-in' },
  { label: 'Object', kind: 'type', detail: 'built-in' },
  { label: 'parseInt', kind: 'function', detail: '(string, radix) => number' },
  { label: 'parseFloat', kind: 'function', detail: '(string) => number' },

  // Standard Functions / APIs
  { label: 'console.log', kind: 'function', detail: 'console.log(...)', insertText: 'console.log();' },
  { label: 'console.error', kind: 'function', detail: 'console.error(...)', insertText: 'console.error();' },
  { label: 'console.warn', kind: 'function', detail: 'console.warn(...)', insertText: 'console.warn();' },
  { label: 'document.getElementById', kind: 'function', detail: 'getElementById(id)', insertText: "document.getElementById('')" },
  { label: 'document.querySelector', kind: 'function', detail: 'querySelector(selector)', insertText: "document.querySelector('')" },
  { label: 'document.querySelectorAll', kind: 'function', detail: 'querySelectorAll(selector)', insertText: "document.querySelectorAll('')" },
  { label: 'addEventListener', kind: 'function', detail: 'addEventListener(type, listener)', insertText: "addEventListener('', (e) => {\n  \n})" },
  { label: 'setTimeout', kind: 'function', detail: 'setTimeout(handler, timeout)', insertText: 'setTimeout(() => {\n  \n}, 1000);' },
  { label: 'setInterval', kind: 'function', detail: 'setInterval(handler, timeout)', insertText: 'setInterval(() => {\n  \n}, 1000);' },
  { label: 'JSON.stringify', kind: 'function', detail: 'JSON.stringify(value)', insertText: 'JSON.stringify()' },
  { label: 'JSON.parse', kind: 'function', detail: 'JSON.parse(text)', insertText: 'JSON.parse()' }
];

const C_CPP_COMPLETIONS: CompletionItem[] = [
  { label: 'int', kind: 'type', detail: 'primitive type (32-bit integer)' },
  { label: 'float', kind: 'type', detail: 'primitive type (single precision)' },
  { label: 'double', kind: 'type', detail: 'primitive type (double precision)' },
  { label: 'char', kind: 'type', detail: 'primitive type (character)' },
  { label: 'void', kind: 'type', detail: 'type (no value)' },
  { label: 'bool', kind: 'type', detail: 'primitive type (boolean)' },
  { label: 'auto', kind: 'keyword', detail: 'type inference' },
  { label: 'const', kind: 'keyword', detail: 'type qualifier' },
  { label: 'long', kind: 'type', detail: 'primitive type' },
  { label: 'short', kind: 'type', detail: 'primitive type' },
  { label: 'unsigned', kind: 'keyword', detail: 'type modifier' },
  { label: 'signed', kind: 'keyword', detail: 'type modifier' },
  { label: 'struct', kind: 'keyword', detail: 'struct declaration' },
  { label: 'class', kind: 'keyword', detail: 'class declaration', insertText: 'class Name {\npublic:\n  \n};' },
  { label: 'public', kind: 'keyword', detail: 'access specifier' },
  { label: 'private', kind: 'keyword', detail: 'access specifier' },
  { label: 'protected', kind: 'keyword', detail: 'access specifier' },
  { label: 'virtual', kind: 'keyword', detail: 'keyword' },
  { label: 'namespace', kind: 'keyword', detail: 'namespace declaration' },
  { label: 'using', kind: 'keyword', detail: 'keyword' },
  { label: 'std', kind: 'property', detail: 'standard namespace' },
  { label: 'sizeof', kind: 'function', detail: 'sizeof(type)' },
  { label: 'return', kind: 'keyword', detail: 'keyword' },
  { label: 'if', kind: 'keyword', detail: 'keyword', insertText: 'if () {\n  \n}' },
  { label: 'else', kind: 'keyword', detail: 'keyword', insertText: 'else {\n  \n}' },
  { label: 'while', kind: 'keyword', detail: 'keyword', insertText: 'while () {\n  \n}' },
  { label: 'for', kind: 'keyword', detail: 'keyword', insertText: 'for (int i = 0; i < n; i++) {\n  \n}' },
  { label: 'switch', kind: 'keyword', detail: 'keyword' },
  { label: 'case', kind: 'keyword', detail: 'keyword' },
  { label: 'break', kind: 'keyword', detail: 'keyword' },
  { label: 'continue', kind: 'keyword', detail: 'keyword' },
  { label: 'true', kind: 'keyword', detail: 'boolean literal' },
  { label: 'false', kind: 'keyword', detail: 'boolean literal' },
  { label: 'nullptr', kind: 'keyword', detail: 'pointer literal' },
  { label: 'include', kind: 'snippet', detail: '#include <...>', insertText: '#include <iostream>\n' },
  { label: 'main', kind: 'snippet', detail: 'int main() {...}', insertText: 'int main() {\n  \n  return 0;\n}' },
  { label: 'cout', kind: 'snippet', detail: 'std::cout << ...', insertText: 'std::cout <<  << std::endl;' },
  { label: 'cin', kind: 'snippet', detail: 'std::cin >> ...', insertText: 'std::cin >> ;' },
  { label: 'vector', kind: 'type', detail: 'std::vector<T>', insertText: 'std::vector<int> ' },
  { label: 'string', kind: 'type', detail: 'std::string' }
];

const PYTHON_COMPLETIONS: CompletionItem[] = [
  // Control keywords
  { label: 'def', kind: 'keyword', detail: 'function definition', insertText: 'def name():\n    ' },
  { label: 'return', kind: 'keyword', detail: 'keyword' },
  { label: 'if', kind: 'keyword', detail: 'keyword', insertText: 'if condition:\n    ' },
  { label: 'elif', kind: 'keyword', detail: 'keyword', insertText: 'elif condition:\n    ' },
  { label: 'else', kind: 'keyword', detail: 'keyword', insertText: 'else:\n    ' },
  { label: 'for', kind: 'keyword', detail: 'keyword', insertText: 'for item in iterable:\n    ' },
  { label: 'while', kind: 'keyword', detail: 'keyword', insertText: 'while condition:\n    ' },
  { label: 'in', kind: 'keyword', detail: 'keyword' },
  { label: 'is', kind: 'keyword', detail: 'keyword' },
  { label: 'not', kind: 'keyword', detail: 'keyword' },
  { label: 'and', kind: 'keyword', detail: 'keyword' },
  { label: 'or', kind: 'keyword', detail: 'keyword' },
  { label: 'import', kind: 'keyword', detail: 'keyword' },
  { label: 'from', kind: 'keyword', detail: 'keyword' },
  { label: 'as', kind: 'keyword', detail: 'keyword' },
  { label: 'class', kind: 'keyword', detail: 'class definition', insertText: 'class Name:\n    def __init__(self):\n        ' },
  { label: 'try', kind: 'keyword', detail: 'exception handling', insertText: 'try:\n    \nexcept Exception as e:\n    ' },
  { label: 'except', kind: 'keyword', detail: 'keyword' },
  { label: 'finally', kind: 'keyword', detail: 'keyword' },
  { label: 'raise', kind: 'keyword', detail: 'keyword' },
  { label: 'with', kind: 'keyword', detail: 'context manager', insertText: 'with expression as target:\n    ' },
  { label: 'pass', kind: 'keyword', detail: 'null statement' },
  { label: 'break', kind: 'keyword', detail: 'break loop' },
  { label: 'continue', kind: 'keyword', detail: 'continue loop' },
  { label: 'yield', kind: 'keyword', detail: 'generator yield' },
  { label: 'lambda', kind: 'keyword', detail: 'anonymous function' },
  { label: 'True', kind: 'keyword', detail: 'boolean literal' },
  { label: 'False', kind: 'keyword', detail: 'boolean literal' },
  { label: 'None', kind: 'keyword', detail: 'NoneType literal' },
  { label: 'self', kind: 'variable', detail: 'instance reference' },

  // Built-in functions
  { label: 'print', kind: 'function', detail: 'print(...)', insertText: 'print()' },
  { label: 'len', kind: 'function', detail: 'len(obj)' },
  { label: 'range', kind: 'function', detail: 'range(stop)' },
  { label: 'sum', kind: 'function', detail: 'sum(iterable)' },
  { label: 'min', kind: 'function', detail: 'min(iterable)' },
  { label: 'max', kind: 'function', detail: 'max(iterable)' },
  { label: 'abs', kind: 'function', detail: 'abs(x)' },
  { label: 'sorted', kind: 'function', detail: 'sorted(iterable)' },
  { label: 'enumerate', kind: 'function', detail: 'enumerate(iterable)' },
  { label: 'zip', kind: 'function', detail: 'zip(*iterables)' },
  { label: 'map', kind: 'function', detail: 'map(function, iterable)' },
  { label: 'filter', kind: 'function', detail: 'filter(function, iterable)' },
  { label: 'any', kind: 'function', detail: 'any(iterable)' },
  { label: 'all', kind: 'function', detail: 'all(iterable)' },
  { label: 'input', kind: 'function', detail: 'input(prompt)' },
  { label: 'round', kind: 'function', detail: 'round(number[, ndigits])' },
  { label: 'type', kind: 'function', detail: 'type(object)' },

  // Common types & constructors
  { label: 'int', kind: 'type', detail: 'int(x)' },
  { label: 'float', kind: 'type', detail: 'float(x)' },
  { label: 'str', kind: 'type', detail: 'str(object)' },
  { label: 'bool', kind: 'type', detail: 'bool(x)' },
  { label: 'list', kind: 'type', detail: 'list([iterable])' },
  { label: 'dict', kind: 'type', detail: 'dict()' },
  { label: 'set', kind: 'type', detail: 'set()' },
  { label: 'tuple', kind: 'type', detail: 'tuple([iterable])' },

  // Common list / dict / string methods
  { label: 'append', kind: 'function', detail: 'list.append(x)', insertText: 'append()' },
  { label: 'extend', kind: 'function', detail: 'list.extend(iterable)', insertText: 'extend()' },
  { label: 'pop', kind: 'function', detail: 'list.pop([index])', insertText: 'pop()' },
  { label: 'insert', kind: 'function', detail: 'list.insert(i, x)', insertText: 'insert()' },
  { label: 'remove', kind: 'function', detail: 'list.remove(x)', insertText: 'remove()' },
  { label: 'sort', kind: 'function', detail: 'list.sort()', insertText: 'sort()' },
  { label: 'reverse', kind: 'function', detail: 'list.reverse()', insertText: 'reverse()' },
  { label: 'keys', kind: 'function', detail: 'dict.keys()' },
  { label: 'values', kind: 'function', detail: 'dict.values()' },
  { label: 'items', kind: 'function', detail: 'dict.items()' },
  { label: 'get', kind: 'function', detail: 'dict.get(key, default)' },
  { label: 'update', kind: 'function', detail: 'dict.update(other)' },
  { label: 'split', kind: 'function', detail: 'str.split(sep=None)' },
  { label: 'join', kind: 'function', detail: 'str.join(iterable)' },
  { label: 'strip', kind: 'function', detail: 'str.strip()' },
  { label: 'replace', kind: 'function', detail: 'str.replace(old, new)' },
  { label: 'lower', kind: 'function', detail: 'str.lower()' },
  { label: 'upper', kind: 'function', detail: 'str.upper()' },
  { label: 'startswith', kind: 'function', detail: 'str.startswith(prefix)' },
  { label: 'endswith', kind: 'function', detail: 'str.endswith(suffix)' }
];

const HTML_COMPLETIONS: CompletionItem[] = [
  // Tags
  { label: 'div', kind: 'tag', detail: 'HTML division', insertText: '<div class="">\n  \n</div>' },
  { label: 'span', kind: 'tag', detail: 'HTML inline container', insertText: '<span></span>' },
  { label: 'button', kind: 'tag', detail: 'HTML button', insertText: '<button type="button"></button>' },
  { label: 'input', kind: 'tag', detail: 'HTML input', insertText: '<input type="text" />' },
  { label: 'form', kind: 'tag', detail: 'HTML form', insertText: '<form id="">\n  \n</form>' },
  { label: 'p', kind: 'tag', detail: 'HTML paragraph', insertText: '<p></p>' },
  { label: 'h1', kind: 'tag', detail: 'HTML heading 1', insertText: '<h1></h1>' },
  { label: 'h2', kind: 'tag', detail: 'HTML heading 2', insertText: '<h2></h2>' },
  { label: 'h3', kind: 'tag', detail: 'HTML heading 3', insertText: '<h3></h3>' },
  { label: 'ul', kind: 'tag', detail: 'HTML unordered list', insertText: '<ul>\n  <li></li>\n</ul>' },
  { label: 'ol', kind: 'tag', detail: 'HTML ordered list', insertText: '<ol>\n  <li></li>\n</ol>' },
  { label: 'li', kind: 'tag', detail: 'HTML list item', insertText: '<li></li>' },
  { label: 'a', kind: 'tag', detail: 'HTML hyperlink', insertText: '<a href=""></a>' },
  { label: 'img', kind: 'tag', detail: 'HTML image', insertText: '<img src="" alt="" />' },
  { label: 'table', kind: 'tag', detail: 'HTML table', insertText: '<table>\n  <tr>\n    <td></td>\n  </tr>\n</table>' },
  { label: 'header', kind: 'tag', detail: 'HTML header container', insertText: '<header>\n  \n</header>' },
  { label: 'footer', kind: 'tag', detail: 'HTML footer container', insertText: '<footer>\n  \n</footer>' },
  { label: 'nav', kind: 'tag', detail: 'HTML navigation', insertText: '<nav>\n  \n</nav>' },
  { label: 'main', kind: 'tag', detail: 'HTML main content', insertText: '<main>\n  \n</main>' },
  { label: 'section', kind: 'tag', detail: 'HTML section', insertText: '<section>\n  \n</section>' },
  { label: 'article', kind: 'tag', detail: 'HTML article', insertText: '<article>\n  \n</article>' },
  { label: 'style', kind: 'tag', detail: 'HTML style tag', insertText: '<style>\n  \n</style>' },
  { label: 'script', kind: 'tag', detail: 'HTML script tag', insertText: '<script>\n  \n</script>' },

  // Common HTML attributes
  { label: 'class', kind: 'property', detail: 'attribute', insertText: 'class=""' },
  { label: 'id', kind: 'property', detail: 'attribute', insertText: 'id=""' },
  { label: 'style', kind: 'property', detail: 'attribute', insertText: 'style=""' },
  { label: 'src', kind: 'property', detail: 'attribute', insertText: 'src=""' },
  { label: 'href', kind: 'property', detail: 'attribute', insertText: 'href=""' },
  { label: 'placeholder', kind: 'property', detail: 'attribute', insertText: 'placeholder=""' },
  { label: 'type', kind: 'property', detail: 'attribute', insertText: 'type=""' },
  { label: 'value', kind: 'property', detail: 'attribute', insertText: 'value=""' },
  { label: 'name', kind: 'property', detail: 'attribute', insertText: 'name=""' },
  { label: 'disabled', kind: 'property', detail: 'boolean attribute' },
  { label: 'required', kind: 'property', detail: 'boolean attribute' }
];

const CSS_COMPLETIONS: CompletionItem[] = [
  // Properties
  { label: 'display', kind: 'property', detail: 'property', insertText: 'display: ;' },
  { label: 'flex', kind: 'property', detail: 'property', insertText: 'flex: ;' },
  { label: 'grid', kind: 'property', detail: 'property' },
  { label: 'position', kind: 'property', detail: 'property', insertText: 'position: ;' },
  { label: 'color', kind: 'property', detail: 'property', insertText: 'color: ;' },
  { label: 'background', kind: 'property', detail: 'property', insertText: 'background: ;' },
  { label: 'background-color', kind: 'property', detail: 'property', insertText: 'background-color: ;' },
  { label: 'border', kind: 'property', detail: 'property', insertText: 'border: 1px solid ;' },
  { label: 'border-radius', kind: 'property', detail: 'property', insertText: 'border-radius: ;' },
  { label: 'font-size', kind: 'property', detail: 'property', insertText: 'font-size: ;' },
  { label: 'font-family', kind: 'property', detail: 'property', insertText: 'font-family: ;' },
  { label: 'font-weight', kind: 'property', detail: 'property', insertText: 'font-weight: ;' },
  { label: 'padding', kind: 'property', detail: 'property', insertText: 'padding: ;' },
  { label: 'margin', kind: 'property', detail: 'property', insertText: 'margin: ;' },
  { label: 'width', kind: 'property', detail: 'property', insertText: 'width: ;' },
  { label: 'height', kind: 'property', detail: 'property', insertText: 'height: ;' },
  { label: 'max-width', kind: 'property', detail: 'property', insertText: 'max-width: ;' },
  { label: 'min-height', kind: 'property', detail: 'property', insertText: 'min-height: ;' },
  { label: 'align-items', kind: 'property', detail: 'property', insertText: 'align-items: center;' },
  { label: 'justify-content', kind: 'property', detail: 'property', insertText: 'justify-content: center;' },
  { label: 'flex-direction', kind: 'property', detail: 'property', insertText: 'flex-direction: column;' },
  { label: 'gap', kind: 'property', detail: 'property', insertText: 'gap: ;' },
  { label: 'cursor', kind: 'property', detail: 'property', insertText: 'cursor: pointer;' },
  { label: 'transition', kind: 'property', detail: 'property', insertText: 'transition: all 0.2s ease;' },
  { label: 'transform', kind: 'property', detail: 'property', insertText: 'transform: ;' },
  { label: 'box-shadow', kind: 'property', detail: 'property', insertText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.1);' },
  { label: 'opacity', kind: 'property', detail: 'property', insertText: 'opacity: ;' },
  { label: 'z-index', kind: 'property', detail: 'property', insertText: 'z-index: ;' },
  { label: 'overflow', kind: 'property', detail: 'property', insertText: 'overflow: hidden;' },

  // Values
  { label: 'none', kind: 'keyword', detail: 'value' },
  { label: 'block', kind: 'keyword', detail: 'value' },
  { label: 'inline-block', kind: 'keyword', detail: 'value' },
  { label: 'flex', kind: 'keyword', detail: 'value' },
  { label: 'absolute', kind: 'keyword', detail: 'value' },
  { label: 'relative', kind: 'keyword', detail: 'value' },
  { label: 'fixed', kind: 'keyword', detail: 'value' },
  { label: 'sticky', kind: 'keyword', detail: 'value' },
  { label: 'pointer', kind: 'keyword', detail: 'value' },
  { label: 'center', kind: 'keyword', detail: 'value' },
  { label: 'space-between', kind: 'keyword', detail: 'value' },
  { label: 'space-around', kind: 'keyword', detail: 'value' },
  { label: 'column', kind: 'keyword', detail: 'value' },
  { label: 'row', kind: 'keyword', detail: 'value' }
];

const LANGUAGE_COMPLETIONS: Partial<Record<SupportedLanguage, CompletionItem[]>> = {
  javascript: COMMON_JS_TS_COMPLETIONS,
  typescript: COMMON_JS_TS_COMPLETIONS,
  c: C_CPP_COMPLETIONS,
  cpp: C_CPP_COMPLETIONS,
  python: PYTHON_COMPLETIONS,
  html: HTML_COMPLETIONS,
  css: CSS_COMPLETIONS
};

/**
 * Checks whether a given character offset in a document is inside a string literal
 * or comment. In VS Code, autocomplete is suppressed inside strings and comments.
 */
export function isInsideStringOrComment(
  text: string,
  offset: number,
  language: SupportedLanguage = 'javascript'
): boolean {
  if (offset <= 0 || !text) return false;
  const limit = Math.min(offset, text.length);

  type ScanState =
    | 'code'
    | 'single_quote'
    | 'double_quote'
    | 'backtick'
    | 'triple_double'
    | 'triple_single'
    | 'line_comment'
    | 'block_comment'
    | 'html_comment';

  let state: ScanState = 'code';
  let i = 0;

  while (i < limit) {
    const ch = text[i];
    const next = text[i + 1] ?? '';
    const next2 = text[i + 2] ?? '';

    if (state === 'code') {
      // Check for Python / Bash line comment: #
      if ((language === 'python' || language === 'bash') && ch === '#') {
        state = 'line_comment';
        i++;
        continue;
      }

      // Check for SQL line comment: --
      if (language === 'sql' && ch === '-' && next === '-') {
        state = 'line_comment';
        i += 2;
        continue;
      }

      // Check for C/C++/JS/TS/Java/Go/CSS line comment: //
      if (
        language !== 'python' &&
        language !== 'bash' &&
        language !== 'sql' &&
        ch === '/' &&
        next === '/'
      ) {
        state = 'line_comment';
        i += 2;
        continue;
      }

      // Check for HTML comment: <!--
      if (
        language === 'html' &&
        ch === '<' &&
        next === '!' &&
        next2 === '-' &&
        text[i + 3] === '-'
      ) {
        state = 'html_comment';
        i += 4;
        continue;
      }

      // Check for block comment: /*
      if (
        language !== 'python' &&
        language !== 'bash' &&
        ch === '/' &&
        next === '*'
      ) {
        state = 'block_comment';
        i += 2;
        continue;
      }

      // Check for Python triple quotes
      if (language === 'python') {
        if (ch === '"' && next === '"' && next2 === '"') {
          state = 'triple_double';
          i += 3;
          continue;
        }
        if (ch === "'" && next === "'" && next2 === "'") {
          state = 'triple_single';
          i += 3;
          continue;
        }
      }

      // Check for regular quotes
      if (ch === '"') {
        state = 'double_quote';
        i++;
        continue;
      }
      if (ch === "'") {
        state = 'single_quote';
        i++;
        continue;
      }
      if (
        ch === '`' &&
        (language === 'javascript' || language === 'typescript' || language === 'go')
      ) {
        state = 'backtick';
        i++;
        continue;
      }

      i++;
    } else if (state === 'line_comment') {
      if (ch === '\n') {
        state = 'code';
      }
      i++;
    } else if (state === 'block_comment') {
      if (ch === '*' && next === '/') {
        state = 'code';
        i += 2;
      } else {
        i++;
      }
    } else if (state === 'html_comment') {
      if (ch === '-' && next === '-' && next2 === '>') {
        state = 'code';
        i += 3;
      } else {
        i++;
      }
    } else if (state === 'double_quote') {
      if (ch === '\\') {
        i += 2;
      } else if (ch === '"') {
        state = 'code';
        i++;
      } else if (ch === '\n' && language !== 'python') {
        state = 'code';
        i++;
      } else {
        i++;
      }
    } else if (state === 'single_quote') {
      if (ch === '\\') {
        i += 2;
      } else if (ch === "'") {
        state = 'code';
        i++;
      } else if (ch === '\n' && language !== 'python') {
        state = 'code';
        i++;
      } else {
        i++;
      }
    } else if (state === 'backtick') {
      if (ch === '\\') {
        i += 2;
      } else if (ch === '`') {
        state = 'code';
        i++;
      } else {
        i++;
      }
    } else if (state === 'triple_double') {
      if (ch === '"' && next === '"' && next2 === '"') {
        state = 'code';
        i += 3;
      } else {
        i++;
      }
    } else if (state === 'triple_single') {
      if (ch === "'" && next === "'" && next2 === "'") {
        state = 'code';
        i += 3;
      } else {
        i++;
      }
    }
  }

  return state !== 'code';
}

/**
 * Extracts identifier words from the current document to provide VS Code-style
 * word completion for user variables, functions, and classes.
 */
export function extractDocumentWords(text: string, _language?: SupportedLanguage): CompletionItem[] {
  if (!text) return [];

  // Strip comments and string literals so words inside strings/comments are not extracted as symbols
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/.*/g, '')
    .replace(/#.*/g, '')
    .replace(/(["'`])(?:(?=(\\?))\2[\s\S])*?\1/g, '');

  const matches = stripped.match(/[a-zA-Z_$][a-zA-Z0-9_$]{1,}/g);
  if (!matches) return [];

  const KNOWN_KEYWORDS = new Set([
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
    'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw',
    'import', 'export', 'class', 'extends', 'async', 'await', 'new', 'this',
    'true', 'false', 'null', 'undefined', 'int', 'float', 'double', 'char',
    'void', 'bool', 'auto', 'struct', 'def', 'elif', 'in', 'is', 'not',
    'and', 'or', 'from', 'as', 'None', 'True', 'False', 'self', 'print',
    'len', 'range', 'list', 'dict', 'set', 'str'
  ]);

  const wordCounts = new Map<string, number>();
  for (const w of matches) {
    if (!KNOWN_KEYWORDS.has(w) && w.length >= 2) {
      wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
    }
  }

  const items: CompletionItem[] = [];
  for (const [word] of wordCounts.entries()) {
    items.push({
      label: word,
      kind: 'variable',
      detail: 'document symbol'
    });
  }
  return items;
}

/**
 * Extracts the prefix word being typed immediately before the caret.
 * Returns null if the cursor is inside a string or comment, or if
 * preceded by whitespace/punctuation.
 */
export function getWordPrefixAtCursor(
  value: string,
  cursorOffset: number,
  language: SupportedLanguage = 'javascript'
): { prefix: string; start: number; end: number } | null {
  if (cursorOffset === 0 || !value) return null;

  // 1. Suppress autocomplete inside strings or comments
  if (isInsideStringOrComment(value, cursorOffset, language)) {
    return null;
  }

  // 2. Character immediately before cursor must be an identifier character
  const charBefore = value[cursorOffset - 1];
  const isIdentifierChar =
    language === 'css'
      ? /[a-zA-Z0-9_-]/.test(charBefore)
      : language === 'html'
        ? /[a-zA-Z0-9_-]/.test(charBefore)
        : /[a-zA-Z0-9_$]/.test(charBefore);

  if (!isIdentifierChar) return null;

  let start = cursorOffset;
  const wordRegex =
    language === 'css'
      ? /[a-zA-Z0-9_-]/
      : language === 'html'
        ? /[a-zA-Z0-9_-]/
        : /[a-zA-Z0-9_$]/;

  while (start > 0 && wordRegex.test(value[start - 1])) {
    start--;
  }

  const prefix = value.slice(start, cursorOffset);
  if (!prefix || prefix.length < 1) return null;

  // Do not autocomplete pure numbers (e.g. 100)
  if (/^\d+$/.test(prefix)) return null;

  return { prefix, start, end: cursorOffset };
}

/**
 * Returns prioritized autocomplete suggestions for the active prefix and language.
 */
export function getAutocompleteSuggestions(
  prefix: string,
  language: SupportedLanguage = 'javascript',
  documentText: string = ''
): CompletionItem[] {
  const cleanPrefix = prefix.toLowerCase();
  const catalog = LANGUAGE_COMPLETIONS[language] ?? COMMON_JS_TS_COMPLETIONS;
  const docWords = extractDocumentWords(documentText, language);

  // Combine and deduplicate
  const seen = new Set<string>();
  const candidates: CompletionItem[] = [];

  for (const item of catalog) {
    const key = item.label.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(item);
    }
  }

  for (const item of docWords) {
    const key = item.label.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(item);
    }
  }

  // Filter and rank:
  // 1. Starts with prefix (case-insensitive)
  // 2. For multi-character prefixes (>= 2 chars), also allow substring match
  const matches = candidates.filter((item) => {
    const l = item.label.toLowerCase();
    if (l.startsWith(cleanPrefix)) return true;
    if (cleanPrefix.length >= 2) {
      return l.includes(cleanPrefix);
    }
    return false;
  });

  matches.sort((a, b) => {
    const aLower = a.label.toLowerCase();
    const bLower = b.label.toLowerCase();

    const aExact = aLower === cleanPrefix;
    const bExact = bLower === cleanPrefix;
    if (aExact !== bExact) return aExact ? -1 : 1;

    const aStarts = aLower.startsWith(cleanPrefix);
    const bStarts = bLower.startsWith(cleanPrefix);
    if (aStarts !== bStarts) return aStarts ? -1 : 1;

    // Prefer catalog items (keywords, types, functions) over generic document variables
    const aIsDoc = a.detail === 'document symbol';
    const bIsDoc = b.detail === 'document symbol';
    if (aIsDoc !== bIsDoc) return aIsDoc ? 1 : -1;

    // Prefer shorter names if both start with prefix
    return a.label.length - b.label.length;
  });

  return matches.slice(0, 10);
}
