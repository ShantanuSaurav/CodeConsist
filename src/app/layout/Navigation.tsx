import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Award, BookOpen, FileText, LayoutGrid, ListChecks, LogIn, LogOut, Menu as MenuIcon, Moon, Route, Settings, Sun, TerminalSquare, Trophy } from 'lucide-react';
import { useLeveling, useSession } from '@/platform/session';
import { useCopy } from '@/platform/settings';
import { useTheme } from '@/platform/theme';
import { intents } from '@/platform/events';
import { ROUTES } from '@/config/routes';
import { Avatar, DevlingoLogo, Dropdown, Menu, MenuItem, MenuSeparator, ProgressBar, Tooltip } from '@/ui';
import { HabitChip } from './HabitChip';

const navigation = [
  { label: 'Dashboard', to: ROUTES.dashboard, icon: LayoutGrid },
  { label: 'Learn', to: ROUTES.learn, icon: BookOpen },
  { label: 'Challenges', to: ROUTES.challenges, icon: ListChecks },
  { label: 'Articles', to: ROUTES.articles, icon: FileText },
  { label: 'Playground', to: ROUTES.playground, icon: TerminalSquare },
  { label: 'Roadmaps', to: ROUTES.roadmaps, icon: Route },
  { label: 'Leaderboard', to: ROUTES.leaderboard, icon: Trophy },
  { label: 'Achievements', to: ROUTES.achievements, icon: Award },
  { label: 'Settings', to: ROUTES.settings, icon: Settings }
];

export const TrackPicker: React.FC = () => {
  const { tracks, selectedTrackId, setSelectedTrack } = useSession();
  if (tracks.length < 2) return null;
  return <Dropdown value={selectedTrackId} onChange={setSelectedTrack} ariaLabel="Switch language track" className="app-track-picker" options={tracks.map(({ track, cleared, total }) => ({ value: track.id, label: track.label, hint: `${cleared}/${total}` }))} />;
};

export const AccountSummary: React.FC = () => {
  const { user, stats, serverStatus } = useSession();
  const { levelProgress } = useLeveling();
  const copy = useCopy();
  const level = levelProgress(stats.xp);
  const signedIn = Boolean(user && user.provider !== 'guest');
  const sync = serverStatus === 'online' ? copy(signedIn ? 'copy.sync.online' : 'copy.sync.guest') : serverStatus === 'checking' ? 'Checking…' : copy('copy.sync.offline');
  return <div className="app-account-summary">
    <div className="app-account-identity"><Avatar src={user?.avatarUrl} name={signedIn ? user!.username : 'Guest'} decorative /><div><strong>{signedIn ? user!.username : 'Guest'}</strong><span>Level {String(level.level).padStart(2, '0')} · {stats.xp.toLocaleString()} XP</span></div></div>
    <ProgressBar value={level.percent} size="sm" label={`${level.into} of ${level.needed} XP into level ${level.level}`} />
    <p className="app-sync"><span className={`app-status-dot ${serverStatus === 'online' ? 'is-online' : ''}`} aria-hidden="true" />{sync}</p>
  </div>;
};

export const NavigationLinks: React.FC<{ rail?: boolean; onNavigate?: () => void }> = ({ rail = false, onNavigate }) => {
  const { pathname } = useLocation();
  const articleOpen = /^\/dashboard\/learn\/[^/]+\/read/.test(pathname);
  return <nav className={rail ? 'app-rail glass' : 'app-sheet-links'} aria-label="Dashboard">
    {rail && <Link to={ROUTES.landing} className="app-rail-brand" aria-label="CodeConsist home"><DevlingoLogo size="md" /></Link>}
    {navigation.map(({ label, to, icon: Icon }) => {
      const active = label === 'Articles' ? articleOpen || pathname === to : label === 'Learn' ? !articleOpen && pathname === to : to === ROUTES.dashboard ? pathname === to : pathname.startsWith(to);
      const link = <Link to={to} aria-label={label} aria-current={active ? 'page' : false} onClick={onNavigate} className={`app-nav-link ${active ? 'is-active' : ''} ${label === 'Settings' ? 'app-nav-settings' : ''}`}><Icon size={19} aria-hidden="true" /><span>{label}</span></Link>;
      return rail ? <Tooltip key={to} content={label} placement="right">{link}</Tooltip> : <React.Fragment key={to}>{link}</React.Fragment>;
    })}
  </nav>;
};

export const TopBar: React.FC<{ drawerOpen: boolean; onOpen: () => void }> = ({ drawerOpen, onOpen }) => {
  const { user, stats, logout } = useSession();
  const { levelProgress } = useLeveling();
  const { theme, toggleTheme } = useTheme();
  const [compact, setCompact] = useState(false);
  const level = levelProgress(stats.xp);
  const signedIn = Boolean(user && user.provider !== 'guest');
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(() => { setCompact(window.scrollY > 8); frame = 0; });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); window.cancelAnimationFrame(frame); };
  }, []);
  return <header className={`app-topbar glass ${compact ? 'is-compact' : ''}`}>
    <Link to={ROUTES.landing} aria-label="CodeConsist home" className="app-topbar-brand"><DevlingoLogo size="sm" wordmark /></Link>
    <div className="app-topbar-track"><TrackPicker /></div>
    <div className="app-topbar-controls">
      <HabitChip compact />
      <div className="app-topbar-progress"><span>Lv {String(level.level).padStart(2, '0')} <b>·</b> {stats.xp.toLocaleString()} XP</span><ProgressBar value={level.percent} size="sm" label={`${level.into} of ${level.needed} XP into level ${level.level}`} /></div>
      <Menu align="end" ariaLabel="Account" menuClassName="app-account-menu" trigger={(props) => <button type="button" className="app-avatar-button" aria-label="Account menu" {...props}><Avatar src={user?.avatarUrl} name={signedIn ? user!.username : 'Guest'} size="sm" decorative /></button>}>
        <AccountSummary />
        <MenuSeparator />
        <MenuItem to={ROUTES.settings} icon={<Settings size={16} />}>Settings</MenuItem>
        <MenuItem onSelect={toggleTheme} icon={theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</MenuItem>
        {signedIn ? <MenuItem onSelect={() => { void logout(); }} icon={<LogOut size={16} />}>Sign out</MenuItem> : <MenuItem onSelect={() => window.setTimeout(() => intents.openAuth(), 0)} icon={<LogIn size={16} />}>Sign in to sync</MenuItem>}
      </Menu>
      <button type="button" className="app-menu-toggle btn btn-ghost btn-icon" onClick={onOpen} aria-label="Open navigation" aria-expanded={drawerOpen} aria-controls="app-navigation-sheet"><MenuIcon size={20} /></button>
    </div>
  </header>;
};
