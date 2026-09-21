import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button, DEVLINGO_LOGO_LAYERS } from '@/ui';
import { useTheme } from '@/platform/theme';
import '../styles/welcome.css';

interface WelcomeIntroProps {
  /** "Enter Devlingo" - continue into the application. */
  onEnter: () => void;
  /** The quiet alternative: skip into the landing page instead. */
  onExplore: () => void;
}

const NAME = 'Devlingo';
const TAGLINE = ['Learn.', 'Practice.', 'Build.'];
/* When the cursor's click lands (welcome.css) and how fast the name types. */
const TYPE_START_MS = 1450;
const TYPE_STEP_MS = 55;
/** How long the intro takes to fade out before the next screen appears. */
const LEAVE_MS = 320;

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * The introduction shown once at "/".
 *
 * The mark is assembled from its layers in sequence: the base draws from the
 * spine, the pages open, code symbols land like keystrokes, and the cursor
 * slides in to click. That click types the wordmark letter-by-letter behind
 * a caret, followed by the tagline and actions. Once loaded, the mark beats
 * with an accent glow. Choosing either action fades the intro out.
 */
export const WelcomeIntro: React.FC<WelcomeIntroProps> = ({ onEnter, onExplore }) => {
  const { theme, toggleTheme } = useTheme();
  const enterRef = useRef<HTMLButtonElement>(null);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const leave = useCallback(
    (next: () => void) => {
      if (leaving) return;
      if (reducedMotion()) {
        next();
        return;
      }
      setLeaving(true);
      timer.current = window.setTimeout(next, LEAVE_MS);
    },
    [leaving]
  );

  // The wordmark is typed one letter at a time so the caret can sit right
  // behind the last letter. Reduced motion shows the whole name at once.
  const [typed, setTyped] = useState(() => (reducedMotion() ? NAME.length : 0));
  useEffect(() => {
    if (reducedMotion()) return;
    const timers = NAME.split('').map((_, i) => window.setTimeout(() => setTyped(i + 1), TYPE_START_MS + i * TYPE_STEP_MS));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <main className={`welcome relative ${leaving ? 'is-leaving' : ''}`.trim()} aria-labelledby="welcome-title" aria-busy={leaving}>
      <div className="welcome-corner">
        <Button variant="ghost" size="sm" icon onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </Button>
      </div>

      <div className="welcome-inner">
        {/* The official mark, assembled from its own layers and beating after loading */}
        <div className="welcome-logo-wrap">
          <span className="welcome-logo-glow" aria-hidden="true" />
          <div className="welcome-mark" role="img" aria-label="Devlingo logo">
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
        </div>

        <h1 id="welcome-title" className="welcome-name" aria-label={NAME}>
          {/* A hidden copy of the full name reserves its width, so the letters
              type from the left instead of growing out of the centre. */}
          <span className="welcome-name-box" aria-hidden="true">
            <span className="welcome-name-ghost">{NAME}</span>
            <span className="welcome-name-typed">
              {NAME.slice(0, typed)}
              <span className="welcome-caret" />
            </span>
          </span>
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
            if (e.target === e.currentTarget) enterRef.current?.focus({ preventScroll: true });
          }}
        >
          <Button ref={enterRef} variant="primary" size="lg" disabled={leaving} onClick={() => leave(onEnter)}>
            Enter Devlingo
          </Button>
          <button type="button" className="welcome-secondary" disabled={leaving} onClick={() => leave(onExplore)}>
            Learn more about Devlingo first
          </button>
        </div>
      </div>
    </main>
  );
};
