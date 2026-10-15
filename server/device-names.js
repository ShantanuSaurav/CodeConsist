import { readFileSync } from 'node:fs';

// Public Google Play supported-device catalog, refreshed 2026-10-16.
// https://storage.googleapis.com/play_public/supported_devices.csv
const models = JSON.parse(readFileSync(new URL('./device-catalog.json', import.meta.url), 'utf8'));
function modelName(model,manufacturer='') {
  const match=Object.hasOwn(models,model.toLowerCase())?models[model.toLowerCase()]:null;
  return typeof match==='string'?match:match&&Object.hasOwn(match,manufacturer.toLowerCase())?match[manufacturer.toLowerCase()]:null;
}
export function friendlyDeviceName(req) {
  const ua=String(req.get('user-agent')||'').slice(0,500);
  const raw=String(req.get('x-codeconsist-device')||'').slice(0,600);
  let claimed='';try{claimed=decodeURIComponent(raw).replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,120);}catch{}
  const [manufacturer,model]=claimed.split('|');
  if(model) {
    const found=modelName(model,manufacturer);
    if(found)return found;
    return model.toLowerCase().startsWith(manufacturer.toLowerCase())?model:`${manufacturer} ${model}`;
  }
  if(/iPad/.test(ua))return 'Apple iPad';
  if(/iPhone/.test(ua))return 'Apple iPhone';
  const android=ua.match(/Android[^;)]*;\s*(?:[a-z]{2}(?:[-_][A-Z]{2})?;\s*)?([^;)]+?)(?:\s+Build\/[^;)]*)?[;)]/i)?.[1]?.trim();
  if(android && !['K','wv'].includes(android))return modelName(android)||android;
  if(/Android/.test(ua))return 'Android device';
  if(/Windows/.test(ua))return 'Windows PC';
  if(/Macintosh|Mac OS X/.test(ua))return 'Apple Mac';
  if(/CrOS/.test(ua))return 'Chromebook';
  if(/Linux/.test(ua))return 'Linux computer';
  return String(req.get('x-codeconsist-client')||'').toLowerCase()==='ios'?'Apple iPhone / iPad':'Unknown device';
}
