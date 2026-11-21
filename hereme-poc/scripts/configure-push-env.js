'use strict';
const fs=require('node:fs');
const webPush=require('web-push');

const file=process.argv[2],domain=process.argv[3];
if(!file||!domain||!/^[A-Za-z0-9.-]+$/.test(domain))throw new Error('Usage: node scripts/configure-push-env.js <env-file> <public-domain>');
const source=fs.readFileSync(file,'utf8'),values=new Map();
for(const line of source.split(/\r?\n/)){const match=/^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);if(match)values.set(match[1],match[2]);}
let publicKey=values.get('VAPID_PUBLIC_KEY')||'',privateKey=values.get('VAPID_PRIVATE_KEY')||'';
if(!/^[A-Za-z0-9_-]{40,200}$/.test(publicKey)||!/^[A-Za-z0-9_-]{40,200}$/.test(privateKey))({publicKey,privateKey}=webPush.generateVAPIDKeys());
const replacements={WEB_PUSH_ENABLED:'1',VAPID_PUBLIC_KEY:publicKey,VAPID_PRIVATE_KEY:privateKey,VAPID_SUBJECT:/^(?:mailto:|https:\/\/)/.test(values.get('VAPID_SUBJECT')||'')?values.get('VAPID_SUBJECT'):`mailto:operator@${domain}`};
const seen=new Set(),lines=source.split(/\r?\n/).map(line=>{const match=/^([A-Z][A-Z0-9_]*)=/.exec(line);if(!match||!Object.hasOwn(replacements,match[1]))return line;seen.add(match[1]);return `${match[1]}=${replacements[match[1]]}`;});
for(const [key,value] of Object.entries(replacements))if(!seen.has(key))lines.push(`${key}=${value}`);
fs.writeFileSync(file,lines.join('\n').replace(/\n*$/,'\n'),{mode:0o600});
fs.chmodSync(file,0o600);
process.stdout.write('Web Push configuration is enabled.\n');
