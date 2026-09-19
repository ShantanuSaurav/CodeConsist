import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  Award,
  BookOpen,
  Home,
  LogIn,
  LogOut,
  Map,
  Moon,
  Settings,
  Sun,
  Swords,
  TerminalSquare,
  Trophy,
  User,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useSession } from '@/platform/session';
import { useTheme } from '@/platform/theme';
import { intents } from '@/platform/events';
import { levelProgress } from '@/platform/xp-leveling/leveling';
import { ROUTES } from '@/config/routes';
import { Dropdown } from '@/ui';

const NAV = [
  { icon: <Home size={20} />, label: 'Dashboard', path: ROUTES.dashboard, exact: true },
  { icon: <BookOpen size={20} />, label: 'Learn', path: ROUTES.learn },
  { icon: <Swords size={20} />, label: 'Challenges', path: ROUTES.challenges },
  { icon: <TerminalSquare size={20} />, label: 'Playground', path: ROUTES.playground },
  { icon: <Map size={20} />, label: 'Roadmaps', path: ROUTES.roadmaps },
  { icon: <Trophy size={20} />, label: 'Leaderboard', path: ROUTES.leaderboard },
  { icon: <Award size={20} />, label: 'Achievements', path: ROUTES.achievements }
];

interface SidebarProps {
  /** Called after any navigation, so a mobile drawer can close itself. */
  onNavigate?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onNavigate }) => {
  const { user, stats, logout, serverStatus, tracks, selectedTrackId, setSelectedTrack } = useSession();
  const { theme, toggleTheme } = useTheme();
  const openAuthModal = intents.openAuth;
  const level = levelProgress(stats.xp);
  const signedIn = Boolean(user && user.provider !== 'guest');

  return (
    <div className="w-64 h-full border-r border-black/5 dark:border-white/5 bg-white dark:bg-[#0d1117] flex flex-col overflow-y-auto scroll-thin">
      <div className="px-5 pt-5 pb-3 flex-1">
        <Link to="/" className={`text-2xl font-bold flex items-center gap-2 ${tracks.length > 1 ? 'mb-4' : 'mb-6'}`} onClick={onNavigate}>
          <span className="text-[var(--color-primary)] font-mono">&lt;/&gt;</span>
          <span className="text-gray-900 dark:text-white">Devlingo</span>
        </Link>

        {/* Persistent track switcher - always visible, always changeable,
            not just on the Learn page's track-selection row. */}
        {tracks.length > 1 && (
          <div className="mb-4">
            <Dropdown
              value={selectedTrackId}
              onChange={setSelectedTrack}
              className="w-full"
              size="md"
              options={tracks.map(({ track, cleared, total }) => ({
                value: track.id,
                label: track.label,
                icon: <span className="text-base">{track.icon}</span>,
                hint: `(${cleared}/${total})`
              }))}
              ariaLabel="Switch language track"
            />
          </div>
        )}

        <nav className="space-y-1" aria-label="Dashboard">
          {NAV.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.exact}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium border border-[var(--color-primary)]/20'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 border border-transparent'
                }`
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="px-5 pt-4 pb-5 border-t border-black/5 dark:border-white/5 shrink-0">
        <button
          type="button"
          onClick={toggleTheme}
          className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors mb-0.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          aria-pressed={theme === 'dark'}
        >
          <div className="flex items-center space-x-3">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            <span className="text-sm font-medium">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </div>
          <div className="w-8 h-4 bg-black/10 dark:bg-white/10 rounded-full relative">
            <div
              className={`w-3 h-3 rounded-full absolute top-0.5 transition-all ${
                theme === 'dark' ? 'bg-white right-0.5' : 'bg-gray-600 left-0.5'
              }`}
            />
          </div>
        </button>

        <NavLink
          to={ROUTES.settings}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center space-x-3 px-3 py-1.5 rounded-lg transition-colors mb-0.5 text-sm font-medium ${
              isActive
                ? 'text-[var(--color-primary)] bg-[var(--color-primary)]/10'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
            }`
          }
        >
          <Settings size={18} />
          <span>Settings</span>
        </NavLink>

        {signedIn ? (
          <button
            type="button"
            onClick={() => {
              onNavigate?.();
              logout();
            }}
            className="w-full flex items-center space-x-3 px-3 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors mb-3 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium"
          >
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              onNavigate?.();
              openAuthModal();
            }}
            className="w-full flex items-center space-x-3 px-3 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors mb-3 text-[var(--color-primary)] text-sm font-medium"
          >
            <LogIn size={18} />
            <span>Sign in to sync</span>
          </button>
        )}

        <div className="flex items-center space-x-3 bg-gray-50 dark:bg-[#161b22] p-3 rounded-xl border border-black/5 dark:border-white/5">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[var(--color-primary)] to-[var(--color-secondary)] p-[2px] shrink-0">
            <div className="w-full h-full bg-gray-50 dark:bg-[#161b22] rounded-full flex items-center justify-center overflow-hidden font-bold text-gray-700 dark:text-gray-200">
              {signedIn ? user!.username.charAt(0).toUpperCase() : <User size={20} className="text-gray-500" />}
            </div>
          </div>
          <div className="overflow-hidden flex-1">
            <div className="text-gray-900 dark:text-white font-medium text-sm truncate">
              {signedIn ? user!.username : 'Guest'}
            </div>
            <div className="text-[var(--color-primary)] text-xs font-mono flex items-center gap-2">
              Level {String(level.level).padStart(2, '0')}
              <span
                className={serverStatus === 'online' ? 'text-gray-400' : 'text-amber-500'}
                title={serverStatus === 'online' ? 'Connected to the API' : 'API offline - progress is saved in this browser'}
              >
                {serverStatus === 'online' ? <Wifi size={12} /> : <WifiOff size={12} />}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
