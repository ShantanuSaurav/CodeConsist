import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, Moon, Sun, X } from 'lucide-react';
import { useSession } from '@/platform/session';
import { useTheme } from '@/platform/theme';
import { intents } from '@/platform/events';
import { Button, ButtonLink, DevlingoLogo, MOTION, usePresence } from '@/ui';

const LINKS = [
  { to: '/dashboard/learn', label: 'Learn' },
  { to: '/dashboard/challenges', label: 'Challenges' },
  { to: '/dashboard/practice', label: 'Playground' },
  { to: '/dashboard/roadmap', label: 'Roadmaps' },
  { to: '/dashboard/leaderboard', label: 'Leaderboard' }
];

/**
 * Landing-page navigation. Inside the app the Sidebar takes over.
 *
 * Transparent over the hero; once the page scrolls under it the bar turns
 * into a frosted surface with a hairline (landing.css, `data-scrolled`). The
 * small-screen menu drops in and out with the shared `.menu-surface` motion,
 * and the bar keeps its surface until the menu has fully left. Escape closes
 * the menu and hands focus back to its toggle.
 */
export const Navbar: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = usePresence(menuOpen, MOTION.fast);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const { user, stats } = useSession();
  const { theme, toggleTheme } = useTheme();
  const openAuthModal = intents.openAuth;
  const navigate = useNavigate();
  const signedIn = Boolean(user && user.provider !== 'guest');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setMenuOpen(false);
      toggleRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <nav className="landing-nav fixed top-0 left-0 right-0 z-50 h-14" data-scrolled={scrolled || menu.mounted ? '' : undefined}>
      <div className="max-w-6xl mx-auto px-6 h-full flex items-center justify-between">
        <Link to="/" className="flex items-center rounded-xs" aria-label="CodeConsist home">
          <DevlingoLogo size="sm" wordmark />
        </Link>

        <div className="hidden md:flex items-center gap-6 text-sm text-fg-secondary">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} className="landing-nav-link hover:text-fg">
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </Button>

          {stats.xp > 0 && <span className="hidden sm:inline-flex badge badge-mono tabular-nums">{stats.xp.toLocaleString()} XP</span>}

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
            ref={toggleRef}
            variant="ghost"
            size="sm"
            icon
            className="md:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
            aria-controls="landing-menu"
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </Button>
        </div>
      </div>

      {menu.mounted && (
        <div
          id="landing-menu"
          className="landing-menu menu-surface md:hidden bg-bg border-b border-border px-6 pt-2 pb-4 flex flex-col gap-1 text-sm"
          data-state={menu.state}
        >
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
                  openAuthModal();
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
