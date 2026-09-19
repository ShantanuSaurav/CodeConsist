import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Undo2, Redo2, RotateCcw, FileCode, Palette, FileJson } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { tokenize } from '@/ui/code/highlight';
import { SupportedLanguage } from '@/types';
import {
  handleAutoCloseKey,
  handleSmartBackspace,
  handleSmartEnter,
  toggleLineComment,
  moveLines,
  duplicateLines,
  getWordPrefixAtCursor,
  getAutocompleteSuggestions,
  CompletionItem
} from '@/ui/code/editorEngine';
import { AutocompleteDropdown } from '@/ui/code/AutocompleteDropdown';

export interface WebFiles {
  html: string;
  css: string;
  js: string;
}

export type WebTab = 'html' | 'css' | 'js';

/**
 * Parse combined HTML (containing optional <style> and <script> tags)
 * into separate HTML, CSS, and JS file contents for a real IDE experience.
 */
export function parseWebCode(code: string): WebFiles {
  let working = code || '';

  // Extract CSS from <style>...</style>
  let css = '';
  const styleMatch = working.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  if (styleMatch) {
    css = styleMatch[1].trim();
    working = working.replace(styleMatch[0], '');
  }

  // Extract JS from <script>...</script>
  let js = '';
  const scriptMatch = working.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  if (scriptMatch) {
    js = scriptMatch[1].trim();
    working = working.replace(scriptMatch[0], '');
  }

  // The rest is pure HTML structure
  const html = working.trim();

  return { html, css, js };
}

/**
 * Bundle separate HTML, CSS, and JS files into a single runnable document
 * for the sandboxed DOM runner and automated test suites.
 */
export function bundleWebCode(files: WebFiles): string {
  const parts: string[] = [];
  if (files.html.trim()) {
    parts.push(files.html.trim());
  }
  if (files.css.trim()) {
    parts.push(`<style>\n${files.css.trim()}\n</style>`);
  }
  if (files.js.trim()) {
    parts.push(`<script>\n${files.js.trim()}\n</script>`);
  }
  return parts.join('\n\n');
}

interface WebIdeProps {
  code: string;
  onChange: (code: string) => void;
  readOnly?: boolean;
  onSubmit?: () => void;
  starterCode?: string;
  onReset?: () => void;
}

const TAB_CONFIG: Record<
  WebTab,
  { name: string; ext: string; icon: LucideIcon; lang: string }
> = {
  html: { name: 'index.html', ext: 'HTML5', icon: FileCode, lang: 'html' },
  css: { name: 'styles.css', ext: 'CSS3', icon: Palette, lang: 'css' },
  js: { name: 'script.js', ext: 'ES6+', icon: FileJson, lang: 'javascript' }
};

const INDENT = '  ';

export const WebIde: React.FC<WebIdeProps> = ({
  code,
  onChange,
  readOnly = false,
  onSubmit,
  starterCode,
  onReset
}) => {
  const [activeTab, setActiveTab] = useState<WebTab>('html');

  // Internal separate files state
  const [files, setFiles] = useState<WebFiles>(() => parseWebCode(code));
  const parsedStarter = useMemo(() => parseWebCode(starterCode ?? ''), [starterCode]);

  // Per-tab undo/redo history stacks
  const historyRef = useRef<Record<WebTab, { past: string[]; future: string[] }>>({
    html: { past: [], future: [] },
    css: { past: [], future: [] },
    js: { past: [], future: [] }
  });

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateUndoRedoState = useCallback((tab: WebTab) => {
    const h = historyRef.current[tab];
    setCanUndo(h.past.length > 0);
    setCanRedo(h.future.length > 0);
  }, []);

  // Synchronize internal files state if parent changes code externally
  const lastBundledCode = useRef(code);
  useEffect(() => {
    if (code !== lastBundledCode.current) {
      const parsed = parseWebCode(code);
      setFiles(parsed);
      lastBundledCode.current = code;
    }
  }, [code]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const [focused, setFocused] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [suggestions, setSuggestions] = useState<CompletionItem[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [autocompleteVisible, setAutocompleteVisible] = useState(false);
  const [autocompletePos, setAutocompletePos] = useState({ top: 0, left: 0 });

  const currentContent = files[activeTab];
  const activeLang = (TAB_CONFIG[activeTab].lang as SupportedLanguage) ?? 'html';
  const tokenizedLines = useMemo(() => tokenize(currentContent, activeLang), [currentContent, activeLang]);

  const updateCursorOnly = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const pos = el.selectionStart;
    const textBefore = el.value.slice(0, pos);
    const lines = textBefore.split('\n');
    const lineNum = lines.length;
    const colNum = lines[lines.length - 1].length + 1;
    setCursorPos({
      line: lineNum,
      col: colNum
    });
  }, []);

  // Update line and column cursor position and query IntelliSense
  const updateCursorAndAutocomplete = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const pos = el.selectionStart;
    const textBefore = el.value.slice(0, pos);
    const lines = textBefore.split('\n');
    const lineNum = lines.length;
    const colNum = lines[lines.length - 1].length + 1;
    setCursorPos({
      line: lineNum,
      col: colNum
    });

    if (readOnly) {
      setAutocompleteVisible(false);
      return;
    }

    const prefixInfo = getWordPrefixAtCursor(el.value, pos, activeLang);
    if (prefixInfo && prefixInfo.prefix.length >= 1) {
      const list = getAutocompleteSuggestions(prefixInfo.prefix, activeLang, el.value);
      if (list.length > 0) {
        setSuggestions(list);
        setSelectedSuggestionIndex(0);
        setAutocompleteVisible(true);

        const lineIdx = lineNum - 1;
        const colIdx = colNum - 1;
        const lineHeight = 24;
        const paddingTop = 14;
        const paddingLeft = 14;
        const charWidth = 8.25;

        let top = (lineIdx + 1) * lineHeight + paddingTop - el.scrollTop;
        if (el.clientHeight > 0 && top + 220 > el.clientHeight && lineIdx > 3) {
          top = lineIdx * lineHeight + paddingTop - 225 - el.scrollTop;
        }

        const maxLeft = Math.max(paddingLeft, (el.clientWidth || 400) - 285);
        const left = Math.max(paddingLeft, Math.min(paddingLeft + colIdx * charWidth - el.scrollLeft, maxLeft));

        setAutocompletePos({ top, left });
        return;
      }
    }
    setAutocompleteVisible(false);
  }, [activeLang, readOnly]);

  // Scroll gutter and highlight layer with textarea
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
  }, [currentContent, syncScroll]);

  const lineCount = Math.max(12, currentContent.split('\n').length + 2);

  // Snapshot timer for grouping rapid keystrokes into undoable chunks
  const snapshotTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSnapshot = useRef<string | null>(null);

  const commitSnapshot = useCallback((tab: WebTab, text: string) => {
    const h = historyRef.current[tab];
    if (h.past.length === 0 || h.past[h.past.length - 1] !== text) {
      h.past.push(text);
      if (h.past.length > 80) h.past.shift();
      h.future = [];
      updateUndoRedoState(tab);
    }
  }, [updateUndoRedoState]);

  const handleFileChange = useCallback(
    (tab: WebTab, nextVal: string, immediateSnapshot = false) => {
      const prevVal = files[tab];
      if (prevVal === nextVal) return;

      if (immediateSnapshot) {
        if (snapshotTimer.current) clearTimeout(snapshotTimer.current);
        commitSnapshot(tab, prevVal);
        pendingSnapshot.current = null;
      } else {
        if (!pendingSnapshot.current) {
          pendingSnapshot.current = prevVal;
        }
        if (snapshotTimer.current) clearTimeout(snapshotTimer.current);
        snapshotTimer.current = setTimeout(() => {
          if (pendingSnapshot.current !== null) {
            commitSnapshot(tab, pendingSnapshot.current);
            pendingSnapshot.current = null;
          }
        }, 500);
      }

      const nextFiles = { ...files, [tab]: nextVal };
      setFiles(nextFiles);

      const bundled = bundleWebCode(nextFiles);
      lastBundledCode.current = bundled;
      onChange(bundled);
    },
    [files, commitSnapshot, onChange]
  );

  const handleUndo = useCallback(() => {
    const h = historyRef.current[activeTab];
    if (h.past.length === 0) return;

    if (snapshotTimer.current) clearTimeout(snapshotTimer.current);
    pendingSnapshot.current = null;

    const prev = h.past.pop()!;
    h.future.unshift(files[activeTab]);

    const nextFiles = { ...files, [activeTab]: prev };
    setFiles(nextFiles);
    updateUndoRedoState(activeTab);

    const bundled = bundleWebCode(nextFiles);
    lastBundledCode.current = bundled;
    onChange(bundled);
  }, [activeTab, files, onChange, updateUndoRedoState]);

  const handleRedo = useCallback(() => {
    const h = historyRef.current[activeTab];
    if (h.future.length === 0) return;

    if (snapshotTimer.current) clearTimeout(snapshotTimer.current);
    pendingSnapshot.current = null;

    const next = h.future.shift()!;
    h.past.push(files[activeTab]);

    const nextFiles = { ...files, [activeTab]: next };
    setFiles(nextFiles);
    updateUndoRedoState(activeTab);

    const bundled = bundleWebCode(nextFiles);
    lastBundledCode.current = bundled;
    onChange(bundled);
  }, [activeTab, files, onChange, updateUndoRedoState]);

  const handleResetCurrentTab = () => {
    const starterVal = parsedStarter[activeTab];
    handleFileChange(activeTab, starterVal, true);
  };

  const handleSwitchTab = (tab: WebTab) => {
    if (tab === activeTab) return;
    if (pendingSnapshot.current !== null) {
      commitSnapshot(activeTab, pendingSnapshot.current);
      pendingSnapshot.current = null;
    }
    setActiveTab(tab);
    updateUndoRedoState(tab);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        updateCursorOnly();
      }
    });
  };

  const handleSelectSuggestion = useCallback(
    (item: CompletionItem) => {
      const el = textareaRef.current;
      if (!el) return;
      const selStart = el.selectionStart;
      const prefixInfo = getWordPrefixAtCursor(currentContent, selStart);
      if (!prefixInfo) return;

      const insertText = item.insertText ?? item.label;
      const next = currentContent.slice(0, prefixInfo.start) + insertText + currentContent.slice(prefixInfo.end);
      handleFileChange(activeTab, next, true);
      setAutocompleteVisible(false);

      requestAnimationFrame(() => {
        const newCursor = prefixInfo.start + insertText.length;
        el.selectionStart = el.selectionEnd = newCursor;
        el.focus();
        updateCursorAndAutocomplete();
      });
    },
    [activeTab, currentContent, handleFileChange, updateCursorAndAutocomplete]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;

    if (readOnly) {
      if (e.key === 'Escape') el.blur();
      return;
    }

    // 1. Intercept Autocomplete navigation & selection
    if (autocompleteVisible && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestionIndex((prev) => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestionIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSelectSuggestion(suggestions[selectedSuggestionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setAutocompleteVisible(false);
        return;
      }
    }

    // Run tests (Ctrl+Enter / Cmd+Enter)
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      onSubmit?.();
      return;
    }

    // Undo (Ctrl+Z / Cmd+Z)
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      handleUndo();
      return;
    }

    // Redo (Ctrl+Y or Ctrl+Shift+Z / Cmd+Shift+Z)
    if (
      ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) ||
      ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z'))
    ) {
      e.preventDefault();
      handleRedo();
      return;
    }

    // Line Comment Toggle (Ctrl+/ or Cmd+/)
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      const res = toggleLineComment(currentContent, el.selectionStart, el.selectionEnd, activeLang);
      handleFileChange(activeTab, res.value, true);
      requestAnimationFrame(() => {
        el.selectionStart = res.selectionStart;
        el.selectionEnd = res.selectionEnd;
        updateCursorAndAutocomplete();
      });
      return;
    }

    // Move Lines (Alt + ArrowUp / ArrowDown)
    if (e.altKey && !e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const dir = e.key === 'ArrowUp' ? 'up' : 'down';
      const res = moveLines(currentContent, el.selectionStart, el.selectionEnd, dir);
      if (res) {
        handleFileChange(activeTab, res.value, true);
        requestAnimationFrame(() => {
          el.selectionStart = res.selectionStart;
          el.selectionEnd = res.selectionEnd;
          updateCursorAndAutocomplete();
        });
      }
      return;
    }

    // Duplicate Lines (Shift + Alt + ArrowDown / ArrowUp)
    if (e.altKey && e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const dir = e.key === 'ArrowUp' ? 'up' : 'down';
      const res = duplicateLines(currentContent, el.selectionStart, el.selectionEnd, dir);
      handleFileChange(activeTab, res.value, true);
      requestAnimationFrame(() => {
        el.selectionStart = res.selectionStart;
        el.selectionEnd = res.selectionEnd;
        updateCursorAndAutocomplete();
      });
      return;
    }

    // Tab key indent/unindent
    if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart, selectionEnd } = el;
      const text = currentContent;

      if (e.shiftKey || text.slice(selectionStart, selectionEnd).includes('\n')) {
        const startOfFirst = text.lastIndexOf('\n', selectionStart - 1) + 1;
        const nl = text.indexOf('\n', selectionEnd);
        const endOfLast = nl === -1 ? text.length : nl;
        const block = text.slice(startOfFirst, endOfLast);
        const shifted = block
          .split('\n')
          .map((line) =>
            e.shiftKey
              ? line.startsWith(INDENT)
                ? line.slice(INDENT.length)
                : line.replace(/^\s{1,2}/, '')
              : INDENT + line
          )
          .join('\n');
        const next = text.slice(0, startOfFirst) + shifted + text.slice(endOfLast);
        handleFileChange(activeTab, next, true);
        requestAnimationFrame(() => {
          el.selectionStart = startOfFirst;
          el.selectionEnd = startOfFirst + shifted.length;
          updateCursorAndAutocomplete();
        });
        return;
      }

      // Simple 2-space tab insertion at cursor
      const next = text.slice(0, selectionStart) + INDENT + text.slice(selectionEnd);
      handleFileChange(activeTab, next, true);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = selectionStart + INDENT.length;
        updateCursorAndAutocomplete();
      });
      return;
    }

    // Auto-close pairs & wrap selection: (, [, {, ", ', ` or skip-over ), ], }
    const autoCloseResult = handleAutoCloseKey(e.key, currentContent, el.selectionStart, el.selectionEnd);
    if (autoCloseResult) {
      e.preventDefault();
      handleFileChange(activeTab, autoCloseResult.value, true);
      requestAnimationFrame(() => {
        el.selectionStart = autoCloseResult.selectionStart;
        el.selectionEnd = autoCloseResult.selectionEnd;
        updateCursorAndAutocomplete();
      });
      return;
    }

    // Smart Backspace between matching pairs
    if (e.key === 'Backspace') {
      const bsResult = handleSmartBackspace(currentContent, el.selectionStart, el.selectionEnd);
      if (bsResult) {
        e.preventDefault();
        handleFileChange(activeTab, bsResult.value, true);
        requestAnimationFrame(() => {
          el.selectionStart = bsResult.selectionStart;
          el.selectionEnd = bsResult.selectionEnd;
          updateCursorAndAutocomplete();
        });
        return;
      }
    }

    // Smart Enter with bracket expansion
    if (e.key === 'Enter') {
      const enterResult = handleSmartEnter(currentContent, el.selectionStart, el.selectionEnd, INDENT);
      if (enterResult) {
        e.preventDefault();
        handleFileChange(activeTab, enterResult.value, true);
        requestAnimationFrame(() => {
          el.selectionStart = enterResult.selectionStart;
          el.selectionEnd = enterResult.selectionEnd;
          updateCursorAndAutocomplete();
        });
        return;
      }
    }

    if (e.key === 'Escape') {
      e.stopPropagation();
      el.blur();
      setAutocompleteVisible(false);
    }
  };

  const hintId = useId();
  const ActiveIcon = TAB_CONFIG[activeTab].icon;

  return (
    <div className={`web-ide ${focused ? 'is-focused' : ''}`.trim()}>
      {/* ------------------------------------------------ IDE Tab Bar & Actions */}
      <div className="web-ide-header">
        <div className="web-ide-tabs" role="tablist" aria-label="Web IDE files">
          {(['html', 'css', 'js'] as WebTab[]).map((tab) => {
            const config = TAB_CONFIG[tab];
            const Icon = config.icon;
            const isTabActive = activeTab === tab;
            const isModified = files[tab] !== parsedStarter[tab];

            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={isTabActive}
                className={`web-ide-tab ${isTabActive ? 'is-active' : ''} is-${tab}`}
                onClick={() => handleSwitchTab(tab)}
              >
                <Icon size={14} className="web-ide-tab-icon" />
                <span className="web-ide-tab-name">{config.name}</span>
                {isModified && <span className="web-ide-modified-dot" title="Modified" />}
              </button>
            );
          })}
        </div>

        <div className="web-ide-toolbar">
          <button
            type="button"
            className="web-ide-tool-btn"
            onClick={handleUndo}
            disabled={!canUndo || readOnly}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            <Undo2 size={13} />
            <span>Undo</span>
          </button>
          <button
            type="button"
            className="web-ide-tool-btn"
            onClick={handleRedo}
            disabled={!canRedo || readOnly}
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
          >
            <Redo2 size={13} />
            <span>Redo</span>
          </button>
          <button
            type="button"
            className="web-ide-tool-btn is-reset"
            onClick={handleResetCurrentTab}
            disabled={readOnly}
            title={`Reset ${TAB_CONFIG[activeTab].name} to starter code`}
          >
            <RotateCcw size={12} />
            <span>Reset file</span>
          </button>
          {onReset && (
            <button
              type="button"
              className="web-ide-tool-btn is-reset"
              onClick={onReset}
              disabled={readOnly}
              title="Reset all files to starter code"
            >
              <RotateCcw size={12} />
              <span>Reset all</span>
            </button>
          )}
        </div>
      </div>

      {/* ------------------------------------------------ Editor Workspace */}
      <div className="web-ide-workspace">
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

        <div className="code-editor-stage">
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
                  {lineIdx < tokenizedLines.length - 1 ? '\n' : (currentContent.endsWith('\n') ? '\n' : '')}
                </span>
              ))}
            </code>
          </pre>
          <textarea
            ref={textareaRef}
            className="code-editor-area"
            value={currentContent}
            onChange={(e) => {
              handleFileChange(activeTab, e.target.value);
              updateCursorAndAutocomplete();
            }}
            onKeyDown={handleKeyDown}
            onKeyUp={(e) => {
              if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
                if (autocompleteVisible && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                  setAutocompleteVisible(false);
                }
                updateCursorOnly();
              }
            }}
            onClick={() => {
              setAutocompleteVisible(false);
              updateCursorOnly();
            }}
            onScroll={syncScroll}
            onFocus={() => {
              setFocused(true);
              updateCursorOnly();
            }}
            onBlur={() => {
              setFocused(false);
              setAutocompleteVisible(false);
            }}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            readOnly={readOnly}
            aria-label={`Code editor for ${TAB_CONFIG[activeTab].name}`}
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
      </div>

      {/* ------------------------------------------------ IDE Status Bar */}
      <div className="web-ide-status-bar">
        <div className="web-ide-status-left">
          <span className="web-ide-file-badge">
            <ActiveIcon size={12} />
            <span>{TAB_CONFIG[activeTab].name}</span>
          </span>
          <span className="web-ide-lang-badge">{TAB_CONFIG[activeTab].ext}</span>
          <span className="web-ide-mode-note">
            Tab indents 2 spaces · <kbd>Ctrl</kbd>+<kbd>Z</kbd> to undo
          </span>
        </div>

        <div className="web-ide-status-right">
          <span>
            Ln {cursorPos.line}, Col {cursorPos.col}
          </span>
          <span>{currentContent.length} chars</span>
          <span className="web-ide-kbd-badge">
            <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to run tests
          </span>
        </div>
      </div>
    </div>
  );
};
