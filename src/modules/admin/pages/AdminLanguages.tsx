import React, { useEffect, useState } from 'react';
import { AdminLanguageRow, adminApi } from '../services/adminApi';
import { Badge, Card, EmptyState, Spinner, Toggle } from '../components/ui';

/**
 * /admin/languages. One row per src/data/tracks.ts language track. "Hidden"
 * is the publish/unpublish control: a hidden track disappears from
 * /api/content entirely (see applyLearnerOverrides in server/content.js), so
 * learners never see a half-finished language, while it still shows up here
 * with a switch to bring it back.
 */
export const AdminLanguages: React.FC = () => {
  const [languages, setLanguages] = useState<AdminLanguageRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .languages()
      .then((res) => setLanguages(res.languages))
      .catch((err) => setError(err.message ?? 'Failed to load languages.'));
  }, []);

  const toggleHidden = async (lang: AdminLanguageRow) => {
    setBusyId(lang.id);
    setError(null);
    try {
      await adminApi.updateLanguage(lang.id, { hidden: !lang.hidden });
      setLanguages((prev) => prev?.map((l) => (l.id === lang.id ? { ...l, hidden: !l.hidden } : l)) ?? null);
    } catch (err: any) {
      setError(err.message ?? 'Could not update that language.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Languages</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        These are the same language tracks learners pick from on the Learn page - hide one to unpublish it without deleting any content.
      </p>

      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      {!languages ? (
        <Spinner />
      ) : languages.length === 0 ? (
        <EmptyState>No language tracks found.</EmptyState>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {languages.map((lang) => (
            <Card key={lang.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{lang.icon}</span>
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                      {lang.label}
                      {lang.hidden && <Badge tone="warning">Hidden</Badge>}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{lang.tagline}</div>
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">{lang.description}</p>
              <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 dark:text-gray-400">
                <span>{lang.stageCount} stages</span>
                <span>{lang.challengeCount} challenges</span>
              </div>
              <div className="mt-3 pt-3 border-t border-black/5 dark:border-white/5">
                <Toggle
                  label={lang.hidden ? 'Unpublish (hidden from learners)' : 'Published'}
                  checked={!lang.hidden}
                  onChange={() => toggleHidden(lang)}
                />
              </div>
              {busyId === lang.id && <div className="text-xs text-gray-400 mt-1">Saving…</div>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
