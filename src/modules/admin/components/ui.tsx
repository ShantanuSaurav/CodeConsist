import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Badge as UiBadge, Button as UiButton, Switch } from '@/ui';
import type { BadgeTone } from '@/ui';

/**
 * Form and layout primitives for the admin console, built on the shared UI
 * kit so the console is visibly the same product as the learner app - just
 * denser. Every content-editing screen is built from these rather than a raw
 * <textarea> of JSON - see docs on server/admin.js for why: the fields
 * exposed here are exactly the ones the backend accepts.
 */

export const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block mb-4">
    <span className="field-label">{label}</span>
    {children}
    {hint && <span className="field-hint">{hint}</span>}
  </label>
);

const inputClass = 'w-full';

export const TextField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  maxLength?: number;
  disabled?: boolean;
}> = ({ label, value, onChange, placeholder, hint, maxLength, disabled }) => (
  <Field label={label} hint={hint}>
    <input
      type="text"
      className={inputClass}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  </Field>
);

export const TextArea: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  rows?: number;
  maxLength?: number;
}> = ({ label, value, onChange, placeholder, hint, rows = 3, maxLength }) => (
  <Field label={label} hint={hint}>
    <textarea
      className={inputClass}
      value={value}
      placeholder={placeholder}
      rows={rows}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
    />
  </Field>
);

export const NumberField: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  hint?: string;
}> = ({ label, value, onChange, min, max, hint }) => (
  <Field label={label} hint={hint}>
    <input
      type="number"
      className={inputClass}
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  </Field>
);

export const SelectField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  hint?: string;
}> = ({ label, value, onChange, options, hint }) => (
  <Field label={label} hint={hint}>
    <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  </Field>
);

export const TagsField: React.FC<{ label: string; value: string[]; onChange: (value: string[]) => void; hint?: string }> = ({
  label,
  value,
  onChange,
  hint
}) => (
  <Field label={label} hint={hint ?? 'Comma-separated'}>
    <input
      type="text"
      className={inputClass}
      value={value.join(', ')}
      onChange={(e) =>
        onChange(
          e.target.value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        )
      }
    />
  </Field>
);

export const Toggle: React.FC<{ label: string; checked: boolean; onChange: (checked: boolean) => void; hint?: string }> = ({
  label,
  checked,
  onChange,
  hint
}) => (
  <div className={`flex items-center justify-between gap-3 ${label ? 'py-2' : ''}`}>
    {label && (
      <span>
        <span className="block text-sm font-medium text-fg">{label}</span>
        {hint && <span className="block text-xs text-fg-muted">{hint}</span>}
      </span>
    )}
    <Switch checked={checked} onChange={onChange} ariaLabel={label || undefined} />
  </div>
);

type AdminVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: AdminVariant; size?: 'sm' | 'md' }> = ({
  variant = 'secondary',
  size = 'md',
  ...props
}) => <UiButton variant={variant} size={size} {...props} />;

export const Badge: React.FC<{ tone?: 'default' | 'success' | 'warning' | 'danger'; children: React.ReactNode }> = ({
  tone = 'default',
  children
}) => {
  const map: Record<string, BadgeTone> = { default: 'neutral', success: 'success', warning: 'warning', danger: 'error' };
  return <UiBadge tone={map[tone]}>{children}</UiBadge>;
};

export const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`panel ${className.includes('p-0') ? '' : 'panel-body'} ${className}`.replace(/\s+/g, ' ').trim()}>{children}</div>
);

/** Page title + optional description + right-hand actions, above every admin screen. */
export const AdminPageHeader: React.FC<{ title: string; description?: React.ReactNode; actions?: React.ReactNode }> = ({
  title,
  description,
  actions
}) => (
  <div className="flex flex-wrap items-end justify-between gap-3 pb-4 mb-6 border-b border-border-subtle">
    <div className="min-w-0 max-w-2xl">
      <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
      {description && <p className="text-sm text-fg-secondary mt-1">{description}</p>}
    </div>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

/** Dense data table styling shared by every list in the console. */
export const Table: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`overflow-x-auto ${className}`.trim()}>
    <table className="w-full text-sm admin-table">{children}</table>
  </div>
);

/** Side drawer used for editing one record - stages, challenges, etc. */
export const Drawer: React.FC<{ open: boolean; title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }> = ({
  open,
  title,
  onClose,
  children,
  footer
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-surface border-l border-border shadow-dialog flex flex-col">
        <div className="flex items-center justify-between px-5 h-14 border-b border-border">
          <h2 className="text-base font-semibold text-fg truncate">{title}</h2>
          <UiButton variant="ghost" size="sm" icon onClick={onClose} aria-label="Close">
            <X size={16} />
          </UiButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-border flex justify-end gap-2 bg-surface-2">{footer}</div>}
      </div>
    </div>
  );
};

/** A destructive-action confirmation, so nothing irreversible fires from one click. */
export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ open, title, message, confirmLabel = 'Confirm', onConfirm, onCancel }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="alertdialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div ref={ref} tabIndex={-1} className="relative bg-surface border border-border rounded-lg shadow-dialog max-w-sm w-full p-5 outline-none">
        <h3 className="text-base font-semibold text-fg mb-1.5">{title}</h3>
        <p className="text-sm text-fg-secondary mb-5">{message}</p>
        <div className="flex justify-end gap-2">
          <UiButton variant="secondary" onClick={onCancel}>
            Cancel
          </UiButton>
          <UiButton variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </UiButton>
        </div>
      </div>
    </div>
  );
};

export const EmptyState: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-center py-12 text-fg-muted text-sm">{children}</div>
);

export const Spinner: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <div className="flex items-center justify-center gap-2 py-12 text-fg-muted text-sm">
    <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
    {label}
  </div>
);

export const ErrorText: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-sm text-error mb-4" role="alert">
    {children}
  </p>
);
