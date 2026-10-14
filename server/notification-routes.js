import express from 'express';
import { NotificationError } from './notifications.js';

export function createNotificationRouter({ service, requireAuth, sessionOf, writeLimit = (_q,_s,next)=>next() }) {
  const router=express.Router();
  router.use('/notifications',requireAuth,(_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
  router.get('/notifications', (req,res)=>res.json({messages:service.inbox(req.user.id),preferences:service.preferences(req.user.id)}));
  router.put('/notifications/preferences',writeLimit,(req,res)=>res.json({preferences:service.setPreferences(req.user.id,req.body)}));
  router.post('/notifications/devices',writeLimit,(req,res)=>res.json(service.register(req.user,sessionOf(req),req.body)));
  router.delete('/notifications/devices/:installationId',writeLimit,(req,res)=>{service.unregister(req.user,req.params.installationId);res.json({ok:true});});
  router.post('/notifications/:id/read',writeLimit,(req,res)=>res.json(service.read(req.user.id,req.params.id)));
  router.use(notificationError);
  return router;
}
export function createNotificationAdminRouter({ service, requireAdminAuth, audit, store }) {
  const router=express.Router();
  router.use('/notifications',requireAdminAuth,(_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
  router.get('/notifications',(req,res)=>res.json({...service.status(),users:store.allUsers().map(({id,username,email})=>({id,username,email}))}));
  router.put('/notifications/rules',(req,res)=>{const rules=service.saveRules(req.body?.rules);audit(req,'notifications.rules.update',null,{enabled:rules.filter(r=>r.enabled).map(r=>r.id)});res.json({rules});});
  router.post('/notifications/send',(req,res)=>{const result=service.send(req.body,req.admin.id);audit(req,'notifications.send',req.body.audience==='user'?req.body.userId:null,{audience:req.body.audience,accepted:result.accepted});res.status(202).json(result);});
  router.use(notificationError);
  return router;
}
function notificationError(error,_req,res,next) { if(error instanceof NotificationError) res.status(error.status).json({error:error.message}); else next(error); }
