import React, { useEffect, useRef } from 'react';
import { CompletionItem } from './editorEngine';

interface AutocompleteDropdownProps {
  suggestions: CompletionItem[];
  selectedIndex: number;
  onSelect: (item: CompletionItem) => void;
  position: { top: number; left: number };
  visible: boolean;
}

const KIND_BADGES: Record<CompletionItem['kind'], { text: string; className: string }> = {
  keyword: { text: 'K', className: 'badge-keyword' },
  type: { text: 'T', className: 'badge-type' },
  function: { text: 'F', className: 'badge-function' },
  snippet: { text: 'S', className: 'badge-snippet' },
  property: { text: 'P', className: 'badge-property' },
  tag: { text: '<>', className: 'badge-tag' },
  variable: { text: '#', className: 'badge-variable' }
};

export const AutocompleteDropdown: React.FC<AutocompleteDropdownProps> = ({
  suggestions,
  selectedIndex,
  onSelect,
  position,
  visible
}) => {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector('.is-selected') as HTMLElement | null;
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!visible || suggestions.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="editor-autocomplete-box"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`
      }}
      role="listbox"
      aria-label="IntelliSense completions"
    >
      {suggestions.map((item, idx) => {
        const isSelected = idx === selectedIndex;
        const badge = KIND_BADGES[item.kind] ?? { text: '·', className: 'badge-keyword' };

        return (
          <div
            key={`${item.label}-${idx}`}
            className={`editor-suggestion-item ${isSelected ? 'is-selected' : ''}`}
            role="option"
            aria-selected={isSelected}
            onMouseDown={(e) => {
              // Prevent losing focus on textarea
              e.preventDefault();
              onSelect(item);
            }}
          >
            <span className={`editor-suggestion-badge ${badge.className}`}>{badge.text}</span>
            <span className="editor-suggestion-label">{item.label}</span>
            {item.detail && <span className="editor-suggestion-detail">{item.detail}</span>}
          </div>
        );
      })}
    </div>
  );
};
