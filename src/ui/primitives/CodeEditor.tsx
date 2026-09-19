import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { SupportedLanguage } from '@/types';
import { tokenize } from '../code/highlight';
import { useEditorEngine } from '../code/useEditorEngine';
import { AutocompleteDropdown } from '../code/AutocompleteDropdown';

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
 * Modern code editor with live VS Code syntax highlighting, line numbers,
 * smart auto-indentation, active-line tracking, auto-enclosing brackets/quotes,
 * VS Code shortcuts, and real-time IntelliSense autocomplete.
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
  const highlightRef = useRef<HTMLPreElement>(null);
  const [focused, setFocused] = useState(false);

  const lineCount = useMemo(() => Math.max(value.split('\n').length, minRows), [value, minRows]);
  const indent = INDENT[language] ?? '  ';

  // Live syntax highlighting tokens
  const tokenizedLines = useMemo(() => tokenize(value, language), [value, language]);

  // Integrated editor engine: shortcuts, auto-close pairs, smart enter, IntelliSense
  const {
    cursorPos,
    suggestions,
    selectedSuggestionIndex,
    autocompleteVisible,
    autocompletePos,
    handleSelectSuggestion,
    dismissAutocomplete,
    handleKeyDown,
    updateCursorAndAutocomplete,
    updateCursorOnly
  } = useEditorEngine({
    value,
    onChange,
    language,
    readOnly,
    indent,
    textareaRef,
    onSubmit
  });

  // Keep the gutter and syntax highlight layer aligned with textarea scroll
  const syncScroll = useCallback(() => {
    if (!textareaRef.current) return;
    const top = textareaRef.current.scrollTop;
    const left = textareaRef.current.scrollLeft;
    if (gutterRef.current) gutterRef.current.scrollTop = top;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = top;
      highlightRef.current.scrollLeft = left;
    }
  }, []);

  useEffect(() => {
    syncScroll();
  }, [value, syncScroll]);

  const hintId = useId();

  return (
    <div className={`code-editor ${focused ? 'is-focused' : ''}`.trim()}>
      <div className="code-editor-gutter" ref={gutterRef} aria-hidden="true">
        {Array.from({ length: lineCount }, (_, i) => (
          <span
            key={i}
            className={`code-line-number ${focused && cursorPos.line === i + 1 ? 'is-active-line' : ''}`}
          >
            {i + 1}
          </span>
        ))}
      </div>
      <div
        className="code-editor-stage"
        style={{ height: `calc(${lineCount} * var(--code-line-height) + 1.7rem)` }}
      >
        <pre ref={highlightRef} className="code-editor-highlight" aria-hidden="true">
          <code>
            {tokenizedLines.map((lineTokens, lineIdx) => (
              <span
                key={lineIdx}
                className={`code-editor-line ${focused && cursorPos.line === lineIdx + 1 ? 'is-active-line' : ''}`}
              >
                {lineTokens.length === 0 ? '' : lineTokens.map((tok, tokIdx) => (
                  <span key={tokIdx} className={`tok tok-${tok.kind}`}>
                    {tok.text}
                  </span>
                ))}
                {lineIdx < tokenizedLines.length - 1 ? '\n' : (value.endsWith('\n') ? '\n' : '')}
              </span>
            ))}
          </code>
        </pre>
        <textarea
          ref={textareaRef}
          className="code-editor-area"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            updateCursorAndAutocomplete();
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={(e) => {
            // Arrow/nav keys update line/col indicator without opening autocomplete
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
              if (autocompleteVisible && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                dismissAutocomplete();
              }
              updateCursorOnly();
            }
          }}
          onClick={() => {
            dismissAutocomplete();
            updateCursorOnly();
          }}
          onScroll={syncScroll}
          onFocus={() => {
            setFocused(true);
            updateCursorOnly();
          }}
          onBlur={() => {
            setFocused(false);
            dismissAutocomplete();
          }}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          readOnly={readOnly}
          aria-label={ariaLabel}
          aria-describedby={hintId}
          rows={lineCount}
        />

        {/* Floating VS Code IntelliSense Autocomplete */}
        <AutocompleteDropdown
          suggestions={suggestions}
          selectedIndex={selectedSuggestionIndex}
          onSelect={handleSelectSuggestion}
          position={autocompletePos}
          visible={focused && autocompleteVisible}
        />
      </div>
      {/* Keyboard hints */}
      <span id={hintId} className="code-editor-hint" aria-live="off">
        {focused ? 'Tab indents · Ctrl+/ comments · Alt+↑/↓ moves line · Esc leaves' : ''}
      </span>
    </div>
  );
};
