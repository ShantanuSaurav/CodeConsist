import React, { useEffect, useId, useRef, useState } from 'react';
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

export const Field: React.FC<{ label: string; hint?: string; error?: string; required?: boolean; children: React.ReactNode }> = ({
  label,
  hint,
  error,
  required,
  children
}) => (
  <label className="block mb-4">
    <span className="field-label">
      {label}
      {required && (
        <span className="text-error ml-0.5" aria-hidden="true">
          *
        </span>
      )}
    </span>
    {children}
    {error ? (
      <span className="field-hint text-error" role="alert">
        {error}
      </span>
    ) : (
      hint && <span className="field-hint">{hint}</span>
    )}
  </label>
);

const inputClass = 'w-full';

export const TextField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  maxLength?: number;
  disabled?: boolean;
  mono?: boolean;
}> = ({ label, value, onChange, placeholder, hint, error, required, maxLength, disabled, mono }) => (
  <Field label={label} hint={hint} error={error} required={required}>
    <input
      type="text"
      className={`${inputClass} ${mono ? 'font-mono' : ''} ${error ? 'is-invalid' : ''}`.trim()}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      aria-invalid={error ? true : undefined}
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
  error?: string;
  required?: boolean;
  rows?: number;
  maxLength?: number;
}> = ({ label, value, onChange, placeholder, hint, error, required, rows = 3, maxLength }) => (
  <Field label={label} hint={hint} error={error} required={required}>
    <textarea
      className={`${inputClass} ${error ? 'is-invalid' : ''}`.trim()}
      value={value}
      placeholder={placeholder}
      rows={rows}
      maxLength={maxLength}
      aria-invalid={error ? true : undefined}
      onChange={(e) => onChange(e.target.value)}
    />
  </Field>
);

/** A monospace, tab-friendly textarea for code: snippets, starter code, solutions. */
export const CodeArea: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  rows?: number;
}> = ({ label, value, onChange, placeholder, hint, error, required, rows = 6 }) => (
  <Field label={label} hint={hint} error={error} required={required}>
    <textarea
      className={`${inputClass} font-mono text-[13px] leading-relaxed whitespace-pre ${error ? 'is-invalid' : ''}`.trim()}
      value={value}
      placeholder={placeholder}
      rows={rows}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      wrap="off"
      aria-invalid={error ? true : undefined}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        // Tab indents instead of leaving the field, like an editor.
        if (e.key !== 'Tab') return;
        e.preventDefault();
        const el = e.currentTarget;
        const { selectionStart, selectionEnd } = el;
        const next = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
        onChange(next);
        requestAnimationFrame(() => el.setSelectionRange(selectionStart + 2, selectionStart + 2));
      }}
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
  error?: string;
  required?: boolean;
}> = ({ label, value, onChange, min, max, hint, error, required }) => (
  <Field label={label} hint={hint} error={error} required={required}>
    <input
      type="number"
      className={`${inputClass} ${error ? 'is-invalid' : ''}`.trim()}
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      aria-invalid={error ? true : undefined}
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
  error?: string;
  required?: boolean;
}> = ({ label, value, onChange, options, hint, error, required }) => (
  <Field label={label} hint={hint} error={error} required={required}>
    <select className={`${inputClass} ${error ? 'is-invalid' : ''}`.trim()} value={value} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value)}>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  </Field>
);

/**
 * Comma-separated tags. The raw text is local state: deriving it from the
 * parsed list on every keystroke would swallow the comma being typed
 * ("a," -> ["a"] -> "a"), so a second tag could never be entered.
 */
export const TagsField: React.FC<{ label: string; value: string[]; onChange: (value: string[]) => void; hint?: string; placeholder?: string }> = ({
  label,
  value,
  onChange,
  hint,
  placeholder
}) => {
  const [text, setText] = useState(value.join(', '));
  return (
    <Field label={label} hint={hint ?? 'Comma-separated'}>
      <input
        type="text"
        className={inputClass}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          onChange(
            e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          );
        }}
      />
    </Field>
  );
};

export const Toggle: React.FC<{ label: string; checked: boolean; onChange: (checked: boolean) => void; hint?: string; ariaLabel?: string }> = ({
  label,
  checked,
  onChange,
  hint,
  ariaLabel
}) => (
  <div className={`flex items-center justify-between gap-3 ${label ? 'py-2' : ''}`}>
    {label && (
      <span>
        <span className="block text-sm font-medium text-fg">{label}</span>
        {hint && <span className="block text-xs text-fg-muted">{hint}</span>}
      </span>
    )}
    <Switch checked={checked} onChange={onChange} ariaLabel={ariaLabel ?? (label || undefined)} />
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

/** Side drawer used for editing one record - stages, challenges, etc. `size="lg"` for multi-column forms. */
export const Drawer: React.FC<{
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'md' | 'lg';
  /** False while a save is in flight: Escape, the backdrop and the X then do nothing. */
  closable?: boolean;
}> = ({ open, title, onClose, children, footer, size = 'md', closable = true }) => {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !closable) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closable, onClose]);

  // Focus moves into the drawer on open (Tab would otherwise walk the page
  // behind the overlay) and back to whatever opened it on close.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => opener?.focus?.();
  }, [open]);

  if (!open) return null;
  const close = () => closable && onClose();
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={title} aria-busy={!closable || undefined}>
      <div className="absolute inset-0 bg-black/50" onClick={close} />
      <div
        ref={panel}
        tabIndex={-1}
        className={`absolute right-0 top-0 h-full w-full ${size === 'lg' ? 'max-w-3xl' : 'max-w-md'} bg-surface border-l border-border shadow-dialog flex flex-col outline-none`}
      >
        <div className="flex items-center justify-between px-5 h-14 border-b border-border">
          <h2 className="text-base font-semibold text-fg truncate">{title}</h2>
          <UiButton variant="ghost" size="sm" icon onClick={close} disabled={!closable} aria-label="Close">
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
  const id = useId();
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-message`}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div ref={ref} tabIndex={-1} className="relative bg-surface border border-border rounded-lg shadow-dialog max-w-sm w-full p-5 outline-none">
        <h3 id={`${id}-title`} className="text-base font-semibold text-fg mb-1.5">
          {title}
        </h3>
        <p id={`${id}-message`} className="text-sm text-fg-secondary mb-5">
          {message}
        </p>
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
