import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  Award,
  BookOpen,
  LayoutGrid,
  ListChecks,
  LogIn,
  LogOut,
  Moon,
  Route,
  Settings,
  Sun,
  TerminalSquare,
  Trophy,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useSession } from '@/platform/session';
import { useTheme } from '@/platform/theme';
import { intents } from '@/platform/events';
import { levelProgress } from '@/platform/xp-leveling/leveling';
import { ROUTES } from '@/config/routes';
import { Dropdown, ProgressBar } from '@/ui';

const ICON = 16;

const GROUPS: Array<{ label: string; items: Array<{ icon: React.ReactNode; label: string; path: string; exact?: boolean }> }> = [
  {
    label: 'Learn',
    items: [
      { icon: <LayoutGrid size={ICON} />, label: 'Dashboard', path: ROUTES.dashboard, exact: true },
      { icon: <BookOpen size={ICON} />, label: 'Learn', path: ROUTES.learn },
      { icon: <ListChecks size={ICON} />, label: 'Challenges', path: ROUTES.challenges },
      { icon: <TerminalSquare size={ICON} />, label: 'Playground', path: ROUTES.playground }
    ]
  },
  {
    label: 'Discover',
    items: [
      { icon: <Route size={ICON} />, label: 'Roadmaps', path: ROUTES.roadmaps },
      { icon: <Trophy size={ICON} />, label: 'Leaderboard', path: ROUTES.leaderboard },
      { icon: <Award size={ICON} />, label: 'Achievements', path: ROUTES.achievements }
    ]
  }
];

interface SidebarProps {
  /** Called after any navigation, so a mobile drawer can close itself. */
  onNavigate?: () => void;
}

/**
 * The application's left rail. Grouped navigation, the track switcher, and a
 * compact identity block at the bottom. The active item is marked by a
 * slightly raised surface and an accent icon - nothing louder.
 */
export const Sidebar: React.FC<SidebarProps> = ({ onNavigate }) => {
  const { user, stats, logout, serverStatus, tracks, selectedTrackId, setSelectedTrack } = useSession();
  const { theme, toggleTheme } = useTheme();
  const openAuthModal = intents.openAuth;
  const level = levelProgress(stats.xp);
  const signedIn = Boolean(user && user.provider !== 'guest');

  return (
    <div className="w-64 h-full border-r border-border bg-surface flex flex-col">
      <div className="px-3 pt-4 pb-3 flex-1 overflow-y-auto scroll-thin">
        <Link
          to="/"
          className="flex items-center gap-2 px-3 h-8 mb-4 text-fg font-semibold tracking-tight"
          onClick={onNavigate}
        >
          <span className="font-mono text-xs text-accent" aria-hidden="true">
            &lt;/&gt;
          </span>
          <span>Devlingo</span>
        </Link>

        {/* Persistent track switcher - always visible, always changeable. */}
        {tracks.length > 1 && (
          <div className="px-1 mb-2">
            <Dropdown
              value={selectedTrackId}
              onChange={setSelectedTrack}
              className="w-full"
              size="md"
              options={tracks.map(({ track, cleared, total }) => ({
                value: track.id,
                label: track.label,
                hint: `${cleared}/${total}`
              }))}
              ariaLabel="Switch language track"
            />
          </div>
        )}

        <nav aria-label="Dashboard">
          {GROUPS.map((group) => (
            <div key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      end={item.exact}
                      onClick={onNavigate}
                      className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`.trim()}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="nav-group-label">
            <span className="sr-only">Account</span>
          </div>
          <ul className="space-y-0.5">
            <li>
              <NavLink
                to={ROUTES.settings}
                onClick={onNavigate}
                className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`.trim()}
              >
                <Settings size={ICON} />
                <span>Settings</span>
              </NavLink>
            </li>
            <li>
              <button type="button" onClick={toggleTheme} className="nav-item w-full text-left" aria-pressed={theme === 'dark'}>
                {theme === 'dark' ? <Sun size={ICON} /> : <Moon size={ICON} />}
                <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
              </button>
            </li>
            <li>
              {signedIn ? (
                <button
                  type="button"
                  onClick={() => {
                    onNavigate?.();
                    logout();
                  }}
                  className="nav-item w-full text-left"
                >
                  <LogOut size={ICON} />
                  <span>Sign out</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onNavigate?.();
                    openAuthModal();
                  }}
                  className="nav-item w-full text-left"
                >
                  <LogIn size={ICON} />
                  <span>Sign in to sync</span>
                </button>
              )}
            </li>
          </ul>
        </nav>
      </div>

      {/* Identity */}
      <div className="px-4 py-3 border-t border-border shrink-0">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-sm bg-surface-3 border border-border flex items-center justify-center text-xs font-semibold text-fg-secondary shrink-0"
            aria-hidden="true"
          >
            {signedIn ? user!.username.charAt(0).toUpperCase() : 'G'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-fg truncate">{signedIn ? user!.username : 'Guest'}</div>
            <div className="text-xs text-fg-muted font-mono flex items-center gap-1.5">
              <span>Level {String(level.level).padStart(2, '0')}</span>
              <span aria-hidden="true">·</span>
              <span>{stats.xp.toLocaleString()} XP</span>
              <span
                className={`ml-auto ${serverStatus === 'online' ? 'text-fg-muted' : 'text-warning'}`}
                title={serverStatus === 'online' ? 'Connected to the API' : 'API offline - progress is saved in this browser'}
              >
                {serverStatus === 'online' ? <Wifi size={11} /> : <WifiOff size={11} />}
              </span>
            </div>
          </div>
        </div>
        <ProgressBar value={level.percent} size="sm" className="mt-2.5" label={`${level.into} of ${level.needed} XP into level ${level.level}`} />
      </div>
    </div>
  );
};
