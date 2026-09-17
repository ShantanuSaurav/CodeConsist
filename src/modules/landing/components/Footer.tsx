import React from 'react';
import { Link } from 'react-router-dom';

const REPO = 'https://github.com/ShantanuSaurav/Devlingo';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-white dark:bg-[#0d1117] border-t border-black/5 dark:border-white/5 py-12 px-6">
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
        <div>
          <h4 className="font-bold text-gray-900 dark:text-white mb-4">Product</h4>
          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li><Link to="/dashboard/learn" className="hover:text-gray-900 dark:hover:text-white transition-colors">Learn</Link></li>
            <li><Link to="/dashboard/practice" className="hover:text-gray-900 dark:hover:text-white transition-colors">Playground</Link></li>
            <li><Link to="/dashboard/challenges" className="hover:text-gray-900 dark:hover:text-white transition-colors">Challenges</Link></li>
            <li><Link to="/dashboard/roadmap" className="hover:text-gray-900 dark:hover:text-white transition-colors">Roadmap</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-bold text-gray-900 dark:text-white mb-4">Community</h4>
          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li><Link to="/dashboard/leaderboard" className="hover:text-gray-900 dark:hover:text-white transition-colors">Leaderboard</Link></li>
            <li><Link to="/dashboard/achievements" className="hover:text-gray-900 dark:hover:text-white transition-colors">Achievements</Link></li>
            <li><a href={REPO} target="_blank" rel="noreferrer" className="hover:text-gray-900 dark:hover:text-white transition-colors">GitHub</a></li>
          </ul>
        </div>
        <div>
          <h4 className="font-bold text-gray-900 dark:text-white mb-4">Under the hood</h4>
          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li><a href={`${REPO}/blob/main/README.md`} target="_blank" rel="noreferrer" className="hover:text-gray-900 dark:hover:text-white transition-colors">How it works</a></li>
            <li><a href={`${REPO}/blob/main/docs/CONTENT_AUTHORING.md`} target="_blank" rel="noreferrer" className="hover:text-gray-900 dark:hover:text-white transition-colors">Writing challenges</a></li>
          </ul>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-4 group">
            <span className="text-[var(--color-primary)] font-mono">&lt;/&gt;</span>
            <span className="font-bold text-gray-900 dark:text-white tracking-tight">Devlingo</span>
          </div>
          <p className="text-sm text-gray-500">The professional platform for developers who want to keep growing.</p>
        </div>
      </div>
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center pt-8 border-t border-black/5 dark:border-white/5 text-xs text-gray-500">
        <p>© {new Date().getFullYear()} Devlingo. Built for curious developers.</p>
        <p className="mt-4 md:mt-0">Open source · runs entirely on your machine</p>
      </div>
    </footer>
  );
};
