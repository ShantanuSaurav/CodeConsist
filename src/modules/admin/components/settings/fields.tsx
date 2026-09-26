import React, { useEffect, useId, useState } from 'react';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { fillCopy, normalizeOrigin } from '@/platform/settings';
import type { RowFieldMeta, SettingMeta } from '@/platform/settings';
import { Badge, Button, Toggle } from '../ui';

/**
 * One input per setting kind, all wrapped in the same shell: the label and
 * help text, "Default: X", a Reset when the value is overridden (it sends
 * `null`, which puts the default back), and the problem the server or the
 * local check found at this path. GenericSection picks the input from the
 * setting's `kind` in src/platform/settings/meta.ts.
 */

export interface SettingFieldProps {
  path: string;
  meta: SettingMeta;
  value: unknown;
  defaultValue: unknown;
  /** Stored as an override (or about to be). */
  overridden: boolean;
  /** Changed on this page and not saved yet. */
  edited: boolean;
  /** Supplied by an environment variable. */
  fromEnv?: boolean;
  error?: string;
  onChange: (value: unknown) => void;
  onReset: () => void;
}

/** A value as a short, readable default hint. */
export function formatSettingValue(value: unknown, meta: SettingMeta): string {
  if (value === null || value === undefined) return meta.kind === 'zone' ? "the server's own zone" : 'none';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (meta.kind === 'rows' && Array.isArray(value)) return `${value.length} ${value.length === 1 ? 'row' : 'rows'}`;
  if (Array.isArray(value)) {
    const text = value.join(', ');
    return text.length > 60 ? `${value.slice(0, 6).join(', ')}, … (${value.length} values)` : text || 'none';
  }
  if (typeof value === 'object') return `${Object.keys(value as object).length} entries`;
  const text = String(value);
  return `${text.length > 60 ? `${text.slice(0, 59)}…` : text}${meta.unit && meta.unit !== '%' ? ` ${meta.unit}` : meta.unit ?? ''}`;
}

const FieldShell: React.FC<{
  id: string;
  meta: SettingMeta;
  path: string;
  defaultValue: unknown;
  overridden: boolean;
  edited: boolean;
  fromEnv?: boolean;
  error?: string;
  onReset: () => void;
  children: React.ReactNode;
}> = ({ id, meta, path, defaultValue, overridden, edited, fromEnv, error, onReset, children }) => (
  <div className="py-4 border-b border-border-subtle last:border-b-0" data-setting={path}>
    <div className="flex flex-wrap items-start justify-between gap-2 mb-1.5">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-fg">
          {meta.label}
          {edited && <span className="ml-2 text-[11px] font-mono uppercase tracking-wider text-warning">unsaved</span>}
        </label>
        <p className="text-xs text-fg-muted mt-0.5 max-w-2xl">{meta.help}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {fromEnv && <Badge>from .env</Badge>}
        {overridden && (
          <Button type="button" variant="ghost" size="sm" onClick={onReset} title="Put the default back" aria-label={`Reset ${meta.label} to its default`}>
            <RotateCcw size={13} /> Reset
          </Button>
        )}
      </div>
    </div>
    {children}
    <div className="flex flex-wrap items-center justify-between gap-2 mt-1.5">
      <span className="text-xs text-fg-muted font-mono">Default: {formatSettingValue(defaultValue, meta)}</span>
      <span className="text-[11px] text-fg-muted font-mono">{path}</span>
    </div>
    {error && (
      <p className="text-xs text-error mt-1" role="alert">
        {error}
      </p>
    )}
  </div>
);

/** A number input that keeps what is being typed and only reports finite numbers. */
const NumberInput: React.FC<{ id?: string; value: unknown; min?: number; max?: number; step?: number; invalid?: boolean; onChange: (n: number) => void; className?: string; ariaLabel?: string }> = ({
  id,
  value,
  min,
  max,
  step,
  invalid,
  onChange,
  className = '',
  ariaLabel
}) => {
  const [text, setText] = useState(value === null || value === undefined ? '' : String(value));
  useEffect(() => {
    // Follow outside changes (Reset, Discard) without fighting the typing.
    if (Number(text) !== value) setText(value === null || value === undefined ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      className={`${className} ${invalid ? 'is-invalid' : ''}`.trim()}
      value={text}
      min={min}
      max={max}
      step={step ?? 1}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(n);
      }}
    />
  );
};

export const SettingNumber: React.FC<SettingFieldProps & { id: string }> = ({ id, meta, value, error, onChange }) => (
  <div className="flex items-center gap-2">
    <NumberInput id={id} className="w-40" value={value} min={meta.min} max={meta.max} step={meta.step} invalid={Boolean(error)} onChange={onChange} />
    {meta.unit && <span className="text-sm text-fg-muted">{meta.unit}</span>}
    {(meta.min !== undefined || meta.max !== undefined) && (
      <span className="text-xs text-fg-muted">
        {meta.min ?? '…'}–{meta.max ?? '…'}
      </span>
    )}
  </div>
);

export const SettingToggle: React.FC<SettingFieldProps & { id: string }> = ({ meta, value, onChange }) => (
  <Toggle label="" ariaLabel={meta.label} checked={value === true} onChange={(checked) => onChange(checked)} />
);

export const SettingSelect: React.FC<SettingFieldProps & { id: string }> = ({ id, meta, value, error, onChange }) => (
  <select id={id} className={`w-64 ${error ? 'is-invalid' : ''}`.trim()} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
    {(meta.values ?? []).map((v) => (
      <option key={v} value={v}>
        {v}
      </option>
    ))}
  </select>
);

/** Plain text with `{tokens}`: chips insert a token, and a live preview fills them with sample values. */
export const SettingText: React.FC<SettingFieldProps & { id: string }> = ({ id, meta, value, error, onChange }) => {
  const text = typeof value === 'string' ? value : '';
  const long = meta.kind === 'text' && (meta.maxLength ?? 0) > 120;
  return (
    <div>
      {long ? (
        <textarea id={id} className={`w-full ${error ? 'is-invalid' : ''}`.trim()} rows={3} maxLength={meta.maxLength} value={text} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} type="text" className={`w-full ${error ? 'is-invalid' : ''}`.trim()} maxLength={meta.maxLength} value={text} onChange={(e) => onChange(e.target.value)} />
      )}
      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
        {(meta.tokens ?? []).map((token) => (
          <button key={token} type="button" className="badge badge-mono" onClick={() => onChange(`${text}{${token}}`)} title={`Insert {${token}}`}>
            {`{${token}}`}
          </button>
        ))}
        {meta.maxLength && <span className="text-xs text-fg-muted ml-auto">{text.length} / {meta.maxLength}</span>}
      </div>
      {meta.kind === 'text' && (
        <p className="text-xs text-fg-secondary mt-1.5">
          Preview: <span className="text-fg">{fillCopy(text, meta.sample ?? {}) || '—'}</span>
        </p>
      )}
    </div>
  );
};

const COMMON_ZONES = [
  'UTC',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Australia/Sydney',
  'Pacific/Auckland'
];

/** An IANA zone name - or, when the setting allows it, none (the server's own zone). */
export const SettingZone: React.FC<SettingFieldProps & { id: string }> = ({ id, meta, value, error, onChange }) => {
  const listId = useId();
  const none = value === null || value === undefined;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        id={id}
        type="text"
        list={listId}
        className={`w-72 font-mono ${error ? 'is-invalid' : ''}`.trim()}
        placeholder="e.g. Asia/Kolkata"
        value={none ? '' : String(value)}
        disabled={none && meta.nullable}
        onChange={(e) => onChange(e.target.value.trim() || (meta.nullable ? null : ''))}
      />
      <datalist id={listId}>
        {COMMON_ZONES.map((z) => (
          <option key={z} value={z} />
        ))}
      </datalist>
      {meta.nullable && (
        <label className="flex items-center gap-2 text-sm text-fg-secondary">
          <input type="checkbox" checked={none} onChange={(e) => onChange(e.target.checked ? null : 'UTC')} />
          Use the server's own zone
        </label>
      )}
    </div>
  );
};

/** A comma-separated list of numbers or words. Keeps what is typed; reports only a list that parses. */
export const SettingList: React.FC<SettingFieldProps & { id: string }> = ({ id, meta, value, error, onChange }) => {
  const list = Array.isArray(value) ? value : [];
  const [text, setText] = useState(list.join(', '));
  const [localError, setLocalError] = useState<string | null>(null);
  useEffect(() => {
    if (text.split(',').map((s) => s.trim()).filter(Boolean).join(',') !== list.map(String).join(',')) setText(list.join(', '));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(list)]);
  const numeric = meta.kind === 'intList';
  return (
    <div>
      <textarea
        id={id}
        rows={list.length > 12 ? 3 : 1}
        className={`w-full font-mono text-[13px] ${error || localError ? 'is-invalid' : ''}`.trim()}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const parts = e.target.value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          if (!numeric) {
            setLocalError(null);
            onChange(parts);
            return;
          }
          const numbers = parts.map(Number);
          if (numbers.some((n) => !Number.isFinite(n))) {
            setLocalError('Numbers only, separated by commas.');
            return;
          }
          setLocalError(null);
          onChange(numbers);
        }}
      />
      <p className="text-xs text-fg-muted mt-1">
        {list.length} {list.length === 1 ? 'value' : 'values'}
        {meta.minItems !== undefined && ` · at least ${meta.minItems}`}
        {meta.maxItems !== undefined && ` · at most ${meta.maxItems}`}
        {numeric && (meta.min !== undefined || meta.max !== undefined) && ` · each ${meta.min ?? '…'}–${meta.max ?? '…'}`}
      </p>
      {localError && <p className="text-xs text-error mt-1">{localError}</p>}
    </div>
  );
};

function emptyRow(columns: RowFieldMeta[], rows: Record<string, unknown>[]): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const column of columns) {
    if (column.kind === 'int' || column.kind === 'number') {
      const last = Number(rows[rows.length - 1]?.[column.key]);
      row[column.key] = Number.isFinite(last) ? last + 1 : column.min ?? 0;
    } else if (column.kind === 'bool') row[column.key] = false;
    else if (column.kind === 'enum') row[column.key] = column.values?.[0] ?? '';
    else row[column.key] = '';
  }
  return row;
}

/** A small table: one row per entry, one column per field in `rowMeta`. */
export const SettingRows: React.FC<SettingFieldProps & { id: string; issueFor?: (path: string) => string | undefined }> = ({ id, path, meta, value, onChange, issueFor }) => {
  const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  const columns = meta.rowMeta ?? [];
  const update = (index: number, key: string, cell: unknown) => onChange(rows.map((row, i) => (i === index ? { ...row, [key]: cell } : row)));
  const canAdd = meta.maxItems === undefined || rows.length < meta.maxItems;
  const canRemove = meta.minItems === undefined || rows.length > meta.minItems;
  return (
    <div id={id}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm admin-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {columns.map((column) => {
                  const cellError = issueFor?.(`${path}.${index}.${column.key}`);
                  const cell = row[column.key];
                  return (
                    <td key={column.key} className="align-top">
                      {column.kind === 'int' || column.kind === 'number' ? (
                        <NumberInput className="w-28" value={cell} min={column.min} max={column.max} invalid={Boolean(cellError)} ariaLabel={`${column.label}, row ${index + 1}`} onChange={(n) => update(index, column.key, n)} />
                      ) : column.kind === 'bool' ? (
                        <input type="checkbox" aria-label={`${column.label}, row ${index + 1}`} checked={cell === true} onChange={(e) => update(index, column.key, e.target.checked)} />
                      ) : column.kind === 'enum' ? (
                        <select aria-label={`${column.label}, row ${index + 1}`} value={String(cell ?? '')} onChange={(e) => update(index, column.key, e.target.value)}>
                          {(column.values ?? []).map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          className={`w-full ${cellError ? 'is-invalid' : ''}`.trim()}
                          maxLength={column.maxLength}
                          aria-label={`${column.label}, row ${index + 1}`}
                          value={String(cell ?? '')}
                          onChange={(e) => update(index, column.key, e.target.value)}
                        />
                      )}
                      {cellError && <div className="text-xs text-error mt-1">{cellError}</div>}
                    </td>
                  );
                })}
                <td className="text-right align-top">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!canRemove}
                    onClick={() => onChange(rows.filter((_, i) => i !== index))}
                    aria-label={`Remove row ${index + 1}`}
                    className="!text-fg-muted hover:!text-error"
                  >
                    <Trash2 size={13} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="secondary" size="sm" className="mt-2" disabled={!canAdd} onClick={() => onChange([...rows, emptyRow(columns, rows)])}>
        <Plus size={13} /> Add a row
      </Button>
    </div>
  );
};

/** A map of keys to values, edited as JSON (the value must parse before it is taken). */
export const SettingMap: React.FC<SettingFieldProps & { id: string }> = ({ id, value, error, onChange }) => {
  const [text, setText] = useState(JSON.stringify(value ?? {}, null, 2));
  const [localError, setLocalError] = useState<string | null>(null);
  return (
    <div>
      <textarea
        id={id}
        rows={6}
        className={`w-full font-mono text-[13px] ${error || localError ? 'is-invalid' : ''}`.trim()}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const parsed = JSON.parse(e.target.value);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not a map');
            setLocalError(null);
            onChange(parsed);
          } catch {
            setLocalError('Must be a JSON object of keys and values.');
          }
        }}
      />
      {localError && <p className="text-xs text-error mt-1">{localError}</p>}
    </div>
  );
};

/**
 * Exact origins, one per line (`https://example.com`). What is typed is put
 * in the form a browser sends in `Origin` (lower case, no trailing slash, no
 * default port) before it is stored, so an entry can actually match; a line
 * that is not an origin at all is kept as typed for the check to point at.
 */
export const SettingOrigins: React.FC<SettingFieldProps & { id: string }> = ({ id, value, error, onChange }) => {
  const list = Array.isArray(value) ? (value as string[]) : [];
  const [text, setText] = useState(list.join('\n'));
  return (
    <textarea
      id={id}
      rows={Math.max(2, Math.min(8, list.length + 1))}
      className={`w-full font-mono text-[13px] ${error ? 'is-invalid' : ''}`.trim()}
      placeholder="https://example.com"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(
          e.target.value
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => normalizeOrigin(s) ?? s)
        );
      }}
    />
  );
};

/** The right input for a setting's kind, inside the shared shell. */
export const SettingField: React.FC<SettingFieldProps & { issueFor?: (path: string) => string | undefined }> = (props) => {
  const id = `setting-${props.path.replace(/[^a-zA-Z0-9]+/g, '-')}`;
  const { meta } = props;
  let input: React.ReactNode;
  switch (meta.kind) {
    case 'int':
    case 'number':
      input = <SettingNumber {...props} id={id} />;
      break;
    case 'bool':
      input = <SettingToggle {...props} id={id} />;
      break;
    case 'enum':
      input = <SettingSelect {...props} id={id} />;
      break;
    case 'zone':
      input = <SettingZone {...props} id={id} />;
      break;
    case 'intList':
    case 'stringList':
      input = <SettingList {...props} id={id} />;
      break;
    case 'rows':
      input = <SettingRows {...props} id={id} />;
      break;
    case 'map':
      input = <SettingMap {...props} id={id} />;
      break;
    case 'origins':
      input = <SettingOrigins {...props} id={id} />;
      break;
    default:
      input = <SettingText {...props} id={id} />;
  }
  return (
    <FieldShell
      id={id}
      meta={meta}
      path={props.path}
      defaultValue={props.defaultValue}
      overridden={props.overridden}
      edited={props.edited}
      fromEnv={props.fromEnv}
      error={props.error}
      onReset={props.onReset}
    >
      {input}
    </FieldShell>
  );
};
