import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { adminApi } from '../services/adminApi';
import type { AdminBillingProduct, AdminCertificateRow, AdminOrderRow, AdminUserRow, PricingPatch, PricingResponse } from '../services/adminApi';
import { AdminPageHeader, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorText, Field, SelectField, Spinner, Table, TextField } from '../components/ui';
import { Segmented } from '@/ui';

/**
 * /admin/billing - what is sold and for how much, who has been given what,
 * every order, every certificate.
 *
 * Money is handled in paise everywhere except the inputs on this page, which
 * are in rupees for the admin's sake. The three helpers below are the only
 * place the conversion happens. The server re-validates every price (integer
 * paise within its limits) and every grant (the same `canPurchase` rules a
 * learner's own purchase goes through), so nothing here is a boundary.
 */

/* --------------------------------------------------------------- money */

const MAX_PAISE = 10_000_000; // ₹1,00,000 - mirrors server/billing.js MAX_PRICE

/** 199900 -> "₹1,999"; 199950 -> "₹1,999.50". Display only. */
function formatRupees(paise: number): string {
  const whole = Math.floor(paise / 100);
  const rest = paise % 100;
  return `₹${whole.toLocaleString('en-IN')}${rest ? `.${String(rest).padStart(2, '0')}` : ''}`;
}

/** 199900 -> "1999", 199950 -> "1999.50" - what goes into an input. */
function paiseToInput(paise: number): string {
  const whole = Math.floor(paise / 100);
  const rest = paise % 100;
  return rest ? `${whole}.${String(rest).padStart(2, '0')}` : String(whole);
}

/** "1,999.50" -> 199950. Null when it is not a rupee amount within limits. */
function inputToPaise(text: string): number | null {
  const clean = text.replace(/[,\s₹]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [whole, frac = ''] = clean.split('.');
  const paise = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(paise) || paise < 0 || paise > MAX_PAISE) return null;
  return paise;
}

/* ------------------------------------------------------------ products */

const PROVIDER_LABEL: Record<AdminOrderRow['provider'], string> = { razorpay: 'Razorpay', test: 'Test', admin: 'Granted', free: 'Free' };
const STATUS_TONE: Record<AdminOrderRow['status'], 'default' | 'success' | 'warning' | 'danger'> = {
  paid: 'success',
  created: 'warning',
  failed: 'danger',
  revoked: 'default'
};

/** "lifetime" | "track:c" | "stage:stage-9" | "certificate:core" <-> product object, for the <select>. */
function productFromKey(key: string): AdminBillingProduct | null {
  if (key === 'lifetime') return { kind: 'lifetime' };
  const [kind, id] = key.split(':');
  if (!id) return null;
  if (kind === 'track') return { kind: 'track', trackId: id };
  if (kind === 'stage') return { kind: 'stage', stageId: id };
  if (kind === 'certificate') return { kind: 'certificate', trackId: id };
  return null;
}

function describeProduct(product: AdminBillingProduct, keys: PricingResponse['catalogKeys'] | null): string {
  const trackLabel = (id: string) => keys?.tracks.find((t) => t.id === id)?.label ?? id;
  const stageLabel = (id: string) => {
    const s = keys?.premiumStages.find((p) => p.id === id);
    return s ? `${String(s.index).padStart(2, '0')} · ${s.name}` : id;
  };
  switch (product.kind) {
    case 'lifetime':
      return 'Lifetime licence';
    case 'track':
      return `Track · ${trackLabel(product.trackId)}`;
    case 'stage':
      return `Stage · ${stageLabel(product.stageId)}`;
    case 'certificate':
      return `Certificate · ${trackLabel(product.trackId)}`;
  }
}

function shortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* ================================================================= page */

export const AdminBilling: React.FC = () => {
  const [pricing, setPricing] = useState<PricingResponse | null>(null);
  const [orders, setOrders] = useState<AdminOrderRow[] | null>(null);
  const [certificates, setCertificates] = useState<AdminCertificateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Bumped when something outside the table changes an order, so it refetches with its own filters. */
  const [ordersToken, setOrdersToken] = useState(0);

  const loadPricing = useCallback(() => adminApi.billingPricing().then(setPricing), []);
  const loadOrders = useCallback((status = '', q = '') => adminApi.billingOrders({ status: status || undefined, q: q || undefined }).then((r) => setOrders(r.orders)), []);
  const loadCertificates = useCallback(() => adminApi.billingCertificates().then((r) => setCertificates(r.certificates)), []);

  useEffect(() => {
    Promise.all([loadPricing(), loadOrders(), loadCertificates()]).catch((err) => setError(err.message ?? 'Failed to load billing.'));
  }, [loadPricing, loadOrders, loadCertificates]);

  if (error && !pricing) return <ErrorText>{error}</ErrorText>;
  if (!pricing) return <Spinner label="Loading billing…" />;

  return (
    <div>
      <AdminPageHeader
        title="Billing"
        description="One-time purchases only: a lifetime licence, a track, a single premium stage, or a verified certificate. No subscriptions."
      />

      {error && <ErrorText>{error}</ErrorText>}

      <ModeBanner mode={pricing.mode} />

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <PricesCard pricing={pricing} onSaved={setPricing} />
        <GrantCard
          keys={pricing.catalogKeys}
          onGranted={() => {
            // Not loadOrders() - that would drop the filter and search the
            // table below is still showing as active.
            setOrdersToken((n) => n + 1);
            loadCertificates().catch(() => undefined);
          }}
        />
      </div>

      <OrdersCard
        orders={orders}
        keys={pricing.catalogKeys}
        reload={loadOrders}
        reloadToken={ordersToken}
        onRevoked={() => {
          loadCertificates().catch(() => undefined);
        }}
      />

      <CertificatesCard certificates={certificates} keys={pricing.catalogKeys} />
    </div>
  );
};

/* ---------------------------------------------------------------- mode */

const ModeBanner: React.FC<{ mode: 'razorpay' | 'test' }> = ({ mode }) =>
  mode === 'razorpay' ? (
    <div className="notice notice-success mb-6">
      <strong>Razorpay is live.</strong> Learners pay through Razorpay's checkout and every payment is verified by signature before anything unlocks. Point
      the Razorpay webhook at <code>/api/billing/webhook</code> so a payment that finishes after the tab closed still lands.
    </div>
  ) : (
    <div className="notice notice-warn mb-6">
      <strong>Test mode - no money moves.</strong> <code>RAZORPAY_KEY_ID</code> and <code>RAZORPAY_KEY_SECRET</code> are not set in <code>.env</code>, so
      learners see a clearly labelled "Complete test payment" step instead of a real checkout. Add the keys (see <code>.env.example</code>) and restart the
      API to go live.
    </div>
  );

/* -------------------------------------------------------------- prices */

type PriceGroup = 'tracks' | 'stages' | 'certificates';

interface PriceDraft {
  lifetime: string;
  tracks: Record<string, string>;
  stages: Record<string, string>;
  certificates: Record<string, string>;
}

function draftFrom(p: PricingResponse): PriceDraft {
  const toInputs = (rec: Record<string, number>) => Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, paiseToInput(v)]));
  return {
    lifetime: paiseToInput(p.pricing.lifetime),
    tracks: toInputs(p.pricing.tracks),
    stages: toInputs(p.pricing.stages),
    certificates: toInputs(p.pricing.certificates)
  };
}

/** One rupee field with its default shown and a Reset. Module-level so typing never remounts it. */
const PriceInput: React.FC<{ label: string; value: string; fallback: number; onChange: (v: string) => void; hint?: string }> = ({ label, value, fallback, onChange, hint }) => {
  const paise = inputToPaise(value);
  const invalid = paise === null;
  const isDefault = paise === fallback;
  return (
    <Field
      label={label}
      hint={hint ?? (isDefault ? `Default (${formatRupees(fallback)})` : `Default is ${formatRupees(fallback)}`)}
      error={invalid ? `Enter rupees between 0 and ${formatRupees(MAX_PAISE)} (up to 2 decimals).` : undefined}
    >
      <div className="flex items-center gap-2">
        <span className="text-fg-muted text-sm" aria-hidden="true">
          ₹
        </span>
        <input type="text" inputMode="decimal" className={`w-full font-mono ${invalid ? 'is-invalid' : ''}`.trim()} value={value} aria-invalid={invalid || undefined} onChange={(e) => onChange(e.target.value)} />
        <Button size="sm" variant="ghost" type="button" disabled={isDefault} onClick={() => onChange(paiseToInput(fallback))} title="Put this price back to its default">
          Reset
        </Button>
      </div>
    </Field>
  );
};

const PricesCard: React.FC<{ pricing: PricingResponse; onSaved: (next: PricingResponse) => void }> = ({ pricing, onSaved }) => {
  const [draft, setDraft] = useState<PriceDraft>(() => draftFrom(pricing));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => setDraft(draftFrom(pricing)), [pricing]);

  const defaultFor = (group: PriceGroup | 'lifetime') =>
    group === 'lifetime' ? pricing.defaults.lifetime : group === 'tracks' ? pricing.defaults.track : group === 'stages' ? pricing.defaults.stage : pricing.defaults.certificate;

  const effective = (group: PriceGroup, id: string): number => pricing.pricing[group][id] ?? defaultFor(group);

  /** Only what changed. A value equal to the default goes up as `null`, so the override is dropped rather than pinned. */
  const patch = useMemo<{ patch: PricingPatch; problems: string[]; changed: number }>(() => {
    const out: PricingPatch = {};
    const problems: string[] = [];
    let changed = 0;
    const consider = (label: string, text: string, current: number, fallback: number): number | null | undefined => {
      const paise = inputToPaise(text);
      if (paise === null) {
        problems.push(label);
        return undefined;
      }
      if (paise === current) return undefined;
      changed += 1;
      return paise === fallback ? null : paise;
    };
    const lifetime = consider('Lifetime licence', draft.lifetime, pricing.pricing.lifetime, pricing.defaults.lifetime);
    if (lifetime !== undefined) out.lifetime = lifetime;
    for (const group of ['tracks', 'stages', 'certificates'] as const) {
      for (const [id, text] of Object.entries(draft[group])) {
        const v = consider(`${group} · ${id}`, text, effective(group, id), defaultFor(group));
        if (v === undefined) continue;
        (out[group] ??= {})[id] = v;
      }
    }
    return { patch: out, problems, changed };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, pricing]);

  const save = async () => {
    if (patch.problems.length || patch.changed === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const next = await adminApi.updateBillingPricing(patch.patch);
      onSaved(next);
      setSavedAt(Date.now());
    } catch (err: any) {
      setSaveError(err.message ?? 'Could not save prices.');
    } finally {
      setSaving(false);
    }
  };

  const setGroupValue = (group: PriceGroup, id: string, value: string) => setDraft((d) => ({ ...d, [group]: { ...d[group], [id]: value } }));

  const { tracks, premiumStages } = pricing.catalogKeys;

  return (
    <Card>
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-sm font-medium text-fg">Prices</h2>
        <span className="text-xs text-fg-muted">Rupees · one-time</span>
      </div>
      <p className="text-xs text-fg-muted mb-4">
        ₹0 makes a product free (an order is still recorded). Changes apply to new orders only - nobody who already paid is affected.
      </p>

      <PriceInput label="Lifetime licence" value={draft.lifetime} fallback={pricing.defaults.lifetime} onChange={(v) => setDraft((d) => ({ ...d, lifetime: v }))} hint="Every premium stage, now and in future." />

      <h3 className="text-xs font-mono uppercase tracking-wider text-fg-muted mt-2 mb-2">Per track</h3>
      {tracks.length === 0 && <p className="text-xs text-fg-muted mb-4">No tracks.</p>}
      {tracks.map((t) => (
        <PriceInput key={t.id} label={t.label} value={draft.tracks[t.id] ?? paiseToInput(effective('tracks', t.id))} fallback={pricing.defaults.track} onChange={(v) => setGroupValue('tracks', t.id, v)} />
      ))}

      <h3 className="text-xs font-mono uppercase tracking-wider text-fg-muted mt-2 mb-2">Per premium stage</h3>
      {premiumStages.length === 0 && <p className="text-xs text-fg-muted mb-4">No premium stages. Mark one as Premium under Stages to sell it.</p>}
      {premiumStages.map((s) => (
        <PriceInput
          key={s.id}
          label={`${String(s.index).padStart(2, '0')} · ${s.name}`}
          value={draft.stages[s.id] ?? paiseToInput(effective('stages', s.id))}
          fallback={pricing.defaults.stage}
          onChange={(v) => setGroupValue('stages', s.id, v)}
        />
      ))}

      <h3 className="text-xs font-mono uppercase tracking-wider text-fg-muted mt-2 mb-2">Certificate, per track</h3>
      {tracks.map((t) => (
        <PriceInput
          key={t.id}
          label={t.label}
          value={draft.certificates[t.id] ?? paiseToInput(effective('certificates', t.id))}
          fallback={pricing.defaults.certificate}
          onChange={(v) => setGroupValue('certificates', t.id, v)}
        />
      ))}

      {saveError && <ErrorText>{saveError}</ErrorText>}
      <div className="flex items-center justify-between gap-3 mt-2">
        <span className="text-xs text-fg-muted">
          {patch.problems.length ? `${patch.problems.length} ${patch.problems.length === 1 ? 'field needs' : 'fields need'} a valid amount.` : patch.changed ? `${patch.changed} ${patch.changed === 1 ? 'change' : 'changes'} to save.` : savedAt ? 'Saved.' : 'No changes.'}
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={saving || patch.changed === 0} onClick={() => setDraft(draftFrom(pricing))}>
            Discard
          </Button>
          <Button variant="primary" disabled={saving || patch.changed === 0 || patch.problems.length > 0} onClick={save}>
            {saving ? 'Saving…' : 'Save prices'}
          </Button>
        </div>
      </div>
    </Card>
  );
};

/* --------------------------------------------------------------- grant */

const NAME_RULE = /^[\p{L}\p{M} .'-]+$/u;

const GrantCard: React.FC<{ keys: PricingResponse['catalogKeys']; onGranted: () => void }> = ({ keys, onGranted }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdminUserRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [user, setUser] = useState<AdminUserRow | null>(null);
  const [productKey, setProductKey] = useState('lifetime');
  const [note, setNote] = useState('');
  const [certificateName, setCertificateName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  // A hidden track or stage can still be priced (see the Prices card), but a
  // grant is checked against what learners can actually see, so the server
  // would answer "Unknown product." Say so here instead of letting it fail.
  const HIDDEN_NOTE = ' (hidden - cannot be granted)';
  const productOptions = useMemo(
    () => [
      { value: 'lifetime', label: 'Lifetime licence', disabled: false },
      ...keys.tracks.map((t) => ({ value: `track:${t.id}`, label: `Track · ${t.label}${t.hidden ? HIDDEN_NOTE : ''}`, disabled: t.hidden })),
      ...keys.premiumStages.map((s) => ({
        value: `stage:${s.id}`,
        label: `Stage · ${String(s.index).padStart(2, '0')} · ${s.name}${s.hidden ? HIDDEN_NOTE : ''}`,
        disabled: s.hidden
      })),
      ...keys.tracks.map((t) => ({ value: `certificate:${t.id}`, label: `Certificate · ${t.label}${t.hidden ? HIDDEN_NOTE : ''}`, disabled: t.hidden }))
    ],
    [keys]
  );

  const productHidden = productOptions.find((o) => o.value === productKey)?.disabled ?? false;
  const product = productFromKey(productKey);
  const isCertificate = product?.kind === 'certificate';
  const nameProblem =
    isCertificate && certificateName.trim().length > 0
      ? certificateName.trim().length < 2 || certificateName.trim().length > 80
        ? '2 to 80 characters.'
        : !NAME_RULE.test(certificateName.trim())
          ? "Letters, spaces and . ' - only."
          : undefined
      : undefined;
  const noteProblem = note.trim().length > 0 && note.trim().length < 2 ? 'A few words, please.' : undefined;
  const canGrant = Boolean(user && product && !productHidden && note.trim().length >= 2 && !nameProblem && !busy);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearching(true);
    setMessage(null);
    // A new search drops the current pick: the results list is hidden while one
    // is selected, so keeping it would grant to the account that is off screen.
    setUser(null);
    try {
      const res = await adminApi.users(query.trim());
      setResults(res.users.slice(0, 8));
    } catch (err: any) {
      setMessage({ tone: 'error', text: err.message ?? 'Search failed.' });
    } finally {
      setSearching(false);
    }
  };

  const grant = async () => {
    if (!user || !product || !canGrant) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await adminApi.grantAccess({
        userId: user.id,
        product,
        note: note.trim(),
        ...(isCertificate && certificateName.trim() ? { certificateName: certificateName.trim() } : {})
      });
      setMessage({
        tone: 'success',
        text: `${describeProduct(product, keys)} granted to ${user.username}${res.certificate ? ` - certificate ${res.certificate.id} issued` : ''}.`
      });
      setNote('');
      setCertificateName('');
      onGranted();
    } catch (err: any) {
      setMessage({ tone: 'error', text: err.message ?? 'Could not grant that.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h2 className="text-sm font-medium text-fg mb-1">Grant access</h2>
      <p className="text-xs text-fg-muted mb-4">
        For payments taken outside Razorpay (UPI, cash, a refund made good). Records a paid order with provider "Granted" and your note; it can be revoked below
        like any other order.
      </p>

      <form onSubmit={search} className="mb-3">
        <span className="field-label">User</span>
        <div className="flex items-center gap-2">
          <label className="relative block flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none" />
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Username or email" className="!pl-8 w-full" aria-label="Search users" />
          </label>
          <Button type="submit" variant="secondary" disabled={searching}>
            {searching ? 'Searching…' : 'Search'}
          </Button>
        </div>
        <span className="field-hint">{user ? `Selected: ${user.username} (${user.email})` : 'Search, then pick the account.'}</span>
      </form>

      {results && !user && (
        <div className="border border-border rounded-md mb-4 overflow-hidden">
          {results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-fg-muted">No users match.</div>
          ) : (
            results.map((u) => (
              <button
                key={u.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 border-b border-border-subtle last:border-b-0 flex items-center justify-between gap-3"
                onClick={() => {
                  setUser(u);
                  setResults(null);
                }}
              >
                <span className="text-fg font-medium truncate">{u.username}</span>
                <span className="text-xs text-fg-muted truncate">{u.email}</span>
              </button>
            ))
          )}
        </div>
      )}
      {user && (
        <div className="mb-4">
          <Button size="sm" variant="ghost" onClick={() => setUser(null)}>
            Change user
          </Button>
        </div>
      )}

      <SelectField
        label="Product"
        value={productKey}
        onChange={setProductKey}
        options={productOptions}
        error={productHidden ? 'This is hidden from learners. Show it on the Content page before granting it.' : undefined}
        hint="Stages and tracks the user already has come back as 'already has access'."
      />

      <TextField label="Note" value={note} onChange={setNote} required maxLength={200} error={noteProblem} placeholder="Paid by UPI, ref 4821" hint="Why this is being granted. Kept on the order and in the audit log." />

      {isCertificate && (
        <TextField label="Name on the certificate" value={certificateName} onChange={setCertificateName} maxLength={80} error={nameProblem} hint="Optional - defaults to the username. The learner must have cleared every stage in the track." />
      )}

      {message && (
        <div className={`notice ${message.tone === 'success' ? 'notice-success' : 'notice-error'} mb-3`} role={message.tone === 'error' ? 'alert' : undefined}>
          {message.text}
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="primary" disabled={!canGrant} onClick={grant}>
          {busy ? 'Granting…' : 'Grant'}
        </Button>
      </div>
    </Card>
  );
};

/* -------------------------------------------------------------- orders */

type StatusFilter = 'all' | 'paid' | 'created' | 'failed' | 'revoked';

const OrdersCard: React.FC<{
  orders: AdminOrderRow[] | null;
  keys: PricingResponse['catalogKeys'];
  reload: (status?: string, q?: string) => Promise<void>;
  /** Changes when a grant elsewhere on the page needs this table refetched. */
  reloadToken: number;
  onRevoked: () => void;
}> = ({ orders, keys, reload, reloadToken, onRevoked }) => {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [q, setQ] = useState('');
  const [pending, setPending] = useState<AdminOrderRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = (nextStatus: StatusFilter, nextQ: string) => {
    setError(null);
    reload(nextStatus === 'all' ? '' : nextStatus, nextQ.trim()).catch((err) => setError(err.message ?? 'Could not load orders.'));
  };

  // The filters live here, so the refetch has to read them from here - a bare
  // reload() would silently swap the table for an unfiltered one while the
  // controls still show a filter. A ref, because the effect must fire on the
  // token alone and not on every keystroke in the search box.
  const filters = useRef({ status, q });
  filters.current = { status, q };
  // Compared rather than a "first run" flag so StrictMode's second mount
  // pass does not fire an extra fetch. The page's own first load covers 0.
  const seenToken = useRef(reloadToken);
  useEffect(() => {
    if (seenToken.current === reloadToken) return;
    seenToken.current = reloadToken;
    const { status: s, q: text } = filters.current;
    setError(null);
    reload(s === 'all' ? '' : s, text.trim()).catch((err) => setError(err.message ?? 'Could not load orders.'));
  }, [reloadToken, reload]);

  const revoke = async () => {
    // Revoking is not idempotent for the admin: a second call 409s and would
    // report a failure over a revoke that actually worked.
    if (!pending || busyId) return;
    setBusyId(pending.id);
    setError(null);
    try {
      await adminApi.revokeOrder(pending.id);
    } catch (err: any) {
      setError(err.message ?? 'Could not revoke that order.');
      setBusyId(null);
      setPending(null);
      return;
    }
    // The revoke landed. A failed refresh after it is a display problem, not
    // a failed revoke, so it must not be reported as one.
    try {
      await reload(status === 'all' ? '' : status, q.trim());
      onRevoked();
    } catch (err: any) {
      setError(`Revoked. The list could not be refreshed: ${err.message ?? 'try again.'}`);
    } finally {
      setBusyId(null);
      setPending(null);
    }
  };

  return (
    <Card className="p-0 overflow-hidden mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border-subtle">
        <h2 className="text-sm font-medium text-fg">Orders</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<StatusFilter>
            size="sm"
            value={status}
            ariaLabel="Filter orders by status"
            onChange={(next) => {
              setStatus(next);
              apply(next, q);
            }}
            options={[
              { value: 'all', label: 'All' },
              { value: 'paid', label: 'Paid' },
              { value: 'created', label: 'Not completed' },
              { value: 'failed', label: 'Failed' },
              { value: 'revoked', label: 'Revoked' }
            ]}
          />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              apply(status, q);
            }}
            className="flex items-center gap-2"
          >
            <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="User, email or order id" className="w-56" aria-label="Search orders" />
            <Button type="submit" size="sm" variant="secondary">
              Search
            </Button>
          </form>
        </div>
      </div>

      {error && (
        <div className="px-4 pt-3">
          <ErrorText>{error}</ErrorText>
        </div>
      )}

      {!orders ? (
        <Spinner />
      ) : orders.length === 0 ? (
        <EmptyState>No orders{status !== 'all' ? ' with that status' : ' yet'}.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>When</th>
              <th>User</th>
              <th>Item</th>
              <th>Amount</th>
              <th>Via</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="cell-mono text-fg-muted whitespace-nowrap">
                  {shortDate(o.paidAt ?? o.createdAt)}
                  <div className="text-[11px]">{o.id}</div>
                </td>
                <td>
                  <div className="cell-primary">{o.username}</div>
                  <div className="text-xs text-fg-muted">{o.email}</div>
                </td>
                <td>
                  {describeProduct(o.product, keys)}
                  {o.certificateId && <div className="text-xs text-fg-muted font-mono">{o.certificateId}</div>}
                  {o.note && <div className="text-xs text-fg-muted">{o.note}</div>}
                </td>
                <td className="cell-num">{o.amount === 0 ? 'Free' : formatRupees(o.amount)}</td>
                <td>{PROVIDER_LABEL[o.provider]}</td>
                <td>
                  <Badge tone={STATUS_TONE[o.status]}>{o.status}</Badge>
                  {o.revokedAt && <div className="text-[11px] text-fg-muted mt-0.5">{shortDate(o.revokedAt)}</div>}
                </td>
                <td className="text-right">
                  {o.status === 'paid' && (
                    <Button size="sm" variant="ghost" className="!text-fg-muted hover:!text-error" disabled={busyId === o.id} onClick={() => setPending(o)}>
                      Revoke
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        title="Revoke this order?"
        message={`${pending ? describeProduct(pending.product, keys) : ''} for ${pending?.username} stops working immediately${pending?.product.kind === 'certificate' ? ' and its certificate shows as revoked at its verification link' : ''}. This does not refund anything in Razorpay.`}
        confirmLabel="Revoke"
        busy={busyId !== null}
        onConfirm={revoke}
        onCancel={() => setPending(null)}
      />
    </Card>
  );
};

/* -------------------------------------------------------- certificates */

const CertificatesCard: React.FC<{ certificates: AdminCertificateRow[] | null; keys: PricingResponse['catalogKeys'] }> = ({ certificates, keys }) => (
  <Card className="p-0 overflow-hidden">
    <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
      <h2 className="text-sm font-medium text-fg">Certificates</h2>
      <span className="text-xs text-fg-muted">The id is the public verification code (/verify/&lt;id&gt;).</span>
    </div>
    {!certificates ? (
      <Spinner />
    ) : certificates.length === 0 ? (
      <EmptyState>No certificates issued yet.</EmptyState>
    ) : (
      <Table>
        <thead>
          <tr>
            <th>Certificate</th>
            <th>Name on it</th>
            <th>Account</th>
            <th>Track</th>
            <th>Issued</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {certificates.map((c) => (
            <tr key={c.id}>
              <td className="cell-mono">{c.id}</td>
              <td className="cell-primary">{c.learnerName}</td>
              <td className="text-fg-muted">{c.username}</td>
              <td>{c.trackLabel ?? keys.tracks.find((t) => t.id === c.trackId)?.label ?? c.trackId}</td>
              <td className="cell-mono text-fg-muted whitespace-nowrap">{shortDate(c.issuedAt)}</td>
              <td>{c.revokedAt ? <Badge tone="danger">Revoked</Badge> : <Badge tone="success">Valid</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    )}
  </Card>
);
