import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { applySettingsPatch, getPath, mergeSettings, overrideLeaves, patchFromEdits } from '@/platform/settings';
import { SETTING_META, pathsInSection } from '@/platform/settings/meta';
import type { Settings, SettingsIssue } from '@/platform/settings';
import { patchIssues } from '@/platform/settings/schema';
import { AdminApiError, adminApi } from '../services/adminApi';
import type { AdminSettingsView, SettingsContext } from '../services/adminApi';
import { AdminPageHeader, Badge, Button, Card, ConfirmDialog, ErrorText, Spinner } from '../components/ui';
import { GenericSection } from '../components/settings/GenericSection';
import type { SectionProps } from '../components/settings/GenericSection';
import { SECTIONS, sectionById } from '../components/settings/sections';

function hasOwn(map: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, key);
}

/** Sections reached from their own navigation item, with their own page heading. */
const OWN_PAGES: Partial<Record<string, { title: string; description: string }>> = {
  copy: {
    title: 'Site copy',
    description: 'What learners and visitors read: offline and error messages, the landing page, limits and premium messages. Changes apply without a redeploy.'
  },
  access: {
    title: 'Limits & access',
    description: 'Rate limits, code-runner capacity, the proxy chain, CORS, the server-side premium lock and reset links. Applied to the next request.'
  }
};

function shortDate(iso: string | null): string {
  if (!iso) return '';
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '' : at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * /admin/rules and /admin/rules/:sectionId - every learning rule, number and
 * piece of copy, edited in one place.
 *
 * Nothing here is saved until Save: edits are kept as `{ path: value }`
 * (`null` = put the default back), checked locally with the same zod schema
 * the server uses, then sent as a sparse patch against the revision they
 * were made on. The server answers 409 if someone saved in between (the
 * edits are kept - reload and save again) and 422 with the problems tied to
 * their fields. Learners pick up a saved change within one health probe
 * (30 seconds); the server applies it to the very next request.
 */
export const AdminRules: React.FC = () => {
  const { sectionId } = useParams();
  const navigate = useNavigate();
  const section = sectionById(sectionId) ?? SECTIONS[0];

  const [view, setView] = useState<AdminSettingsView | null>(null);
  const [context, setContext] = useState<SettingsContext | null>(null);
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const [issues, setIssues] = useState<SettingsIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  /** The stored path an admin asked to remove from the "being ignored" card, awaiting confirmation. */
  const [removing, setRemoving] = useState<string | null>(null);

  const loadContext = useCallback(() => {
    adminApi
      .settingsContext()
      .then(setContext)
      .catch(() => setContext(null));
  }, []);

  const load = useCallback(async () => {
    try {
      setView(await adminApi.settings());
      setConflict(null);
      setError(null);
    } catch (err: any) {
      setError(err.message ?? 'Could not load the settings.');
    }
    loadContext();
  }, [loadContext]);

  useEffect(() => {
    load();
  }, [load]);

  const savedLeaves = useMemo(() => overrideLeaves(view?.overrides ?? {}), [view]);
  const pendingOverrides = useMemo(() => (view ? applySettingsPatch(view.overrides, patchFromEdits(edits)).overrides : {}), [view, edits]);
  const draft = useMemo<Settings | null>(() => (view ? mergeSettings(view.defaults, pendingOverrides) : null), [view, pendingOverrides]);
  const dirtyCount = Object.keys(edits).length;

  const changesIn = useCallback(
    (id: string) => {
      const paths = new Set([...Object.keys(savedLeaves), ...Object.keys(edits)].filter((path) => path.startsWith(`${id}.`)));
      return [...paths].filter((path) => (hasOwn(edits, path) ? edits[path] !== null : true)).length;
    },
    [savedLeaves, edits]
  );

  if (error && !view) return <ErrorText>{error}</ErrorText>;
  if (!view || !draft) return <Spinner label="Loading the rules…" />;

  const onChange = (path: string, value: unknown) => {
    setNotice(null);
    setEdits((prev) => {
      const next = { ...prev };
      if (JSON.stringify(value) === JSON.stringify(getPath(view.settings, path)) && !(hasOwn(prev, path) && prev[path] === null)) delete next[path];
      else next[path] = value;
      return next;
    });
  };

  const onReset = (path: string) => {
    setNotice(null);
    setEdits((prev) => {
      const next = { ...prev };
      if (hasOwn(savedLeaves, path)) next[path] = null;
      else delete next[path];
      return next;
    });
  };

  const issueFor = (path: string): string | undefined => {
    const exact = issues.find((issue) => issue.path === path);
    if (exact) return exact.message;
    // A list's problems sit on its items (`levels.thresholds.3`); rows show theirs per cell.
    if (SETTING_META[path]?.kind === 'rows') return undefined;
    return issues.find((issue) => issue.path.startsWith(`${path}.`))?.message;
  };

  const sectionProps: SectionProps = {
    sectionId: section.id,
    draft,
    saved: view.settings,
    valueOf: (path) => getPath(draft, path),
    defaultOf: (path) => getPath(view.defaults, path),
    isOverridden: (path) => (hasOwn(edits, path) ? edits[path] !== null : hasOwn(savedLeaves, path)),
    isEdited: (path) => hasOwn(edits, path),
    fromEnv: (path) => hasOwn(view.env ?? {}, path),
    issueFor,
    onChange,
    onReset,
    context
  };

  const save = async () => {
    const patch = patchFromEdits(edits);
    // The same check the server runs: only what this patch sets, and the
    // sections it touches - a stored value it leaves alone never blocks it.
    const local = patchIssues(patch, pendingOverrides, draft);
    if (local.length) {
      setIssues(local);
      setNotice(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const next = await adminApi.updateSettings(view.revision, patch);
      setView(next);
      setEdits({});
      setIssues([]);
      setConflict(null);
      setNotice(`Saved as revision ${next.revision}. The server uses it now; open learner tabs pick it up within 30 seconds.`);
      loadContext();
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 409) {
        setConflict(Number((err.payload as { revision?: number } | null)?.revision ?? NaN));
      } else if (err instanceof AdminApiError && err.status === 422) {
        setIssues(((err.payload as { issues?: SettingsIssue[] } | null)?.issues ?? []) as SettingsIssue[]);
        setError(err.message);
      } else {
        setError((err as Error).message ?? 'Could not save.');
      }
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setEdits({});
    setIssues([]);
    setNotice(null);
  };

  const resetSection = async () => {
    setSaving(true);
    try {
      const next = await adminApi.updateSettings(view.revision, { [section.id]: null });
      setView(next);
      setEdits((prev) => Object.fromEntries(Object.entries(prev).filter(([path]) => !path.startsWith(`${section.id}.`))));
      setIssues([]);
      setNotice(`${section.title} is back to its defaults (revision ${next.revision}).`);
      loadContext();
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 409) setConflict(Number((err.payload as { revision?: number } | null)?.revision ?? NaN));
      else setError((err as Error).message ?? 'Could not reset the section.');
    } finally {
      setSaving(false);
      setConfirmingReset(false);
    }
  };

  /**
   * The stored override a server issue sits under - the value itself, or the
   * setting holding it (`levels.thresholds` for `levels.thresholds.3`) - so
   * the card can offer to remove it. Null when nothing stored matches.
   */
  const storedPathFor = (issuePath: string): string | null =>
    Object.keys(savedLeaves).find((path) => issuePath === path || issuePath.startsWith(`${path}.`)) ?? null;

  /** Remove one stored value the server is ignoring - a key this version does not know, say. */
  const removeStored = async (path: string) => {
    setSaving(true);
    setError(null);
    try {
      const next = await adminApi.updateSettings(view.revision, patchFromEdits({ [path]: null }));
      setView(next);
      setNotice(`Removed the stored value "${path}" (revision ${next.revision}).`);
      loadContext();
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 409) setConflict(Number((err.payload as { revision?: number } | null)?.revision ?? NaN));
      else setError((err as Error).message ?? 'Could not remove it.');
    } finally {
      setSaving(false);
      setRemoving(null);
    }
  };

  const reloadKeepingEdits = async () => {
    try {
      setView(await adminApi.settings());
      setConflict(null);
    } catch (err: any) {
      setError(err.message ?? 'Could not reload.');
    }
  };

  const Body = section.Component ?? GenericSection;
  const sectionChanges = changesIn(section.id);
  const serverIssues = view.issues ?? [];
  // Site copy and Limits & access have their own entries in the admin
  // navigation; the page says which one it is.
  const heading = OWN_PAGES[section.id] ?? {
    title: 'Rules & rewards',
    description: 'Every learning rule, in one place. Defaults live in the code; only what you change here is stored.'
  };

  return (
    <div className="pb-20">
      <AdminPageHeader
        title={heading.title}
        description={heading.description}
        actions={
          <Badge tone={view.revision > 0 ? 'success' : 'default'}>
            {view.revision > 0
              ? `Revision ${view.revision} · saved ${shortDate(view.updatedAt)}${view.updatedBy ? ` by ${view.updatedBy}` : ''}`
              : 'Revision 0 · all defaults'}
          </Badge>
        }
      />

      {serverIssues.length > 0 && (
        <Card className="mb-4 !border-warning">
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-fg">Some stored values are being ignored</p>
              <p className="text-fg-secondary">They never block saving anything else. Remove one to stop storing it.</p>
              <ul className="mt-1 space-y-1 text-fg-secondary">
                {serverIssues.map((issue) => {
                  const stored = storedPathFor(issue.path);
                  return (
                    <li key={issue.path + issue.message} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="min-w-0 break-words">
                        <span className="font-mono text-xs">{issue.path}</span> - {issue.message}
                      </span>
                      {stored && (
                        <Button variant="ghost" size="sm" disabled={saving} onClick={() => setRemoving(stored)}>
                          Remove
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {conflict !== null && (
        <Card className="mb-4 !border-warning">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>
              Changed elsewhere{Number.isFinite(conflict) ? ` (revision ${conflict})` : ''} - reload to see it. Your unsaved edits are kept.
            </span>
            <Button variant="secondary" size="sm" onClick={reloadKeepingEdits}>
              Reload
            </Button>
          </div>
        </Card>
      )}
      {error && view && <ErrorText>{error}</ErrorText>}
      {notice && (
        <p className="text-sm text-success mb-4" role="status">
          {notice}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        {/* Section index: a left rail on desktop, a select on small screens. */}
        <nav aria-label="Rule sections" className="hidden lg:block">
          <ul className="space-y-0.5 sticky top-4">
            {SECTIONS.map((s) => {
              const n = changesIn(s.id);
              return (
                <li key={s.id}>
                  <NavLink to={`/admin/rules/${s.id}`} className={() => `nav-item ${s.id === section.id ? 'is-active' : ''}`.trim()}>
                    <span className="flex-1">{s.title}</span>
                    {n > 0 && <span className="text-[11px] font-mono text-fg-muted">{n}</span>}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
        <label className="lg:hidden block">
          <span className="field-label">Section</span>
          <select className="w-full" value={section.id} onChange={(e) => navigate(`/admin/rules/${e.target.value}`)}>
            {SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>

        <div className="min-w-0">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3 pb-3 mb-1 border-b border-border-subtle">
              <div className="min-w-0 max-w-2xl">
                <h2 className="text-base font-semibold text-fg flex items-center gap-2">
                  {section.title}
                  {section.audience === 'admin' && <Badge tone="warning">admin only</Badge>}
                </h2>
                <p className="text-sm text-fg-secondary mt-1">{section.description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge tone={sectionChanges > 0 ? 'success' : 'default'}>
                  {sectionChanges > 0 ? `${sectionChanges} ${sectionChanges === 1 ? 'change' : 'changes'}` : 'Using defaults'}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving || !pathsInSection(section.id).some((path) => hasOwn(savedLeaves, path))}
                  onClick={() => setConfirmingReset(true)}
                >
                  Reset section
                </Button>
              </div>
            </div>
            <Body {...sectionProps} />
          </Card>

          <details className="mt-4">
            <summary className="text-sm text-fg-secondary cursor-pointer">Effective settings (JSON)</summary>
            <pre className="mt-2 p-3 rounded-md bg-surface-2 text-xs font-mono overflow-x-auto max-h-96">{JSON.stringify(draft, null, 2)}</pre>
          </details>
        </div>
      </div>

      {dirtyCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 lg:left-60 z-30 border-t border-border bg-surface shadow-dialog" role="region" aria-label="Unsaved changes">
          <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-fg">
              {dirtyCount} unsaved {dirtyCount === 1 ? 'change' : 'changes'}
              {issues.length > 0 && <span className="text-error ml-2">- {issues.length} to fix first</span>}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={discard} disabled={saving}>
                Discard
              </Button>
              <Button variant="primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmingReset}
        title={`Reset ${section.title}?`}
        message={`Every setting in "${section.title}" goes back to its default. Learners pick the change up within 30 seconds.`}
        confirmLabel="Reset section"
        busy={saving}
        onConfirm={resetSection}
        onCancel={() => setConfirmingReset(false)}
      />

      <ConfirmDialog
        open={removing !== null}
        title="Remove this stored value?"
        message={`"${removing ?? ''}" is deleted from the stored settings. It is ignored now; if a newer version of the app used it, that version goes back to its default.`}
        confirmLabel="Remove"
        busy={saving}
        onConfirm={() => {
          if (removing) void removeStored(removing);
        }}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
};
