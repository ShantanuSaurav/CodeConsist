import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, Moon, Sun, X } from 'lucide-react';
import { useSession } from '@/platform/session';
import { useTheme } from '@/platform/theme';
import { intents } from '@/platform/events';
import { Button, ButtonLink, DevlingoLogo, useBodyScrollLock, useFocusTrap } from '@/ui';

const LINKS = [
  { to: '/dashboard/learn', label: 'Learn' },
  { to: '/dashboard/challenges', label: 'Challenges' },
  { to: '/dashboard/practice', label: 'Playground' },
  { to: '/dashboard/roadmap', label: 'Roadmaps' },
  { to: '/dashboard/articles', label: 'Articles' },
  { to: '/dashboard/achievements', label: 'Achievements' },
  { to: '/dashboard/leaderboard', label: 'Leaderboard' }
];

/** Landing-page navigation. Inside the app the Sidebar takes over. */
export const Navbar: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, stats } = useSession();
  const { theme, toggleTheme } = useTheme();
  const openAuthModal = intents.openAuth;
  const navigate = useNavigate();
  const signedIn = Boolean(user && user.provider !== 'guest');
  const menuRef = useRef<HTMLDivElement>(null);
  useFocusTrap(menuRef, menuOpen);
  useBodyScrollLock(menuOpen);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1200px)');
    const close = () => { if (media.matches) setMenuOpen(false); };
    media.addEventListener('change', close);
    return () => media.removeEventListener('change', close);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      className={`landing-navbar glass ${scrolled ? 'is-compact' : ''} ${menuOpen ? 'is-open' : ''}`}
    >
      <div className="max-w-6xl mx-auto px-6 h-full flex items-center justify-between">
        <Link to="/" className="flex items-center" aria-label="CodeConsist home">
          <DevlingoLogo size="sm" wordmark />
        </Link>

        <div className="landing-nav-links">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} className="hover:text-fg transition-colors">
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </Button>

          {stats.xp > 0 && <span className="hidden sm:inline-flex badge badge-mono">{stats.xp.toLocaleString()} XP</span>}

          {signedIn ? (
            <Button size="sm" variant="secondary" onClick={() => navigate('/dashboard')}>
              Dashboard
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" className="hidden sm:inline-flex" onClick={openAuthModal}>
                Sign in
              </Button>
              <ButtonLink size="sm" variant="primary" to="/dashboard/learn" className="hidden sm:inline-flex">
                Start learning
              </ButtonLink>
            </>
          )}

          <Button
            variant="ghost"
            size="sm"
            icon
            className="landing-nav-toggle"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </Button>
        </div>
      </div>

      {menuOpen && (
        <div ref={menuRef} role="dialog" aria-modal="true" aria-label="Navigation" tabIndex={-1} className="landing-mobile-nav" onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setMenuOpen(false); } }}>
          <div className="landing-mobile-nav-heading"><span className="eyebrow">EXPLORE CODECONSIST</span><Button variant="ghost" icon aria-label="Close navigation" onClick={() => setMenuOpen(false)}><X size={18} /></Button></div>
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} onClick={() => setMenuOpen(false)} className="nav-item">
              {l.label}
            </Link>
          ))}
          {!signedIn && (
            <div className="flex gap-2 mt-2">
              <Button
                block
                onClick={() => {
                  setMenuOpen(false);
                  window.setTimeout(() => openAuthModal(), 0);
                }}
              >
                Sign in
              </Button>
              <ButtonLink block variant="primary" to="/dashboard/learn" onClick={() => setMenuOpen(false)}>
                Start learning
              </ButtonLink>
            </div>
          )}
        </div>
      )}
    </nav>
  );
};
