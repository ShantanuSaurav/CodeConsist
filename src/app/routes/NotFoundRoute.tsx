import React from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import { ButtonLink, CodeConsistLogo } from '@/ui';

interface NotFoundRouteProps {
  /**
   * Rendered inside the dashboard frame (`/dashboard/typo`), so the sidebar
   * stays and the page only needs its own content. Outside it (`/typo`) the
   * page brings its own header.
   */
  inFrame?: boolean;
}

/**
 * The page for a URL that matches nothing. It used to be a silent redirect to
 * the landing page, which made a mistyped or outdated link look like the site
 * had forgotten where the learner was. Imported statically: it is tiny, and a
 * dead link is exactly when a chunk download should not be needed.
 */
export const NotFoundRoute: React.FC<NotFoundRouteProps> = ({ inFrame = false }) => {
  const body = (
    <div className="max-w-xl">
      <div className="eyebrow">Page not found</div>
      <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight text-fg">There is nothing at this address.</h1>
      <p className="text-fg-secondary mt-2 text-[0.9375rem] leading-relaxed">
        The link may be mistyped, or the page may have moved. Everything else is where you left it.
      </p>
      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <ButtonLink to={ROUTES.learn} variant="primary">
          Open the learning path
        </ButtonLink>
        <ButtonLink to={ROUTES.landing} variant="secondary">
          Go to the home page
        </ButtonLink>
      </div>
    </div>
  );

  if (inFrame) return <div className="page max-w-3xl">{body}</div>;

  return (
    <div className="min-h-screen bg-bg text-fg flex flex-col">
      <header className="h-14 px-6 flex items-center border-b border-border bg-surface">
        <Link to={ROUTES.landing} className="inline-flex" aria-label="CodeConsist home">
          <CodeConsistLogo size="sm" wordmark />
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center px-6 py-16">{body}</main>
    </div>
  );
};
