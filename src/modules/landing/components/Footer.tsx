import React from 'react';
import { Link } from 'react-router-dom';

const REPO = 'https://github.com/ShantanuSaurav/Devlingo';

const COLUMNS: Array<{ title: string; links: Array<{ label: string; to?: string; href?: string }> }> = [
  {
    title: 'Product',
    links: [
      { label: 'Learn', to: '/dashboard/learn' },
      { label: 'Challenges', to: '/dashboard/challenges' },
      { label: 'Playground', to: '/dashboard/practice' },
      { label: 'Roadmaps', to: '/dashboard/roadmap' }
    ]
  },
  {
    title: 'Community',
    links: [
      { label: 'Leaderboard', to: '/dashboard/leaderboard' },
      { label: 'Achievements', to: '/dashboard/achievements' },
      { label: 'GitHub', href: REPO }
    ]
  },
  {
    title: 'Under the hood',
    links: [
      { label: 'How it works', href: `${REPO}/blob/main/README.md` },
      { label: 'Writing challenges', href: `${REPO}/blob/main/docs/CONTENT_AUTHORING.md` }
    ]
  }
];

export const Footer: React.FC = () => (
  <footer className="border-t border-border">
    <div className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
      <div className="col-span-2 md:col-span-1">
        <div className="flex items-center gap-2 mb-3">
          <span className="font-mono text-xs text-accent" aria-hidden="true">
            &lt;/&gt;
          </span>
          <span className="font-semibold text-fg tracking-tight">Devlingo</span>
        </div>
        <p className="text-sm text-fg-muted max-w-xs">The developer training environment. Open source; runs entirely on your machine.</p>
      </div>
      {COLUMNS.map((col) => (
        <div key={col.title}>
          <h4 className="text-xs font-mono uppercase tracking-wider text-fg-muted mb-3">{col.title}</h4>
          <ul className="space-y-2 text-sm text-fg-secondary">
            {col.links.map((l) => (
              <li key={l.label}>
                {l.to ? (
                  <Link to={l.to} className="hover:text-fg transition-colors">
                    {l.label}
                  </Link>
                ) : (
                  <a href={l.href} target="_blank" rel="noreferrer" className="hover:text-fg transition-colors">
                    {l.label}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
    <div className="max-w-6xl mx-auto px-6 py-5 border-t border-border-subtle flex flex-col md:flex-row justify-between gap-2 text-xs text-fg-muted">
      <p>© {new Date().getFullYear()} Devlingo</p>
      <p>Built for curious developers.</p>
    </div>
  </footer>
);
