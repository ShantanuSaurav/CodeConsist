import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import { createLearnerSessionsRouter, createAdminSessionsRouter } from '../session-routes.js';
import { initAuthSecret, signLearnerToken, verifyLearnerToken, learnerTokenIsCurrent } from '../auth.js';
import { sessionId, touchSession } from '../learner-sessions.js';
import { friendlyDeviceName } from '../device-names.js';

const previousSecret=process.env.JWT_SECRET;
beforeAll(async()=>{process.env.JWT_SECRET='session-route-test-key-only-not-a-real-credential';await initAuthSecret();});
afterAll(()=>{if(previousSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousSecret;});
const req=headers=>({get:key=>headers[key.toLowerCase()]||''});
describe('friendly device names',()=>{
  it.each([['samsung|SM-A135F','Samsung Galaxy A13'],['samsung|SM-S921B','Samsung Galaxy S24'],['samsung|SM-S928B','Samsung Galaxy S24 Ultra'],['Apple|iPhone','Apple iPhone']])('identifies %s', (value,expected)=>{
    expect(friendlyDeviceName(req({'x-codeconsist-device':encodeURIComponent(value)}))).toBe(expected);
  });
  it('uses browser platform labels without inventing exact hidden models',()=>{
    expect(friendlyDeviceName(req({'user-agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 17) AppleWebKit Safari/605'}))).toBe('Apple iPhone');
    expect(friendlyDeviceName(req({'user-agent':'Mozilla/5.0 (Windows NT 10.0) Chrome/130'}))).toBe('Windows PC');
    expect(friendlyDeviceName(req({'user-agent':'Mozilla/5.0 (Linux; Android 13; SM-A135F Build/TP1A) Chrome/100'}))).toBe('Samsung Galaxy A13');
    expect(friendlyDeviceName(req({'user-agent':'Mozilla/5.0 (Linux; Android 10; K) Chrome/130'}))).toBe('Android device');
  });
  it('adds a model name to existing sessions without waiting for the write throttle',()=>{
    const user={id:'one',tokenVersion:0};const now=Date.now();const payload={sub:'one',jti:'test',tv:0,iat:now/1000,exp:now/1000+3600};
    touchSession(user,payload,req({'x-codeconsist-client':'android'}),now);
    expect(touchSession(user,payload,req({'x-codeconsist-client':'android','x-codeconsist-device':'samsung%7CSM-S921B'}),now+1)).toBe(true);
    expect(user.sessions[0].deviceName).toBe('Samsung Galaxy S24');
  });
});
async function fixture(run) {
  const users=[{id:'one',tokenVersion:0},{id:'two',tokenVersion:0}];const audit=[];
  const store={findUserById:id=>users.find(u=>u.id===id),persist:()=>{},persistNow:async()=>{}};
  const tokens={one:signLearnerToken(users[0]),other:signLearnerToken(users[0]),two:signLearnerToken(users[1]),unseen:signLearnerToken(users[0])};
  for(const key of ['one','other','two']){const payload=verifyLearnerToken(tokens[key]);touchSession(users.find(u=>u.id===payload.sub),payload,req({'x-codeconsist-client':'android','x-codeconsist-device':key==='other'?'samsung%7CSM-S921B':'samsung%7CSM-A135F'}));}
  const app=express();app.use(express.json());app.use((req,_res,next)=>{const token=req.get('authorization')?.replace('Bearer ','');try{const payload=verifyLearnerToken(token);const user=store.findUserById(payload.sub);if(learnerTokenIsCurrent(payload,user)){req.user=user;touchSession(user,payload,req);}}catch{}next();});
  const requireAuth=(req,res,next)=>req.user?next():res.status(401).json({error:'Sign in'});
  const sessionOf=req=>sessionId(verifyLearnerToken(req.get('authorization').replace('Bearer ','')));
  app.use('/api',createLearnerSessionsRouter({store,requireAuth,sessionOf}));
  app.use('/api/admin',(req,res,next)=>{if(req.get('authorization')!=='Bearer admin-test-only')return res.status(401).json({error:'Admin required'});req.admin={id:'admin'};next();},createAdminSessionsRouter({store,audit:(...args)=>audit.push(args.slice(1))}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const call=async(path,token=tokens.one,body)=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
  try{await run({users,tokens,call,audit});}finally{await new Promise(resolve=>server.close(resolve));}
}
describe('device session access and revocation',()=>{
  it('lists only your own sessions and marks the current device',()=>fixture(async({tokens,call})=>{
    const result=await call('/api/me/sessions');expect(result.status).toBe(200);expect(result.body.sessions).toHaveLength(2);expect(result.body.sessions.filter(s=>s.current)).toHaveLength(1);
    expect(JSON.stringify(result.body)).not.toContain(tokens.one);expect(result.body.sessions.every(s=>s.active)).toBe(true);
  }));
  it('rejects unauthenticated access and learner requests to admin endpoints',()=>fixture(async({call,tokens})=>{
    expect((await call('/api/me/sessions','invalid')).status).toBe(401);
    expect((await call('/api/admin/users/one/sessions/logout-all',tokens.one,{})).status).toBe(401);
  }));
  it('cannot log out another account by sending its session id or user id',()=>fixture(async({call,tokens})=>{
    const id=sessionId(verifyLearnerToken(tokens.two));expect((await call(`/api/me/sessions/${id}/logout`,tokens.one,{userId:'two'})).status).toBe(404);expect((await call('/api/me/sessions',tokens.two)).status).toBe(200);
  }));
  it('logs out one selected device and leaves the current one working',()=>fixture(async({call,tokens})=>{
    const id=sessionId(verifyLearnerToken(tokens.other));const result=await call(`/api/me/sessions/${id}/logout`,tokens.one,{});expect(result.body.signedOutCurrent).toBe(false);
    expect((await call('/api/me/sessions',tokens.other)).status).toBe(401);expect((await call('/api/me/sessions',tokens.one)).status).toBe(200);
  }));
  it('reports when the current device was logged out',()=>fixture(async({call,tokens})=>{
    const id=sessionId(verifyLearnerToken(tokens.one));expect((await call(`/api/me/sessions/${id}/logout`,tokens.one,{})).body.signedOutCurrent).toBe(true);expect((await call('/api/me/sessions',tokens.one)).status).toBe(401);
  }));
  it('logout-all also invalidates tokens which have not yet reported a device',()=>fixture(async({call,tokens})=>{
    expect((await call('/api/me/sessions/logout-all',tokens.one,{})).status).toBe(200);
    for(const token of [tokens.one,tokens.other,tokens.unseen])expect((await call('/api/me/sessions',token)).status).toBe(401);
    expect((await call('/api/me/sessions',tokens.two)).status).toBe(200);
  }));
  it('admin can log out a single learner device or all its devices, with audit entries',()=>fixture(async({call,tokens,audit})=>{
    const id=sessionId(verifyLearnerToken(tokens.other));expect((await call(`/api/admin/users/one/sessions/${id}/logout`,'admin-test-only',{})).status).toBe(200);
    expect((await call('/api/me/sessions',tokens.other)).status).toBe(401);expect((await call('/api/me/sessions',tokens.one)).status).toBe(200);
    expect((await call('/api/admin/users/one/sessions/logout-all','admin-test-only',{})).status).toBe(200);expect((await call('/api/me/sessions',tokens.one)).status).toBe(401);expect(audit).toHaveLength(2);
  }));
});
