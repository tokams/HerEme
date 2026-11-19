'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {runtimeConfig}=require('../server/config');
const {listenAvailable}=require('../server/listen');
const app={listen:(...args)=>http.createServer((req,res)=>res.end('ok')).listen(...args)};
const close=server=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));

test('worktree launch selects preview storage and port 3001; original defaults remain 3000',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'hereme-startup-'));
  t.after(()=>fs.rmSync(root,{recursive:true}));
  const original=path.join(root,'original'),worktree=path.join(root,'worktree');
  fs.mkdirSync(path.join(original,'.git'),{recursive:true});
  fs.mkdirSync(path.join(worktree,'hereme-poc/data/preview'),{recursive:true});
  fs.writeFileSync(path.join(worktree,'.git'),'gitdir: example');
  const appDir=path.join(worktree,'hereme-poc');
  assert.throws(()=>runtimeConfig(appDir,{}),/Preview snapshot missing/);
  fs.writeFileSync(path.join(appDir,'data/preview/hereme.sqlite'),'');
  assert.equal(runtimeConfig(appDir,{}).port,3001);
  assert.equal(runtimeConfig(appDir,{}).dataDir,path.join(appDir,'data/preview'));
  assert.equal(runtimeConfig(path.join(original,'hereme-poc'),{}).port,3000);
  assert.equal(runtimeConfig(appDir,{PORT:'4100'}).port,4100);
  assert.throws(()=>runtimeConfig(appDir,{PORT:'wrong'}),/PORT/);
});

test('occupied ports advance automatically, exhaustion is bounded, and unexpected errors propagate',async()=>{
  const occupied=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
  const port=occupied.address().port;
  try{
    const busy=[];
    const server=await listenAvailable(app,{port,host:'127.0.0.1',onBusy:p=>busy.push(p)});
    try{assert.ok(server.address().port>port);assert.equal(busy[0],port);}
    finally{await close(server);}
    await assert.rejects(listenAvailable(app,{port,host:'127.0.0.1',attempts:1}),/No available port/);
    const failure=new Error('Unexpected bind failure');failure.code='EACCES';
    await assert.rejects(listenAvailable({listen(){throw failure;}},{port}),error=>error===failure);
  }finally{await close(occupied);}
});
