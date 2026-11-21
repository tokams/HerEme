'use strict';
const fs = require('node:fs');
const path = require('node:path');

function runtimeConfig(appDir = path.resolve(__dirname, '..'), env = process.env) {
  const gitEntry = path.join(appDir, '..', '.git');
  const worktree = fs.existsSync(gitEntry) && fs.statSync(gitEntry).isFile();
  const preview = worktree || env.HEREME_PREVIEW === '1';
  const dataDir = env.HEREME_DATA_DIR
    ? path.resolve(env.HEREME_DATA_DIR)
    : path.join(appDir, 'data', ...(preview ? ['preview'] : []));
  if (preview && !env.HEREME_DATA_DIR && !fs.existsSync(path.join(dataDir, 'hereme.sqlite'))) {
    throw new Error(`Preview snapshot missing at ${dataDir}. Follow docs/migration.md before starting this worktree.`);
  }
  const environment=env.HEREME_ENV||'development';
  if(!['development','test','production'].includes(environment))throw new Error('HEREME_ENV must be development, test or production.');
  const production=environment==='production';
  const port = env.PORT === undefined ? (preview ? 3001 : 3000) : Number(env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  const host=env.HOST||(production?'127.0.0.1':'0.0.0.0');
  const publicOrigin=env.HEREME_PUBLIC_ORIGIN||'';
  if(production){
    if(!/^https:\/\/[^/]+$/.test(publicOrigin))throw new Error('Production HEREME_PUBLIC_ORIGIN must be an HTTPS origin without a path.');
    if(host!=='127.0.0.1'&&host!=='::1')throw new Error('Production HOST must be loopback behind the reverse proxy.');
  }
  const sessionDays=Number(env.HEREME_SESSION_DAYS||30);
  const minFreeBytes=Number(env.HEREME_MIN_FREE_BYTES||256*1024*1024);
  const maxVideoBytes=Number(env.HEREME_MAX_VIDEO_BYTES||2*1024*1024*1024);
  const enableWebPush=env.WEB_PUSH_ENABLED==='1',vapidPublicKey=env.VAPID_PUBLIC_KEY||'',vapidPrivateKey=env.VAPID_PRIVATE_KEY||'',vapidSubject=env.VAPID_SUBJECT||'';
  if(!Number.isInteger(sessionDays)||sessionDays<1||sessionDays>365)throw new Error('HEREME_SESSION_DAYS must be 1-365.');
  if(!Number.isSafeInteger(minFreeBytes)||minFreeBytes<0)throw new Error('HEREME_MIN_FREE_BYTES must be a nonnegative integer.');
  if(!Number.isSafeInteger(maxVideoBytes)||maxVideoBytes<1024*1024)throw new Error('HEREME_MAX_VIDEO_BYTES must be a safe integer of at least 1 MiB.');
  if(enableWebPush&&!/^[A-Za-z0-9_-]{40,200}$/.test(vapidPublicKey))throw new Error('WEB_PUSH_ENABLED requires a valid VAPID_PUBLIC_KEY.');
  if(vapidPrivateKey&&!/^[A-Za-z0-9_-]{20,200}$/.test(vapidPrivateKey))throw new Error('VAPID_PRIVATE_KEY is invalid.');
  if(enableWebPush&&env.HEREME_PUSH_WORKER==='1'&&!vapidPrivateKey)throw new Error('The push worker requires VAPID_PRIVATE_KEY.');
  if(enableWebPush&&!/^(mailto:|https:\/\/)/.test(vapidSubject))throw new Error('WEB_PUSH_ENABLED requires VAPID_SUBJECT as mailto: or HTTPS URL.');
  return {dataDir,port,preview,environment,production,host,publicOrigin,sessionDays,minFreeBytes,
    trustProxy:env.HEREME_TRUST_PROXY==='loopback',uploadsSuspended:env.HEREME_UPLOADS_SUSPENDED==='1',
    enableVideo:env.HEREME_ENABLE_VIDEO==='1',enableLocations:env.HEREME_ENABLE_LOCATIONS==='1',
    enableVerification:env.HEREME_ENABLE_VERIFICATION==='1',enableStaffPanel:true,enableWebPush,vapidPublicKey,vapidPrivateKey,vapidSubject,pushWorker:env.HEREME_PUSH_WORKER==='1',
    maxVideoBytes,ffprobe:env.HEREME_FFPROBE||'ffprobe',ffmpeg:env.HEREME_FFMPEG||'ffmpeg'};
}
module.exports = { runtimeConfig };
