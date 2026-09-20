import React from 'react';
import { DevlingoLogo } from './DevlingoLogo';

/**
 * Loading placeholders for the two moments the app has nothing to show yet:
 * a route chunk still downloading, or the content bank not yet arrived.
 * Neutral blocks in the page's own rhythm, so the layout does not jump when
 * the real thing lands. Motion is a soft pulse that reduced-motion turns off
 * (tokens.css).
 */

/** One grey block. `w`/`h` are any CSS lengths. */
export const Bone: React.FC<{ w?: string; h?: string; className?: string }> = ({ w = '100%', h = '1rem', className = '' }) => (
  <span className={`skeleton-bone ${className}`} style={{ width: w, height: h }} aria-hidden="true" />
);

/** A dashboard page while its chunk or its data is on the way. */
export const PageSkeleton: React.FC<{ label?: string }> = ({ label = 'Loading' }) => (
  <div className="skeleton-page" role="status" aria-live="polite" aria-label={label}>
    <div className="skeleton-head">
      <Bone w="9rem" h="0.75rem" />
      <Bone w="min(24rem, 70%)" h="2rem" />
      <Bone w="min(32rem, 90%)" h="1rem" />
    </div>
    <div className="skeleton-grid">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="skeleton-card">
          <Bone w="40%" h="0.75rem" />
          <Bone w="80%" h="1.25rem" />
          <Bone w="100%" h="0.75rem" />
          <Bone w="60%" h="0.75rem" />
        </div>
      ))}
    </div>
  </div>
);

/** The whole-window fallback while the very first route chunk downloads. */
export const AppSplash: React.FC = () => (
  <div className="app-splash" role="status" aria-label="Loading Devlingo">
    <DevlingoLogo size="lg" decorative />
    <span className="app-splash-bar" aria-hidden="true" />
  </div>
);
