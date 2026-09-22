import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, Printer } from 'lucide-react';
import { useSession } from '@/platform/session';
import { intents } from '@/platform/events';
import { api, ApiError, OfflineError } from '@/platform/api-client/api';
import type { CertificateDetail } from '@/platform/api-client/api';
import { ROUTES } from '@/config/routes';
import { Button, CodeConsistLogo, EmptyState } from '@/ui';
import '../styles/certificate.css';

type State = { kind: 'loading' } | { kind: 'ready'; certificate: CertificateDetail } | { kind: 'missing' } | { kind: 'signed-out' } | { kind: 'error'; message: string };

function longDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * /certificates/:id - the owner's printable certificate. Lives outside the
 * dashboard frame so "Print / Save as PDF" gives one clean sheet. The server
 * answers 404 for anyone but the owner, so a guessed id shows nothing.
 */
export const CertificatePage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const { user, serverStatus } = useSession();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [copied, setCopied] = useState(false);

  const signedIn = Boolean(user && user.provider !== 'guest');

  useEffect(() => {
    let cancelled = false;
    if (serverStatus === 'checking') return;
    if (!signedIn) {
      setState({ kind: 'signed-out' });
      return;
    }
    setState({ kind: 'loading' });
    api
      .certificate(id)
      .then((res) => {
        if (!cancelled) setState({ kind: 'ready', certificate: res.certificate });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 401)) setState({ kind: 'missing' });
        else if (err instanceof OfflineError) setState({ kind: 'error', message: 'The API server is not reachable.' });
        else setState({ kind: 'error', message: err instanceof Error ? err.message : 'Could not load the certificate.' });
      });
    return () => {
      cancelled = true;
    };
  }, [id, signedIn, serverStatus]);

  const verifyUrl = `${window.location.origin}${ROUTES.verify(id)}`;

  const copyVerify = async () => {
    try {
      await navigator.clipboard.writeText(verifyUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link', verifyUrl);
    }
  };

  return (
    <div className="certificate-page">
      <div className="certificate-chrome">
        <Link to={ROUTES.settings} className="btn btn-ghost btn-sm">
          <ArrowLeft size={14} />
          Back to settings
        </Link>
        {state.kind === 'ready' && (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={copyVerify} title="Anyone with this link can check the certificate is genuine">
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy verification link'}
            </Button>
            <Button size="sm" variant="primary" onClick={() => window.print()}>
              <Printer size={14} />
              Print / Save as PDF
            </Button>
          </div>
        )}
      </div>

      {state.kind === 'loading' && <p className="text-sm text-fg-muted">Loading certificate…</p>}

      {state.kind === 'signed-out' && (
        <EmptyState className="w-full max-w-lg" title="Sign in to see this certificate" action={<Button variant="primary" onClick={() => intents.openAuth()}>Sign in</Button>}>
          Certificates are shown to the account that earned them. To check one without signing in, use its verification link.
        </EmptyState>
      )}

      {state.kind === 'missing' && (
        <EmptyState className="w-full max-w-lg" title="No such certificate">
          There is no certificate with this id on your account. If someone shared it with you, open its verification link instead:{' '}
          <Link to={ROUTES.verify(id)} className="underline underline-offset-2 text-fg">
            verify {id}
          </Link>
        </EmptyState>
      )}

      {state.kind === 'error' && (
        <div className="notice notice-error w-full max-w-lg" role="alert">
          {state.message}
        </div>
      )}

      {state.kind === 'ready' && <Sheet certificate={state.certificate} verifyUrl={verifyUrl} />}
    </div>
  );
};

const Sheet: React.FC<{ certificate: CertificateDetail; verifyUrl: string }> = ({ certificate, verifyUrl }) => (
  <article className="certificate-sheet" aria-label={`Certificate of completion for ${certificate.learnerName}`}>
    {certificate.revoked && <span className="certificate-revoked">Revoked</span>}

    <header className="certificate-brand">
      <CodeConsistLogo size="md" wordmark className="certificate-wordmark" />
      <span className="certificate-kicker">Verified certificate</span>
    </header>

    <div className="certificate-kicker">CodeConsist certifies that</div>
    <h1 className="certificate-title">Certificate of Completion</h1>

    <p className="certificate-lead">This certificate is awarded to</p>
    <div className="certificate-name">{certificate.learnerName}</div>

    <p className="certificate-lead">for completing the</p>
    <div className="certificate-track">{certificate.trackLabel} track</div>
    <p className="certificate-body">
      having completed all {certificate.stagesTotal} {certificate.stagesTotal === 1 ? 'stage' : 'stages'} and their tests - every lesson solved and every
      stage test passed, graded by CodeConsist.
    </p>

    <dl className="certificate-meta">
      <div>
        <dt>Issued</dt>
        <dd>{longDate(certificate.issuedAt)}</dd>
      </div>
      <div>
        <dt>Certificate id</dt>
        <dd className="is-mono">{certificate.id}</dd>
      </div>
      <div>
        <dt>Verify at</dt>
        <dd className="is-mono">{verifyUrl}</dd>
      </div>
      <div>
        <dt>Account</dt>
        <dd>{certificate.username}</dd>
      </div>
    </dl>
  </article>
);
