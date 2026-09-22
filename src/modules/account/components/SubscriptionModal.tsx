import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, ExternalLink, X } from 'lucide-react';
import { useSession } from '@/platform/session';
import { intents } from '@/platform/events';
import { api, ApiError, OfflineError, rupees } from '@/platform/api-client/api';
import type { BillingCatalogResponse, BillingOrder, BillingProduct, CreateOrderResponse, OrderPaidResponse } from '@/platform/api-client/api';
import { ROUTES } from '@/config/routes';
import { useFocusTrap } from '@/ui/hooks/useFocusTrap';
import { Button, Segmented, useToast } from '@/ui';

/**
 * The unlock modal (still exported as `SubscriptionModal` so AccountModals
 * keeps working). Sells one-time unlocks - a lifetime licence, a track, a
 * single premium stage - and verified certificates. There is no subscription.
 *
 * Nothing here decides what the learner owns. The server prices every
 * product, creates every order, verifies every Razorpay signature and only
 * then marks the order paid; this modal asks, waits, and re-reads the account.
 */

export type UnlockTab = 'unlock' | 'certificates';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The premium stage that was locked, if the modal opened from one. Highlights it and its track. */
  stageId?: string;
  /** A track to feature when no stage was given. */
  trackId?: string;
  initialTab?: UnlockTab;
}

/* --------------------------------------------------------- Razorpay loader */

interface RazorpayFailure {
  error?: { description?: string; reason?: string; code?: string };
}

interface RazorpayCheckout {
  open(): void;
  on(event: 'payment.failed', handler: (response: RazorpayFailure) => void): void;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { name: string; email: string };
  theme: { color: string };
  handler: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  modal: { ondismiss: () => void };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayCheckout;
  }
}

const RAZORPAY_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';
let razorpayLoading: Promise<void> | null = null;

/** Load Razorpay's checkout once, on first use. Cached so a retry does not add a second script tag. */
function loadRazorpay(): Promise<void> {
  if (typeof window.Razorpay === 'function') return Promise.resolve();
  if (!razorpayLoading) {
    razorpayLoading = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = RAZORPAY_SCRIPT;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        razorpayLoading = null;
        script.remove();
        reject(new Error('Could not load the Razorpay checkout. Check your connection and try again.'));
      };
      document.head.appendChild(script);
    });
  }
  return razorpayLoading;
}

/** The product's accent, so the Razorpay sheet matches the app. */
function accentColor(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  return value || '#16a34a';
}

/* ------------------------------------------------------------- helpers */

const NAME_RULE = /^[\p{L}\p{M} .'-]+$/u;

/** Same rule as the server: 2-80 characters, letters, spaces, . ' - only. */
function certificateNameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 2) return 'Enter at least 2 characters.';
  if (trimmed.length > 80) return 'Keep it under 80 characters.';
  if (!NAME_RULE.test(trimmed)) return "Letters, spaces and . ' - only.";
  return null;
}

/**
 * A first guess at the name to print, from the username. Usernames may hold
 * digits and underscores and a printed name may not, so those are dropped;
 * when nothing usable is left the field starts empty rather than invalid.
 */
function nameFromUsername(username: string | undefined): string {
  const cleaned = (username ?? '').replace(/[^\p{L}\p{M} .'-]/gu, ' ').replace(/\s+/g, ' ').trim();
  return certificateNameProblem(cleaned) ? '' : cleaned;
}

function messageOf(err: unknown, fallback: string): string {
  if (err instanceof OfflineError) return 'The API server is not reachable, so nothing can be bought right now.';
  if (err instanceof ApiError || err instanceof Error) return err.message || fallback;
  return fallback;
}

/** A test-mode order waiting for the explicit "Complete test payment" step. */
interface PendingTest {
  order: BillingOrder;
  what: string;
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ isOpen, onClose, stageId, trackId, initialTab = 'unlock' }) => {
  const { user, stats, selectedTrackId, refreshAccount, celebrate } = useSession();
  const { notify } = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);

  const [tab, setTab] = useState<UnlockTab>(initialTab);
  const [data, setData] = useState<BillingCatalogResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The product key being bought, while a request or the checkout is in flight. */
  const [busyKey, setBusyKey] = useState<string | null>(null);
  /** True while Razorpay's own sheet is on screen; the focus trap steps aside for it. */
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [pendingTest, setPendingTest] = useState<PendingTest | null>(null);
  const [certName, setCertName] = useState(() => nameFromUsername(user?.username));
  /** The red error waits for a keystroke - the prefilled value is ours, not the learner's. */
  const [certNameTouched, setCertNameTouched] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const signedIn = Boolean(user && user.provider !== 'guest');
  const busy = busyKey !== null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useFocusTrap(dialogRef, isOpen && !checkoutOpen);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await api.billingCatalog();
      if (mounted.current) setData(res);
    } catch (err) {
      if (mounted.current) setLoadError(messageOf(err, 'Could not load prices.'));
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setTab(initialTab);
    setError(null);
    setPendingTest(null);
    setCertName(nameFromUsername(user?.username));
    setCertNameTouched(false);
    load();
  }, [isOpen, initialTab, load, user?.username]);

  // Closing is refused mid-payment: the confirm step must not lose its owner.
  const requestClose = useCallback(() => {
    if (busy) return;
    onClose();
  }, [busy, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, requestClose]);

  /* ------------------------------------------------------- what to show */

  const catalog = data?.catalog ?? null;
  const owned = data?.owned ?? null;
  const lifetimeOwned = owned ? owned.lifetime : Boolean(stats.isPremium);
  const unlocked = useMemo(() => new Set(owned ? owned.unlockedStages : stats.unlockedStages ?? []), [owned, stats.unlockedStages]);

  const featuredStage = useMemo(() => (stageId && catalog ? catalog.stages.find((s) => s.stageId === stageId) ?? null : null), [stageId, catalog]);
  const featuredTrack = useMemo(() => {
    if (!catalog) return null;
    const id = trackId ?? featuredStage?.trackId ?? selectedTrackId;
    const track = catalog.tracks.find((t) => t.trackId === id) ?? null;
    // A track with nothing premium in it has nothing to sell.
    return track && track.premiumStageIds.length > 0 ? track : null;
  }, [catalog, trackId, featuredStage, selectedTrackId]);
  const stageName = useMemo(() => new Map((catalog?.stages ?? []).map((s) => [s.stageId, `${String(s.index).padStart(2, '0')} · ${s.name}`])), [catalog]);

  /* ------------------------------------------------------------ buying */

  /** After the server says paid: adopt the new entitlements, then say so. */
  const finish = useCallback(
    async (res: OrderPaidResponse, what: string) => {
      try {
        await refreshAccount();
      } catch {
        // The purchase is recorded server-side; the next session restore picks it up.
      }
      if (!mounted.current) return;
      celebrate();
      if (res.order.product.kind === 'certificate') {
        notify(`Certificate issued for ${what}.`, 'success');
        // Stay on the tab so the "View certificate" link is right there.
        setBusyKey(null);
        setPendingTest(null);
        await load();
        return;
      }
      notify(`Unlocked. ${what}`, 'success');
      setBusyKey(null);
      setPendingTest(null);
      onClose();
    },
    [refreshAccount, celebrate, notify, load, onClose]
  );

  const openRazorpay = useCallback(
    (created: CreateOrderResponse, what: string) =>
      new Promise<void>((resolve) => {
        const checkout = created.checkout!;
        const Razorpay = window.Razorpay!;
        setCheckoutOpen(true);
        // Razorpay may fire ondismiss after a successful handler too; once the
        // confirm request is in flight, a dismiss must not re-enable Buy.
        let confirming = false;
        const done = () => {
          if (mounted.current) setCheckoutOpen(false);
          resolve();
        };
        const sheet = new Razorpay({
          key: created.keyId,
          amount: checkout.amount,
          currency: checkout.currency,
          name: checkout.name,
          description: checkout.description,
          order_id: checkout.providerOrderId,
          prefill: checkout.prefill,
          theme: { color: accentColor() },
          handler: async (r) => {
            confirming = true;
            done();
            try {
              // The server checks the signature; only its answer unlocks anything.
              const paid = await api.confirmOrder(created.order.id, r);
              await finish(paid, what);
            } catch (err) {
              if (!mounted.current) return;
              setError(messageOf(err, 'Payment could not be verified.'));
              setBusyKey(null);
            }
          },
          modal: {
            ondismiss: () => {
              done();
              if (mounted.current && !confirming) setBusyKey(null);
            }
          }
        });
        sheet.on('payment.failed', (r) => {
          if (!mounted.current) return;
          setError(`Payment failed - ${r.error?.description || r.error?.reason || 'the payment did not go through'}.`);
        });
        sheet.open();
      }),
    [finish]
  );

  const buy = useCallback(
    async (product: BillingProduct, key: string, what: string, certificateName?: string) => {
      if (busy) return;
      setError(null);
      setPendingTest(null);
      setBusyKey(key);
      try {
        const created = await api.createOrder(product, certificateName);
        if (!mounted.current) return;
        if (!created.checkout) {
          // Free at today's price: the server already marked it paid.
          await finish({ order: created.order, user: user! }, what);
          return;
        }
        if (created.mode === 'razorpay') {
          await loadRazorpay();
          if (!mounted.current) return;
          await openRazorpay(created, what);
          return;
        }
        // Test mode: nothing is simulated silently - the learner completes it by hand.
        setPendingTest({ order: created.order, what });
        setBusyKey(null);
      } catch (err) {
        if (!mounted.current) return;
        setError(messageOf(err, 'Could not start the purchase.'));
        setBusyKey(null);
      }
    },
    [busy, finish, openRazorpay, user]
  );

  /**
   * What a purchasable card shows when it is not already owned. A test order
   * waiting to be completed keeps its own card out of the buy path - clicking
   * Buy again would only leave another half-finished order behind in Purchases.
   */
  const cardState = useCallback(
    (key: string): CardState => (pendingTest?.order.productKey === key ? 'pending' : busyKey === key ? 'busy' : 'buy'),
    [pendingTest, busyKey]
  );

  const completeTest = useCallback(async () => {
    if (!pendingTest || busy) return;
    setError(null);
    setBusyKey(pendingTest.order.productKey);
    try {
      const paid = await api.testCompleteOrder(pendingTest.order.id);
      await finish(paid, pendingTest.what);
    } catch (err) {
      if (!mounted.current) return;
      setError(messageOf(err, 'Could not complete the test payment.'));
      setBusyKey(null);
    }
  }, [pendingTest, busy, finish]);

  const copyVerifyLink = useCallback(async (id: string) => {
    const url = `${window.location.origin}${ROUTES.verify(id)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
    } catch {
      window.prompt('Copy this link', url);
    }
  }, []);

  if (!isOpen) return null;

  const certNameProblem = certificateNameProblem(certName);
  const certNameError = certNameTouched ? certNameProblem : null;

  return (
    <div className="modal-overlay" onMouseDown={requestClose}>
      <div
        className="modal-card !w-[min(38rem,100%)] !h-auto !max-h-[92vh]"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Unlock CodeConsist"
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="modal-header">
          <div>
            <div className="modal-stage-badge">One-time purchases</div>
            <h3 className="modal-title">Unlock CodeConsist</h3>
          </div>
          <button type="button" className="modal-close-btn" onClick={requestClose} aria-label="Close" disabled={busy}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {signedIn && (
            <Segmented<UnlockTab>
              value={tab}
              onChange={(next) => {
                setTab(next);
                setError(null);
              }}
              ariaLabel="What to buy"
              options={[
                { value: 'unlock', label: 'Unlock stages' },
                { value: 'certificates', label: 'Certificates' }
              ]}
            />
          )}

          {loadError && (
            <div className="notice notice-warn" role="alert">
              {loadError}{' '}
              <button type="button" className="underline underline-offset-2" onClick={load}>
                Try again
              </button>
            </div>
          )}

          {!data && !loadError && <p className="text-sm text-fg-muted">Loading prices…</p>}

          {data?.mode === 'test' && (
            <div className="notice notice-warn">
              Test mode - no money moves. This server has no Razorpay keys, so the payment is simulated.
            </div>
          )}

          {error && (
            <div className="notice notice-error" role="alert">
              {error}
            </div>
          )}

          {pendingTest && (
            <div className="notice notice-warn flex flex-wrap items-center justify-between gap-3">
              <span>
                Test order created for <strong>{pendingTest.what}</strong> ({rupees(pendingTest.order.amount)}). Nothing is charged.
              </span>
              <span className="flex items-center gap-2">
                <Button variant="primary" size="sm" onClick={completeTest} disabled={busy}>
                  {busy ? 'Completing…' : 'Complete test payment'}
                </Button>
                {/* Dropping it is a deliberate choice - the order stays in Purchases as not completed. */}
                <Button variant="ghost" size="sm" onClick={() => setPendingTest(null)} disabled={busy}>
                  Cancel
                </Button>
              </span>
            </div>
          )}

          {!signedIn && catalog && (
            <>
              <p className="text-sm text-fg-secondary">
                Unlocks and certificates belong to an account, so they follow you between devices. Sign in (or create a free account) to buy.
              </p>
              <Button
                variant="primary"
                block
                onClick={() => {
                  onClose();
                  intents.openAuth();
                }}
              >
                Sign in to buy
              </Button>
            </>
          )}

          {signedIn && catalog && tab === 'unlock' && (
            <div className="flex flex-col gap-3">
              {featuredStage && (
                <p className="text-sm text-fg-secondary">
                  <strong className="text-fg">{stageName.get(featuredStage.stageId)}</strong> is a premium stage. Unlock just that stage, its whole
                  track, or everything.
                </p>
              )}

              <ProductCard
                title="Lifetime licence"
                detail="Every premium stage, now and in future - one payment, no subscription."
                amount={catalog.lifetime.amount}
                state={lifetimeOwned ? 'owned' : cardState(catalog.lifetime.key)}
                ownedLabel="Owned"
                onBuy={() => buy({ kind: 'lifetime' }, catalog.lifetime.key, 'Every premium stage is open.')}
                disabled={busy}
              />

              {featuredTrack && (
                <ProductCard
                  title={`This track · ${featuredTrack.label}`}
                  detail={
                    <>
                      Unlocks {featuredTrack.premiumStageIds.length === 1 ? 'the premium stage' : `all ${featuredTrack.premiumStageIds.length} premium stages`}{' '}
                      in this track, plus any added later:
                      <ul className="mt-1.5 flex flex-col gap-0.5">
                        {featuredTrack.premiumStageIds.map((id) => (
                          <li key={id} className="flex items-center gap-1.5 font-mono text-xs">
                            {unlocked.has(id) || lifetimeOwned ? <Check size={12} className="text-success" /> : <span className="w-3" />}
                            {stageName.get(id) ?? id}
                          </li>
                        ))}
                      </ul>
                    </>
                  }
                  amount={featuredTrack.amount}
                  state={
                    lifetimeOwned
                      ? 'included'
                      : featuredTrack.premiumStageIds.every((id) => unlocked.has(id))
                        ? 'owned'
                        : cardState(featuredTrack.key)
                  }
                  ownedLabel="Unlocked"
                  onBuy={() => buy({ kind: 'track', trackId: featuredTrack.trackId }, featuredTrack.key, `${featuredTrack.label} track.`)}
                  disabled={busy}
                />
              )}

              {featuredStage && (
                <ProductCard
                  title={`Just this stage · ${featuredStage.name}`}
                  detail="One premium stage - its lessons, its article and its stage test."
                  amount={featuredStage.amount}
                  state={lifetimeOwned ? 'included' : unlocked.has(featuredStage.stageId) ? 'owned' : cardState(featuredStage.key)}
                  ownedLabel="Unlocked"
                  onBuy={() => buy({ kind: 'stage', stageId: featuredStage.stageId }, featuredStage.key, `Stage ${stageName.get(featuredStage.stageId)}.`)}
                  disabled={busy}
                />
              )}

              <p className="text-xs text-fg-muted">
                Prices in Indian rupees, paid once through Razorpay. Unlocks are tied to your account and never expire.
              </p>
            </div>
          )}

          {signedIn && catalog && tab === 'certificates' && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-fg-secondary">
                Learning is free. A verified certificate is issued once every stage in a track - lessons and stage tests - is cleared. Anyone can check
                it at its verification link.
              </p>

              <div>
                <label className="field-label" htmlFor="certificate-name">
                  Name on the certificate
                </label>
                <input
                  id="certificate-name"
                  type="text"
                  className={`w-full ${certNameError ? 'is-invalid' : ''}`.trim()}
                  value={certName}
                  maxLength={80}
                  onChange={(e) => {
                    setCertName(e.target.value);
                    setCertNameTouched(true);
                  }}
                  aria-invalid={certNameError ? true : undefined}
                  disabled={busy}
                />
                <span className={`field-hint ${certNameError ? 'text-error' : ''}`.trim()}>
                  {certNameError ??
                    (certNameProblem ? 'Type the name to print on the certificate.' : 'Printed exactly as typed. It cannot be changed once issued.')}
                </span>
              </div>

              {catalog.certificates.length === 0 && <p className="text-sm text-fg-muted">No tracks are open for certificates yet.</p>}

              {catalog.certificates.map((cert) => {
                const issuedId = owned?.certificates[cert.trackId];
                const eligibility = data?.eligibility?.[cert.trackId];
                return (
                  <div key={cert.key} className="rounded-md border border-border p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-fg">{cert.label}</div>
                      {issuedId ? (
                        <div className="text-xs text-fg-muted font-mono mt-0.5">{issuedId}</div>
                      ) : eligibility?.eligible ? (
                        <div className="text-sm text-success mt-0.5">Every stage cleared - ready to issue.</div>
                      ) : (
                        <div className="text-sm text-fg-muted mt-0.5">{eligibility?.reason ?? 'Finish every stage in this track.'}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {issuedId ? (
                        <>
                          <Link to={ROUTES.certificate(issuedId)} className="btn btn-secondary btn-sm" onClick={onClose}>
                            <ExternalLink size={13} />
                            View certificate
                          </Link>
                          <Button size="sm" variant="ghost" onClick={() => copyVerifyLink(issuedId)} title="Copy the public verification link">
                            {copied === issuedId ? <Check size={13} /> : <Copy size={13} />}
                            {copied === issuedId ? 'Copied' : 'Verify link'}
                          </Button>
                        </>
                      ) : eligibility?.eligible ? (
                        cardState(cert.key) === 'pending' ? (
                          <span className="text-sm text-fg-muted">Waiting for test payment</span>
                        ) : (
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={busy || Boolean(certNameProblem)}
                            onClick={() => buy({ kind: 'certificate', trackId: cert.trackId }, cert.key, cert.label, certName.trim())}
                          >
                            {busyKey === cert.key ? 'Working…' : `Get certificate · ${rupees(cert.amount)}`}
                          </Button>
                        )
                      ) : (
                        <span className="font-mono text-xs text-fg-muted">{rupees(cert.amount)}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ pieces */

type CardState = 'buy' | 'busy' | 'owned' | 'included' | 'pending';

const ProductCard: React.FC<{
  title: string;
  detail: React.ReactNode;
  amount: number;
  state: CardState;
  /** What an owned card says: "Owned" for the licence, "Unlocked" for stages. */
  ownedLabel: string;
  onBuy: () => void;
  disabled: boolean;
}> = ({ title, detail, amount, state, ownedLabel, onBuy, disabled }) => (
  <div className={`rounded-md border p-4 flex flex-wrap items-start justify-between gap-3 ${state === 'owned' || state === 'included' ? 'border-success/40 bg-success-soft/40' : 'border-border'}`}>
    <div className="min-w-0 flex-1">
      <div className="font-medium text-fg">{title}</div>
      <div className="text-sm text-fg-secondary mt-0.5">{detail}</div>
    </div>
    <div className="flex flex-col items-end gap-2 shrink-0">
      <span className="text-lg font-semibold tracking-tight text-fg tabular-nums">{amount === 0 ? 'Free' : rupees(amount)}</span>
      {state === 'owned' || state === 'included' ? (
        <span className="inline-flex items-center gap-1 text-sm text-success">
          <Check size={14} strokeWidth={2.5} />
          {state === 'included' ? 'Included' : ownedLabel}
        </span>
      ) : state === 'pending' ? (
        // The test order for this card is waiting to be completed above.
        <span className="text-sm text-fg-muted">Waiting for test payment</span>
      ) : (
        // Three cards, three buttons all reading "Buy" - the label spells out
        // which one this is, because paying is not something to undo.
        <Button
          size="sm"
          variant="primary"
          onClick={onBuy}
          disabled={disabled}
          // An aria-label wins over the button's text, so it has to carry the
          // working state too or a screen reader never hears the click landed.
          aria-label={
            state === 'busy'
              ? `Working - buying ${title}`
              : `Buy ${title} for ${amount === 0 ? 'free' : rupees(amount)}`
          }
        >
          {state === 'busy' ? 'Working…' : 'Buy'}
        </Button>
      )}
    </div>
  </div>
);
