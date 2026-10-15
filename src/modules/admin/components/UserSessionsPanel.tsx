import { useEffect, useState } from 'react';
import { adminApi } from '../services/adminApi';
import { Badge, Button, ErrorText, Spinner, ConfirmDialog } from './ui';

export function UserSessionsPanel({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof adminApi.userSessions>>['sessions']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [busy,setBusy]=useState(false);
  const [confirm,setConfirm]=useState<{id:string|null;label:string}|null>(null);
  const revoke=async()=>{if(!confirm)return;setBusy(true);setError('');try{await adminApi.logoutUserDevice(userId,confirm.id);setConfirm(null);setRevision(v=>v+1);}catch(e){setError(e instanceof Error?e.message:'Could not sign out device.');}finally{setBusy(false);}};
  useEffect(() => {
    let current = true;
    setLoading(true); setError('');
    adminApi.userSessions(userId).then(data => { if (current) setRows(data.sessions); })
      .catch(error => { if (current) setError(error.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [userId, revision]);
  const date = (value: string) => new Date(value).toLocaleString();
  return <section className="space-y-4">
    <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Signed-in devices & browsers</h3><Button size="sm" disabled={loading} onClick={() => setRevision(value => value + 1)}>Refresh</Button></div>
    <p className="text-sm text-fg-muted">One entry per sign-in. Recent activity means a request in the last two minutes, not a guarantee that the app is still open. Existing sign-ins appear when they next connect.</p>
    {loading && <Spinner label="Checking sign-ins…" />}
    {error && <ErrorText>{error}</ErrorText>}
    {!loading && !error && rows.length === 0 && <p className="text-sm text-fg-muted">No device activity recorded yet.</p>}
    {rows.map(row => <article key={row.id} className="rounded-xl border border-border p-4 space-y-2">
      <div className="flex justify-between gap-3"><strong>{row.deviceName||row.platform}</strong><Badge>{row.status}</Badge></div>
      <p className="text-sm text-fg-muted">{row.browser} · {row.platform}</p>
      <dl className="grid grid-cols-2 gap-2 text-sm"><dt>Signed in</dt><dd>{date(row.signedInAt)}</dd><dt>Last activity</dt><dd>{date(row.lastSeenAt)}</dd><dt>Session expires</dt><dd>{date(row.expiresAt)}</dd></dl>
      <Button size="sm" disabled={loading||busy||!row.active} onClick={()=>setConfirm({id:row.id,label:row.deviceName||row.platform})}>Sign out device</Button>
    </article>)}
    <Button disabled={loading||busy||!rows.some(row=>row.active)} onClick={()=>setConfirm({id:null,label:'all devices'})}>Sign out all devices</Button>
    <ConfirmDialog open={confirm!==null} title={`Sign out ${confirm?.label||'device'}?`} message="The learner will need to sign in again on the selected device(s). This does not reset their progress." confirmLabel="Sign out" busy={busy} onConfirm={revoke} onCancel={()=>{if(!busy)setConfirm(null);}}/>
  </section>;
}
