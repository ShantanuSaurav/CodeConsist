import React, { useMemo } from 'react';
import { SupportedLanguage } from '../types';
import { tokenize } from '../lib/highlight';

interface CodeBlockProps {
  code: string;
  language?: SupportedLanguage;
  /** Line numbers help a lot on anything longer than a couple of lines. */
  showLineNumbers?: boolean;
  /** Rendered instead of the language name in the corner. */
  label?: string;
  /** Slots a React node in place of each `___` placeholder (fill-in-the-blank). */
  renderBlank?: (index: number) => React.ReactNode;
  className?: string;
}

const LANGUAGE_LABELS: Partial<Record<SupportedLanguage, string>> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  go: 'Go',
  sql: 'SQL',
  html: 'HTML',
  css: 'CSS',
  bash: 'Shell',
  pseudocode: 'Pseudocode'
};

/**
 * Read-only code display.
 *
 * This element is a flex child inside the practice modal. Because it sets
 * `overflow`, its automatic minimum size becomes zero, which previously let the
 * flex layout squash a ten-line snippet down to a single visible line whenever
 * the modal hit its max-height. `flex: none` in the stylesheet keeps it at its
 * natural height and gives it its own scrollbar instead.
 */
export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language = 'javascript',
  showLineNumbers,
  label,
  renderBlank,
  className = ''
}) => {
  const lines = useMemo(() => tokenize(code ?? '', language), [code, language]);
  const withNumbers = showLineNumbers ?? lines.length > 2;

  // Blanks are numbered across the whole snippet, not per line.
  let blankIndex = -1;

  return (
    <div className={`code-block ${className}`.trim()}>
      <div className="code-block-head">
        <span className="code-block-lang">{label ?? LANGUAGE_LABELS[language] ?? language}</span>
        <span className="code-block-lines">
          {lines.length} {lines.length === 1 ? 'line' : 'lines'}
        </span>
      </div>

      <pre className="code-block-body" tabIndex={0}>
        <code>
          {lines.map((tokens, lineNo) => (
            <span className="code-line" key={lineNo}>
              {withNumbers && (
                <span className="code-line-no" aria-hidden="true">
                  {lineNo + 1}
                </span>
              )}
              <span className="code-line-text">
                {tokens.length === 0 ? (
                  ' '
                ) : (
                  tokens.map((token, i) => {
                    if (renderBlank && token.text.includes('___')) {
                      // Split around every placeholder so the input sits inline.
                      const parts = token.text.split('___');
                      return (
                        <React.Fragment key={i}>
                          {parts.map((part, p) => (
                            <React.Fragment key={p}>
                              {part && <span className={`tok tok-${token.kind}`}>{part}</span>}
                              {p < parts.length - 1 && renderBlank(++blankIndex)}
                            </React.Fragment>
                          ))}
                        </React.Fragment>
                      );
                    }
                    return (
                      <span className={`tok tok-${token.kind}`} key={i}>
                        {token.text}
                      </span>
                    );
                  })
                )}
              </span>
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
};
