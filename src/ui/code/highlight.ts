/**
 * Real-time syntax highlighter & tokeniser designed for VS Code Dark+/Light+ color grading.
 *
 * Dependency-free and returns safe typed tokens for React rendering without dangerouslySetInnerHTML.
 * Supports JavaScript, TypeScript, HTML, CSS, Python, C, C++, Java, Go, SQL, Bash, and Pseudocode.
 */
import { SupportedLanguage } from '@/types';

export type TokenKind =
  | 'plain'
  | 'keyword'
  | 'control'
  | 'type'
  | 'string'
  | 'comment'
  | 'number'
  | 'boolean'
  | 'function'
  | 'property'
  | 'tag'
  | 'attribute'
  | 'selector'
  | 'operator'
  | 'punctuation';

export interface Token {
  text: string;
  kind: TokenKind;
}

const CONTROL_KEYWORDS = new Set([
  'return', 'if', 'else', 'for', 'while', 'do', 'break', 'continue', 'switch',
  'case', 'default', 'try', 'catch', 'finally', 'throw', 'throws', 'async',
  'await', 'yield', 'import', 'export', 'from', 'elif', 'except', 'raise',
  'with', 'match', 'in', 'is', 'and', 'or', 'not', 'pass', 'defer', 'select'
]);

const DECLARATION_KEYWORDS: Partial<Record<SupportedLanguage, Set<string>>> = {
  javascript: new Set('const let var function class extends new this super typeof instanceof delete void static get set'.split(' ')),
  typescript: new Set('const let var function class extends new this super typeof instanceof delete void static get set interface enum implements public private protected readonly as satisfies declare'.split(' ')),
  python: new Set('def class from as lambda global nonlocal assert del'.split(' ')),
  java: new Set('public private protected class interface extends implements static final abstract new this super import package synchronized volatile transient'.split(' ')),
  c: new Set('struct union enum typedef static const extern inline sizeof include define'.split(' ')),
  cpp: new Set('struct union enum typedef static const extern inline sizeof include define class public private protected template typename namespace using new delete auto friend virtual explicit override'.split(' ')),
  go: new Set('package import func var const type struct interface map chan make'.split(' ')),
  sql: new Set('SELECT FROM WHERE JOIN INNER LEFT RIGHT FULL OUTER ON GROUP BY HAVING ORDER LIMIT OFFSET INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER DROP INDEX PRIMARY KEY FOREIGN REFERENCES UNIQUE DISTINCT UNION ALL'.split(' ')),
  bash: new Set('git npm node cd ls echo export if then else fi for do done while function return sudo curl grep cat rm mv cp mkdir chmod docker'.split(' ')),
  pseudocode: new Set('SET TO FUNCTION PROCEDURE OUTPUT INPUT APPEND REMOVE SWAP'.split(' '))
};

const TYPE_KEYWORDS = new Set([
  'string', 'number', 'boolean', 'any', 'void', 'unknown', 'never', 'object',
  'symbol', 'bigint', 'int', 'long', 'double', 'float', 'char', 'short',
  'byte', 'unsigned', 'signed', 'size_t', 'bool', 'int64', 'int32', 'float64',
  'float32', 'error', 'String', 'Promise', 'Array', 'Record', 'Set', 'Map',
  'Vector', 'vector', 'List', 'Integer', 'Boolean', 'Double'
]);

const BOOLEAN_KEYWORDS = new Set([
  'true', 'false', 'null', 'undefined', 'None', 'True', 'False', 'NULL',
  'nullptr', 'nil', 'NaN', 'Infinity'
]);

const LINE_COMMENT: Partial<Record<SupportedLanguage, string>> = {
  javascript: '//',
  typescript: '//',
  java: '//',
  c: '//',
  cpp: '//',
  go: '//',
  css: '//',
  python: '#',
  bash: '#',
  sql: '--',
  pseudocode: '//'
};

/* ----------------------------------------------------------- HTML Tokenizer */

export function tokenizeHtmlLine(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  const push = (text: string, kind: TokenKind) => {
    if (!text) return;
    const last = tokens[tokens.length - 1];
    if (last && last.kind === kind) last.text += text;
    else tokens.push({ text, kind });
  };

  while (i < line.length) {
    // HTML comment <!-- ... -->
    if (line.startsWith('<!--', i)) {
      const end = line.indexOf('-->', i + 4);
      if (end !== -1) {
        push(line.slice(i, end + 3), 'comment');
        i = end + 3;
      } else {
        push(line.slice(i), 'comment');
        break;
      }
      continue;
    }

    // Doctype
    if (line.startsWith('<!DOCTYPE', i) || line.startsWith('<!doctype', i)) {
      const end = line.indexOf('>', i);
      if (end !== -1) {
        push(line.slice(i, end + 1), 'tag');
        i = end + 1;
      } else {
        push(line.slice(i), 'tag');
        break;
      }
      continue;
    }

    // Tag opening: < or </
    if (line[i] === '<') {
      const isClose = line.startsWith('</', i);
      const prefixLen = isClose ? 2 : 1;
      push(line.slice(i, i + prefixLen), 'punctuation');
      i += prefixLen;

      while (i < line.length && line[i] !== '>') {
        const ch = line[i];

        if (/\s/.test(ch)) {
          let ws = '';
          while (i < line.length && /\s/.test(line[i])) ws += line[i++];
          push(ws, 'plain');
          continue;
        }

        if (ch === '"' || ch === "'") {
          const quote = ch;
          let str = quote;
          i++;
          while (i < line.length) {
            str += line[i];
            if (line[i] === quote && line[i - 1] !== '\\') {
              i++;
              break;
            }
            i++;
          }
          push(str, 'string');
          continue;
        }

        if (line.startsWith('/>', i)) {
          push('/>', 'punctuation');
          i += 2;
          break;
        }

        if (/[a-zA-Z0-9_\-:]/.test(ch)) {
          let name = '';
          while (i < line.length && /[a-zA-Z0-9_\-:]/.test(line[i])) name += line[i++];
          const prevNonWs = tokens.filter((t) => t.kind !== 'plain').pop();
          const isTagName = prevNonWs && (prevNonWs.text === '<' || prevNonWs.text === '</');
          push(name, isTagName ? 'tag' : 'attribute');
          continue;
        }

        if (ch === '=') {
          push('=', 'operator');
          i++;
          continue;
        }

        push(ch, 'punctuation');
        i++;
      }

      if (i < line.length && line[i] === '>') {
        push('>', 'punctuation');
        i++;
      }
      continue;
    }

    // Text outside tag: scan until next <
    const nextTag = line.indexOf('<', i);
    if (nextTag === -1) {
      push(line.slice(i), 'plain');
      break;
    } else {
      push(line.slice(i, nextTag), 'plain');
      i = nextTag;
    }
  }

  return tokens;
}

/* ------------------------------------------------------------ CSS Tokenizer */

export function tokenizeCssLine(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  const push = (text: string, kind: TokenKind) => {
    if (!text) return;
    const last = tokens[tokens.length - 1];
    if (last && last.kind === kind) last.text += text;
    else tokens.push({ text, kind });
  };

  while (i < line.length) {
    if (line.startsWith('/*', i)) {
      const end = line.indexOf('*/', i + 2);
      if (end !== -1) {
        push(line.slice(i, end + 2), 'comment');
        i = end + 2;
      } else {
        push(line.slice(i), 'comment');
        break;
      }
      continue;
    }
    if (line.startsWith('//', i)) {
      push(line.slice(i), 'comment');
      break;
    }

    const ch = line[i];

    if (/\s/.test(ch)) {
      let ws = '';
      while (i < line.length && /\s/.test(line[i])) ws += line[i++];
      push(ws, 'plain');
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let str = quote;
      i++;
      while (i < line.length) {
        str += line[i];
        if (line[i] === quote && line[i - 1] !== '\\') {
          i++;
          break;
        }
        i++;
      }
      push(str, 'string');
      continue;
    }

    if (ch === '{' || ch === '}' || ch === '(' || ch === ')' || ch === ';') {
      push(ch, 'punctuation');
      i++;
      continue;
    }

    if (ch === ':') {
      push(':', 'punctuation');
      i++;
      continue;
    }

    // Selectors .class or #id or hex colors
    if ((ch === '.' || ch === '#') && /[a-zA-Z0-9_-]/.test(line[i + 1] ?? '')) {
      let sel = ch;
      i++;
      const lineBeforeColon = line.slice(0, i - 1).includes(':');
      if (ch === '#' && lineBeforeColon) {
        while (i < line.length && /[a-fA-F0-9]/.test(line[i])) sel += line[i++];
        push(sel, 'number');
        continue;
      }
      while (i < line.length && /[a-zA-Z0-9_-]/.test(line[i])) sel += line[i++];
      push(sel, 'selector');
      continue;
    }

    // Numbers with units: 20px, 1.5rem, 100%, 0.4s
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(line[i + 1] ?? ''))) {
      let num = '';
      while (i < line.length && /[\d.]/.test(line[i])) num += line[i++];
      push(num, 'number');
      let unit = '';
      while (i < line.length && /[a-zA-Z%]/.test(line[i])) unit += line[i++];
      if (unit) push(unit, 'keyword');
      continue;
    }

    if (/[a-zA-Z_-]/.test(ch)) {
      let word = '';
      while (i < line.length && /[a-zA-Z0-9_-]/.test(line[i])) word += line[i++];
      if (word.startsWith('@')) {
        push(word, 'control');
        continue;
      }
      const rest = line.slice(i).trimStart();
      const hasColonNext = rest.startsWith(':') && !rest.startsWith('::');
      if (hasColonNext) {
        push(word, 'property');
      } else {
        const isCommonValue = /^(none|block|inline|flex|grid|auto|inherit|initial|solid|dashed|dotted|pointer|relative|absolute|fixed|sticky|bold|normal|sans-serif|monospace|serif|center|left|right|hidden|visible|overflow|transparent|currentColor)$/i.test(word);
        push(word, isCommonValue ? 'keyword' : 'plain');
      }
      continue;
    }

    push(ch, 'operator');
    i++;
  }

  return tokens;
}

/* ------------------------------------------- General Code Language Tokenizer */

export function tokenizeCodeLine(line: string, language: SupportedLanguage): Token[] {
  const declKeywords = DECLARATION_KEYWORDS[language] ?? DECLARATION_KEYWORDS.javascript ?? new Set();
  const caseInsensitive = language === 'sql' || language === 'pseudocode';
  const commentMarker = LINE_COMMENT[language] ?? '//';
  const tokens: Token[] = [];

  let i = 0;
  const push = (text: string, kind: TokenKind) => {
    if (!text) return;
    const last = tokens[tokens.length - 1];
    if (last && last.kind === kind) last.text += text;
    else tokens.push({ text, kind });
  };

  while (i < line.length) {
    // Comments
    if (line.startsWith(commentMarker, i) || (language === 'python' && line.startsWith('#', i))) {
      push(line.slice(i), 'comment');
      break;
    }
    if (language !== 'python' && language !== 'bash' && line.startsWith('/*', i)) {
      push(line.slice(i), 'comment');
      break;
    }

    const ch = line[i];

    // Preprocessor directives in C / C++
    if ((language === 'c' || language === 'cpp') && ch === '#') {
      let j = i + 1;
      while (j < line.length && /[A-Za-z0-9_]/.test(line[j])) j++;
      const directive = line.slice(i, j);
      push(directive, 'control');
      i = j;
      if (directive === '#include') {
        while (i < line.length && /\s/.test(line[i])) {
          push(line[i++], 'plain');
        }
        if (i < line.length && line[i] === '<') {
          const headerEnd = line.indexOf('>', i);
          if (headerEnd !== -1) {
            push(line.slice(i, headerEnd + 1), 'string');
            i = headerEnd + 1;
          }
        }
      }
      continue;
    }

    // Strings
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < line.length) {
        if (line[j] === '\\') j += 2;
        else if (line[j] === ch) {
          j++;
          break;
        } else j++;
      }
      push(line.slice(i, j), 'string');
      i = j;
      continue;
    }

    // Whitespace
    if (/\s/.test(ch)) {
      let ws = '';
      while (i < line.length && /\s/.test(line[i])) ws += line[i++];
      push(ws, 'plain');
      continue;
    }

    // Numbers (decimal, hex, octal, binary)
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(line[i + 1] ?? ''))) {
      let num = '';
      if (line.startsWith('0x', i) || line.startsWith('0X', i)) {
        num = line.slice(i, i + 2);
        i += 2;
        while (i < line.length && /[0-9a-fA-F_]/.test(line[i])) num += line[i++];
      } else if (line.startsWith('0b', i) || line.startsWith('0B', i)) {
        num = line.slice(i, i + 2);
        i += 2;
        while (i < line.length && /[01_]/.test(line[i])) num += line[i++];
      } else {
        while (i < line.length && /[\d._eE+-]/.test(line[i])) {
          // Break on arithmetic operator after number
          if ((line[i] === '+' || line[i] === '-') && !/[eE]/.test(line[i - 1] ?? '')) break;
          num += line[i++];
        }
      }
      push(num, 'number');
      continue;
    }

    // Punctuation brackets and separators
    if (/[(){}[\];,]/.test(ch)) {
      push(ch, 'punctuation');
      i++;
      continue;
    }

    // Identifiers and Keywords
    if (/[A-Za-z_$]/.test(ch)) {
      let word = '';
      while (i < line.length && /[A-Za-z0-9_$]/.test(line[i])) word += line[i++];

      const probe = caseInsensitive ? word.toLowerCase() : word;
      const upperProbe = word.toUpperCase();

      // Check for property access (.identifier)
      const prevNonWs = tokens.filter((t) => t.kind !== 'plain').pop();
      const isProperty = prevNonWs && prevNonWs.text === '.';

      // Check if function call (identifier followed by '(')
      const rest = line.slice(i).trimStart();
      const isCall = rest.startsWith('(');

      if (isProperty) {
        push(word, isCall ? 'function' : 'property');
      } else if (CONTROL_KEYWORDS.has(probe) || (caseInsensitive && CONTROL_KEYWORDS.has(upperProbe.toLowerCase()))) {
        push(word, 'control');
      } else if (declKeywords.has(word) || (caseInsensitive && declKeywords.has(upperProbe))) {
        push(word, 'keyword');
      } else if (BOOLEAN_KEYWORDS.has(word) || BOOLEAN_KEYWORDS.has(probe)) {
        push(word, 'boolean');
      } else if (TYPE_KEYWORDS.has(word)) {
        push(word, 'type');
      } else if (isCall) {
        push(word, 'function');
      } else {
        push(word, 'plain');
      }
      continue;
    }

    // Operators
    if (/[+\-*/%=<>!&|^~?:.]/.test(ch)) {
      let op = '';
      while (i < line.length && /[+\-*/%=<>!&|^~?:.]/.test(line[i])) {
        // Stop single dot if next is identifier
        if (line[i] === '.' && op.length > 0) break;
        op += line[i++];
        if (op === '.' || op === '=>' || op === '===' || op === '!==' || op === '==' || op === '!=') break;
      }
      push(op, op === '.' ? 'punctuation' : 'operator');
      continue;
    }

    push(ch, 'plain');
    i++;
  }

  return tokens;
}

/* ------------------------------------------------------------- Line Dispatcher */

export function tokenizeLine(line: string, language: SupportedLanguage): Token[] {
  if (language === 'html') return tokenizeHtmlLine(line);
  if (language === 'css') return tokenizeCssLine(line);
  return tokenizeCodeLine(line, language);
}

/**
 * Tokenize a full code document with multi-line context awareness.
 * When an HTML file embeds <style> or <script> blocks, lines inside are
 * automatically syntax-highlighted with CSS and JavaScript rules respectively.
 */
export function tokenize(code: string, language: SupportedLanguage): Token[][] {
  const lines = (code ?? '').split('\n');
  if (language !== 'html') {
    return lines.map((line) => tokenizeLine(line, language));
  }

  let inStyle = false;
  let inScript = false;

  return lines.map((line) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('<style') && !trimmed.includes('</style>')) {
      inStyle = true;
      return tokenizeHtmlLine(line);
    }
    if (trimmed.includes('</style>')) {
      inStyle = false;
      return tokenizeHtmlLine(line);
    }
    if (trimmed.startsWith('<script') && !trimmed.includes('</script>')) {
      inScript = true;
      return tokenizeHtmlLine(line);
    }
    if (trimmed.includes('</script>')) {
      inScript = false;
      return tokenizeHtmlLine(line);
    }

    if (inStyle) return tokenizeCssLine(line);
    if (inScript) return tokenizeCodeLine(line, 'javascript');

    return tokenizeHtmlLine(line);
  });
}
