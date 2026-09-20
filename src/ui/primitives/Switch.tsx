import React from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
  id?: string;
  className?: string;
}

/** On/off toggle, styled by `.switch` in components.css. */
export const Switch: React.FC<SwitchProps> = ({ checked, onChange, disabled, ariaLabel, id, className = '' }) => (
  <button
    id={id}
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`switch ${className}`.trim()}
  />
);
