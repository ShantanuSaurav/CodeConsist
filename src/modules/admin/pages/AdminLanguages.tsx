import React, { useEffect, useState } from 'react';
import { AdminLanguageRow, adminApi } from '../services/adminApi';
import { AdminPageHeader, Badge, Card, EmptyState, ErrorText, Spinner, Table, Toggle } from '../components/ui';

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
      <AdminPageHeader
        title="Languages"
        description="The same language tracks learners pick from on the Learn page. Hide one to unpublish it without deleting any content."
      />

      {error && <ErrorText>{error}</ErrorText>}

      {!languages ? (
        <Spinner />
      ) : languages.length === 0 ? (
        <EmptyState>No language tracks found.</EmptyState>
      ) : (
        <Card className="p-0 overflow-hidden">
          <Table>
            <thead>
              <tr>
                <th>Track</th>
                <th>Stages</th>
                <th>Challenges</th>
                <th>Status</th>
                <th className="text-right">Published</th>
              </tr>
            </thead>
            <tbody>
              {languages.map((lang) => (
                <tr key={lang.id}>
                  <td>
                    <div className="cell-primary">{lang.label}</div>
                    <div className="text-xs text-fg-muted line-clamp-1 max-w-lg">{lang.description}</div>
                  </td>
                  <td className="cell-num">{lang.stageCount}</td>
                  <td className="cell-num">{lang.challengeCount}</td>
                  <td>
                    {lang.hidden ? <Badge tone="warning">Hidden</Badge> : <Badge tone="success">Live</Badge>}
                    {busyId === lang.id && <span className="ml-2 text-xs text-fg-muted">Saving…</span>}
                  </td>
                  <td>
                    <div className="flex justify-end">
                      <Toggle label="" checked={!lang.hidden} onChange={() => toggleHidden(lang)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
};
