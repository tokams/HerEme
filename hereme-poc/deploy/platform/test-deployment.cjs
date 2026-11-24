'use strict';
// Run only against a local development Docker Engine. All names and preserved volumes belong to this run.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {site, register, isolation} = require('../../tests/support/instance-contract.cjs');
const {totp} = require('../../server/platform/operator');
const root = path.resolve(__dirname,'../..');
const prefix = 'cut' + crypto.randomBytes(5).toString('hex');
const volume = prefix + '_workspace';
const legacyTemp = fs.mkdtempSync(path.join(os.tmpdir(),'hereme-legacy-'));
const legacyArchive = path.join(legacyTemp,'baseline.tar');
const host = 'hereme.no', other = 'tanteulrikkesvei.hereme.no', admin = 'admin.hereme.no';
function docker(args, capture=false) {
  return execFileSync('docker',args,{encoding:'utf8',stdio:['ignore',capture?'pipe':'inherit','inherit'],windowsHide:true})?.trim();
}
const get = (...args) => docker(args,true);
const run = (...args) => docker(args);
function base32(seed) {
  const bits = [...seed].map(char=>'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char).toString(2).padStart(5,'0')).join('');
  return Buffer.from(bits.match(/.{8}/g).map(byte=>parseInt(byte,2)));
}
async function browserPanel(credentials, code) {
  const browser = await require('playwright').chromium.launch({args:[
    '--no-proxy-server','--host-resolver-rules=MAP admin.hereme.no 127.0.0.1:18444'
  ]});
  try {
    const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:390,height:844}});
    await page.goto('https://admin.hereme.no/');
    await page.getByLabel('Username').fill('operator');
    await page.getByLabel('Password').fill(credentials);
    await page.getByLabel('Authenticator code').fill(code);
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.getByRole('heading',{name:'Communities'}).waitFor();
    await page.getByRole('link',{name:'Database Explorer'}).click();
    await page.getByRole('link',{name:'main',exact:true}).first().click();
    await page.getByRole('link',{name:'security_events',exact:true}).first().click();
    await page.locator('table').first().waitFor();
    await page.goto('https://admin.hereme.no/');
    await page.getByRole('heading',{name:'Communities'}).waitFor();
    const card=page.locator('article').filter({hasText:'Tante Ulrikkes vei'});
    const qr=card.locator('img[alt="QR code for tanteulrikkesvei.hereme.no"]');
    await qr.waitFor();
    assert.equal(await qr.getAttribute('src'),'/api/sites/community/qr.svg');
    await card.getByRole('button',{name:'Close registration'}).waitFor();
    page.on('dialog',dialog=>dialog.accept());
    await card.getByRole('button',{name:'Close registration'}).click();
    await card.getByRole('button',{name:'Open registration'}).click();
    await card.getByRole('button',{name:'Close registration'}).waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.setViewportSize({width:1280,height:800});
    await page.getByRole('button',{name:'Refresh status'}).click();
    await page.getByRole('button',{name:'Sign out'}).click();
    await page.getByRole('heading',{name:'Operator sign-in'}).waitFor();
  } finally {await browser.close();}
}
async function test() {
  const endpoint = process.env.DOCKER_HOST || get('context','inspect',get('context','show'),'--format','{{.Endpoints.docker.Host}}');
  assert.match(endpoint,/^(?:unix:\/\/\/|npipe:\/\/\/\/\.\/pipe\/)/i);
  assert.equal(get('info','--format','{{.OSType}}'),'linux');
  console.log('Cutover rehearsal '+prefix);
  const controller = prefix+'-controller:test';
  run('build','-t',controller,'-f',path.join(__dirname,'tests/controller.Dockerfile'),path.join(__dirname,'tests'));
  run('volume','create',volume);
  const base = get('volume','inspect','--format','{{.Mountpoint}}',volume);
  const socket='/var/run/docker.sock';
  execFileSync('git',['-C',path.dirname(root),'archive','--format=tar','--output='+legacyArchive,'0a93b6c:hereme-poc']);
  const mounts=['-v',volume+':'+base,'-v',socket+':'+socket,'-v',root+':/src:ro','-v',legacyArchive+':/baseline.tar:ro'];
  const gid=get('run','--rm',...mounts,controller,'stat','-c','%g',socket);
  run('run','--rm','-v',volume+':'+base,controller,'chown','1000:1000',base);
  const controllerArgs=['run','--rm','-e','HOME=/tmp','-e','DATA_VOLUME=invalid-inherited-volume','--user','1000:1000','--group-add',gid,...mounts,controller];
  const phase=name=>run(...controllerArgs,'python3','/src/deploy/platform/tests/fixture.py',base,prefix,name);
  const file=relative=>get(...controllerArgs,'cat',base+'/'+relative);
  const cid=(project,svc)=>get('ps','-q','--filter','label=com.docker.compose.project='+prefix+'_'+project,'--filter','label=com.docker.compose.service='+svc);
  phase('first');
  const ca=file('platform/state/ca/root.crt');
  const main=site(host,18444,ca),community=site(other,18444,ca),panel=site(admin,18444,ca);
  const before=get('exec',cid('main','app'),'cat','/var/lib/hereme/fixture-session');
  const legacyUser=()=>main.request('/api/me',{headers:{cookie:before}});
  assert.equal((await legacyUser()).body.user.name,'BeforeCutover');
  const existingPosts=(await main.request('/api/posts')).body.posts.map(p=>p.title);
  assert.ok(existingPosts.includes('Before cutover'));
  const state=await isolation(main,community,existingPosts);
  const signin=async(instance,contents)=>{
    const key=/Recovery key: (.+)/.exec(contents)[1].trim();
    const res=await instance.request('/api/session/recover',{method:'POST',body:{name:'HerEmeAdmin',recovery_key:key}});
    assert.equal(res.status,200);
    return {headers:{cookie:res.headers['set-cookie'].map(x=>x.split(';')[0]).join('; '),'x-csrf-token':res.body.csrf_token}};
  };
  const mainStaff=await signin(main,file('main-staff.txt'));
  const communityStaff=await signin(community,file('platform/state/secrets/tanteulrikkesvei-staff-credentials.txt'));
  for(const [instance,user] of [[main,mainStaff],[community,communityStaff]]) {
    assert.equal((await instance.request('/api/admin/overview',{user})).status,200);
    assert.equal((await instance.request('/api/admin/security-events',{user})).status,200);
    assert.equal((await panel.request('/api/sites',{user})).status,401);
  }
  assert.equal((await community.request('/api/admin/overview',{user:mainStaff})).status,401);
  const credentials=file('platform/state/secrets/platform-operator.txt');
  const password=/^Password: (.+)$/m.exec(credentials)[1];
  const secret=base32(/^Authenticator setup key: (.+)$/m.exec(credentials)[1]);
  const loginBody={name:'operator',password,code:totp(secret,Math.floor(Date.now()/30000))};
  const login=()=>panel.request('/api/login',{method:'POST',body:loginBody});
  const result=await login();
  assert.equal(result.status,200);
  assert.equal((await login()).status,401);
  const session=result.headers['set-cookie'][0];
  assert.match(session,/^__Host-hereme_operator=.*; Path=\/; HttpOnly; Secure; SameSite=Strict/);
  const cookie=session.split(';')[0];
  assert.equal((await panel.request('/databases/main.json?sql=select+1')).status,401);
  const query=(db,sql)=>panel.request('/databases/'+db+'.json?sql='+encodeURIComponent(sql),{headers:{cookie}});
  for(const database of ['main','community']) {
    const joined=await query(database,'SELECT e.event_id, json_extract(r.raw_metadata_json,\'$.ip_source\') FROM security_events e JOIN security_event_raw r USING(event_id) LIMIT 2');
    assert.equal(joined.status,200,JSON.stringify(joined.body));
    assert.ok(joined.body.rows.length);
    assert.equal((await query(database,'SELECT token_hash FROM users')).status,400);
    assert.equal((await query(database,'DELETE FROM users')).status,400);
  }
  assert.deepEqual((await query('platform','SELECT name FROM operators')).body.rows,[['operator']]);
  assert.equal((await query('platform','SELECT otp FROM operators')).status,400);
  const limited=await query('main','WITH RECURSIVE n(v) AS (VALUES(1) UNION ALL SELECT v+1 FROM n WHERE v<750) SELECT v FROM n');
  assert.equal(limited.body.rows.length,500);
  assert.ok((await query('main','WITH RECURSIVE n(v) AS (VALUES(1) UNION ALL SELECT v+1 FROM n) SELECT max(v) FROM n')).status>=400);
  assert.equal((await query('missing','SELECT 1')).status,404);
  assert.ok((await panel.request('/databases/main.db',{headers:{cookie}})).status>=400);
  assert.equal((await query('main','SELECT name FROM users WHERE name=\'OpenOnMain\'')).body.rows.length,0);
  const overview=()=>panel.request('/api/sites',{headers:{cookie}});
  const initial=(await overview()).body;
  assert.ok(initial.audit.some(entry=>entry.actor==='operator' && entry.action==='database query'
    && /^SQL SHA-256 [a-f0-9]{64}$/.test(entry.detail)));
  assert.deepEqual(initial.sites.map(s=>[s.hostname,s.ready,s.registrationOpen,s.release]),
    [[host,true,true,'1'.repeat(40)],[other,true,true,'1'.repeat(40)]]);
  assert.equal((await main.request('/api/admin/overview',{headers:{cookie}})).status,401);
  await browserPanel(password,totp(secret,Math.floor(Date.now()/30000)+1));
  const toggle=(open,headers={})=>panel.request('/api/sites/community/registration',{method:'POST',
    headers:{cookie,'x-csrf-token':initial.csrf,...headers},body:{registrationOpen:open}});
  assert.equal((await toggle(false,{'x-csrf-token':''})).status,403);
  assert.equal((await toggle(false,{origin:main.origin})).status,403);
  assert.equal((await toggle(false)).status,200);
  const signupClosed=()=>community.request('/api/session',{method:'POST',body:{name:'ClosedSignup'}});
  assert.equal((await signupClosed()).status,403);
  assert.equal((await community.request('/api/me',{user:state.other})).status,200);
  await register(main,'OpenOnMain');
  assert.deepEqual((await query('main','SELECT name FROM users WHERE name=\'OpenOnMain\'')).body.rows,[['OpenOnMain']]);
  run('stop',cid('edge','platform'));
  assert.equal((await signupClosed()).status,403);
  assert.equal((await main.request(state.media)).status,200);
  const panelId=get('ps','-aq','--filter','label=com.docker.compose.project='+prefix+'_edge','--filter','label=com.docker.compose.service=platform');
  run('start',panelId);
  const sidecar=cid('community','sidecar');
  run('stop',sidecar);
  try {
    const status=(await overview()).body;
    assert.equal(status.sites[0].ready,true);
    assert.equal(status.sites[1].ready,false);
  } finally {run('start',sidecar);}
  const mainId=cid('main','app'),communityId=cid('community','app');
  assert.throws(()=>phase('rollback'));
  assert.notEqual(cid('main','app'),mainId,'The failed activation must exercise main recovery');
  assert.equal(cid('community','app'),communityId);
  assert.equal((await legacyUser()).body.user.name,'BeforeCutover');
  assert.equal((await overview()).body.sites[1].release,'1'.repeat(40));
  phase('second');
  assert.deepEqual((await query('main',"SELECT name FROM users WHERE name='OpenOnMain'")).body.rows,[['OpenOnMain']]);
  assert.equal((await signupClosed()).status,403);
  const updated=(await overview()).body;
  assert.ok(updated.sites.every(s=>s.ready && s.release==='3'.repeat(40)));
  assert.ok(updated.audit.some(a=>a.action==='registration applied' && a.site==='community' && a.detail==='closed'));
  assert.equal((await legacyUser()).body.user.name,'BeforeCutover');
  assert.equal((await main.request(state.media)).status,200);
  assert.equal((await main.request(state.messages,{user:state.author})).status,200);
  assert.equal((await toggle(true)).status,200);
  await register(community,'ReopenedSignup');
  const logout=await panel.request('/api/logout',{method:'POST',headers:{cookie,'x-csrf-token':initial.csrf},body:{}});
  assert.equal(logout.status,200);
  assert.equal((await query('platform','SELECT 1')).status,401);
  assert.equal((await overview()).status,401);
  console.log('Passed legacy migration, both staff panels, MFA, isolation, live health, registration, outage, failed rollout recovery and second release.');
}
function cleanup() {
  // Only remove resources with this cryptographically random rehearsal namespace.
  for(const [kind,list,remove] of [
    ['container',['ps','-a','--format','{{.Names}}'],['rm','-f']],
    ['network',['network','ls','--format','{{.Name}}'],['network','rm']],
    ['volume',['volume','ls','--format','{{.Name}}'],['volume','rm']],
    ['image',['image','ls','--format','{{.Repository}}:{{.Tag}}'],['image','rm']]
  ]) {
    const names=get(...list).split(/\r?\n/).filter(n=>n.startsWith(prefix+'_')||n.startsWith(prefix+'-'));
    if(names.length)run(...remove,...names);
  }
}
test().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>{
  try {cleanup();} finally {fs.rmSync(legacyTemp,{recursive:true,force:true});}
});
