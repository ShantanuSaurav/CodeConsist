import { useCallback, useEffect, useState } from 'react';
import { Laptop, Smartphone } from 'lucide-react';
import { api, getToken, type DeviceSession } from '@/platform/api-client/api';
import { Badge, Button, Modal } from '@/ui';

export function DeviceSessionsPanel({online,onSignedOut}:{online:boolean;onSignedOut:()=>Promise<void>}) {
  const [rows,setRows]=useState<DeviceSession[]>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);const [confirm,setConfirm]=useState<DeviceSession|'all'|null>(null);
  useEffect(()=>{let alive=true;if(!online)return;setBusy(true);api.deviceSessions().then(data=>{if(alive){setRows(data.sessions);setError('');}}).catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setBusy(false);});return()=>{alive=false;};},[online,revision]);
  const revoke=useCallback(async()=>{
    if(!confirm)return;const sessionToken=getToken();setBusy(true);setError('');
    try{const result=await api.logoutDevice(confirm==='all'?null:confirm.id);if(getToken()!==sessionToken)return;setConfirm(null);if(result.signedOutCurrent)await onSignedOut();else setRevision(v=>v+1);}
    catch(e){setError(e instanceof Error?e.message:'Could not sign out this device.');}finally{setBusy(false);}
  },[confirm,onSignedOut]);
  return <div className="space-y-4 py-3">
    <div className="flex flex-wrap justify-between gap-3"><p className="text-sm text-fg-secondary">Where your account is signed in. Device names reflect available model information.</p><Button disabled={!online||busy} onClick={()=>setRevision(v=>v+1)}>Refresh</Button></div>
    {error&&<p role="alert" className="text-error text-sm">{error}</p>}
    {!online&&<p className="text-sm text-fg-secondary">Connect to the server to manage your devices.</p>}
    {rows.map(row=><article key={row.id} className="rounded-2xl border border-border p-4 space-y-2">
      <div className="flex gap-3 items-start">{/app|mobile/i.test(row.platform)?<Smartphone size={22}/>:<Laptop size={22}/>}<div className="flex-1 min-w-0"><strong>{row.deviceName||row.platform}</strong><p className="text-sm text-fg-secondary">{row.browser} · {row.platform}</p></div><Badge tone={row.active?'success':'neutral'}>{row.current?'This device':row.status}</Badge></div>
      <p className="text-xs text-fg-secondary">Last active {new Date(row.lastSeenAt).toLocaleString()} · Signed in {new Date(row.signedInAt).toLocaleString()}</p>
      <Button variant="danger-line" disabled={!online||busy||!row.active} onClick={()=>setConfirm(row)}>Sign out{row.current?' this device':''}</Button>
    </article>)}
    {!busy&&online&&rows.length===0&&<p className="text-sm text-fg-secondary">No device activity recorded yet.</p>}
    <Button variant="danger-line" disabled={!online||busy||!rows.some(row=>row.active)} onClick={()=>setConfirm('all')}>Sign out all devices</Button>
    <Modal open={confirm!==null} onClose={()=>{if(!busy)setConfirm(null);}} title={confirm==='all'?'Sign out all devices?':`Sign out ${confirm?.deviceName||'this device'}?`} description={confirm==='all'?'This includes the device you are using now. You will need to sign in again.':confirm?.current?'You will be signed out here.':'This device will lose account access on its next connection.'} size="sm"
      footer={<><Button disabled={busy} onClick={()=>setConfirm(null)}>Cancel</Button><Button variant="danger-line" disabled={busy} onClick={revoke}>{busy?'Signing out…':'Sign out'}</Button></>}>{error&&<p role="alert" className="text-error">{error}</p>}</Modal>
  </div>;
}
