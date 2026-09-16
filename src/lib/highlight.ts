/**
 * A small, dependency-free tokeniser for the code shown in challenges.
 *
 * It returns tokens rather than HTML so the renderer can build React elements -
 * no dangerouslySetInnerHTML, so authored content can never inject markup.
 * This is deliberately approximate: it makes code readable, it is not a parser.
 */
import { SupportedLanguage } from '../types';

export type TokenKind = 'plain' | 'keyword' | 'string' | 'comment' | 'number' | 'function' | 'operator';

export interface Token {
  text: string;
  kind: TokenKind;
}

const KEYWORDS: Partial<Record<SupportedLanguage, string[]>> = {
  javascript: 'const let var function return if else for while do break continue class extends new this typeof instanceof try catch finally throw switch case default async await yield import export from delete in of null undefined true false void static get set super'.split(' '),
  typescript: 'const let var function return if else for while do break continue class extends new this typeof instanceof try catch finally throw switch case default async await yield import export from delete in of null undefined true false void interface type enum implements public private readonly as satisfies'.split(' '),
  python: 'def return if elif else for while break continue class import from as try except finally raise with lambda yield global nonlocal pass and or not in is None True False assert del async await match case'.split(' '),
  java: 'public private protected class interface extends implements static final void int long double float boolean char String new return if else for while do break continue try catch finally throw throws import package this super null true false'.split(' '),
  c: 'int char float double void long short unsigned signed struct union enum typedef static const return if else for while do break continue switch case default sizeof include define NULL'.split(' '),
  cpp: 'int char float double void long short unsigned signed struct class public private protected template typename namespace using return if else for while do break continue switch case default new delete const auto nullptr true false std'.split(' '),
  go: 'package import func var const type struct interface map chan go defer return if else for range switch case default break continue nil true false string int error'.split(' '),
  sql: 'SELECT FROM WHERE JOIN INNER LEFT RIGHT FULL OUTER ON GROUP BY HAVING ORDER LIMIT OFFSET INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER DROP INDEX PRIMARY KEY FOREIGN REFERENCES NOT NULL UNIQUE DISTINCT AS AND OR IN EXISTS BETWEEN LIKE CASE WHEN THEN ELSE END UNION ALL COUNT SUM AVG MIN MAX BEGIN COMMIT ROLLBACK TRANSACTION WITH'.split(' '),
  bash: 'git npm node cd ls echo export if then else fi for do done while function return sudo curl grep cat rm mv cp mkdir chmod docker'.split(' '),
  pseudocode: 'SET TO FOR EACH IN END WHILE IF THEN ELSE RETURN FUNCTION PROCEDURE REPEAT UNTIL DO OUTPUT INPUT AND OR NOT APPEND REMOVE SWAP BREAK CONTINUE'.split(' '),
  css: 'color background display flex grid margin padding border position absolute relative fixed sticky width height font important hover focus media'.split(' '),
  html: 'div span class id href src type button input form section header footer nav main article'.split(' ')
};

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

const IDENTIFIER = /[A-Za-z_$][A-Za-z0-9_$]*/y;
const NUMBER = /\d[\d_]*(\.\d+)?([eE][+-]?\d+)?/y;
const WHITESPACE = /\s+/y;
const OPERATOR = /[+\-*/%=<>!&|^~?:.,;(){}[\]]/y;

/** Tokenise one line. Multi-line strings and block comments are not tracked. */
export function tokenizeLine(line: string, language: SupportedLanguage): Token[] {
  const keywords = new Set(KEYWORDS[language] ?? KEYWORDS.javascript ?? []);
  const caseInsensitive = language === 'sql' || language === 'pseudocode';
  const commentMarker = LINE_COMMENT[language] ?? '//';
  const tokens: Token[] = [];

  let i = 0;
  const push = (text: string, kind: TokenKind) => {
    const last = tokens[tokens.length - 1];
    if (last && last.kind === kind) last.text += text;
    else tokens.push({ text, kind });
  };

  while (i < line.length) {
    // Comments run to the end of the line.
    if (line.startsWith(commentMarker, i) || (language !== 'sql' && line.startsWith('#', i) && language === 'python')) {
      push(line.slice(i), 'comment');
      break;
    }
    if (language !== 'python' && language !== 'bash' && line.startsWith('/*', i)) {
      push(line.slice(i), 'comment');
      break;
    }

    const ch = line[i];

    // Strings, including a tolerant unterminated case.
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

    WHITESPACE.lastIndex = i;
    const ws = WHITESPACE.exec(line);
    if (ws && ws.index === i) {
      push(ws[0], 'plain');
      i += ws[0].length;
      continue;
    }

    NUMBER.lastIndex = i;
    const num = NUMBER.exec(line);
    if (num && num.index === i) {
      push(num[0], 'number');
      i += num[0].length;
      continue;
    }

    IDENTIFIER.lastIndex = i;
    const ident = IDENTIFIER.exec(line);
    if (ident && ident.index === i) {
      const word = ident[0];
      const probe = caseInsensitive ? word.toUpperCase() : word;
      const isKeyword = caseInsensitive
        ? [...keywords].some((k) => k.toUpperCase() === probe)
        : keywords.has(word);
      const isCall = line[i + word.length] === '(';
      push(word, isKeyword ? 'keyword' : isCall ? 'function' : 'plain');
      i += word.length;
      continue;
    }

    OPERATOR.lastIndex = i;
    const op = OPERATOR.exec(line);
    if (op && op.index === i) {
      push(op[0], 'operator');
      i += op[0].length;
      continue;
    }

    push(ch, 'plain');
    i += 1;
  }

  return tokens;
}

export function tokenize(code: string, language: SupportedLanguage): Token[][] {
  return code.split('\n').map((line) => tokenizeLine(line, language));
}
