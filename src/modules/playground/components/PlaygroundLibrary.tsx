import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button, Modal, Segmented, useToast } from '@/ui';
import { api } from '@/platform/api-client/api';
import { intents } from '@/platform/events';
import { samePlaygroundProgram, type PlaygroundProgram, type PlaygroundSave } from '@/platform/playground/model';
import { setGuestProgramToSave, usePlaygroundHistory } from './runHistory';

interface Props {
  owner: string;
  signedIn: boolean;
  label: string;
  current: PlaygroundProgram;
  successful: PlaygroundProgram | null;
  running: boolean;
  onOpen: (program: PlaygroundProgram) => void;
}

export const PlaygroundLibrary: React.FC<Props> = ({ owner, signedIn, label, current, successful, running, onOpen }) => {
  const history = usePlaygroundHistory(owner).filter((run) => run.program.language === current.language);
  const [dialog, setDialog] = useState<'browse' | 'save' | 'rename' | 'delete' | 'open' | null>(null);
  const [tab, setTab] = useState<'saved' | 'history'>('history');
  const [saves, setSaves] = useState<PlaygroundSave[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [selection, setSelection] = useState<PlaygroundSave | null>(null);
  const [pending, setPending] = useState<PlaygroundProgram | null>(null);
  const [saveId, setSaveId] = useState('');
  const alive = useRef(true);
  const revision = useRef(0);
  const actionPending = useRef(false);
  const nameId = useId();
  const { notify } = useToast();
  useEffect(() => { alive.current = true; return () => { alive.current = false; revision.current++; }; }, []);

  const load = useCallback(async () => {
    if (!signedIn) return;
    const request = ++revision.current;
    setLoading(true);
    setError('');
    try {
      const result = await api.playgroundSaves(current.language);
      if (alive.current && request === revision.current) setSaves(result.snippets.filter((entry) => entry.program.language === current.language));
    } catch (failure) {
      if (alive.current && request === revision.current) setError(failure instanceof Error ? failure.message : 'Could not load saved code.');
    } finally {
      if (alive.current && request === revision.current) setLoading(false);
    }
  }, [signedIn, current.language]);

  useEffect(() => {
    if (dialog !== 'browse' || tab !== 'saved') return;
    void load();
    const refresh = () => { void load(); };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [dialog, tab, load]);

  const beginSave = (program: PlaygroundProgram) => {
    if (!signedIn) { setGuestProgramToSave(program); setDialog(null); intents.openAuth(); return; }
    setPending(program);
    setName(`${label} experiment`);
    setSaveId(crypto.randomUUID());
    setError('');
    setDialog('save');
  };
  const apply = async () => {
    if (actionPending.current) return;
    if (dialog === 'save' && (!pending || !history.some((run) => samePlaygroundProgram(run.program, pending)))) {
      setError('This run is no longer eligible. Close this dialog and run the code successfully again.');
      return;
    }
    actionPending.current = true;
    setBusy(true);
    setError('');
    revision.current++;
    try {
      if (dialog === 'save' && pending) await api.savePlayground(saveId, name.trim(), pending);
      else if (dialog === 'rename' && selection) await api.renamePlayground(selection.id, name.trim());
      else if (dialog === 'delete' && selection) await api.deletePlayground(selection.id);
      if (!alive.current) return;
      notify(dialog === 'delete' ? 'Saved code deleted.' : 'Saved to your account.', 'success');
      setTab('saved');
      setDialog('browse');
    } catch (failure) {
      if (alive.current) setError(failure instanceof Error ? failure.message : 'Could not update your library. Please retry.');
    } finally {
      actionPending.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const canSave = !running && successful !== null && samePlaygroundProgram(current, successful);
  const close = () => { if (!actionPending.current) { setDialog(null); setError(''); } };
  const requestOpen = (program: PlaygroundProgram) => { setPending(program); setError(''); setDialog('open'); };
  const title = dialog === 'save' ? 'Save successful code' : dialog === 'rename' ? 'Rename saved code' : dialog === 'delete' ? 'Delete saved code?' : dialog === 'open' ? 'Open this code?' : `${label} library`;

  return (
    <>
      <section className="playground-library-bar" aria-label={`${label} code library`}>
        <div><strong>Your code, kept close.</strong><p>{canSave ? 'Successful run. Save this version to your account.' : 'Run successfully to save this version.'}</p></div>
        <div className="playground-library-actions">
          <Button size="sm" variant="secondary" onClick={() => { setTab('history'); setError(''); setDialog('browse'); }}>Run history ({history.length})</Button>
          <Button size="sm" variant="secondary" onClick={() => { setTab('saved'); setError(''); setDialog('browse'); }}>Saved code</Button>
          <Button size="sm" variant="primary" disabled={!canSave} onClick={() => successful && beginSave(successful)}>Save code</Button>
        </div>
      </section>
      <Modal open={dialog !== null} onClose={close} title={title} eyebrow={label} size="lg"
        description={dialog === 'browse' ? 'Only code for the selected language appears here.' : undefined}>
        {dialog === 'browse' && <>
          <Segmented value={tab} onChange={setTab} ariaLabel="Code library view" options={[{ value: 'history', label: 'This visit' }, { value: 'saved', label: 'Account saves' }]} />
          <p className="text-sm text-fg-muted mt-4">{tab === 'history' ? 'Last 20 distinct successful runs for this language. Cleared when you refresh. Editor draft recovery is separate.' : 'Named saves stay on your account across refreshes and devices. Up to 100 saves in total.'}</p>
          {tab === 'saved' && !signedIn ? <Button onClick={() => { close(); intents.openAuth(); }}>Sign in to sync saved code</Button> : null}
          {tab === 'saved' && signedIn && loading ? <p role="status">Loading saved code…</p> : null}
          {tab === 'saved' && signedIn && !loading && !error && saves.length === 0 ? <p className="playground-library-empty">No saved {label} code yet. Run a program successfully, then choose Save code.</p> : null}
          {tab === 'history' && history.length === 0 ? <p className="playground-library-empty">No successful runs this visit. Failed runs are never added.</p> : null}
          <ul className="playground-library-list">
            {tab === 'history' ? history.map((run) => <li key={run.id}>
              <div><strong>Successful {label} run</strong><time dateTime={run.ranAt}>{new Date(run.ranAt).toLocaleString()}</time><pre>{run.program.language === 'web' ? run.program.files.html.slice(0, 160) : run.program.code.slice(0, 160)}</pre></div>
              <div className="playground-library-actions"><Button size="sm" variant="secondary" onClick={() => requestOpen(run.program)}>Open</Button><Button size="sm" variant="ghost" onClick={() => beginSave(run.program)}>Save to account</Button></div>
            </li>) : signedIn && !loading && !error ? saves.map((save) => <li key={save.id}>
              <div><strong>{save.title}</strong><time dateTime={save.updatedAt}>{new Date(save.updatedAt).toLocaleString()}</time><pre>{save.program.language === 'web' ? save.program.files.html.slice(0, 160) : save.program.code.slice(0, 160)}</pre></div>
              <div className="playground-library-actions"><Button size="sm" variant="secondary" onClick={() => requestOpen(save.program)}>Open</Button><Button size="sm" variant="ghost" onClick={() => { setSelection(save); setName(save.title); setDialog('rename'); }}>Rename</Button><Button size="sm" variant="ghost" onClick={() => { setSelection(save); setDialog('delete'); }}>Delete</Button></div>
            </li>) : null}
          </ul>
        </>}
        {(dialog === 'save' || dialog === 'rename') && <form onSubmit={(event) => { event.preventDefault(); void apply(); }}>
          <label className="field-label" htmlFor={nameId}>Name your code</label>
          <input className="input w-full" id={nameId} value={name} maxLength={80} required disabled={busy} onChange={(event) => setName(event.target.value)} />
          <p className="text-sm text-fg-muted mt-3">{dialog === 'save' ? 'This saves the exact successful version, including standard input or all three web files.' : 'Only the name changes. Your saved code stays intact.'}</p>
          <div className="playground-library-actions mt-5"><Button type="button" variant="secondary" disabled={busy} onClick={close}>Cancel</Button><Button type="submit" disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save to account'}</Button></div>
        </form>}
        {dialog === 'delete' && <><p>Delete “{selection?.title}” from your account? This cannot be undone.</p><div className="playground-library-actions mt-5"><Button variant="secondary" disabled={busy} onClick={close}>Cancel</Button><Button variant="danger" disabled={busy} onClick={() => void apply()}>{busy ? 'Deleting…' : 'Delete permanently'}</Button></div></>}
        {dialog === 'open' && <><p>This replaces the current editor contents{current.language === 'web' ? ' in all three files' : ' and standard input'}. Save any successful version you want to keep first.</p><div className="playground-library-actions mt-5"><Button variant="secondary" onClick={close}>Cancel</Button><Button onClick={() => { if (pending) onOpen(pending); close(); }}>Replace editor</Button></div></>}
        {error && <div className="notice notice-error mt-4" role="alert"><p>{error}</p>{dialog === 'browse' && <Button size="sm" variant="secondary" onClick={() => void load()}>Retry</Button>}</div>}
      </Modal>
    </>
  );
};
