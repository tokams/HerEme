'use strict';
// Disposable M1 integration rehearsal. No SSH, production mounts or DNS changes.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {site, isolation} = require('../../tests/support/instance-contract.cjs');

const root = path.resolve(__dirname, '../..');
const prefix = 'm1' + crypto.randomBytes(6).toString('hex');
const projects = [], networks = [], volumes = [];
const imageTags = [];
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  !/^(COMPOSE_|INSTANCE_|APP_IMAGE_ID$|DATABASE_START$|DATA_VOLUME$|ARCHIVE_VOLUME$|EDGE_|MAIN_|COMMUNITY_|TLS_POLICY$|HTTPS?_BIND$|VAPID_|WEB_PUSH_|CADDY_IMAGE$)/i.test(name)));
function docker(args, extra = {}) {
  return execFileSync('docker',args,{cwd:__dirname,env:{...env,...extra},windowsHide:true,encoding:'utf8',
    stdio:['ignore','pipe','inherit'],maxBuffer:8*1024*1024}).trim();
}
function project(name,file,settings) {
  const stack = (...args) => docker(['compose','--env-file',emptyEnv,'-p',name,'-f',file,...args],settings);
  projects.push(stack);
  return stack;
}
function volume(suffix) {
  const name = prefix + '_' + suffix;
  docker(['volume','create',name]); volumes.push(name); return name;
}
function tenant(label,host,appId,caddy) {
  const name = prefix + '_' + label;
  const ingress = name + '_ingress';
  docker(['network','create','--internal',ingress]); networks.push(ingress);
  const subnet = JSON.parse(docker(['network','inspect','--format','{{json .IPAM.Config}}',ingress])).find(config=>/^\d+\./.test(config.Gateway));
  assert.ok(subnet, 'Docker ingress needs an IPv4 gateway');
  const octets = subnet.Gateway.split('.').map(Number);
  octets[3] += 1;
  assert.ok(octets[3]<255, 'Check the Docker IPv4 pool');
  const peer = octets.join('.');
  const data = volume(label+'_data'), archive = volume(label+'_archive');
  const keys = require('web-push').generateVAPIDKeys();
  const settings = {INSTANCE_PROJECT:name,INSTANCE_HOST:host,EDGE_PEER:peer,APP_IMAGE_ID:appId,CADDY_IMAGE:caddy,
    DATA_VOLUME:data,ARCHIVE_VOLUME:archive,DATABASE_START:'empty',WEBAUTHN_ENABLED:'true',WEB_PUSH_ENABLED:'1',
    VAPID_PRIVATE_KEY:keys.privateKey,VAPID_PUBLIC_KEY:keys.publicKey,VAPID_SUBJECT:'mailto:operator@example.test'};
  const compose = project(name,'instance.compose.yaml',settings);
  return {name,host,peer,compose,data,archive,settings,ingress};
}
const inspect = (id,format) => docker(['inspect','--format',format,id]);
function inspectTenant(tenant,image) {
  for (const service of ['app','worker','chat-worker','push-worker','content-git-worker','sidecar']) {
    const container = tenant.compose('ps','-q',service);
    const mounts = JSON.parse(inspect(container,'{{json .Mounts}}'));
    if(service!=='sidecar') {
      assert.equal(inspect(container,'{{.Image}}'),image);
      const expected = [tenant.data];
      if(service==='content-git-worker') expected.push(tenant.archive);
      assert.deepEqual(mounts.map(m=>m.Name).sort(),expected.sort());
    } else {
      assert.equal(mounts.some(m=>m.Name===tenant.data||m.Name===tenant.archive),false);
    }
    const mode=inspect(container,'{{.HostConfig.NetworkMode}}');
    if(service==='app') assert.equal(mode,tenant.ingress);
    else if(service==='sidecar') assert.equal(mode,'container:'+tenant.compose('ps','-q','app'));
    else assert.equal(mode,service==='push-worker'?tenant.name+'_egress':'none');
    assert.equal(Object.keys(JSON.parse(inspect(container,'{{json .HostConfig.PortBindings}}'))||{}).length,0);
  }
}
function auditPeer(tenant,requestId) {
  assert.match(requestId,/^[a-f0-9-]{36}$/);
  return tenant.compose('exec','-T','app','node','-e',
    "const db=new (require('node:sqlite').DatabaseSync)('/var/lib/hereme/hereme.sqlite',{readOnly:true});console.log(db.prepare('select ip_hash from security_events where request_id=?').get(process.argv[1]).ip_hash)",requestId);
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(),'hereme-m1-'));
const emptyEnv = path.join(scratch,'empty.env');
fs.writeFileSync(emptyEnv,'');
async function run() {
  const context = docker(['context','show']);
  const endpoint = env.DOCKER_HOST || docker(['context','inspect',context,'--format','{{.Endpoints.docker.Host}}']);
  assert.match(endpoint,/^(?:unix:\/\/\/|npipe:\/\/\/\/\.\/pipe\/)/i,'Use a local development Docker socket for this rehearsal');
  assert.equal(docker(['info','--format','{{.OSType}}']),'linux','Select a development Linux Docker engine');
  console.log('Rehearsal project prefix: '+prefix);
  const buildTag='hereme-m1:'+prefix;
  docker(['build','--load','-t',buildTag,'-f',path.join(root,'deploy/docker/Dockerfile'),root]);
  imageTags.push(buildTag);
  const image = docker(['image','inspect','--format','{{.Id}}',buildTag]);
  assert.match(image,/^sha256:[a-f0-9]{64}$/);
  docker(['pull','caddy:2-alpine']);
  const caddy = docker(['image','inspect','--format','{{index .RepoDigests 0}}','caddy:2-alpine']);
  const a=tenant('main','hereme.no',image.slice(7),caddy);
  const b=tenant('community','tanteulrikkesvei.hereme.no',image.slice(7),caddy);
  const gateway=project(prefix+'_edge','edge.compose.yaml',{
    EDGE_PROJECT:prefix+'_edge', MAIN_PROJECT:a.name, COMMUNITY_PROJECT:b.name,
    MAIN_EDGE_PEER:a.peer, COMMUNITY_EDGE_PEER:b.peer, EDGE_DATA_VOLUME:volume('tls'),EDGE_CONFIG_VOLUME:volume('config'),
    TLS_POLICY:'development', CADDY_IMAGE:caddy
  });
  // Claim the trusted peer address on each empty network before Docker assigns app addresses.
  gateway('up','-d','--wait');
  a.compose('up','-d','--wait'); b.compose('up','-d','--wait');
  inspectTenant(a,image); inspectTenant(b,image);
  const edgeId = gateway('ps','-q','edge');
  gateway('exec','-T','edge','caddy','validate','--config','/etc/caddy/Caddyfile');
  gateway('exec','-T','edge','caddy','reload','--config','/etc/caddy/Caddyfile');
  const rootFile=path.join(scratch,'development-ca.crt');
  docker(['cp',edgeId+':/data/caddy/pki/authorities/local/root.crt',rootFile]);
  const ca=fs.readFileSync(rootFile);
  const main=site(a.host,18443,ca), community=site(b.host,18443,ca);
  const state=await isolation(main,community);
  const alias=await site('www.hereme.no',18443,ca).request('/?post=7');
  assert.equal(alias.status,307); assert.equal(alias.headers.location,'https://hereme.no/?post=7');
  assert.equal((await site('unlisted.hereme.no',18080).request('/api/meta')).status,421);
  await assert.rejects(site('unlisted.hereme.no',18443,ca).request('/api/meta'));
  assert.equal((await main.request('/api/meta',{headers:{host:b.host}})).status,421);

  // Compare the app's audit hash to the actual TCP source of an external-to-ingress client.
  const probe = docker(['run','--rm','--network',prefix+'_edge_public','-v',rootFile+':/probe-ca:ro',image,
    'node','-e',`const https=require('node:https'),fs=require('node:fs');
    const req=https.request({hostname:'edge',servername:'hereme.no',ca:fs.readFileSync('/probe-ca'),method:'POST',path:'/api/session',
      headers:{Host:'hereme.no',Origin:'https://invalid.test','X-Forwarded-For':'192.0.2.1','X-Hereme-Client':'192.0.2.2'}},
      res=>{if(res.statusCode!==403)throw Error('unexpected status '+res.statusCode);
      console.log(JSON.stringify({ip:req.socket.localAddress,id:res.headers['x-request-id']}));res.resume()});req.end()`]);
  const {ip,id} = JSON.parse(probe);
  assert.equal(auditPeer(a,id),crypto.createHash('sha256').update(ip).digest('hex').slice(0,20));
  const bId=b.compose('ps','-q','app');
  a.compose('down');
  assert.equal((await community.request('/api/me',{user:state.other})).status,200);
  // Exercise a second, schema-compatible image ID without altering application data or code.
  const candidateContext=path.join(scratch,'candidate');
  fs.mkdirSync(candidateContext);
  fs.writeFileSync(path.join(candidateContext,'Dockerfile'),'FROM '+buildTag+'\nLABEL hereme.rehearsal.release="2"\n');
  const candidateTag='hereme-m1:'+prefix+'-next';
  docker(['build','--load','-t',candidateTag,candidateContext]);
  imageTags.push(candidateTag);
  const candidate=docker(['image','inspect','--format','{{.Id}}',candidateTag]);
  assert.match(candidate,/^sha256:[a-f0-9]{64}$/);
  assert.notEqual(candidate,image);
  a.settings.APP_IMAGE_ID=candidate.slice(7);
  a.settings.DATABASE_START='existing';
  a.compose('up','-d','--wait');
  inspectTenant(a,candidate);
  inspectTenant(b,image);
  assert.equal(b.compose('ps','-q','app'),bId);
  assert.equal((await main.request('/api/me',{user:state.author})).body.user.id,state.author.id);
  assert.equal((await main.request(state.media)).status,200);
  assert.equal((await community.request(state.media)).status,404);
  console.log('Passed two-project HTTPS, image, mount, peer IP, network, cookie, chat, media, WSS and independent replacement checks. Image '+image);
}
async function main() {
  try { await run(); }
  finally {
    for(const stack of projects.reverse()) stack('down','-v');
    for(const name of networks) docker(['network','rm',name]);
    for(const name of volumes) docker(['volume','rm',name]);
    for(const tag of imageTags.reverse()) docker(['image','rm',tag]);
    fs.rmSync(scratch,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
