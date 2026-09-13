import React, { useEffect, useRef, useState } from 'react';
import { useGame } from '../context/GameContext';
import { levelProgress } from '../lib/leveling';

export const Navbar: React.FC = () => {
  const {
    theme,
    toggleTheme,
    stats,
    user,
    serverStatus,
    openAuthModal,
    openSubModal,
    openPractice,
    resetProgress,
    logout
  } = useGame();

  const [isMobileOpen, setMobileOpen] = useState(false);
  const [isProfileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(() => {
    if (!isProfileOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
        setConfirmingReset(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setProfileOpen(false);
        setConfirmingReset(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [isProfileOpen]);

  const level = levelProgress(stats.xp);
  const closeMobile = () => setMobileOpen(false);

  return (
    <>
      <header className="nav">
        <a href="#top" className="nav-mark">
          CQ
        </a>

        <div className="nav-badges">
          <span className="streak-pill" title={`${stats.streak} day streak`}>
            🔥 {stats.streak}d
          </span>
          <span className="xp-pill" title={`${stats.xp} total XP`}>
            ⚡ {stats.xp} XP
          </span>
          <span className="lvl-pill" title={`${level.percent}% to level ${level.level + 1}`}>
            Lv {level.level}
          </span>
          {stats.isPremium && <span className="pro-pill">PRO</span>}
        </div>

        <nav className="nav-links">
          <a href="#journey">/path</a>
          <a href="#library">/challenges</a>
          <a href="#compiler">/playground</a>

          {!stats.isPremium && (
            <button type="button" className="nav-link-btn nav-link-pro" onClick={openSubModal}>
              /pro
            </button>
          )}

          <div className="profile-menu" ref={profileRef}>
            <button
              className="profile-btn"
              onClick={() => setProfileOpen((v) => !v)}
              aria-label="Account and settings"
              aria-expanded={isProfileOpen}
              aria-haspopup="dialog"
            >
              {user ? (
                <span className="profile-initial">{user.username.charAt(0).toUpperCase()}</span>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              )}
            </button>

            {isProfileOpen && (
              <div className="profile-dropdown open" role="group" aria-label="Account and settings">
                <div className="dropdown-header">
                  {user ? `Signed in as ${user.username}` : 'Not signed in'}
                </div>

                <div className="dropdown-item">
                  <span>Level</span>
                  <strong>
                    {level.level} · {level.percent}%
                  </strong>
                </div>

                <div className="dropdown-item">
                  <span>Membership</span>
                  <strong className={stats.isPremium ? 'is-pro' : ''}>
                    {stats.isPremium ? 'Pro' : 'Free'}
                  </strong>
                </div>

                <div className="dropdown-item">
                  <span>Server</span>
                  <strong className={`status-${serverStatus}`}>
                    {serverStatus === 'online'
                      ? 'connected'
                      : serverStatus === 'checking'
                        ? 'checking…'
                        : 'offline'}
                  </strong>
                </div>

                <div className="dropdown-item">
                  <span>Dark mode</span>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={theme === 'dark'}
                      onChange={toggleTheme}
                      aria-label="Toggle dark mode"
                    />
                    <span className="slider" />
                  </label>
                </div>

                {user ? (
                  <button
                    type="button"
                    className="btn btn-line dropdown-btn"
                    onClick={() => {
                      setProfileOpen(false);
                      logout();
                    }}
                  >
                    Sign out
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-solid dropdown-btn"
                    onClick={() => {
                      setProfileOpen(false);
                      openAuthModal();
                    }}
                  >
                    Sign in or register
                  </button>
                )}

                {/* Two-step rather than window.confirm, which is blocked in some
                    browsers and cannot be styled or keyboard-trapped properly. */}
                {confirmingReset ? (
                  <div className="dropdown-confirm">
                    <span>Erase all progress?</span>
                    <div>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmingReset(false)}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => {
                          setConfirmingReset(false);
                          setProfileOpen(false);
                          resetProgress();
                        }}
                      >
                        Erase
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost dropdown-btn dropdown-btn-quiet"
                    onClick={() => setConfirmingReset(true)}
                  >
                    Reset progress
                  </button>
                )}
              </div>
            )}
          </div>

          <button type="button" className="btn btn-solid nav-cta" onClick={() => openPractice()}>
            Practise →
          </button>
        </nav>

        <button
          className={`nav-toggle ${isMobileOpen ? 'open' : ''}`.trim()}
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle navigation menu"
          aria-expanded={isMobileOpen}
        >
          <span />
          <span />
        </button>
      </header>

      <div
        className={`nav-mobile ${isMobileOpen ? 'open' : ''}`.trim()}
        // @ts-expect-error - inert is in every current browser; React's typings lag.
        inert={isMobileOpen ? undefined : ''}
        aria-hidden={!isMobileOpen}
      >
        <a href="#journey" onClick={closeMobile}>
          /path
        </a>
        <a href="#library" onClick={closeMobile}>
          /challenges
        </a>
        <a href="#compiler" onClick={closeMobile}>
          /playground
        </a>
        {!stats.isPremium && (
          <button
            type="button"
            className="nav-link-pro"
            onClick={() => {
              closeMobile();
              openSubModal();
            }}
          >
            /pro
          </button>
        )}

        <div className="nav-mobile-row">
          <span>Dark mode</span>
          <label className="switch">
            <input type="checkbox" checked={theme === 'dark'} onChange={toggleTheme} aria-label="Toggle dark mode" />
            <span className="slider" />
          </label>
        </div>

        <button
          type="button"
          className="btn btn-solid nav-mobile-cta"
          onClick={() => {
            closeMobile();
            openPractice();
          }}
        >
          Start practising
        </button>

        {user ? (
          <button
            type="button"
            className="btn btn-line nav-mobile-cta"
            onClick={() => {
              closeMobile();
              logout();
            }}
          >
            Sign out ({user.username})
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-line nav-mobile-cta"
            onClick={() => {
              closeMobile();
              openAuthModal();
            }}
          >
            Sign in or register
          </button>
        )}
      </div>
    </>
  );
};
