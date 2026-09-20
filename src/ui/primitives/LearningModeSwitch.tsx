import React from 'react';
import { BookOpen, Zap } from 'lucide-react';
import type { LearningMode } from '@/types';

interface LearningModeSwitchProps {
  value: LearningMode | null;
  onChange: (mode: LearningMode) => void;
  /** Compact variant for the practice modal header. */
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * A two-way segmented control between Learn and Practice. The same control
 * appears in the practice modal header, on the Learn page and in Settings, so
 * the preference is never more than one click away and never locked in.
 */
export const LearningModeSwitch: React.FC<LearningModeSwitchProps> = ({ value, onChange, size = 'md', className = '' }) => {
  const options: Array<{ mode: LearningMode; label: string; icon: React.ReactNode; title: string }> = [
    { mode: 'learn', label: 'Learn', icon: <BookOpen size={size === 'sm' ? 12 : 13} />, title: 'Learn & Understand: theory, examples and a try-it before each new idea' },
    { mode: 'practice', label: 'Practice', icon: <Zap size={size === 'sm' ? 12 : 13} />, title: 'Practice mode: straight into the challenges' }
  ];
  return (
    <div className={`mode-switch mode-switch-${size} ${className}`.trim()} role="radiogroup" aria-label="Learning mode">
      {options.map((o) => (
        <button
          key={o.mode}
          type="button"
          role="radio"
          aria-checked={value === o.mode}
          title={o.title}
          className={`mode-switch-option ${value === o.mode ? 'is-active' : ''}`.trim()}
          onClick={() => onChange(o.mode)}
        >
          {o.icon}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
};
