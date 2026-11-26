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
  const publicOrigin = env.HEREME_PUBLIC_ORIGIN || (production ? '' : `http://localhost:${port}`);
  const databaseStart = env.HEREME_DATABASE_START ?? 'demo';
  if (!['demo', 'empty', 'existing'].includes(databaseStart)) {
    throw new Error('HEREME_DATABASE_START must be demo, empty or existing.');
  }
  if(production){
    const originUrl = URL.canParse(publicOrigin) ? new URL(publicOrigin) : null;
    if (originUrl?.protocol !== 'https:' || originUrl.origin !== publicOrigin) {
      throw new Error('Production HEREME_PUBLIC_ORIGIN must be an HTTPS origin without a path.');
    }
    if(host!=='127.0.0.1'&&host!=='::1')throw new Error('Production HOST must be loopback behind the reverse proxy.');
  }
  const sessionDays=Number(env.HEREME_SESSION_DAYS||30);
  const minFreeBytes=Number(env.HEREME_MIN_FREE_BYTES||256*1024*1024);
  const maxVideoBytes=Number(env.HEREME_MAX_VIDEO_BYTES||2*1024*1024*1024);
  const enableWebPush=env.WEB_PUSH_ENABLED==='1',vapidPublicKey=env.VAPID_PUBLIC_KEY||'',vapidPrivateKey=env.VAPID_PRIVATE_KEY||'',vapidSubject=env.VAPID_SUBJECT||'';
  const pushPollMs=Number(env.HEREME_PUSH_POLL_MS||2000);
  if(env.WEBAUTHN_ENABLED!==undefined&&!['true','false','1','0'].includes(env.WEBAUTHN_ENABLED))throw new Error('WEBAUTHN_ENABLED must be true, false, 1 or 0.');
  const webauthnEnabled=env.WEBAUTHN_ENABLED==='true'||env.WEBAUTHN_ENABLED==='1';
  const webauthnRpId=env.WEBAUTHN_RP_ID||(production?'':'localhost');
  const webauthnOrigins=String(env.WEBAUTHN_ALLOWED_ORIGINS||(production?'':`http://localhost:${port}`)).split(',').map(value=>value.trim()).filter(Boolean);
  if(!Number.isInteger(sessionDays)||sessionDays<1||sessionDays>365)throw new Error('HEREME_SESSION_DAYS must be 1-365.');
  if(!Number.isSafeInteger(minFreeBytes)||minFreeBytes<0)throw new Error('HEREME_MIN_FREE_BYTES must be a nonnegative integer.');
  if(!Number.isSafeInteger(maxVideoBytes)||maxVideoBytes<1024*1024)throw new Error('HEREME_MAX_VIDEO_BYTES must be a safe integer of at least 1 MiB.');
  if(enableWebPush&&!/^[A-Za-z0-9_-]{40,200}$/.test(vapidPublicKey))throw new Error('WEB_PUSH_ENABLED requires a valid VAPID_PUBLIC_KEY.');
  if(vapidPrivateKey&&!/^[A-Za-z0-9_-]{20,200}$/.test(vapidPrivateKey))throw new Error('VAPID_PRIVATE_KEY is invalid.');
  if(enableWebPush&&env.HEREME_PUSH_WORKER==='1'&&!vapidPrivateKey)throw new Error('The push worker requires VAPID_PRIVATE_KEY.');
  if(enableWebPush&&!/^(mailto:|https:\/\/)/.test(vapidSubject))throw new Error('WEB_PUSH_ENABLED requires VAPID_SUBJECT as mailto: or HTTPS URL.');
  if(!Number.isInteger(pushPollMs)||pushPollMs<500||pushPollMs>60000)throw new Error('HEREME_PUSH_POLL_MS must be an integer from 500 to 60000.');
  if(webauthnEnabled&&(!/^(?:[a-z0-9-]+\.)*[a-z0-9-]+$/i.test(webauthnRpId)||webauthnOrigins.length!==1))throw new Error('Enabled WebAuthn requires one explicit WEBAUTHN_RP_ID and WEBAUTHN_ALLOWED_ORIGINS origin.');
  if(webauthnEnabled&&!/^https:\/\//.test(webauthnOrigins[0])&&!(environment!=='production'&&/^http:\/\/localhost(?::\d+)?$/.test(webauthnOrigins[0])))throw new Error('WebAuthn origin must use HTTPS except explicit localhost development.');
  if (production && webauthnEnabled && (webauthnOrigins[0] !== publicOrigin || webauthnRpId !== new URL(publicOrigin).hostname)) {
    throw new Error('Production WebAuthn requires the configured instance hostname and its exact HTTPS origin.');
  }
  const instanceId=env.HEREME_INSTANCE_ID||(production?new URL(publicOrigin).hostname.replaceAll('.','-'):'development');
  if(!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(instanceId))throw new Error('HEREME_INSTANCE_ID must be a stable lowercase identifier.');
  const legalController=env.HEREME_LEGAL_CONTROLLER||'Tomasz Gliniecki';
  const legalContact=env.HEREME_LEGAL_CONTACT||(production?'':'privacy@example.test');
  const legalProcessors=env.HEREME_LEGAL_PROCESSORS||(production?'':'Local test environment');
  const legalReady=Boolean(legalController&&legalContact&&legalProcessors);
  if(legalContact&&!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(legalContact))throw new Error('HEREME_LEGAL_CONTACT must be an email address.');
  if(production&&(/\.(?:test|invalid|example)$/i.test(legalContact)||/replace with/i.test(legalProcessors)))throw new Error('Production legal contact and processors must be verified values.');
  return {dataDir,databaseStart,port,preview,environment,production,host,publicOrigin,instanceId,legalController,legalContact,legalProcessors,legalReady,sessionDays,minFreeBytes,
    trustProxy:env.HEREME_TRUST_PROXY==='loopback',uploadsSuspended:env.HEREME_UPLOADS_SUSPENDED==='1',
    enableVideo:env.HEREME_ENABLE_VIDEO==='1',enableLocations:env.HEREME_ENABLE_LOCATIONS==='1',
    enableVerification:env.HEREME_ENABLE_VERIFICATION==='1',enableStaffPanel:true,enableWebPush,vapidPublicKey,vapidPrivateKey,vapidSubject,pushWorker:env.HEREME_PUSH_WORKER==='1',pushPollMs,
    webauthnEnabled,webauthnRpId,webauthnOrigins,maxVideoBytes,ffprobe:env.HEREME_FFPROBE||'ffprobe',ffmpeg:env.HEREME_FFMPEG||'ffmpeg'};
}
module.exports = { runtimeConfig };
