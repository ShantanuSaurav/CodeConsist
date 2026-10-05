import React, { createContext, useContext, useId, useRef } from 'react';

export interface TabItem {
  /** A short slug: it becomes part of the tab's and panel's ids. */
  id: string;
  label: React.ReactNode;
  disabled?: boolean;
}

interface TabsProps {
  tabs: TabItem[];
  /** The id of the selected tab. */
  value: string;
  onChange: (id: string) => void;
  /** What the tabs switch between, for screen readers. */
  ariaLabel: string;
  /** The panels: one TabPanel per tab, each wired to its tab. */
  children?: React.ReactNode;
  className?: string;
}

/** What a TabPanel needs from the Tabs around it. */
const TabsContext = createContext<{ base: string; value: string } | null>(null);

const tabId = (base: string, id: string) => `${base}-tab-${id}`;
const panelId = (base: string, id: string) => `${base}-panel-${id}`;

/**
 * A tab list. One tab stop: the selected tab. Left and Right move along it
 * and select as they go (the panels show at once), Home and End jump to the
 * ends, and disabled tabs are skipped. The selected tab is marked by a violet
 * bar, since a tab is a choice, not progress. Props only.
 */
export const Tabs: React.FC<TabsProps> = ({ tabs, value, onChange, ariaLabel, children, className = '' }) => {
  const base = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = tabs.flatMap((tab, i) => (tab.disabled ? [] : [i]));
  const selected = tabs.findIndex((tab) => tab.id === value && !tab.disabled);
  const stop = selected >= 0 ? selected : enabled[0];

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const at = enabled.indexOf(index);
    const next =
      event.key === 'ArrowRight'
        ? enabled[(at + 1) % enabled.length]
        : event.key === 'ArrowLeft'
          ? enabled[(at - 1 + enabled.length) % enabled.length]
          : event.key === 'Home'
            ? enabled[0]
            : event.key === 'End'
              ? enabled[enabled.length - 1]
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    refs.current[next]?.focus();
    onChange(tabs[next].id);
  };

  return (
    <TabsContext.Provider value={{ base, value }}>
      <div role="tablist" aria-label={ariaLabel} className={`tabs ${className}`.trim()}>
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={tabId(base, tab.id)}
            type="button"
            role="tab"
            aria-selected={i === selected}
            // Only when there are panels to point at.
            aria-controls={children ? panelId(base, tab.id) : undefined}
            tabIndex={i === stop ? 0 : -1}
            disabled={tab.disabled}
            className="tab"
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, i)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {children}
    </TabsContext.Provider>
  );
};

interface TabPanelProps {
  /** The id of the tab this panel belongs to. */
  id: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * One tab's content, placed inside Tabs. Only the selected panel renders its
 * children; the others stay as empty, hidden targets for their tab's
 * aria-controls, so nothing off screen mounts.
 */
export const TabPanel: React.FC<TabPanelProps> = ({ id, className = '', children }) => {
  const tabs = useContext(TabsContext);
  if (!tabs) return <div className={className || undefined}>{children}</div>;
  const active = tabs.value === id;
  return (
    <div
      role="tabpanel"
      id={panelId(tabs.base, id)}
      aria-labelledby={tabId(tabs.base, id)}
      hidden={!active}
      tabIndex={0}
      className={className || undefined}
    >
      {active ? children : null}
    </div>
  );
};
