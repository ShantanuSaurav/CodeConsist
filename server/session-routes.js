import express from 'express';
import { sessionRows, revokeDeviceSession, revokeAllDeviceSessions } from './learner-sessions.js';

export function createLearnerSessionsRouter({store,requireAuth,sessionOf,writeLimit=(_q,_s,next)=>next()}) {
  const router=express.Router();
  router.use('/me/sessions',requireAuth,(_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
  router.get('/me/sessions',(req,res)=>res.json({sessions:sessionRows(req.user,Date.now(),sessionOf(req))}));
  router.post('/me/sessions/logout-all',writeLimit,async(req,res)=>{
    const revoked=revokeAllDeviceSessions(req.user);store.persist();await store.persistNow({strict:true});res.json({ok:true,revoked,signedOutCurrent:true});
  });
  router.post('/me/sessions/:id/logout',writeLimit,async(req,res)=>{
    if(!revokeDeviceSession(req.user,req.params.id))return res.status(404).json({error:'Device session not found.'});
    store.persist();await store.persistNow({strict:true});res.json({ok:true,signedOutCurrent:req.params.id===sessionOf(req)});
  });
  return router;
}
/** Mounted inside the administrator router, after its separate authentication gate. */
export function createAdminSessionsRouter({store,audit}) {
  const router=express.Router();
  router.post('/users/:id/sessions/logout-all',async(req,res)=>{
    const user=store.findUserById(req.params.id);if(!user)return res.status(404).json({error:'Learner not found.'});
    const revoked=revokeAllDeviceSessions(user);store.persist();audit(req,'user.sessions.logout-all',user.id,{revoked});await store.persistNow({strict:true});res.json({ok:true,revoked});
  });
  router.post('/users/:id/sessions/:sessionId/logout',async(req,res)=>{
    const user=store.findUserById(req.params.id);if(!user)return res.status(404).json({error:'Learner not found.'});
    if(!revokeDeviceSession(user,req.params.sessionId))return res.status(404).json({error:'Device session not found.'});
    store.persist();audit(req,'user.session.logout',user.id,{sessionId:req.params.sessionId});await store.persistNow({strict:true});res.json({ok:true});
  });
  return router;
}
