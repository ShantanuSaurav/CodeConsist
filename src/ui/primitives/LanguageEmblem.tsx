import React from 'react';

const LABELS: Record<string, string> = { javascript: 'JS', typescript: 'TS', python: 'Py', java: 'Java', cpp: 'C++', c: 'C', go: 'Go', sql: 'SQL', html: '</>', css: 'CSS', web: '</>' };

export const LanguageEmblem: React.FC<{ language: string; size?: number }> = ({ language, size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false" className="shrink-0">
    <rect x="1" y="1" width="46" height="46" rx="10" fill="var(--surface-2)" stroke="var(--border)" />
    <path d="M10 12h8M30 36h8" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
    <text x="24" y="29" textAnchor="middle" fill="var(--text)" fontFamily="var(--font-mono)" fontSize={language === 'java' ? 12 : 14} fontWeight="600">{LABELS[language] ?? language.slice(0, 3)}</text>
  </svg>
);
