import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { SupportedLanguage } from '@/types';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: SupportedLanguage;
  minRows?: number;
  readOnly?: boolean;
  ariaLabel?: string;
  /** Fired on Ctrl/Cmd+Enter - wired to "run" everywhere it appears. */
  onSubmit?: () => void;
}

const INDENT: Partial<Record<SupportedLanguage, string>> = {
  python: '    ',
  javascript: '  ',
  typescript: '  '
};

/**
 * A plain textarea with a synced line-number gutter.
 *
 * Deliberately not CodeMirror or Monaco: a 2 MB editor bundle for a textarea
 * that mostly holds twelve lines is a bad trade. What people actually miss from
 * a real editor is line numbers, a Tab that indents, and auto-indent on Enter -
 * so those are what this adds.
 */
export const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  language = 'javascript',
  minRows = 10,
  readOnly = false,
  ariaLabel = 'Code editor',
  onSubmit
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);

  const lineCount = useMemo(() => Math.max(value.split('\n').length, minRows), [value, minRows]);
  const indent = INDENT[language] ?? '  ';

  // Keep the gutter aligned while the textarea scrolls.
  const syncScroll = useCallback(() => {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  useEffect(() => {
    syncScroll();
  }, [value, syncScroll]);

  const replaceSelection = (text: string, caretOffset: number) => {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd } = el;
    const next = value.slice(0, selectionStart) + text + value.slice(selectionEnd);
    onChange(next);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = selectionStart + caretOffset;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;

    // A locked (solved) editor must stay locked. These handlers call onChange
    // directly, which sails past the browser's readOnly enforcement.
    if (readOnly) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        el.blur();
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      onSubmit?.();
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart, selectionEnd } = el;

      // Shift+Tab, or Tab across several lines, re-indents whole lines.
      if (e.shiftKey || value.slice(selectionStart, selectionEnd).includes('\n')) {
        const startOfFirst = value.lastIndexOf('\n', selectionStart - 1) + 1;
        const endOfLast = (() => {
          const nl = value.indexOf('\n', selectionEnd);
          return nl === -1 ? value.length : nl;
        })();
        const block = value.slice(startOfFirst, endOfLast);
        const shifted = block
          .split('\n')
          .map((line) =>
            e.shiftKey
              ? line.startsWith(indent)
                ? line.slice(indent.length)
                : line.replace(/^\s{1,2}/, '')
              : indent + line
          )
          .join('\n');
        const next = value.slice(0, startOfFirst) + shifted + value.slice(endOfLast);
        onChange(next);
        requestAnimationFrame(() => {
          el.selectionStart = startOfFirst;
          el.selectionEnd = startOfFirst + shifted.length;
        });
        return;
      }

      replaceSelection(indent, indent.length);
      return;
    }

    if (e.key === 'Enter') {
      // Carry the current indentation onto the new line, and add one level
      // after an opening brace or a colon.
      const { selectionStart } = el;
      const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
      const currentLine = value.slice(lineStart, selectionStart);
      const leading = currentLine.match(/^[ \t]*/)?.[0] ?? '';
      const opensBlock = /[{([:]\s*$/.test(currentLine);
      if (!leading && !opensBlock) return;

      e.preventDefault();
      const addition = '\n' + leading + (opensBlock ? indent : '');
      replaceSelection(addition, addition.length);
      return;
    }

    if (e.key === 'Escape') {
      // Let Escape leave the editor rather than closing the whole modal from
      // inside a textarea the learner is still typing in.
      e.stopPropagation();
      el.blur();
    }
  };

  const hintId = useId();

  return (
    <div className={`code-editor ${focused ? 'is-focused' : ''}`.trim()}>
      <div className="code-editor-gutter" ref={gutterRef} aria-hidden="true">
        {Array.from({ length: lineCount }, (_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        className="code-editor-area"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onScroll={syncScroll}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        readOnly={readOnly}
        aria-label={ariaLabel}
        aria-describedby={hintId}
        rows={lineCount}
        // Include the vertical padding: without it the content box was ~1.2
        // lines shorter than the line count, the textarea scrolled internally,
        // and the gutter (which cannot scroll) drifted off the code it labels.
        style={{ height: `calc(${lineCount} * var(--code-line-height) + 1.7rem)` }}
      />
      {/* Tab indents here, which is a keyboard trap unless the exit is stated. */}
      <span id={hintId} className="code-editor-hint" aria-live="off">
        {focused ? 'Tab indents · Esc leaves the editor' : ''}
      </span>
    </div>
  );
};
