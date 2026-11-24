'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn, execFileSync} = require('node:child_process');
const {once} = require('node:events');
const {site, isolation} = require('./support/instance-contract.cjs');
const {snapshotData} = require('../scripts/snapshot-data');
const {verifyBackup} = require('../scripts/verify-backup');

test('two production processes isolate state and restore one community independently', {timeout:45000}, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'hereme-m1-'));
  const children = new Set();
  const pushKeys = new Map();
  async function stop(child) {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child,'exit'); child.kill(); await exited;
    }
    children.delete(child);
  }
  t.after(async () => {
    await Promise.all([...children].map(stop));
    fs.rmSync(root,{recursive:true,force:true});
  });
  async function start(host, directory, mode) {
    if (!pushKeys.has(host)) pushKeys.set(host,require('web-push').generateVAPIDKeys());
    // Let the OS allocate a port in the child. Use the real app and production middleware.
    const child = spawn(process.execPath,['-e',
      "const app=require('./server/index');const server=app.listen(0,'127.0.0.1',()=>process.send(server.address().port));"
    ], {cwd:path.resolve(__dirname,'..'), windowsHide:true, stdio:['ignore','ignore','pipe','ipc'], env:{
      ...process.env, HEREME_ENV:'production', HOST:'127.0.0.1', HEREME_DATABASE_START:mode,
      HEREME_DATA_DIR:directory, HEREME_PUBLIC_ORIGIN:'https://'+host, WEBAUTHN_ENABLED:'1',
      WEBAUTHN_ALLOWED_ORIGINS:'https://'+host, WEBAUTHN_RP_ID:host, HEREME_MIN_FREE_BYTES:'0',
      WEB_PUSH_ENABLED:'1',VAPID_PUBLIC_KEY:pushKeys.get(host).publicKey,VAPID_SUBJECT:'mailto:operator@example.test'
    }});
    children.add(child);
    const port = await new Promise((resolve,reject) => {
      child.once('message',resolve); child.once('error',reject);
      let log=''; child.stderr.on('data',chunk=>log+=chunk);
      child.once('exit',code=>reject(new Error('Startup ended '+code+' '+log)));
    });
    return {instance:site(host,port), child};
  }
  const firstHost='hereme.no', secondHost='tanteulrikkesvei.hereme.no';
  const data=path.join(root,'main'), copy=path.join(root,'restored');
  const main=await start(firstHost,data,'empty');
  const community=await start(secondHost,path.join(root,'community'),'empty');
  const state=await isolation(main.instance,community.instance);
  assert.equal((await main.instance.request('/api/meta',{headers:{host:secondHost}})).status,421);
  assert.equal(await main.instance.handshake(state.author,main.instance.origin,secondHost),421);
  await stop(main.child);
  assert.equal((await community.instance.request('/api/me',{user:state.other})).status,200);

  const backup=path.join(root,'backup');
  await snapshotData(data,backup);
  assert.equal(verifyBackup(backup).counts.users,2);
  execFileSync(process.execPath,[path.resolve(__dirname,'../scripts/restore-data.js'),backup,copy]);
  const restored=await start(firstHost,copy,'existing');
  assert.equal((await restored.instance.request('/api/me',{user:state.author})).body.user.id,state.author.id);
  assert.equal((await restored.instance.request(state.media)).status,200);
  assert.equal((await restored.instance.request(state.messages,{user:state.author})).status,200);
  assert.equal((await restored.instance.request(state.postPath)).body.post.title,'M1 photo');
  assert.equal((await community.instance.request(state.media)).status,404);
  await assert.rejects(start(firstHost,path.join(root,'missing'),'existing'),/Expected an existing HerEme database/);
});
