import React, { useRef } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button, DEVLINGO_LOGO_URL } from '@/ui';
import { useTheme } from '@/platform/theme';
import '../styles/welcome.css';

interface WelcomeIntroProps {
  /** "Enter Devlingo" - continue into the application. */
  onEnter: () => void;
  /** The quiet alternative: skip into the landing page instead. */
  onExplore: () => void;
}

/**
 * The introduction shown once at "/": the mark, the name, the tagline, the
 * way in. Timing lives in welcome.css. Nothing here is gated on the
 * animation - the buttons work the moment they exist, and a keyboard user
 * lands on the primary action as soon as it has appeared.
 */
export const WelcomeIntro: React.FC<WelcomeIntroProps> = ({ onEnter, onExplore }) => {
  const { theme, toggleTheme } = useTheme();
  const enterRef = useRef<HTMLButtonElement>(null);

  return (
    <main className="welcome relative" aria-labelledby="welcome-title">
      <div className="welcome-corner">
        <Button variant="ghost" size="sm" icon onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </Button>
      </div>

      <div className="welcome-inner">
        {/* The official mark, straight from the brand asset - the same file every
            other DevlingoLogo renders, just larger. */}
        <img src={DEVLINGO_LOGO_URL} alt="" aria-hidden="true" width={640} height={512} decoding="async" draggable={false} className="welcome-logo" />
        <h1 id="welcome-title" className="welcome-name">
          Devlingo
        </h1>
        <p className="welcome-tagline">Learn. Practice. Build.</p>

        <div className="welcome-actions">
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
