import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, Moon, Sun, X, Zap } from 'lucide-react';
import { useGame } from '../../context/GameContext';

const LINKS = [
  { to: '/dashboard/learn', label: 'Learn' },
  { to: '/dashboard/practice', label: 'Playground' },
  { to: '/dashboard/challenges', label: 'Challenges' },
  { to: '/dashboard/roadmap', label: 'Roadmaps' },
  { to: '/dashboard/leaderboard', label: 'Leaderboard' }
];

/** Landing-page navigation. Inside the app the Sidebar takes over. */
export const Navbar: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggleTheme, user, stats, openAuthModal } = useGame();
  const navigate = useNavigate();
  const signedIn = Boolean(user && user.provider !== 'guest');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ease-in-out border-b ${
        scrolled || menuOpen
          ? 'bg-white/90 dark:bg-[#0d1117]/85 backdrop-blur-md py-3 border-black/5 dark:border-white/5 shadow-lg'
          : 'bg-transparent py-5 border-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold flex items-center gap-2 group">
          <span className="text-[var(--color-primary)] font-mono opacity-80 group-hover:opacity-100 transition-opacity">
            &lt;/&gt;
          </span>
          <span className="tracking-tight text-gray-900 dark:text-white">Devlingo</span>
        </Link>

        <div className="hidden md:flex items-center space-x-8 text-sm font-medium text-gray-600 dark:text-gray-400">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} className="hover:text-gray-900 dark:hover:text-white transition-colors">
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center space-x-4">
          <button
            type="button"
            onClick={toggleTheme}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {stats.xp > 0 && (
            <div className="hidden sm:flex items-center space-x-1 text-[var(--color-primary)] font-mono text-sm font-bold bg-[var(--color-primary)]/10 px-3 py-1.5 rounded-full border border-[var(--color-primary)]/20">
              <Zap size={14} fill="currentColor" />
              <span>{stats.xp.toLocaleString()} XP</span>
            </div>
          )}

          {signedIn ? (
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="w-8 h-8 rounded-full bg-gradient-to-tr from-[var(--color-primary)] to-[var(--color-secondary)] p-[2px]"
              aria-label="Open your dashboard"
            >
              <div className="w-full h-full bg-gray-50 dark:bg-[#161b22] rounded-full flex items-center justify-center overflow-hidden text-xs font-bold text-gray-700 dark:text-gray-200">
                {user!.username.charAt(0).toUpperCase()}
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={openAuthModal}
              className="hidden sm:inline-flex px-5 py-2 bg-[var(--color-primary)] text-white dark:text-black font-bold rounded-lg hover:brightness-110 transition text-sm"
            >
              Log In
            </button>
          )}

          <button
            type="button"
            className="md:hidden text-gray-600 dark:text-gray-300"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="md:hidden max-w-7xl mx-auto px-6 pt-4 pb-2 flex flex-col gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setMenuOpen(false)}
              className="px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
            >
              {l.label}
            </Link>
          ))}
          {!signedIn && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                openAuthModal();
              }}
              className="mt-2 px-5 py-2.5 bg-[var(--color-primary)] text-white dark:text-black font-bold rounded-lg text-sm"
            >
              Log In
            </button>
          )}
        </div>
      )}
    </nav>
  );
};
