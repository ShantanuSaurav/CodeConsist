import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Reusable form primitives for the admin app, styled to match the learner
 * app's existing look (see src/components/layout/Sidebar.tsx for the same
 * tokens). Every content-editing screen is built from these rather than a
 * raw <textarea> of JSON - see docs on server/admin.js for why: the fields
 * exposed here are exactly the ones the backend accepts.
 */

export const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block mb-4">
    <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</span>
    {children}
    {hint && <span className="block text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</span>}
  </label>
);

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-[#161b22] border border-black/10 dark:border-white/10 text-gray-900 dark:text-gray-100 text-sm transition-all duration-150 focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 disabled:opacity-60 shadow-xs';

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
  <label className="flex items-center justify-between gap-3 py-2 cursor-pointer select-none">
    <span>
      <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      {hint && <span className="block text-xs text-gray-500 dark:text-gray-400">{hint}</span>}
    </span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`w-10 h-6 rounded-full relative shrink-0 transition-colors ${
        checked ? 'bg-[var(--color-primary)]' : 'bg-black/15 dark:bg-white/15'
      }`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[1.15rem]' : 'left-0.5'}`}
      />
    </button>
  </label>
);

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }
> = ({ variant = 'secondary', className = '', ...props }) => {
  const base =
    'px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-xs';
  const styles: Record<string, string> = {
    primary:
      'bg-[var(--color-primary)] text-white dark:text-black font-bold hover:brightness-105 hover:-translate-y-0.5 shadow-[0_2px_10px_rgba(22,163,11,0.25)] dark:shadow-[0_2px_14px_rgba(57,255,20,0.35)]',
    secondary:
      'bg-white dark:bg-[#161b22] text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#1c2129] border border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 hover:-translate-y-0.5',
    danger:
      'bg-red-500 text-white hover:bg-red-600 hover:-translate-y-0.5 shadow-[0_2px_10px_rgba(239,68,68,0.3)]',
    ghost:
      'text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white'
  };
  return <button className={`${base} ${styles[variant]} ${className}`} {...props} />;
};

export const Badge: React.FC<{ tone?: 'default' | 'success' | 'warning' | 'danger'; children: React.ReactNode }> = ({
  tone = 'default',
  children
}) => {
  const tones: Record<string, string> = {
    default: 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300',
    success: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    warning: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400',
    danger: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400'
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${tones[tone]}`}>{children}</span>;
};

export const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div
    className={`bg-white dark:bg-[#0d1117] border border-black/5 dark:border-white/5 rounded-2xl p-5 shadow-sm ${className}`}
  >
    {children}
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
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white dark:bg-[#0d1117] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 dark:border-white/5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-black/5 dark:hover:bg-white/5"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-black/5 dark:border-white/5 flex justify-end gap-2">{footer}</div>}
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
      <div
        ref={ref}
        tabIndex={-1}
        className="relative bg-white dark:bg-[#161b22] rounded-2xl shadow-2xl max-w-sm w-full p-6 outline-none"
      >
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">{message}</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};

export const EmptyState: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-center py-12 text-gray-500 dark:text-gray-400 text-sm">{children}</div>
);

export const Spinner: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <div className="flex items-center justify-center gap-2 py-12 text-gray-500 dark:text-gray-400 text-sm">
    <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
    {label}
  </div>
);
