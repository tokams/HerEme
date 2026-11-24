'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {once}=require('node:events');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'hereme-security-'));
process.env.HEREME_DATA_DIR=data;
process.env.HEREME_ENV='test';
process.env.HEREME_DATABASE_START='empty';
const app=require('../server/index');
const S=require('../server/services');
const {requestMetadata}=require('../server/domain/security-events');
let server,base;
test.before(async()=>{server=app.listen(0,'127.0.0.1');await once(server,'listening');base='http://127.0.0.1:'+server.address().port;});
test.after(async()=>{await new Promise(resolve=>server.close(resolve));S.db.close();fs.rmSync(data,{recursive:true,force:true});});
const rows=()=>S.db.prepare('SELECT * FROM security_events ORDER BY rowid').all();
const request=(route,options={})=>fetch(base+route,options);

test('metadata extraction validates trusted IPv4/IPv6 and bounds original values',()=>{
  const headers={host:'hereme.no','x-forwarded-for':'2001:db8::5','user-agent':'Mozilla/5.0 Chrome/131.0 Edg/132.0',cookie:'sensitive'};
  const req={socket:{remoteAddress:'127.0.0.1'},headers,method:'POST',id:'server-request'};
  const config={production:true,publicOrigin:'https://hereme.no',trustProxy:true};
  const parsed=requestMetadata(req,config);
  assert.equal(parsed.fields.client_ip,'2001:db8::5');
  assert.equal(parsed.fields.browser_family,'Edge');
  assert.equal(parsed.fields.hostname,'hereme.no');
  assert.equal(JSON.stringify(parsed).includes('sensitive'),false);
  assert.equal(requestMetadata({...req,socket:{remoteAddress:'198.51.100.5'}},config).fields.client_ip,'198.51.100.5');
  assert.equal(requestMetadata({...req,headers:{...headers,'x-forwarded-for':'2001:db8::5, 192.0.2.2','user-agent':'x'.repeat(513)}},config).fields.client_ip,'127.0.0.1');
  assert.equal(requestMetadata({...req,headers:{...headers,host:'wrong.example'}},config).fields.hostname,null);
});

test('one structured/raw pair is stored for each registration, login and document event',async()=>{
  const visit=await request('/',{headers:{accept:'text/html','user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0','x-forwarded-for':'192.0.2.9',cookie:'secret-cookie'}});
  assert.equal(visit.status,200);
  const created=await request('/api/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'SecurityReader'})});
  assert.equal(created.status,201);
  const body=await created.json(),cookies=created.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  assert.deepEqual(rows().map(row=>row.event_type),['page_visit','registration_attempt','registration_success']);
  assert.equal(rows()[0].user_id,null);
  assert.equal(rows()[0].client_ip,'127.0.0.1');
  assert.equal(rows()[0].browser_family,'Chrome');
  assert.equal(rows()[2].subject_user_id,body.user.id);
  assert.equal(rows()[2].user_id,body.user.id);
  assert.equal(rows()[2].subject_username,'SecurityReader');
  assert.equal(rows()[1].operation_id,rows()[2].operation_id);
  assert.equal(S.db.prepare('SELECT count(*) n FROM security_event_raw').get().n,3);
  assert.equal(JSON.stringify(S.db.prepare('SELECT * FROM security_event_raw').all()).includes('secret-cookie'),false);
  await request('/api/posts');
  assert.equal(rows().length,3);
  const denied=await request('/api/session/recover',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'SecurityReader',recovery_key:'wrong-secret-long-enough'})});
  assert.equal(denied.status,401);
  assert.deepEqual(rows().slice(-2).map(row=>row.event_type),['login_attempt','login_failure']);
  assert.equal(JSON.stringify(S.db.prepare('SELECT * FROM security_event_raw').all()).includes('wrong-secret'),false);
  const own=await request('/api/admin/security-events',{headers:{cookie:cookies}});
  assert.equal(own.status,403);
  S.db.prepare("INSERT INTO user_roles(user_id,role) VALUES(?,'operator')").run(body.user.id);
  const listed=await request('/api/admin/security-events?event_type=registration_success',{headers:{cookie:cookies}});
  assert.equal(listed.status,200);
  assert.equal((await listed.json()).events.length,1);
  const detail=await request('/api/admin/security-events/'+rows()[0].event_id,{headers:{cookie:cookies}});
  assert.equal(detail.status,200);
  assert.equal((await detail.json()).raw_metadata.ip_source,'peer');
  assert.ok(S.db.prepare("SELECT 1 FROM audit_events WHERE action='security.event.inspect'").get());
  assert.equal(S.db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('expired sessions log once and restrictions distinguish actor from affected account',async()=>{
  const operator=S.identity.createProfile({name:'SecurityOperator'});
  const member=S.identity.createProfile({name:'SecurityMember'});
  S.db.prepare("INSERT INTO user_roles(user_id,role) VALUES(?,'operator')").run(operator.user.id);
  const operatorCookies=`hereme_session=${encodeURIComponent(operator.session.raw)}; hereme_csrf=${encodeURIComponent(operator.session.csrf)}`;
  const memberCookies=`hereme_session=${encodeURIComponent(member.session.raw)}; hereme_csrf=${encodeURIComponent(member.session.csrf)}`;
  const response=await request('/api/admin/users/'+member.user.id+'/restriction',{method:'POST',headers:{cookie:operatorCookies,'content-type':'application/json','x-csrf-token':operator.session.csrf},body:JSON.stringify({status:'suspended',reason:'Reviewed security incident'})});
  assert.equal(response.status,200);
  const suspended=rows().find(row=>row.event_type==='account_suspended'&&row.subject_user_id===member.user.id);
  assert.equal(suspended.user_id,operator.user.id);
  assert.equal(suspended.subject_username,'SecurityMember');
  assert.equal((await request('/api/me',{headers:{cookie:memberCookies}})).status,401);
  const duplicate=await request('/api/admin/users/'+member.user.id+'/restriction',{method:'POST',headers:{cookie:operatorCookies,'content-type':'application/json','x-csrf-token':operator.session.csrf},body:JSON.stringify({status:'suspended',reason:'Reviewed security incident'})});
  assert.equal(duplicate.status,409);
  assert.equal(rows().filter(row=>row.event_type==='account_suspended'&&row.subject_user_id===member.user.id).length,1);
  const expiry=S.identity.createProfile({name:'SecurityExpiry'});
  S.db.prepare("UPDATE sessions SET expires_at=datetime('now','-1 second') WHERE id_hash=?").run(S.identity.sha256(expiry.session.raw));
  const cookies=`hereme_session=${encodeURIComponent(expiry.session.raw)}`;
  await request('/api/me',{headers:{cookie:cookies}});
  await request('/api/me',{headers:{cookie:cookies}});
  assert.equal(rows().filter(row=>row.event_type==='session_expired'&&row.subject_user_id===expiry.user.id).length,1);
  assert.equal(S.db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('remaining event hooks persist the expected attempt, outcome, restriction and bounded rate-limit events',async()=>{
  const headers={'content-type':'application/json'};
  const failed=await request('/api/session',{method:'POST',headers,body:JSON.stringify({name:'x'})});
  assert.equal(failed.status,400);
  const registered=await request('/api/session',{method:'POST',headers,body:JSON.stringify({name:'SecurityLifecycle'})});
  assert.equal(registered.status,201);
  const created=await registered.json();
  const login=await request('/api/session/recover',{method:'POST',headers,body:JSON.stringify({name:'SecurityLifecycle',recovery_key:created.recovery_key})});
  assert.equal(login.status,200);
  const loginBody=await login.json();
  const loginCookies=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  assert.equal((await request('/api/session/logout',{method:'POST',headers:{...headers,cookie:loginCookies,'x-csrf-token':loginBody.csrf_token},body:'{}'})).status,200);
  const second=await request('/api/session/recover',{method:'POST',headers,body:JSON.stringify({name:'SecurityLifecycle',recovery_key:created.recovery_key})});
  assert.equal(second.status,200);
  const secondBody=await second.json();
  const secondCookies=second.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  assert.equal((await request('/api/session/revoke-all',{method:'POST',headers:{...headers,cookie:secondCookies,'x-csrf-token':secondBody.csrf_token},body:'{}'})).status,200);
  const operator=S.identity.createProfile({name:'SecurityBanOperator'});
  const target=S.identity.createProfile({name:'SecurityBanTarget'});
  S.db.prepare("INSERT INTO user_roles(user_id,role) VALUES(?,'operator')").run(operator.user.id);
  const operatorCookies=`hereme_session=${encodeURIComponent(operator.session.raw)}; hereme_csrf=${encodeURIComponent(operator.session.csrf)}`;
  const banned=await request('/api/admin/users/'+target.user.id+'/restriction',{method:'POST',headers:{...headers,cookie:operatorCookies,'x-csrf-token':operator.session.csrf},body:JSON.stringify({status:'banned',reason:'Reviewed incident evidence'})});
  assert.equal(banned.status,200);
  const before=rows().filter(row=>row.event_type==='rate_limit_triggered').length;
  for(let i=0;i<35;i++)await request('/api/session',{method:'POST',headers,body:JSON.stringify({name:'x'})});
  assert.equal(rows().filter(row=>row.event_type==='rate_limit_triggered').length,before+1);
  assert.ok(rows().some(row=>row.event_type==='registration_failure'));
  assert.ok(rows().some(row=>row.event_type==='login_success'&&row.subject_user_id===created.user.id));
  assert.ok(rows().some(row=>row.event_type==='login_success'&&row.user_id===created.user.id));
  assert.ok(rows().some(row=>row.event_type==='logout'&&row.user_id===created.user.id));
  assert.ok(rows().some(row=>row.event_type==='session_revoked'&&row.subject_user_id===created.user.id));
  assert.ok(rows().some(row=>row.event_type==='account_banned'&&row.user_id===operator.user.id&&row.subject_user_id===target.user.id));
  assert.deepEqual([...new Set(rows().map(row=>row.event_type))].sort(),['page_visit','registration_attempt','registration_success','registration_failure','login_attempt','login_success','login_failure','logout','session_expired','session_revoked','rate_limit_triggered','account_suspended','account_banned'].sort());
  assert.equal(S.db.prepare('SELECT count(*) n FROM security_event_raw').get().n,rows().length);
});

test('public legal pages use reviewed runtime values and omit template placeholders',async()=>{
  for(const route of ['/privacy.html','/cookies.html','/terms.html']){
    const response=await request(route,{headers:{accept:'text/html'}});
    assert.equal(response.status,200);
    const html=await response.text();
    assert.match(html,/Tomasz Gliniecki/);
    assert.match(html,/privacy@example\.test/);
    assert.doesNotMatch(html,/\{\{(?:CONTROLLER|CONTACT|PROCESSORS)\}\}/);
    assert.match(html,/lang="nb"/);
    assert.match(html,/lang="en"/);
  }
});

test('a raw-row write failure rolls back its structured event and rejects account creation',async()=>{
  const before=rows().length;
  S.db.exec("CREATE TRIGGER reject_security_raw BEFORE INSERT ON security_event_raw BEGIN SELECT RAISE(ABORT,'simulated raw storage failure'); END");
  try{
    const response=await request('/',{headers:{accept:'text/html'}});
    assert.equal(response.status,503);
    assert.throws(()=>S.identity.createProfile({name:'SecurityStorageFailure',onCreated:({user})=>S.securityEvents.record('registration_success',{subject:user})}),error=>error.code==='SECURITY_LOG_UNAVAILABLE');
    assert.equal(rows().length,before);
    assert.equal(S.db.prepare("SELECT count(*) n FROM users WHERE name='SecurityStorageFailure'").get().n,0);
  }finally{S.db.exec('DROP TRIGGER reject_security_raw');}
});
