'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {spawnSync}=require('node:child_process');const {DatabaseSync}=require('node:sqlite');
const {applyMigrations}=require('../server/migrations');const {createVideoService}=require('../server/domain/video');const {snapshotData}=require('../scripts/snapshot-data');const {verifyBackup}=require('../scripts/verify-backup');
const {createLocationService}=require('../server/domain/locations');const {createVerificationService}=require('../server/domain/verification');
const {createRateLimiter}=require('../server/domain/rate-limit');
const {Readable}=require('node:stream');
const {createHash}=require('node:crypto');
const {createArticleService}=require('../server/domain/articles');
const {createMediaService}=require('../server/domain/media');
test('deployment push configuration creates persistent secrets without printing them',t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'hereme-push-env-')),file=path.join(root,'.env');t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.writeFileSync(file,'HEREME_DOMAIN=forum.example.com\nWEB_PUSH_ENABLED=0\nVAPID_PUBLIC_KEY=\nVAPID_PRIVATE_KEY=\nVAPID_SUBJECT=\n');const script=path.join(__dirname,'../scripts/configure-push-env.js'),first=spawnSync(process.execPath,[script,file,'forum.example.com'],{encoding:'utf8'});assert.equal(first.status,0,first.stderr);const configured=fs.readFileSync(file,'utf8'),publicKey=/^VAPID_PUBLIC_KEY=(.+)$/m.exec(configured)[1],privateKey=/^VAPID_PRIVATE_KEY=(.+)$/m.exec(configured)[1];assert.match(configured,/^WEB_PUSH_ENABLED=1$/m);assert.match(configured,/^VAPID_SUBJECT=mailto:operator@forum\.example\.com$/m);assert.ok(publicKey.length>40&&privateKey.length>40);assert.equal(first.stdout.includes(publicKey)||first.stdout.includes(privateKey),false);const second=spawnSync(process.execPath,[script,file,'forum.example.com'],{encoding:'utf8'});assert.equal(second.status,0,second.stderr);assert.equal(fs.readFileSync(file,'utf8'),configured);});
function database(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'hereme-ops-')),data=path.join(root,'data');fs.mkdirSync(path.join(data,'uploads'),{recursive:true});fs.mkdirSync(path.join(data,'media'));fs.mkdirSync(path.join(data,'tmp'));
  const db=new DatabaseSync(path.join(data,'hereme.sqlite'));db.exec(fs.readFileSync(path.join(__dirname,'fixtures/legacy-schema.sql'),'utf8'));applyMigrations(db);t.after(()=>{db.close();fs.rmSync(root,{recursive:true,force:true});});return {root,data,db};
}
test('release verification accepts expired unused article uploads and preserves all protected checksums',async t=>{
  const {root,data,db}=database(t);
  db.prepare("INSERT INTO users(id,name,normalized_name,token_hash) VALUES('writer','Writer','writer','hash')").run();
  for (const id of ['abandoned','draft-image','recent','revision-image']) {
    const folder=path.join(data,'media',id);
    fs.mkdirSync(folder);
    const files=['original.jpg','display.jpg','thumbnail.jpg'].map(name=>`media/${id}/${name}`);
    const bytes=Buffer.from('snapshot checksum fixture');
    for (const relative of files) fs.writeFileSync(path.join(data,relative),bytes);
    db.prepare(`INSERT INTO media(id,owner_id,kind,status,original_path,display_path,thumbnail_path,mime_type,bytes,sha256)
      VALUES(?,'writer','image','ready',?,?,?,'image/jpeg',?,?)`).run(id,...files,bytes.length,createHash('sha256').update(bytes).digest('hex'));
    db.prepare("INSERT INTO article_assets(media_id,owner_id,created_at) VALUES(?,'writer',datetime('now',?))")
      .run(id,id==='recent'?'0 days':'-2 days');
  }
  db.prepare("INSERT INTO article_working_copies(id,owner_id,content_json) VALUES('draft','writer',?)")
    .run(JSON.stringify({cover_media_id:'draft-image'}));
  db.prepare("INSERT INTO posts(id,author_id,title,type,status) VALUES(99,'writer','Existing poster','text','published')").run();
  require('../server/domain/content-revisions').insertRevision(db,{
    id:99,format:'poster',editor:'writer',origin:'publish',snapshot:{text:'Existing poster'},mediaIds:['revision-image']
  });
  const snapshot=path.join(root,'snapshot');
  await snapshotData(data,snapshot);
  const check=()=>spawnSync(process.execPath,[path.join(__dirname,'../scripts/verify-release-clone.js'),snapshot],{encoding:'utf8'});
  const result=check();
  assert.equal(result.status,0,result.stderr);
  assert.equal(verifyBackup(snapshot).files,12);

  createArticleService(db,data,{media:createMediaService(db,data)}).cleanup();
  assert.deepEqual(db.prepare('SELECT id FROM media ORDER BY id').all().map(row=>row.id),['draft-image','recent','revision-image']);
  // An unexpected file beside the expired upload is still protected by the snapshot manifest.
  const extra='media/abandoned/other.jpg';
  fs.writeFileSync(path.join(snapshot,extra),'retained file');
  const manifestPath=path.join(snapshot,'snapshot.json');
  const manifest=JSON.parse(fs.readFileSync(manifestPath));
  manifest.checksums[extra]=createHash('sha256').update('retained file').digest('hex');
  fs.writeFileSync(manifestPath,JSON.stringify(manifest));
  const missing=check();
  assert.notEqual(missing.status,0);
  assert.match(missing.stderr,/other\.jpg/);
  // Even an upload due for cleanup must pass its input checksum before candidate startup.
  fs.writeFileSync(path.join(snapshot,'media/abandoned/display.jpg'),'corrupt');
  const corrupt=check();
  assert.notEqual(corrupt.status,0);
  assert.match(corrupt.stderr,/Checksum mismatch: media\/abandoned\/display\.jpg/);
});
test('WAL-safe release backup verifies checksums and restores only to a new directory',async t=>{
  const {root,data,db}=database(t);db.prepare("insert into users(id,token_hash,name,normalized_name) values('backup-user','hash','Backup','backup')").run();db.prepare("insert into user_roles(user_id,role) values('backup-user','member')").run();
  const backup=path.join(root,'backup');await snapshotData(data,backup);const verified=verifyBackup(backup);assert.equal(verified.ok,true);assert.equal(verified.counts.users,1);
  const restore=path.join(root,'restore'),result=spawnSync(process.execPath,[path.join(__dirname,'../scripts/restore-data.js'),backup,restore],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(verifyBackup(restore).counts.users,1);
  assert.notEqual(spawnSync(process.execPath,[path.join(__dirname,'../scripts/restore-data.js'),backup,restore],{encoding:'utf8'}).status,0);
  const scheduled=path.join(root,'scheduled'),timer=spawnSync(process.execPath,[path.join(__dirname,'../scripts/backup-scheduled.js')],{encoding:'utf8',env:{...process.env,HEREME_ENV:'test',HEREME_DATA_DIR:data,HEREME_BACKUP_DIR:scheduled,HEREME_BACKUP_KEEP:'2'}});assert.equal(timer.status,0,timer.stderr);assert.equal(verifyBackup(path.join(scheduled,fs.readdirSync(scheduled)[0])).ok,true);
  const manifest=JSON.parse(fs.readFileSync(path.join(backup,'snapshot.json')));manifest.checksums['uploads/tampered']='bad';fs.writeFileSync(path.join(backup,'snapshot.json'),JSON.stringify(manifest));assert.throws(()=>verifyBackup(backup));
});
test('durable video worker publishes 180-second media and rejects longer duration',t=>{
  const {data,db}=database(t);db.prepare("insert into users(id,token_hash,name,normalized_name) values('video-user','hash','Video','video')").run();db.prepare("insert into user_roles(user_id,role) values('video-user','member')").run();
  let duration=180;const calls=[];const run=(command,args)=>{calls.push({command,args});if(command==='probe')return {status:0,stdout:JSON.stringify({format:{duration:String(duration)},streams:[{codec_type:'video',width:1280,height:720}]}),stderr:''};const output=args.at(-1);fs.writeFileSync(output,command==='encode'?Buffer.from('mp4'):Buffer.from('jpg'));return {status:0,stdout:'',stderr:''};};
  const config={enableVideo:true,maxVideoBytes:1000000,minFreeBytes:0,ffprobe:'probe',ffmpeg:'encode',enableLocations:false};
  const service=createVideoService(db,data,config,{run});const user={id:'video-user'};
  const codecMime=service.begin({title:'Codec video',bytes:10,mime_type:'video/webm;codecs=vp8,opus',category:'story'},user);assert.equal(db.prepare('select mime_type from media where id=?').get(codecMime.media_id).mime_type,'video/webm');service.cancel(codecMime.media_id,user);
  const queue=seconds=>{duration=seconds;const started=service.begin({title:'Video '+seconds,bytes:10,mime_type:'video/mp4',category:'story'},user),dir=path.join(data,'media',started.media_id);fs.mkdirSync(dir,{recursive:true});const relative=`media/${started.media_id}/original.upload`;fs.writeFileSync(path.join(data,relative),Buffer.alloc(10));db.prepare("update media set original_path=?,status='queued',sha256='x' where id=?").run(relative,started.media_id);db.prepare("insert into media_jobs(media_id,kind,status) values(?,'video','queued')").run(started.media_id);return started;};
  const valid=queue(180);assert.equal(service.processOne().status,'ready');assert.equal(db.prepare('select status from posts where id=?').get(valid.post_id).status,'published');assert.ok(fs.existsSync(path.join(data,'media',valid.media_id,'display.mp4')));assert.ok(calls.some(call=>call.args.includes('scale=trunc(min(1280\\,iw)/2)*2:-2')));
  const invalid=queue(180.001);assert.equal(service.processOne().status,'rejected');assert.equal(db.prepare('select status from posts where id=?').get(invalid.post_id).status,'rejected');
  const recovered=queue(10);db.prepare("update media_jobs set status='processing',attempts=1,locked_at=datetime('now','-31 minutes') where media_id=?").run(recovered.media_id);db.prepare("update media set status='processing' where id=?").run(recovered.media_id);assert.equal(service.processOne().status,'ready');assert.equal(db.prepare('select status from posts where id=?').get(recovered.post_id).status,'published');
});
test('video upload resumes from the durable byte offset without buffering the full file',async t=>{
  const {data,db}=database(t);db.prepare("insert into users(id,token_hash,name,normalized_name) values('chunk-user','hash','Chunk','chunk')").run();db.prepare("insert into user_roles(user_id,role) values('chunk-user','member')").run();
  const service=createVideoService(db,data,{enableVideo:true,maxVideoBytes:1000000,minFreeBytes:0,enableLocations:false},{run:()=>{throw new Error('worker not expected');}}),user={id:'chunk-user'};
  const started=service.begin({title:'Chunked video',bytes:10,mime_type:'video/mp4',category:'story'},user);
  const request=(bytes,start,end)=>Object.assign(Readable.from([bytes]),{headers:{'content-range':`bytes ${start}-${end}/10`,'content-length':String(bytes.length)}});
  const first=await service.receiveChunk(started.media_id,user,request(Buffer.from('1234'),0,3));assert.equal(first.uploaded_bytes,4);assert.equal(service.status(started.media_id,user).uploaded_bytes,4);
  assert.throws(()=>service.receiveChunk(started.media_id,user,request(Buffer.from('x'),0,0)),error=>error.code==='UPLOAD_OFFSET');
  const final=await service.receiveChunk(started.media_id,user,request(Buffer.from('567890'),4,9));assert.equal(final.status,'queued');assert.equal(fs.readFileSync(path.join(data,'media',started.media_id,'original.upload')).toString(),'1234567890');assert.equal(db.prepare('select status from media_jobs where media_id=?').get(started.media_id).status,'queued');service.cancel(started.media_id,user);assert.equal(db.prepare('select id from posts where id=?').get(started.post_id),undefined);assert.equal(fs.existsSync(path.join(data,'media',started.media_id)),false);
});
test('location subscriptions are explicit and verification never grants moderator role',t=>{
  const {db}=database(t);db.prepare("insert into users(id,token_hash,name,normalized_name) values('future-user','hash','Future','future')").run();db.prepare("insert into user_roles(user_id,role) values('future-user','member')").run();
  db.prepare("insert into areas(id,kind,name,geometry_version) values('no:11','fylke','Rogaland','v1')").run();db.prepare("insert into area_geometries(area_id,version,geojson,source_url,license,sha256) values('no:11','v1','{\"type\":\"Polygon\",\"coordinates\":[]}','https://example.invalid','test','x')").run();
  const locations=createLocationService(db,{enableLocations:true}),user={id:'future-user'};assert.equal(locations.setSubscriptions(user,['no:11'])[0].name,'Rogaland');assert.equal(locations.geometry().features[0].id,'no:11');
  const verification=createVerificationService(db,{enableVerification:true});assert.equal(verification.linkFromTrustedProvider(user,{provider:'test-oidc',subject:'opaque'}).status,'verified');assert.deepEqual(db.prepare('select role from user_roles where user_id=?').all(user.id).map(row=>row.role),['member']);assert.equal(db.prepare('select subject_hash from identity_verifications where user_id=?').get(user.id).subject_hash.length,64);
});
test('abuse budget rejects excess work and resets without changing domain state',()=>{let now=0;const limiter=createRateLimiter({windowMs:1000,now:()=>now});assert.equal(limiter.check('actor',2).remaining,1);assert.equal(limiter.check('actor',2).remaining,0);assert.throws(()=>limiter.check('actor',2),error=>error.code==='RATE_LIMITED'&&error.status===429);now=1001;assert.equal(limiter.check('actor',2).remaining,1);});

