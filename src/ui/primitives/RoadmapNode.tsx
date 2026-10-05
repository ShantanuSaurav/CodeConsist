import React from 'react';
import { CheckGlyph, DotGlyph, HalfGlyph, LockGlyph, SkipGlyph, SparkGlyph } from './glyphs';

export type RoadmapNodeState = 'done' | 'current' | 'learning' | 'locked' | 'skipped' | 'optional' | 'pro' | 'pending';

interface RoadmapNodeProps {
  state: RoadmapNodeState;
  label: React.ReactNode;
  /** A mono line under the label ("4 lessons", "Stage 03"). */
  sublabel?: React.ReactNode;
  /** Not called for a locked node. */
  onClick?: () => void;
  /** Chosen (its details are open): aria-pressed and a violet wash. */
  pressed?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** The state in words for screen readers, in place of the defaults. */
  stateLabel?: string;
  className?: string;
}

/** Read after the label. Current says itself through aria-current; pending needs no word. */
const STATE_LABEL: Record<RoadmapNodeState, string> = {
  done: 'Done',
  current: '',
  learning: 'Learning',
  locked: 'Locked',
  skipped: 'Skipped',
  optional: 'Optional',
  pro: 'Pro',
  pending: ''
};

const GLYPH_SIZE = { sm: 10, md: 12, lg: 14 } as const;

function glyphFor(state: RoadmapNodeState, size: number): React.ReactNode {
  switch (state) {
    case 'done':
      return <CheckGlyph size={size} />;
    case 'current':
      return <DotGlyph size={size} />;
    case 'learning':
      return <HalfGlyph size={size} />;
    case 'locked':
      return <LockGlyph size={size} />;
    case 'skipped':
      return <SkipGlyph size={size} />;
    case 'pro':
      return <SparkGlyph size={size} />;
    default:
      return null;
  }
}

/**
 * A stop on a roadmap, as a real button. The marker carries the state: done
 * glows softly green; current (aria-current="step") is orange, with a ring
 * that breathes outward (a still ring under reduced motion); learning is a
 * dashed violet ring; skipped is dimmed and dashed; optional is hollow; pro
 * is in the warning tone. A locked node stays focusable but says
 * aria-disabled and ignores clicks.
 */
export const RoadmapNode: React.FC<RoadmapNodeProps> = ({ state, label, sublabel, onClick, pressed, size = 'md', stateLabel, className = '' }) => {
  const locked = state === 'locked';
  const said = stateLabel ?? STATE_LABEL[state];
  return (
    <button
      type="button"
      className={`map-node is-${state} ${size === 'md' ? '' : `size-${size}`} ${className}`.replace(/\s+/g, ' ').trim()}
      aria-current={state === 'current' ? 'step' : undefined}
      aria-disabled={locked || undefined}
      aria-pressed={pressed}
      onClick={locked ? undefined : onClick}
    >
      <span className="map-node-marker" aria-hidden="true">
        {glyphFor(state, GLYPH_SIZE[size])}
      </span>
      <span className="flex flex-col min-w-0">
        <span className="map-node-label">
          {label}
          {said && <span className="sr-only">, {said}</span>}
        </span>
        {sublabel && <span className="font-mono text-xs text-fg-muted">{sublabel}</span>}
      </span>
    </button>
  );
};
