'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const testData=fs.mkdtempSync(path.join(os.tmpdir(),'hereme-release-api-'));process.env.HEREME_DATA_DIR=testData;process.env.HEREME_ENV='test';
const app=require('../server/index');const S=require('../server/services');let server,url;
test.before(async()=>{server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});url=`http://127.0.0.1:${server.address().port}`;});
test.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));S.db.close();fs.rmSync(testData,{recursive:true,force:true});});
async function request(route,{method='GET',body,form,session,headers={}}={}){
  const outgoing={...headers};if(body!==undefined)outgoing['content-type']='application/json';if(session){outgoing.cookie=session.cookie;if(!['GET','HEAD'].includes(method))outgoing['x-csrf-token']=session.csrf;}
  const response=await fetch(url+route,{method,headers:outgoing,body:form||(body===undefined?undefined:JSON.stringify(body))});
  const type=response.headers.get('content-type')||'',payload=type.includes('json')?await response.json():await response.text();
  return {status:response.status,body:payload,headers:response.headers};
}
async function profile(name){
  const result=await request('/api/session',{method:'POST',body:{name}});assert.equal(result.status,201);
  const cookies=result.headers.getSetCookie();return {user:result.body.user,recovery:result.body.recovery_key,csrf:result.body.csrf_token,cookie:cookies.map(value=>value.split(';')[0]).join('; ')};
}
test('liveness, readiness, public pages and retired room/admin surfaces',async()=>{
  assert.equal((await request('/api/live')).status,200);const ready=await request('/api/ready');assert.equal(ready.status,200);assert.ok(Object.values(ready.body.checks).every(Boolean));
  assert.equal((await request('/api/rooms')).status,410);assert.equal((await request('/api/admin/queue')).status,404);
  assert.match((await request('/privacy.html')).body,/Personvern/);assert.match((await request('/rules.html')).body,/Fellesskapsregler/);
});
test('pseudonym creation, CSRF, recovery, rotation and session revocation',async()=>{
  const first=await profile('ReleaseUser');assert.ok(first.recovery.length>=20);assert.match(first.headers||'',/^$/);
  const saved=await fetch(url+'/api/recovery/confirm',{method:'POST',redirect:'manual',headers:{cookie:first.cookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:'ReleaseUser',password:first.recovery,csrf_token:first.csrf})});assert.equal(saved.status,303);assert.equal(saved.headers.get('location'),'/?recovery-saved=1');
  const rejectedSave=await fetch(url+'/api/recovery/confirm',{method:'POST',redirect:'manual',headers:{cookie:first.cookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:'ReleaseUser',password:'feil-gjenopprettingsnokkel-som-er-lang',csrf_token:first.csrf})});assert.equal(rejectedSave.status,401);
  const me=await request('/api/me',{session:first});assert.equal(me.body.user.name,'ReleaseUser');assert.equal(me.body.user.secured,true);
  const without=await request('/api/posts',{method:'POST',body:{title:'Uten token',type:'text',category:'story'},headers:{cookie:first.cookie}});assert.equal(without.status,403);assert.equal(without.body.error.code,'CSRF_INVALID');
  assert.equal((await request('/api/session/recover',{method:'POST',body:{name:'ReleaseUser',recovery_key:'helt-feil-nokkel-som-er-lang'}})).status,401);
  const recovered=await request('/api/session/recover',{method:'POST',body:{name:'ReleaseUser',recovery_key:first.recovery}});assert.equal(recovered.status,200);const second={cookie:recovered.headers.getSetCookie().map(value=>value.split(';')[0]).join('; '),csrf:recovered.body.csrf_token};assert.notEqual(second.cookie,first.cookie);
  const rotated=await request('/api/recovery/rotate',{method:'POST',session:second});assert.equal(rotated.status,200);assert.notEqual(rotated.body.recovery_key,first.recovery);
  assert.equal((await request('/api/session/recover',{method:'POST',body:{name:'ReleaseUser',recovery_key:first.recovery}})).status,401);
  assert.equal((await request('/api/session/revoke-all',{method:'POST',session:second})).status,200);assert.equal((await request('/api/me',{session:first})).status,401);
  const expiring=await profile('ExpiredUser'),raw=/hereme_session=([^;]+)/.exec(expiring.cookie)[1];S.db.prepare("update sessions set expires_at=datetime('now','-1 second') where id_hash=?").run(S.identity.sha256(decodeURIComponent(raw)));assert.equal((await request('/api/posts',{method:'POST',session:expiring,body:{title:'Skal ikke lagres',type:'text',category:'story'}})).status,401);
  assert.ok(S.db.prepare("select id from security_events where event='recovery.failed' and result='denied'").get());
});
test('legacy bearer identity is upgraded once to a recoverable secure session',async()=>{
  const crypto=require('node:crypto'),token=crypto.randomBytes(32).toString('hex'),id='legacy-upgrade-user';
  S.db.prepare('insert into users(id,token_hash,name,normalized_name) values(?,?,?,?)').run(id,crypto.createHash('sha256').update(token).digest('hex'),'LegacyUpgrade','legacyupgrade');
  const upgraded=await request('/api/me',{headers:{authorization:'Bearer '+token}});assert.equal(upgraded.status,200);assert.equal(upgraded.body.legacy_migrated,true);assert.ok(upgraded.body.recovery_key.length>=20);assert.equal(upgraded.body.user.secured,true);
  assert.equal(S.db.prepare('select count(*) n from recovery_credentials where user_id=?').get(id).n,1);assert.deepEqual(S.db.prepare('select role from user_roles where user_id=?').all(id).map(row=>row.role),['member']);
  const again=await request('/api/me',{headers:{authorization:'Bearer '+token}});assert.equal(again.status,200);assert.equal(again.body.recovery_key,null);
});
test('stable post, pagination, search, vote, comment depth and report contracts',async()=>{
  const actor=await profile('ForumActor');
  const created=await request('/api/posts',{method:'POST',session:actor,body:{title:'Unik søkbar overskrift',body:'Lokal kontrakt',type:'text',category:'question',poster_style:'question'}});assert.equal(created.status,201);const id=created.body.id;
  const detail=await request('/api/posts/'+id);assert.equal(detail.body.post.category,'question');assert.equal(detail.body.post.score,1);assert.equal(detail.body.post.room_id,null);
  assert.equal((await request('/api/posts/'+id+'/vote',{method:'POST',session:actor,body:{value:1}})).body.my_vote,0);
  assert.equal((await request('/api/posts/'+id+'/vote',{method:'POST',session:actor,body:{value:-1}})).body.my_vote,-1);
  const root=await request('/api/posts/'+id+'/comments',{method:'POST',session:actor,body:{body:'nivå 1'}});let parent=root.body.id;
  for(let depth=1;depth<=3;depth++){const child=await request('/api/posts/'+id+'/comments',{method:'POST',session:actor,body:{body:'nivå '+(depth+1),parent_id:parent}});assert.equal(child.status,201);parent=child.body.id;}
  assert.equal((await request('/api/posts/'+id+'/comments',{method:'POST',session:actor,body:{body:'for dypt',parent_id:parent}})).status,400);
  const search=await request('/api/posts?q='+encodeURIComponent('Unik søkbar')+'&limit=1');assert.equal(search.body.posts[0].id,id);
  for(let index=0;index<30;index++)await S.posts.create({title:'Sidepost '+index,type:'text',category:'story'},actor.user);
  const first=await request('/api/posts?limit=10');assert.equal(first.body.posts.length,10);assert.ok(first.body.next_cursor);
  const second=await request('/api/posts?limit=10&cursor='+encodeURIComponent(first.body.next_cursor));assert.equal(second.body.posts.length,10);assert.equal(new Set([...first.body.posts,...second.body.posts].map(post=>post.id)).size,20);
  const people=[await profile('ReporterOne'),await profile('ReporterTwo')];for(const person of [actor,...people])assert.equal((await request('/api/posts/'+id+'/report',{method:'POST',session:person,body:{reason:'Annet'}})).status,201);
  assert.equal(S.db.prepare('select status from posts where id=?').get(id).status,'review');
  const local={id:'local-operator',capabilities:['moderate']};S.moderation.act(local,id,'publish','reviewed locally');assert.equal(S.db.prepare('select status from posts where id=?').get(id).status,'published');assert.ok(S.db.prepare("select id from audit_events where action='moderation.publish' and subject_id=?").get(String(id)));
});
test('server validates image bytes, records immutable media and cleans rejected input',async()=>{
  const actor=await profile('ImageActor'),good=fs.readFileSync(path.join(__dirname,'../public/assets/demo/sources/source-01-rain_bus_stop.jpg'));
  const form=new FormData();for(const [key,value] of Object.entries({title:'Bildekontrakt',type:'image',category:'alert',poster_style:'alert'}))form.set(key,value);form.set('image',new Blob([good],{type:'image/jpeg'}),'photo.jpg');
  const created=await request('/api/posts',{method:'POST',session:actor,form});assert.equal(created.status,201);
  const post=(await request('/api/posts/'+created.body.id)).body.post;assert.match(post.image_url,/^\/media\//);assert.equal(post.media_status,'ready');assert.equal((await fetch(url+post.image_url)).status,200);
  const before=fs.readdirSync(path.join(testData,'media')).length,bad=new FormData();for(const [key,value] of Object.entries({title:'Falskt bilde',type:'image',category:'tip'}))bad.set(key,value);bad.set('image',new Blob([Buffer.from('<script>bad</script>')],{type:'image/png'}),'bad.png');
  const rejected=await request('/api/posts',{method:'POST',session:actor,form:bad});assert.equal(rejected.status,400);assert.equal(fs.readdirSync(path.join(testData,'media')).length,before);
});
test('production config rejects public bind and insecure origin',()=>{
  const {runtimeConfig}=require('../server/config');assert.throws(()=>runtimeConfig(process.cwd(),{HEREME_ENV:'production',HEREME_DATA_DIR:testData,HEREME_PUBLIC_ORIGIN:'http://example.test'}),/HTTPS/);
  assert.throws(()=>runtimeConfig(process.cwd(),{HEREME_ENV:'production',HEREME_DATA_DIR:testData,HEREME_PUBLIC_ORIGIN:'https://example.test',HOST:'0.0.0.0'}),/loopback/);
});
