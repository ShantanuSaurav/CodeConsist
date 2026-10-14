import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import { createNotificationService, DEFAULT_RULES, validateRules } from '../notifications.js';
import { createNotificationRouter, createNotificationAdminRouter } from '../notification-routes.js';

function fixture() {
  let now=Date.parse('2026-10-18T18:30:00Z');
  const users=['one','two'].map(id=>({id,username:id,tokenVersion:0,preferences:{timeZone:'UTC'},createdAt:'2026-10-01T00:00:00Z',lastSeenAt:'2026-10-17T12:00:00Z',sessions:[{id:`session-${id}`,tokenVersion:0,expiresAt:'2026-12-01T00:00:00Z'}]}));
  const db={}; const progress={one:{review:{q:{due:'2026-10-17'}}},two:{}}; const activity={}; const orders=[]; const certificates=[]; const questions=[{id:'old'}];
  const store={db:()=>db,persist:vi.fn(),persistNow:vi.fn(async()=>{}),allUsers:()=>users,findUserById:id=>users.find(u=>u.id===id),getProgress:id=>progress[id],getActivity:id=>activity[id],ordersForUser:id=>orders.filter(o=>o.userId===id),allCertificates:()=>certificates};
  const transport={configured:()=>true,send:vi.fn(async()=>({status:'accepted'}))};
  const habits={streak:5,activeToday:false,goal:{reached:false,target:3,done:1}};
  const make=()=>createNotificationService({store,transport,clock:()=>now,catalog:()=>questions,learning:{habits:{habitSummary:()=>habits}}});
  const service=make();
  const enable=(...ids)=>service.saveRules(DEFAULT_RULES.map(r=>({...r,enabled:ids.includes(r.id)})));
  const register=(id='one',installationId='installation-123456',token='a'.repeat(32))=>service.register(users.find(u=>u.id===id),`session-${id}`,{installationId,token});
  const send=(extra={})=>service.send({requestId:'request-123456789',audience:'user',userId:'one',title:'Hello',body:'Welcome',destination:'learn',...extra},'admin');
  return {service,make,store,db,users,transport,habits,progress,activity,orders,certificates,questions,enable,register,send,setNow:v=>now=Date.parse(v)};
}
describe('notification queue and automation',()=>{
  it('targets only the selected user, deduplicates manual retries and keeps tokens out of responses',async()=>{
    const f=fixture();f.register();expect(f.send().accepted).toBe(1);expect(f.send().accepted).toBe(0);
    await f.service.tick();expect(f.transport.send).toHaveBeenCalledTimes(1);expect(f.service.inbox('two')).toEqual([]);
    expect(JSON.stringify(f.service.status())).not.toContain('a'.repeat(32));
    await f.make().tick();expect(f.transport.send).toHaveBeenCalledTimes(1);
    expect(f.store.persistNow.mock.invocationCallOrder[0]).toBeLessThan(f.transport.send.mock.invocationCallOrder[0]);
  });
  it('broadcasts to all eligible accounts while honoring opt-out',()=>{
    const f=fixture();f.service.setPreferences('two',{enabled:true,announcements:false,reminders:true,quietStart:22,quietEnd:8});
    expect(f.send({audience:'all'})).toEqual({accepted:1,audience:2});
  });
  it('moves a token/installation to the newly signed-in account without cross-account delivery',async()=>{
    const f=fixture();f.register();f.send();f.register('two');await f.service.tick();expect(f.transport.send).not.toHaveBeenCalled();
  });
  it.each(['signedOut','reset','expired'])('does not push to %s sessions',async kind=>{
    const f=fixture();f.register();f.send();if(kind==='signedOut') f.users[0].sessions[0].signedOutAt='2026-10-18';if(kind==='reset')f.users[0].tokenVersion=1;if(kind==='expired')f.users[0].sessions[0].expiresAt='2020-01-01';
    await f.service.tick();expect(f.transport.send).not.toHaveBeenCalled();expect(f.service.status().devices).toBe(0);
  });
  it('backs off transient failures and removes unregistered tokens',async()=>{
    const f=fixture();f.register();f.send();f.transport.send.mockResolvedValueOnce({status:'retry'}).mockResolvedValueOnce({status:'invalid'});
    await f.service.tick();await f.service.tick();expect(f.transport.send).toHaveBeenCalledTimes(1);
    f.setNow('2026-10-18T18:32:00Z');await f.service.tick();expect(f.transport.send).toHaveBeenCalledTimes(2);expect(f.service.status().devices).toBe(0);
  });
  it('keeps inbox usable without Firebase and drops stale push deliveries after a day',async()=>{
    const f=fixture();f.transport.configured=()=>false;f.register();f.send();await f.service.tick();expect(f.service.inbox('one')).toHaveLength(1);expect(f.transport.send).not.toHaveBeenCalled();
    f.transport.configured=()=>true;f.setNow('2026-10-20T18:30:00Z');await f.service.tick();expect(f.transport.send).not.toHaveBeenCalled();
  });
  it('honors local quiet hours and sends once when they finish',async()=>{
    const f=fixture();f.register();f.setNow('2026-10-18T23:30:00Z');f.send();await f.service.tick();expect(f.transport.send).not.toHaveBeenCalled();
    f.setNow('2026-10-19T08:01:00Z');await f.service.tick();expect(f.transport.send).toHaveBeenCalledTimes(1);
  });
  it('uses authoritative habit state and suppresses completed goals and protected streak days',()=>{
    const f=fixture();f.enable('streak','daily_goal');f.service.evaluate();expect(f.service.inbox('one')).toHaveLength(2);
    f.service.evaluate();expect(f.service.inbox('one')).toHaveLength(2);
    f.setNow('2026-10-19T18:30:00Z');f.habits.activeToday=true;f.habits.goal.reached=true;f.service.evaluate();expect(f.service.inbox('one')).toHaveLength(2);
  });
  it('only reminds unfinished weekly targets on the selected day',()=>{
    const f=fixture();f.enable('weekly_goal');f.activity.two={days:{'2026-10-12':{lessons:5}}};f.service.evaluate();expect(f.service.inbox('one')[0].body).toContain('5 more');expect(f.service.inbox('two')).toHaveLength(0);
  });
  it('announces only newly published questions after enabling the rule',()=>{
    const f=fixture();f.enable('new_questions');f.service.evaluate();expect(f.service.inbox('one')).toHaveLength(0);
    f.questions.push({id:'new'});f.service.evaluate();expect(f.service.inbox('one')[0].body).toContain('1 new');f.service.evaluate();expect(f.service.inbox('one')).toHaveLength(1);
  });
  it('uses the real review map and caps automatic reminders at three daily',()=>{
    const f=fixture();f.enable('streak','daily_goal','weekly_goal','review_due');f.service.evaluate();expect(f.service.inbox('one')).toHaveLength(3);
    const g=fixture();g.enable('review_due');g.service.evaluate();expect(g.service.inbox('one')).toHaveLength(1);expect(g.service.inbox('two')).toHaveLength(0);
  });
  it('never issues expiry notices for lifetime products, even with a stray expiry field',()=>{
    const f=fixture();f.orders.push({id:'lifetime',userId:'one',status:'paid',product:{kind:'lifetime'},expiresAt:'2026-10-19T00:00:00Z'});f.enable('subscription_expiring','subscription_expired');f.service.evaluate();expect(f.service.inbox('one')).toHaveLength(0);
    f.orders.push({id:'sub',userId:'one',status:'paid',product:{kind:'subscription'},expiresAt:'2026-10-19T00:00:00Z'});f.service.evaluate();expect(f.service.inbox('one')).toHaveLength(1);
  });
  it('does not deliver a queued streak warning after today has been completed',async()=>{
    const f=fixture();f.register();f.enable('streak');f.service.evaluate();f.habits.activeToday=true;
    await f.service.tick();expect(f.transport.send).not.toHaveBeenCalled();
  });
  it('disabling a rule stops outstanding deliveries',async()=>{
    const f=fixture();f.register();f.enable('streak');f.service.evaluate();f.enable();await f.service.tick();expect(f.transport.send).not.toHaveBeenCalled();
  });
  it('enforces inbox ownership and validates all templates/ranges',()=>{
    const f=fixture();f.send();const id=f.service.inbox('one')[0].id;expect(()=>f.service.read('two',id)).toThrow();f.service.read('one',id);expect(f.service.inbox('one')[0].readAt).toBeTruthy();
    expect(()=>validateRules([])).toThrow();expect(()=>validateRules(DEFAULT_RULES.map(r=>({...r,hour:24})))).toThrow();expect(()=>validateRules(DEFAULT_RULES.map(r=>({...r,body:'{password}'})))).toThrow();expect(()=>f.send({destination:'https://evil.test'})).toThrow();
  });
});
describe('notification routes',()=>{
  it('gates admin sends and learner inboxes independently',async()=>{
    const f=fixture();const app=express();app.use(express.json());app.use((req,_res,next)=>{if(req.get('authorization')==='learner')req.user=f.users[0];if(req.get('authorization')==='admin')req.admin={id:'admin'};next();});
    const gate=key=>(req,res,next)=>req[key]?next():res.status(401).json({error:'Sign in'});
    app.use('/api',createNotificationRouter({service:f.service,requireAuth:gate('user'),sessionOf:()=> 'session-one'}));
    app.use('/api/admin',createNotificationAdminRouter({service:f.service,requireAdminAuth:gate('admin'),audit:()=>{},store:f.store}));
    const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;
    try {
      expect((await fetch(`${base}/api/notifications`)).status).toBe(401);
      expect((await fetch(`${base}/api/admin/notifications`,{headers:{authorization:'learner'}})).status).toBe(401);
      expect((await fetch(`${base}/api/admin/notifications`,{headers:{authorization:'admin'}})).status).toBe(200);
      expect((await fetch(`${base}/api/notifications`,{headers:{authorization:'learner'}})).status).toBe(200);
    } finally { await new Promise(resolve=>server.close(resolve)); }
  });
});
