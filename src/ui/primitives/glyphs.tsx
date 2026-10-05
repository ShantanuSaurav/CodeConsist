import React from 'react';

/**
 * Tiny state glyphs for ChallengeCard and RoadmapNode, drawn inline so the
 * markers add nothing to the shared lucide chunk. A 24-unit box in
 * currentColor, always decorative: the marker around a glyph carries its
 * meaning in words. Not exported from `@/ui`.
 */

interface GlyphProps {
  size?: number;
}

const Svg: React.FC<{ size: number; strokeWidth?: number; children: React.ReactNode }> = ({ size, strokeWidth = 2.5, children }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);

export const CheckGlyph: React.FC<GlyphProps> = ({ size = 12 }) => (
  <Svg size={size} strokeWidth={3}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);

export const LockGlyph: React.FC<GlyphProps> = ({ size = 12 }) => (
  <Svg size={size}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Svg>
);

export const SkipGlyph: React.FC<GlyphProps> = ({ size = 12 }) => (
  <Svg size={size}>
    <path d="m6 17 5-5-5-5M13 17l5-5-5-5" />
  </Svg>
);

/** "Here": a solid dot. */
export const DotGlyph: React.FC<GlyphProps> = ({ size = 12 }) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" />
  </Svg>
);

/** Part way: a half-filled disc. */
export const HalfGlyph: React.FC<GlyphProps> = ({ size = 12 }) => (
  <Svg size={size}>
    <path d="M12 5a7 7 0 0 1 0 14z" fill="currentColor" stroke="none" />
  </Svg>
);

/** Pro: a four-point spark. */
export const SparkGlyph: React.FC<GlyphProps> = ({ size = 12 }) => (
  <Svg size={size}>
    <path d="M12 3l2.1 6.9L21 12l-6.9 2.1L12 21l-2.1-6.9L3 12l6.9-2.1z" fill="currentColor" stroke="none" />
  </Svg>
);
