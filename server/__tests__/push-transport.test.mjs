import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync, verify } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPushTransport, notificationSoundType } from '../push-transport.js';

const folders=[];
afterEach(async()=>{for(const folder of folders.splice(0))await rm(folder,{recursive:true,force:true});});
async function fixture(status=200,errorCode=null) {
  const folder=await mkdtemp(path.join(tmpdir(),'codeconsist-fcm-test-'));folders.push(folder);
  const file=path.join(folder,'test-key.json');
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  await writeFile(file,JSON.stringify({project_id:'test-project',client_email:'test@example.invalid',private_key:privateKey.export({format:'pem',type:'pkcs8'})}));
  const fetcher=vi.fn(async(url)=>url.includes('oauth2')?{ok:true,json:async()=>({access_token:'test-access'})}:{ok:status===200,status,json:async()=>({error:{details:[{errorCode}]}})});
  const transport=createPushTransport({env:{GOOGLE_APPLICATION_CREDENTIALS:file},fetcher});
  return {transport,fetcher,publicKey};
}
const device={token:'test-device-token'};
const message={id:'notification-1',userId:'user-1',title:'Title',body:'Message',destination:'learn'};
describe('FCM HTTP v1 transport',()=>{
  it('signs the OAuth assertion and sends a recipient-bound data message without shipping the private key',async()=>{
    const f=await fixture();expect(await f.transport.send(device,message)).toEqual({status:'accepted'});
    const assertion=f.fetcher.mock.calls[0][1].body.get('assertion');const parts=assertion.split('.');
    expect(verify('RSA-SHA256',Buffer.from(parts.slice(0,2).join('.')),f.publicKey,Buffer.from(parts[2],'base64url'))).toBe(true);
    const claim=JSON.parse(Buffer.from(parts[1],'base64url'));expect(claim.scope).toBe('https://www.googleapis.com/auth/firebase.messaging');
    const send=f.fetcher.mock.calls[1];expect(send[0]).toBe('https://fcm.googleapis.com/v1/projects/test-project/messages:send');
    expect(JSON.parse(send[1].body).message).toMatchObject({data:{...message,type:'general'},android:{priority:'HIGH',ttl:'86400s'}});
    expect(send[1].body).not.toContain('PRIVATE KEY');await f.transport.send(device,message);expect(f.fetcher).toHaveBeenCalledTimes(3);
  });
  it.each([[404,'UNREGISTERED','invalid'],[429,null,'retry'],[403,null,'retry'],[400,'INVALID_ARGUMENT','failed']])('classifies HTTP %s',async(status,code,expected)=>{
    const f=await fixture(status,code);expect((await f.transport.send(device,message)).status).toBe(expected);
  });
  it('does not contact Firebase when unconfigured',async()=>{
    const fetcher=vi.fn();const f=createPushTransport({env:{},fetcher});expect(await f.send(device,message)).toEqual({status:'unconfigured'});expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['direct_message','broadcast','streak','daily_goal','weekly_goal','inactive','new_questions','review_due','subscription_expiring','subscription_expired','certificate'])('preserves the semantic sound type %s',type=>{
    expect(notificationSoundType(type==='direct_message'||type==='broadcast'?{type}:{ruleId:type})).toBe(type);
  });
  it('uses a safe fallback for older or unknown notifications',()=>{
    expect(notificationSoundType({})).toBe('general');
    expect(notificationSoundType({type:'https://example.invalid/sound.wav'})).toBe('general');
    expect(notificationSoundType({ruleId:'streak',type:'broadcast'})).toBe('streak');
  });
});
