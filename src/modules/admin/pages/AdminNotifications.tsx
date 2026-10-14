import React, { useCallback, useEffect, useState } from 'react';
import { Bell, RefreshCw } from 'lucide-react';
import { notificationApi, type NotificationRule, type NotificationOverview } from '../services/notificationApi';
import { AdminPageHeader, Button, Card, Field, TextField, TextArea } from '../components/ui';

const words = (text: string) => text.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
export const AdminNotifications: React.FC = () => {
  const [data,setData]=useState<NotificationOverview|null>(null);
  const [rules,setRules]=useState<NotificationRule[]>([]);
  const [audience,setAudience]=useState('user'); const [userId,setUserId]=useState('');
  const [title,setTitle]=useState(''); const [body,setBody]=useState(''); const [destination,setDestination]=useState('home');
  const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [notice,setNotice]=useState('');
  const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
  const load=useCallback(async (replaceRules=false)=>{const result=await notificationApi.overview();setData(result);if(replaceRules)setRules(result.rules);},[]);
  useEffect(()=>{load(true).catch(e=>setError(e.message));},[load]);
  const run=async (fn:()=>Promise<void>)=>{setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}};
  const change=(id:string,patch:Partial<NotificationRule>)=>setRules(current=>current.map(r=>r.id===id?{...r,...patch}:r));
  const editMessage=(fn:()=>void)=>{fn();setRequestId(crypto.randomUUID());};
  return <div className="space-y-6">
    <AdminPageHeader title="Notifications" description="Send a personal message, announce something to everyone, or let helpful reminders run automatically."
      actions={<Button disabled={busy} onClick={()=>run(()=>load())}><RefreshCw size={16}/> Refresh status</Button>}/>
    {error&&<p role="alert" className="text-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <Card><div className="flex items-center gap-3"><Bell size={22}/><div><h2 className="font-semibold">{data?.configured?'Push delivery configured':'Firebase setup needed'}</h2>
      <p className="text-sm text-fg-secondary">{data?.devices??0} active push devices. Messages also appear in the app inbox. Delivery runs while your PC server is on.</p></div></div>
      {!data?.configured&&<p className="text-sm mt-3">Add the CodeConsist Firebase service-account path as GOOGLE_APPLICATION_CREDENTIALS on your PC and restart the server. Install the Android app with its matching google-services.json.</p>}
    </Card>
    <div className="grid lg:grid-cols-2 gap-6"><Card><h2 className="font-semibold mb-4">Write a notification</h2>
      <Field label="Audience"><select value={audience} disabled={busy} onChange={e=>editMessage(()=>setAudience(e.target.value))}><option value="user">One learner</option><option value="all">All learners</option></select></Field>
      {audience==='user'&&<Field label="Learner"><select value={userId} disabled={busy} onChange={e=>editMessage(()=>setUserId(e.target.value))}><option value="">Choose a learner</option>{data?.users.map(u=><option key={u.id} value={u.id}>{u.username} · {u.email}</option>)}</select></Field>}
      <TextField label="Title" value={title} onChange={v=>editMessage(()=>setTitle(v))} maxLength={100}/>
      <TextArea label="Message" value={body} onChange={v=>editMessage(()=>setBody(v))} maxLength={800}/>
      <Field label="Open when tapped"><select value={destination} onChange={e=>editMessage(()=>setDestination(e.target.value))}>{data?.destinations.map(d=><option key={d} value={d}>{words(d)}</option>)}</select></Field>
      <Button disabled={busy||!data||!title.trim()||!body.trim()||(audience==='user'&&!userId)} onClick={()=>run(async()=>{const result=await notificationApi.send({requestId,audience,userId,title,body,destination});setNotice(`${result.accepted} notification(s) queued for ${result.audience} learner(s). Preferences apply.`);setTitle('');setBody('');setRequestId(crypto.randomUUID());await load();})}>{busy?'Working…':audience==='all'?'Send broadcast':'Send to learner'}</Button>
    </Card><Card><h2 className="font-semibold mb-4">Preview</h2><div className="rounded-xl border border-border p-5 space-y-2"><p className="text-xs text-fg-secondary">CODECONSIST · now</p><h3 className="font-semibold break-words">{title||'Your notification title'}</h3><p className="text-sm whitespace-pre-wrap break-words">{body||'Your message will appear here.'}</p></div><p className="text-sm text-fg-secondary mt-4">Quiet hours and learner preferences apply to broadcasts too. “Accepted” means Firebase accepted the message; it does not prove the phone displayed it.</p></Card></div>
    <Card><h2 className="font-semibold mb-2">Automated reminders</h2><p className="text-sm text-fg-secondary mb-4">Enable the reminders you want. Hours use each learner’s time zone. At most three automated reminders per day; quiet hours default to 22:00–08:00. Weekly progress counts lessons from Monday. All rules start off.</p>
      <p className="text-sm text-fg-secondary mb-4">Current products are lifetime purchases. Expiration rules only qualify a paid subscription record with an explicit expiry; lifetime access never generates expiry warnings.</p>
      <div className="space-y-3">{rules.map(r=><details key={r.id} className="border border-border rounded-lg p-4"><summary className="cursor-pointer font-medium">{r.label} · {r.enabled?'Enabled':'Off'}</summary><div className="mt-4 grid md:grid-cols-2 gap-4">
        <label className="flex items-center gap-2"><input type="checkbox" checked={r.enabled} onChange={e=>change(r.id,{enabled:e.target.checked})}/> Enable reminder</label>
        <Field label="Send from local hour (0–23)"><input type="number" min={0} max={23} value={r.hour} onChange={e=>change(r.id,{hour:Number(e.target.value)})}/></Field>
        <TextField label="Title template" value={r.title} onChange={title=>change(r.id,{title})} maxLength={100}/>
        <TextArea label="Message template" value={r.body} onChange={body=>change(r.id,{body})} maxLength={800}/>
        <Field label="Open page"><select value={r.destination} onChange={e=>change(r.id,{destination:e.target.value})}>{data?.destinations.map(d=><option key={d} value={d}>{words(d)}</option>)}</select></Field>
        {(r.id==='inactive'||r.id==='subscription_expiring')&&<Field label={r.id==='inactive'?'Days away before reminder':'Days before expiry'}><input type="number" min={1} max={90} value={r.days} onChange={e=>change(r.id,{days:Number(e.target.value)})}/></Field>}
        {r.id==='weekly_goal'&&<><Field label="Weekly target (lessons)"><input type="number" min={1} max={500} value={r.target} onChange={e=>change(r.id,{target:Number(e.target.value)})}/></Field><Field label="Reminder day"><select value={r.weekday} onChange={e=>change(r.id,{weekday:Number(e.target.value)})}>{['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((day,i)=><option key={day} value={i}>{day}</option>)}</select></Field></>}
        <p className="text-xs text-fg-secondary md:col-span-2">Template fields: {'{name}, {streak}, {remaining}, {target}, {count}, {expiry}'}. Choose fields relevant to this reminder.</p>
      </div></details>)}</div>
      <Button className="mt-4" disabled={busy||rules.length===0} onClick={()=>run(async()=>{const result=await notificationApi.saveRules(rules);setRules(result.rules);setNotice('Reminder settings saved.');})}>Save automation rules</Button>
    </Card>
    <Card><h2 className="font-semibold mb-4">Recent notifications</h2><div className="space-y-3">{data?.history.map(m=><div key={m.id} className="border-b border-border pb-3"><div className="flex flex-wrap justify-between gap-2"><strong>{m.title}</strong><span className="text-xs text-fg-secondary">{new Date(m.createdAt).toLocaleString()}</span></div><p className="text-sm whitespace-pre-wrap">{m.body}</p><p className="text-xs text-fg-secondary">{data.users.find(u=>u.id===m.userId)?.username||'Learner'} · {m.category} · {Object.entries(m.delivery).map(([s,n])=>`${n} ${s}`).join(', ')||'In inbox / awaiting push'}{m.readAt?' · Read':''}</p></div>)}{data?.history.length===0&&<p className="text-sm text-fg-secondary">No notifications sent yet.</p>}</div></Card>
  </div>;
};
