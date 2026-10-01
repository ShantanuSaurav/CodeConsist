import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BadgeCheck, CircleSlash, SearchX } from 'lucide-react';
import { api, OfflineError } from '@/platform/api-client/api';
import type { VerifyCertificateResponse } from '@/platform/api-client/api';
import { ROUTES } from '@/config/routes';
import { Bone, CodeConsistLogo } from '@/ui';
import '../styles/certificate.css';

type State = { kind: 'loading' } | { kind: 'done'; result: VerifyCertificateResponse } | { kind: 'error'; message: string };

function longDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * /verify/:code - public. An employer pastes the code from a certificate and
 * sees whether CodeConsist issued it, to whom, and for which track. The
 * server never returns the owner's account details here.
 *
 * Motion: the page enters once; the verdict fades in over its skeleton.
 */
export const VerifyPage: React.FC = () => {
  const { code = '' } = useParams<{ code: string }>();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    api
      .verifyCertificate(code)
      .then((result) => {
        if (!cancelled) setState({ kind: 'done', result });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          kind: 'error',
          message: err instanceof OfflineError ? 'The API server is not reachable, so the code cannot be checked right now.' : err instanceof Error ? err.message : 'Could not check that code.'
        });
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  // A revoked certificate comes back `valid: false` with the record attached, so
  // the record - not `valid` - decides the verdict; otherwise it would read "Not found".
  const cert = state.kind === 'done' ? state.result.certificate ?? null : null;
  const verdict: 'valid' | 'revoked' | 'missing' | null = state.kind !== 'done' ? null : !cert ? 'missing' : cert.revoked ? 'revoked' : 'valid';

  return (
    <div className="certificate-page page-enter">
      <div className="certificate-chrome">
        <Link to={ROUTES.landing} className="inline-flex">
          <CodeConsistLogo size="sm" wordmark />
        </Link>
        <span className="text-xs text-fg-muted font-mono">Certificate check</span>
      </div>

      <section className="certificate-sheet" aria-live="polite">
        <div className="certificate-kicker">Certificate</div>
        <div className="font-mono text-sm text-fg mt-1 break-all">{code}</div>

        {/* The verdict's outline while the server answers; the verdict fades in over it. */}
        {state.kind === 'loading' && (
          <div className="grid gap-4 mt-8 anim-fade" style={{ animationDelay: 'var(--delay-skeleton)' }}>
            <span className="sr-only">Checking…</span>
            <Bone w="min(18rem, 70%)" h="2rem" />
            <Bone w="10rem" h="0.875rem" />
            <Bone w="min(20rem, 75%)" h="2.5rem" />
          </div>
        )}

        {state.kind === 'error' && (
          <div className="notice notice-error mt-6 anim-fade" role="alert">
            {state.message}
          </div>
        )}

        {verdict === 'valid' && cert && (
          <div className="anim-fade">
            <h1 className="certificate-title flex items-center gap-2 !mb-4">
              <BadgeCheck size={28} className="text-success shrink-0" />
              Valid certificate
            </h1>
            <p className="certificate-lead">Issued by CodeConsist to</p>
            <div className="certificate-name">{cert.learnerName}</div>
            <p className="certificate-lead">for completing the</p>
            <div className="certificate-track">{cert.trackLabel} track</div>
            <dl className="certificate-meta">
              <div>
                <dt>Issued</dt>
                <dd>{longDate(cert.issuedAt)}</dd>
              </div>
              <div>
                <dt>Certificate id</dt>
                <dd className="is-mono">{cert.id}</dd>
              </div>
            </dl>
          </div>
        )}

        {verdict === 'revoked' && cert && (
          <div className="anim-fade">
            <h1 className="certificate-title flex items-center gap-2 !mb-4">
              <CircleSlash size={28} className="text-error shrink-0" />
              Revoked
            </h1>
            <p className="certificate-body">
              This certificate was issued to <strong className="text-fg">{cert.learnerName}</strong> for the {cert.trackLabel} track on {longDate(cert.issuedAt)},
              but it has since been revoked and is no longer valid.
            </p>
          </div>
        )}

        {verdict === 'missing' && (
          <div className="anim-fade">
            <h1 className="certificate-title flex items-center gap-2 !mb-4">
              <SearchX size={28} className="text-fg-muted shrink-0" />
              Not found
            </h1>
            <p className="certificate-body">
              CodeConsist has no certificate with this code. Check it was copied in full - codes look like <span className="font-mono">CC-2026-XXXXXXXX</span>.
            </p>
          </div>
        )}
      </section>

      <p className="text-xs text-fg-muted max-w-xl text-center">
        A CodeConsist certificate is issued only after every stage in a track - lessons and stage tests - has been cleared, and it can be checked here at any
        time.
      </p>
    </div>
  );
};
