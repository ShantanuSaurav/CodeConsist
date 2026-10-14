import { randomUUID, createHash } from 'node:crypto';

const DAY = 86_400_000;
export const DESTINATIONS = ['home', 'learn', 'library', 'studio', 'review', 'assessments', 'billing', 'achievements', 'certificates', 'notifications'];
const rule = (id, label, title, body, destination, extra = {}) => ({ id, label, enabled: false, title, body, destination, hour: 18, days: 3, weekday: 0, target: 5, ...extra });
export const DEFAULT_RULES = [
  rule('streak', 'Keep a streak going', 'Keep your {streak}-day streak', '{name}, a little practice today keeps your streak going.', 'learn'),
  rule('daily_goal', 'Unfinished daily goal', 'A little closer to your goal', '{name}, you have {remaining} left to reach today’s goal.', 'learn'),
  rule('weekly_goal', 'Unfinished weekly practice target', 'Finish your week strong', '{name}, complete {remaining} more lessons to reach your weekly target of {target}.', 'learn'),
  rule('inactive', 'Return after a break', 'Ready for another small step?', '{name}, pick up where you left off. Your progress is waiting.', 'home', { days: 7 }),
  rule('new_questions', 'New published questions', 'Something new to practise', '{count} new questions are ready in your challenge library.', 'library'),
  rule('review_due', 'Reviews due', 'Time for a quick review', '{name}, revisit the concepts you’ve been practising.', 'review'),
  rule('subscription_expiring', 'Expiring membership', 'Your membership expires soon', '{name}, your membership expires on {expiry}.', 'billing'),
  rule('subscription_expired', 'Expired membership', 'Your membership has expired', '{name}, visit Membership to review your access.', 'billing'),
  rule('certificate', 'Certificate issued', 'Your certificate is ready', '{name}, celebrate your learning in Certificates.', 'certificates'),
];
export class NotificationError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const own = (o, k) => o && Object.hasOwn(o, k) ? o[k] : undefined;
const mapSet = (o, k, v) => Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true });
const digest = value => createHash('sha256').update(value).digest('hex');
export function validateMessage(raw) {
  if (typeof raw?.title !== 'string' || !raw.title.trim() || raw.title.length > 100) throw new NotificationError('Title must contain 1–100 characters.');
  if (typeof raw?.body !== 'string' || !raw.body.trim() || raw.body.length > 800) throw new NotificationError('Message must contain 1–800 characters.');
  if (!DESTINATIONS.includes(raw.destination)) throw new NotificationError('Choose a supported app destination.');
  return { title: raw.title.trim(), body: raw.body.trim(), destination: raw.destination };
}
export function validateRules(input) {
  if (!Array.isArray(input) || input.length !== DEFAULT_RULES.length || new Set(input.map(r => r?.id)).size !== input.length) throw new NotificationError('Send every reminder rule exactly once.');
  return DEFAULT_RULES.map(base => {
    const r = input.find(item => item?.id === base.id);
    if (!r || typeof r.enabled !== 'boolean') throw new NotificationError('Invalid reminder rule.');
    for (const [key, min, max] of [['hour', 0, 23], ['weekday', 0, 6], ['days', 1, 90], ['target', 1, 500]]) {
      if (!Number.isInteger(r[key]) || r[key] < min || r[key] > max) throw new NotificationError(`Invalid ${key} for ${base.label}.`);
    }
    const message = validateMessage(r);
    for (const match of `${message.title} ${message.body}`.matchAll(/\{([^{}]+)\}/g)) {
      if (!['name','streak','remaining','target','count','expiry'].includes(match[1])) throw new NotificationError(`Unknown placeholder {${match[1]}}.`);
    }
    return { ...base, ...message, enabled: r.enabled, hour: r.hour, weekday: r.weekday, days: r.days, target: r.target };
  });
}
export function createNotificationService({ store, transport, learning, catalog = () => [], reviewsDue = null, clock = Date.now }) {
  let working = false;
  function state() {
    const db = store.db();
    db.notifications ??= {};
    for (const key of ['devices','preferences','dedupe','baselines']) db.notifications[key] ??= {};
    db.notifications.messages ??= [];
    db.notifications.rules ??= structuredClone(DEFAULT_RULES);
    return db.notifications;
  }
  function preferences(userId) { return { enabled: true, reminders: true, announcements: true, quietStart: 22, quietEnd: 8, ...own(state().preferences, userId) }; }
  function setPreferences(userId, input) {
    const next = preferences(userId);
    for (const k of ['enabled','reminders','announcements']) { if (typeof input?.[k] !== 'boolean') throw new NotificationError(`Invalid ${k}.`); next[k] = input[k]; }
    for (const k of ['quietStart','quietEnd']) { if (!Number.isInteger(input[k]) || input[k] < 0 || input[k] > 23) throw new NotificationError('Quiet hours must be 0–23.'); next[k] = input[k]; }
    mapSet(state().preferences, userId, next); store.persist(); return next;
  }
  function local(user, now) {
    const zone = learning.activity?.zoneFor(user) || user.preferences?.timeZone || 'Asia/Kolkata';
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
    const day = `${parts.year}-${parts.month}-${parts.day}`;
    return { day, hour: Number(parts.hour), weekday: new Date(`${day}T00:00:00Z`).getUTCDay() };
  }
  const quiet = (hour, prefs) => prefs.quietStart === prefs.quietEnd ? false : prefs.quietStart < prefs.quietEnd ? hour >= prefs.quietStart && hour < prefs.quietEnd : hour >= prefs.quietStart || hour < prefs.quietEnd;
  function register(user, session, input) {
    if (typeof input?.token !== 'string' || input.token.length < 20 || input.token.length > 4096 || /\s/.test(input.token)) throw new NotificationError('Invalid push token.');
    if (typeof input.installationId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(input.installationId)) throw new NotificationError('Invalid installation id.');
    if (!session) throw new NotificationError('Sign in again to register this device.', 401);
    const devices = state().devices;
    const id = digest(input.token);
    // One installation/token belongs to one current account. Never trust a supplied user id.
    for (const [key, d] of Object.entries(devices)) if (d.installationId === input.installationId || key === id) delete devices[key];
    devices[id] = { id, token: input.token, installationId: input.installationId, userId: user.id, sessionId: session, updatedAt: clock() };
    const rows = Object.values(devices).filter(d => d.userId === user.id).sort((a,b) => b.updatedAt-a.updatedAt);
    for (const d of rows.slice(10)) delete devices[d.id];
    store.persist(); return { registered: true };
  }
  function unregister(user, installationId) { for (const [key,d] of Object.entries(state().devices)) if (d.userId === user.id && d.installationId === installationId) delete state().devices[key]; store.persist(); }
  function enqueue(user, message, category, key, now = clock(), ruleId = null) {
    const s = state(); const dedupeKey = digest(`${user.id}:${key}`);
    if (own(s.dedupe, dedupeKey)) return false;
    const prefs = preferences(user.id);
    if (!prefs.enabled || !(category === 'reminder' ? prefs.reminders : prefs.announcements)) return false;
    const row = { id: randomUUID(), userId: user.id, ...message, category, ruleId, createdAt: new Date(now).toISOString(), expiresAt: now + DAY, readAt: null, deliveries: {} };
    s.messages.push(row); s.dedupe[dedupeKey] = now;
    // The inbox is useful even before this account registers a push-enabled device.
    return true;
  }
  function send(raw, adminId) {
    const message = validateMessage(raw);
    if (typeof raw.requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(raw.requestId)) throw new NotificationError('A request id is required.');
    let users;
    if (raw.audience === 'all') users = store.allUsers();
    else if (raw.audience === 'user' && typeof raw.userId === 'string') { const user = store.findUserById(raw.userId); if (!user) throw new NotificationError('User not found.',404); users = [user]; }
    else throw new NotificationError('Choose one user or all users.');
    const accepted = users.filter(u => enqueue(u, message, 'announcement', `manual:${adminId}:${raw.requestId}`)).length;
    store.persist(); return { accepted, audience: users.length };
  }
  function saveRules(input) {
    const next = validateRules(input); const s = state();
    // Enabling content/certificate reminders starts at the current inventory, without a historic blast.
    for (const r of next) if (r.enabled && !s.rules.find(old => old.id === r.id)?.enabled) {
      if (r.id === 'new_questions') { s.baselines.questions = catalog().map(c => c.id); delete s.baselines.newQuestions; }
      if (r.id === 'certificate') s.baselines.certificates = (store.allCertificates?.() ?? []).map(c => c.id);
    }
    s.rules = next; store.persist(); return next;
  }
  function evaluate(now = clock()) {
    const s = state(); const available = catalog();
    const oldQuestions = new Set(s.baselines.questions ?? available.map(c => c.id));
    const added = available.filter(c => !oldQuestions.has(c.id));
    if (added.length) { s.baselines.newQuestions = { count: added.length, key: digest(added.map(c=>c.id).sort().join(',')), at: now }; }
    s.baselines.questions = available.map(c=>c.id);
    const certs = store.allCertificates?.() ?? [];
    s.baselines.certificates ??= certs.map(c=>c.id);
    for (const user of store.allUsers()) {
      const loc = local(user, new Date(now)); const prefs = preferences(user.id);
      if (quiet(loc.hour, prefs)) continue;
      const progress = store.getProgress(user.id);
      const habits = learning.habits?.habitSummary(user, progress, new Date(now));
      const activity = store.getActivity?.(user.id)?.days ?? {};
      const weekStart = new Date(`${loc.day}T00:00:00Z`); weekStart.setUTCDate(weekStart.getUTCDate() - (loc.weekday + 6) % 7);
      const week = weekStart.toISOString().slice(0,10);
      const lessons = Object.entries(activity).filter(([day])=>day>=week && day<=loc.day).reduce((n,[,v])=>n+(v.lessons||0),0);
      const sentToday = s.messages.filter(m=>m.userId===user.id && m.category==='reminder' && local(user,new Date(m.createdAt)).day===loc.day).length;
      let count = sentToday;
      for (const r of s.rules) {
        if (!r.enabled || loc.hour < r.hour || count >= 3) continue;
        let eligible = false, key = `${r.id}:${loc.day}`, vars = { name: user.username || 'Developer', streak: habits?.streak || 0, target: r.target, remaining: 0, count: 0, expiry: '' };
        switch (r.id) {
          case 'streak': eligible = habits?.streak > 0 && !habits.activeToday; break;
          case 'daily_goal': eligible = Boolean(habits?.goal && !habits.goal.reached); vars.remaining = Math.max(0,(habits?.goal?.target||0)-(habits?.goal?.done||0)); break;
          case 'weekly_goal': eligible = loc.weekday === r.weekday && lessons < r.target; key=`weekly:${week}`; vars.remaining=r.target-lessons; break;
          case 'inactive': { const last = Date.parse(user.lastSeenAt || user.createdAt); eligible=Number.isFinite(last) && now-last>=r.days*DAY; key=`inactive:${user.lastSeenAt||user.createdAt}:${Math.floor((now-last)/(r.days*DAY))}`; break; }
          case 'new_questions': { const change=s.baselines.newQuestions; eligible=Boolean(change && now-change.at<DAY); key=`questions:${change?.key}`; vars.count=change?.count||0; break; }
          case 'review_due': eligible=reviewsDue ? reviewsDue(user,new Date(now),loc.day)>0 : Object.values(progress.review ?? {}).some(card=>card.due && card.due<=loc.day); break;
          case 'subscription_expiring': case 'subscription_expired': {
            // Lifetime products deliberately never expire. Only explicit dated subscriptions qualify.
            const subscription = (store.ordersForUser?.(user.id) ?? []).find(o=>o.status==='paid' && o.product?.kind==='subscription' && Number.isFinite(Date.parse(o.expiresAt)) && (r.id==='subscription_expiring' ? Date.parse(o.expiresAt)>now && Date.parse(o.expiresAt)-now<=r.days*DAY : Date.parse(o.expiresAt)<=now && now-Date.parse(o.expiresAt)<DAY));
            eligible=Boolean(subscription); vars.expiry=subscription?.expiresAt?.slice(0,10)||''; key=`${r.id}:${subscription?.id}:${subscription?.expiresAt}`; break;
          }
          case 'certificate': { const cert=certs.find(c=>c.userId===user.id && !s.baselines.certificates.includes(c.id) && now-Date.parse(c.issuedAt)<DAY); eligible=Boolean(cert); key=`certificate:${cert?.id}`; break; }
        }
        if (!eligible) continue;
        const fill = text => text.replace(/\{([^{}]+)\}/g, (_,key)=>String(vars[key]??''));
        if (enqueue(user,{title:fill(r.title),body:fill(r.body),destination:r.destination},'reminder',key,now,r.id)) count++;
      }
    }
    // Keep dedupe longer than the inbox so refreshing/restarting does not repeat recent sends.
    s.messages = s.messages.filter(m=>now-Date.parse(m.createdAt)<30*DAY && store.findUserById(m.userId)).slice(-20_000);
    for(const [key,at] of Object.entries(s.dedupe)) if(now-at>100*DAY) delete s.dedupe[key];
    store.persist();
  }
  function activeDevice(d, now) {
    const user = store.findUserById(d.userId);
    return user && user.sessions?.some(s=>s.id===d.sessionId && !s.signedOutAt && s.tokenVersion===(user.tokenVersion??0) && Date.parse(s.expiresAt)>now);
  }
  function stillRelevant(message, user, now) {
    if (!message.ruleId) return true;
    const current = state().rules.find(r=>r.id===message.ruleId);
    if (!current?.enabled) return false;
    const loc=local(user,new Date(now));
    if (['streak','daily_goal','weekly_goal','review_due'].includes(message.ruleId) && local(user,new Date(message.createdAt)).day!==loc.day) return false;
    const habits=learning.habits?.habitSummary(user,store.getProgress(user.id),new Date(now));
    if(message.ruleId==='streak') return habits?.streak>0 && !habits.activeToday;
    if(message.ruleId==='daily_goal') return Boolean(habits?.goal && !habits.goal.reached);
    if(message.ruleId==='review_due' && reviewsDue) return reviewsDue(user,new Date(now),loc.day)>0;
    if(message.ruleId==='inactive') return now-Date.parse(user.lastSeenAt||user.createdAt)>=current.days*DAY;
    if(message.ruleId==='weekly_goal') {
      const start=new Date(`${loc.day}T00:00:00Z`);start.setUTCDate(start.getUTCDate()-(loc.weekday+6)%7);
      const first=start.toISOString().slice(0,10);
      const completed=Object.entries(store.getActivity?.(user.id)?.days??{}).filter(([day])=>day>=first&&day<=loc.day).reduce((sum,[,day])=>sum+(day.lessons||0),0);
      return completed<current.target;
    }
    return true;
  }
  async function tick() {
    if (working) return;
    working=true;
    try {
      const now=clock(); evaluate(now);
      await store.persistNow({strict:true}); // outbox durable before contacting FCM
      if(!transport.configured()) return;
      let attempted=0;
      for(const m of state().messages) {
        if(m.expiresAt<=now || (m.ruleId && !state().rules.find(r=>r.id===m.ruleId)?.enabled)) continue;
        const user=store.findUserById(m.userId); if(!user || !stillRelevant(m,user,now)) continue;
        const p=preferences(user.id); if(!p.enabled || !(m.category==='reminder'?p.reminders:p.announcements) || quiet(local(user,new Date(now)).hour,p)) continue;
        for(const d of Object.values(state().devices).filter(d=>d.userId===m.userId)) {
          if(!activeDevice(d,now)) { delete state().devices[d.id]; continue; }
          const delivery=m.deliveries[d.id];
          if(delivery && (['accepted','failed','invalid'].includes(delivery.status) || delivery.nextAt>now)) continue;
          if(++attempted>100) return;
          const result=await transport.send(d,m);
          const attempts=(delivery?.attempts||0)+1;
          m.deliveries[d.id]={...result,attempts,at:now,nextAt:now+Math.min(3600_000,30_000*2**Math.min(attempts,7))};
          if(result.status==='invalid') delete state().devices[d.id];
          await store.persistNow({strict:true});
        }
      }
    } finally { working=false; }
  }
  const publicMessage = ({ deliveries, expiresAt, ...m }) => ({ ...m, delivery: Object.values(deliveries).reduce((out,d)=>({...out,[d.status]:(out[d.status]||0)+1}),{}) });
  return { register, unregister, send, saveRules, evaluate, tick, preferences, setPreferences,
    status: () => ({ configured:transport.configured(), devices:Object.values(state().devices).filter(d=>activeDevice(d,clock())).length, rules:state().rules, destinations:DESTINATIONS, history:state().messages.slice(-100).reverse().map(publicMessage) }),
    inbox: userId => state().messages.filter(m=>m.userId===userId).slice(-100).reverse().map(publicMessage),
    read(userId,id) { const m=state().messages.find(m=>m.userId===userId && m.id===id); if(!m) throw new NotificationError('Notification not found.',404); m.readAt=new Date(clock()).toISOString(); store.persist(); return {ok:true}; }
  };
}
