import React from 'react';
import { CodeBlock } from '@/ui';
import type { CodeCallout, SupportedLanguage } from '@/types';

interface CodeExampleProps {
  code: string;
  language: SupportedLanguage;
  callouts?: CodeCallout[];
  /** Small caption above the snippet, e.g. "Example" or "A second example". */
  label?: string;
}

/**
 * A worked example: the code, in full, plus a short line-by-line walkthrough
 * underneath. Deliberately not inline annotations on the code itself - a
 * plain list under a real, unmodified code block is easier to keep accurate
 * and easier to read on a phone.
 */
export const CodeExample: React.FC<CodeExampleProps> = ({ code, language, callouts, label }) => (
  <div className="concept-example">
    {label && <div className="concept-example-label">{label}</div>}
    <CodeBlock code={code} language={language} />
    {callouts && callouts.length > 0 && (
      <ul className="concept-callouts">
        {callouts.map((c) => (
          <li key={c.line}>
            <span className="concept-callout-line">Line {c.line}</span>
            <span>{c.text}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
);
