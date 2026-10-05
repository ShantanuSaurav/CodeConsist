import React from 'react';
import logoUrl from '../brand/devlingo-logo.png';

/**
 * The CodeConsist brand mark - the one place the logo asset is referenced.
 *
 * Every surface that shows the brand (sidebar, mobile bar, landing nav and
 * footer, admin, sign-in, loading screen, welcome) renders this, so the
 * whole product shows the same logo at consistent sizes. The asset is the
 * official pixel-art mark (src/ui/brand/devlingo-logo.png, 640×512, from the
 * supplied Logo.png); it is never redrawn in CSS or swapped for an icon.
 * index.html's boot splash points at the same file; the welcome intro's
 * split layers live apart in src/ui/brand/logoLayers.ts.
 *
 * Code-related icons inside challenges and the editor are a different thing
 * and do not go through here.
 */

export type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** Rendered height of the mark, in px. Width follows the asset's 5:4 ratio. */
const HEIGHT: Record<LogoSize, number> = { xs: 18, sm: 22, md: 32, lg: 56, xl: 112 };
const RATIO = 640 / 512;

export interface CodeConsistLogoProps {
  size?: LogoSize;
  /** Show the "CodeConsist" wordmark next to the mark. */
  wordmark?: boolean;
  /** Text to the right of the wordmark, e.g. a small "admin" badge. */
  suffix?: React.ReactNode;
  className?: string;
  /** The mark is decorative when the wordmark (or surrounding text) already names the brand. */
  decorative?: boolean;
}

export type DevlingoLogoProps = CodeConsistLogoProps;

/** The URL of the mark, for the rare case that needs the raw asset. */
export const CODECONSIST_LOGO_URL = logoUrl;
export const DEVLINGO_LOGO_URL = logoUrl;

export const CodeConsistLogo: React.FC<CodeConsistLogoProps> = ({ size = 'sm', wordmark = false, suffix, className = '', decorative }) => {
  const h = HEIGHT[size];
  const w = Math.round(h * RATIO);
  const hidden = decorative ?? wordmark;
  const img = (
    <img
      src={logoUrl}
      width={w}
      height={h}
      alt={hidden ? '' : 'CodeConsist'}
      aria-hidden={hidden || undefined}
      decoding="async"
      draggable={false}
      className="logo-mark block shrink-0 select-none"
      style={{ width: w, height: h }}
    />
  );
  if (!wordmark) return className ? <span className={`inline-flex ${className}`.trim()}>{img}</span> : img;

  const text: Record<LogoSize, string> = {
    xs: 'text-sm',
    sm: 'text-[0.9375rem]',
    md: 'text-lg',
    lg: 'text-2xl',
    xl: 'text-4xl'
  };
  return (
    <span className={`inline-flex items-center gap-2 min-w-0 ${className}`.trim()}>
      {img}
      <span className={`font-semibold tracking-tight text-fg leading-none truncate ${text[size]}`}>CodeConsist</span>
      {suffix}
    </span>
  );
};

export const DevlingoLogo = CodeConsistLogo;
