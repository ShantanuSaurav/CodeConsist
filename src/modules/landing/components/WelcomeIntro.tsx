import React, { useEffect, useRef, useState } from 'react';
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

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * The introduction shown once at "/".
 *
 * The mark is not faded in - it is built. The base draws outward from the
 * spine, the two pages open, the code symbols land like keystrokes, the
 * cursor slides in and clicks, and that click types the wordmark letter by
 * letter behind a caret. Then the tagline, then the way in. About 2.4 s;
 * every timing lives in welcome.css. Nothing is gated on the animation - the
 * buttons work from first paint, and a keyboard user is placed on the primary
 * action as soon as it has appeared. Reduced motion shows the finished frame.
 */
export const WelcomeIntro: React.FC<WelcomeIntroProps> = ({ onEnter, onExplore }) => {
  const { theme, toggleTheme } = useTheme();
  const enterRef = useRef<HTMLButtonElement>(null);

  // The wordmark is typed one letter at a time so the caret can sit right
  // behind the last letter. Reduced motion shows the whole name at once.
  const [typed, setTyped] = useState(() => (reducedMotion() ? NAME.length : 0));
  useEffect(() => {
    if (reducedMotion()) return;
    const timers = NAME.split('').map((_, i) => window.setTimeout(() => setTyped(i + 1), TYPE_START_MS + i * TYPE_STEP_MS));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <main className="welcome" aria-labelledby="welcome-title">
      <div className="welcome-corner">
        <Button variant="ghost" size="sm" icon onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </Button>
      </div>

      <div className="welcome-inner">
        {/* The official mark, assembled from its own layers. Stacked, they are
            exactly the asset every DevlingoLogo renders. */}
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
          <Button ref={enterRef} variant="primary" size="lg" onClick={onEnter}>
            Enter Devlingo
          </Button>
          <button type="button" className="welcome-secondary" onClick={onExplore}>
            Learn more about Devlingo first
          </button>
        </div>
      </div>
    </main>
  );
};
