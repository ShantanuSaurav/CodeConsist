import React, { useCallback, useState } from 'react';
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
  CompletionItem,
  ReplaceResult
} from './editorEngine';

interface UseEditorEngineOptions {
  value: string;
  onChange: (value: string) => void;
  language: SupportedLanguage;
  readOnly?: boolean;
  indent?: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onSubmit?: () => void;
}

export function useEditorEngine({
  value,
  onChange,
  language,
  readOnly = false,
  indent = '  ',
  textareaRef,
  onSubmit
}: UseEditorEngineOptions) {
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [suggestions, setSuggestions] = useState<CompletionItem[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [autocompleteVisible, setAutocompleteVisible] = useState(false);
  const [autocompletePos, setAutocompletePos] = useState({ top: 0, left: 0 });

  const applyResult = useCallback(
    (res: ReplaceResult) => {
      onChange(res.value);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.selectionStart = res.selectionStart;
        el.selectionEnd = res.selectionEnd;
        updateCursorAndAutocomplete();
      });
    },
    [onChange, textareaRef]
  );

  const updateCursorOnly = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const selStart = el.selectionStart;
    const textBefore = el.value.slice(0, selStart);
    const lines = textBefore.split('\n');
    const lineNum = lines.length;
    const colNum = lines[lines.length - 1].length + 1;
    setCursorPos({ line: lineNum, col: colNum });
  }, [textareaRef]);

  const updateCursorAndAutocomplete = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;

    const selStart = el.selectionStart;
    const textBefore = el.value.slice(0, selStart);
    const lines = textBefore.split('\n');
    const lineNum = lines.length;
    const colNum = lines[lines.length - 1].length + 1;

    setCursorPos({ line: lineNum, col: colNum });

    if (readOnly) {
      setAutocompleteVisible(false);
      return;
    }

    // Check for word prefix to populate autocomplete
    const prefixInfo = getWordPrefixAtCursor(el.value, selStart, language);
    if (prefixInfo && prefixInfo.prefix.length >= 1) {
      const list = getAutocompleteSuggestions(prefixInfo.prefix, language, el.value);
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
  }, [language, readOnly, textareaRef]);

  const handleSelectSuggestion = useCallback(
    (item: CompletionItem) => {
      const el = textareaRef.current;
      if (!el) return;
      const selStart = el.selectionStart;
      const prefixInfo = getWordPrefixAtCursor(value, selStart, language);
      if (!prefixInfo) return;

      const insertText = item.insertText ?? item.label;
      const next = value.slice(0, prefixInfo.start) + insertText + value.slice(prefixInfo.end);
      onChange(next);
      setAutocompleteVisible(false);

      requestAnimationFrame(() => {
        const newCursor = prefixInfo.start + insertText.length;
        el.selectionStart = el.selectionEnd = newCursor;
        el.focus();
        updateCursorAndAutocomplete();
      });
    },
    [value, onChange, language, textareaRef, updateCursorAndAutocomplete]
  );

  const dismissAutocomplete = useCallback(() => {
    setAutocompleteVisible(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const el = e.currentTarget;

      if (readOnly) {
        if (e.key === 'Escape') {
          e.stopPropagation();
          el.blur();
        }
        return;
      }

      // 1. If Autocomplete is open, intercept navigation and selection keys
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

      // 2. Trigger Autocomplete manually (Ctrl+Space or Cmd+Space)
      if ((e.ctrlKey || e.metaKey) && e.key === ' ') {
        e.preventDefault();
        updateCursorAndAutocomplete();
        return;
      }

      // 3. Submit / Run Code (Ctrl/Cmd + Enter)
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        onSubmit?.();
        return;
      }

      // 3. Line Comment Toggle (Ctrl/Cmd + /)
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        const res = toggleLineComment(value, el.selectionStart, el.selectionEnd, language);
        applyResult(res);
        return;
      }

      // 4. Move Lines (Alt + ArrowUp / ArrowDown)
      if (e.altKey && !e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const dir = e.key === 'ArrowUp' ? 'up' : 'down';
        const res = moveLines(value, el.selectionStart, el.selectionEnd, dir);
        if (res) applyResult(res);
        return;
      }

      // 5. Duplicate Lines (Shift + Alt + ArrowDown / ArrowUp)
      if (e.altKey && e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const dir = e.key === 'ArrowUp' ? 'up' : 'down';
        const res = duplicateLines(value, el.selectionStart, el.selectionEnd, dir);
        applyResult(res);
        return;
      }

      // 6. Tab / Shift+Tab indent
      if (e.key === 'Tab') {
        e.preventDefault();
        const { selectionStart, selectionEnd } = el;

        if (e.shiftKey || value.slice(selectionStart, selectionEnd).includes('\n')) {
          const startOfFirst = value.lastIndexOf('\n', selectionStart - 1) + 1;
          const nl = value.indexOf('\n', selectionEnd);
          const endOfLast = nl === -1 ? value.length : nl;
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
          applyResult({
            value: next,
            selectionStart: startOfFirst,
            selectionEnd: startOfFirst + shifted.length
          });
          return;
        }

        const next = value.slice(0, selectionStart) + indent + value.slice(selectionEnd);
        applyResult({
          value: next,
          selectionStart: selectionStart + indent.length,
          selectionEnd: selectionStart + indent.length
        });
        return;
      }

      // 7. Auto-close pairs & wrap selection: (, [, {, ", ', ` or skip-over ), ], }
      const autoCloseResult = handleAutoCloseKey(e.key, value, el.selectionStart, el.selectionEnd);
      if (autoCloseResult) {
        e.preventDefault();
        applyResult(autoCloseResult);
        return;
      }

      // 8. Smart Backspace between matching pairs
      if (e.key === 'Backspace') {
        const bsResult = handleSmartBackspace(value, el.selectionStart, el.selectionEnd);
        if (bsResult) {
          e.preventDefault();
          applyResult(bsResult);
          return;
        }
      }

      // 9. Smart Enter with bracket expansion
      if (e.key === 'Enter') {
        const enterResult = handleSmartEnter(value, el.selectionStart, el.selectionEnd, indent);
        if (enterResult) {
          e.preventDefault();
          applyResult(enterResult);
          return;
        }
      }

      if (e.key === 'Escape') {
        e.stopPropagation();
        el.blur();
        setAutocompleteVisible(false);
      }
    },
    [
      readOnly,
      autocompleteVisible,
      suggestions,
      selectedSuggestionIndex,
      handleSelectSuggestion,
      onSubmit,
      value,
      language,
      applyResult,
      indent
    ]
  );

  return {
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
  };
}
