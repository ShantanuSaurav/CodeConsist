import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button, DEVLINGO_LOGO_LAYERS, MOTION, prefersReducedMotion } from '@/ui';
import { useTheme } from '@/platform/theme';
import '../styles/welcome.css';

interface WelcomeIntroProps {
  /** "Enter CodeConsist" - continue into the application. */
  onEnter: () => void;
  /** The quiet alternative: skip into the landing page instead. */
  onExplore: () => void;
}

const NAME = 'CodeConsist';
const TAGLINE = ['Learn.', 'Practice.', 'Build.'];
/* The last piece (the actions) starts 13 steps in and takes --dur-slow
   (welcome.css). After that there is nothing left to skip. */
const SEQUENCE_MS = MOTION.stagger * 13 + MOTION.slow;
/** The intro's exit: one step shorter than an entrance, like every exit. */
const LEAVE_MS = MOTION.base;

/** Nothing is focused yet (or focus fell back to the page). */
const focusIsFree = () => !document.activeElement || document.activeElement === document.body;

/**
 * The introduction shown once per visit at "/".
 *
 * The mark assembles from its own layers in paint order - base, pages,
 * code symbols, cursor - each a short fade and a few pixels of travel, then
 * the name, the tagline and the actions follow. The whole sequence is under
 * a second and never loops. Any key or click before it finishes completes
 * it at once, and focus still ends on "Enter" (unless the click chose
 * another control). Choosing either action fades the intro out.
 */
export const WelcomeIntro: React.FC<WelcomeIntroProps> = ({ onEnter, onExplore }) => {
  const { theme, toggleTheme } = useTheme();
  const enterRef = useRef<HTMLButtonElement>(null);
  const [leaving, setLeaving] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const unarm = useRef<() => void>(() => {});

  const focusEnter = useCallback(() => {
    if (focusIsFree()) enterRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      unarm.current();
    },
    []
  );

  // Skippable: the first key or pointer press during the entrance ends it
  // where it would have finished. Skipping cancels the actions' animation, so
  // its animationend never comes; focus moves to "Enter" when that key or
  // button is released instead - not on the press, or the keypress that
  // follows an Enter keydown would land on the button and activate it. Tab
  // moves focus itself. Once it has played (or with reduced motion, where it
  // never plays) there is nothing left to skip.
  useEffect(() => {
    if (prefersReducedMotion()) {
      focusEnter();
      return;
    }
    if (skipped) return;
    const stop = () => {
      window.clearTimeout(done);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
    const skip = (e: Event) => {
      setSkipped(true);
      if (e instanceof KeyboardEvent && e.key === 'Tab') return;
      const release = e.type === 'keydown' ? 'keyup' : 'pointerup';
      window.addEventListener(release, focusEnter, { once: true });
      unarm.current = () => window.removeEventListener(release, focusEnter);
    };
    const done = window.setTimeout(stop, SEQUENCE_MS);
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);
    return stop;
  }, [skipped, focusEnter]);

  const leave = useCallback(
    (next: () => void) => {
      if (leaving) return;
      if (prefersReducedMotion()) {
        next();
        return;
      }
      setLeaving(true);
      timer.current = window.setTimeout(next, LEAVE_MS);
    },
    [leaving]
  );

  const className = ['welcome relative', skipped ? 'is-skipped' : '', leaving ? 'is-leaving' : ''].filter(Boolean).join(' ');

  return (
    <main className={className} aria-labelledby="welcome-title" aria-busy={leaving}>
      <div className="welcome-corner">
        <Button variant="ghost" size="sm" icon onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </Button>
      </div>

      <div className="welcome-inner">
        {/* The official mark, assembled from its own layers */}
        <div className="welcome-mark" role="img" aria-label="CodeConsist logo">
          {DEVLINGO_LOGO_LAYERS.map((layer) => (
            <img
              key={layer.id}
              src={layer.src}
              alt=""
              aria-hidden="true"
              width={640}
              height={512}
              decoding="async"
              draggable={false}
              className={`welcome-layer welcome-layer--${layer.id}`}
            />
          ))}
        </div>

        <h1 id="welcome-title" className="welcome-name">
          {NAME}
        </h1>

        <p className="welcome-tagline">
          {TAGLINE.map((word, i) => (
            <span key={word} className="welcome-word" style={{ '--i': i } as React.CSSProperties}>
              {word}
            </span>
          ))}
        </p>

        <div
          className="welcome-actions"
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget) focusEnter();
          }}
        >
          <Button ref={enterRef} variant="primary" size="lg" disabled={leaving} onClick={() => leave(onEnter)}>
            Enter CodeConsist
          </Button>
          <button type="button" className="welcome-secondary" disabled={leaving} onClick={() => leave(onExplore)}>
            Learn more about CodeConsist first
          </button>
        </div>
      </div>
    </main>
  );
};
