'use strict';
const web=require('./mini-web');
const upload=require('./mini-upload');
const qrcode=require('./qr');
const os=require('node:os');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {DomainError}=require('./domain/errors');
const {requestMetadata}=require('./domain/security-events');
const {localizeError}=require('./error-localization');
const {readPolicy}=require('./platform/policy');
const registrationOpen=()=>!process.env.HEREME_REGISTRATION_POLICY || readPolicy(process.env.HEREME_REGISTRATION_POLICY).registrationOpen;
const {themes}=require('../public/themes');
const S=require('./services');
if(S.config.environment!=='test')S.sharePreviews.backfill();
const {listenAvailable}=require('./listen');
const {attachChatSocket}=require('./chat-socket');
const shareMeta=require('./share-meta');
const app=web();
const httpListen=app.listen;app.listen=(...args)=>{const server=httpListen(...args);attachChatSocket(server,{db:S.db,identity:S.identity,config:S.config});return server;};
const runtimeMetrics={errors:0,rate_limited:0,started_at:new Date().toISOString()};
const imageUpload=upload({storage:upload.memoryStorage(),limits:{fileSize:12*1024*1024,files:1}});
const avatarUpload=upload({storage:upload.memoryStorage(),limits:{fileSize:S.avatars.MAX_BYTES,files:1}});
const errors=(res,status,code,message,details)=>res.status(status).json({error:{code,message:localizeError(res.request,code,message),details:details||undefined}});
async function syncSharePreview(id){const post=S.posts.visible(Number(id));if(post)await S.sharePreviews.queue(post);else S.sharePreviews.invalidate(Number(id));}
const ip=req=>requestMetadata(req,S.config).fields.client_ip||'unknown-peer';
const ipKey=req=>crypto.createHash('sha256').update(String(ip(req))).digest('hex').slice(0,20);
const security=(req,event,details={})=>S.securityEvents.record(event,{req,routeClass:'authentication',...details});
function lanIps(){
  const found=[];for(const [name,entries] of Object.entries(os.networkInterfaces()))for(const entry of entries||[])if(entry.family==='IPv4'&&!entry.internal&&!entry.address.startsWith('169.254.'))found.push({name,ip:entry.address});
  found.sort((a,b)=>{const score=x=>/vpn|virtual|docker|vethernet|veth|tailscale|wsl|hyper-v/i.test(x.name)?2:/wi-?fi|wireless|wlan|ethernet|eth\d/i.test(x.name)?0:1;return score(a)-score(b);});return found;
}
function write(capability,limit=60,bucket=capability||'write'){return (req,res,next)=>{req.auth=S.identity.requireUser(req,res);S.identity.requireCsrf(req,req.auth);if(capability)S.identity.requireCapability(req.auth,capability);S.rate.check(`${bucket}:${req.auth.id}`,limit);next();};}
function read(capability){return (req,res,next)=>{req.auth=S.identity.requireUser(req,res);if(capability)S.identity.requireCapability(req.auth,capability);next();};}
function activity(items){
  const selected=new Map(items.map(post=>[post.id,post]));if(!selected.size)return {stats:{posts:0,comments:0},discussions:[],recent_comments:[]};
  const placeholders=[...selected].map(()=>'?').join(',');
  const comments=S.db.prepare(`SELECT c.id,c.post_id,c.body,c.created_at,COALESCE(CASE WHEN u.status='active' THEN u.name END,c.demo_author,'anonym') author,CASE WHEN u.status='active' THEN u.id ELSE NULL END author_public_id
    FROM comments c LEFT JOIN users u ON u.id=c.author_id WHERE c.post_id IN (${placeholders})
    ORDER BY c.created_at DESC,abs(c.id) DESC LIMIT 25`).all(...selected.keys());
  const latest=new Map();for(const comment of comments)if(!latest.has(comment.post_id))latest.set(comment.post_id,comment.created_at);
  return {stats:{posts:items.length,comments:items.reduce((n,p)=>n+p.comment_count,0)},
    discussions:items.filter(p=>p.comment_count).sort((a,b)=>String(latest.get(b.id)||'').localeCompare(String(latest.get(a.id)||''))||b.comment_count-a.comment_count).slice(0,4).map(({id,title,category,comment_count,synthetic_demo})=>({id,title,category,comment_count,synthetic_demo})),
    recent_comments:comments.slice(0,4).map(comment=>({...comment,body:comment.body.slice(0,140),post_title:selected.get(comment.post_id).title,category:selected.get(comment.post_id).category,synthetic_demo:selected.get(comment.post_id).synthetic_demo}))};
}

app.disable('x-powered-by');
app.use((req,res,next)=>{
  res.request=req;
  req.id=crypto.randomUUID();res.set('X-Request-Id',req.id);res.set('X-Content-Type-Options','nosniff');res.set('X-Frame-Options','DENY');res.set('Referrer-Policy','same-origin');
  res.set('Permissions-Policy','camera=(self), microphone=(self), geolocation=()');
  res.set('Content-Security-Policy',`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'${S.config.production?'; upgrade-insecure-requests':''}`);
  if(S.config.production){
    const expected=new URL(S.config.publicOrigin).host;if(req.headers.host!==expected)return errors(res,421,'HOST_INVALID','Ugyldig vertsnavn.');
    if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.origin!==S.config.publicOrigin)return errors(res,403,'ORIGIN_INVALID','Ugyldig forespørselsopprinnelse.');
  }
  next();
});
app.use(web.json({limit:'256kb'}));
app.use((req,res,next)=>{
  if(req.method==='GET'&&!req.headers['purpose']&&!req.headers['sec-purpose']&&req.headers.accept?.includes('text/html')&&
    (req.pathname==='/'||['/chat','/me','/privacy.html','/rules.html','/cookies.html','/terms.html'].includes(req.pathname)||/^\/(?:u|chat)\/[^/]+$/.test(req.pathname))){
    security(req,'page_visit',{actor:S.identity.readSession(req,res,{allowLegacy:false}),routeClass:'document',statusCode:200});
  }
  next();
});
app.use(async(req,res,next)=>{
  if(req.pathname!=='/'||!['GET','HEAD'].includes(req.method)||!Object.hasOwn(req.query,'post'))return next();
  const id=Number(req.query.post),post=Number.isSafeInteger(id)&&id>0?S.posts.visible(id):null;
  if(post)await S.sharePreviews.queue(post);
  const image=post?S.sharePreviews.image(post):null;
  const shell=fs.readFileSync(path.resolve(__dirname,'..','public','index.html'),'utf8');
  res.status(post?200:404).set('Content-Type','text/html; charset=utf-8').set('Cache-Control','no-store').send(shareMeta.render(shell,post,image,S.config.publicOrigin));
});
app.use('/share-previews',(req,res,next)=>{
  if(!['GET','HEAD'].includes(req.method))return next();
  const match=/^\/share-previews\/(\d+)\/([0-9a-f]{20})\.jpg$/.exec(req.pathname),file=match&&S.sharePreviews.file(match[1],match[2]);
  if(!file)return res.status(404).send('Not found.');
  res.set('Content-Type','image/jpeg').set('Cache-Control','no-store').send(fs.readFileSync(file));
});
app.use('/uploads',(req,res,next)=>{const original=req.pathname;req.pathname=req.pathname.slice(8)||'/';web.static(path.join(S.dataDir,'uploads'))(req,res,()=>{req.pathname=original;next();});});
app.use('/media',(req,res,next)=>{
  const original=req.pathname,mediaId=/^\/media\/([0-9a-f-]{36})\//.exec(original)?.[1];
  if(!mediaId)return res.status(404).send('Not found.');
  if(mediaId){
    const mediaRow=S.db.prepare('SELECT owner_id FROM media WHERE id=?').get(mediaId);
    if(!mediaRow)return res.status(404).send('Not found.');
    const asset=S.db.prepare('SELECT a.owner_id,a.post_id,p.status FROM article_assets a LEFT JOIN posts p ON p.id=a.post_id WHERE a.media_id=?').get(mediaId);
    if(asset){
      const publicReference=asset.status==='published'&&S.db.prepare("SELECT 1 FROM content_media_references mr JOIN content_revisions r ON r.post_id=mr.post_id AND r.version=mr.version WHERE mr.media_id=? AND r.visibility='public' LIMIT 1").get(mediaId);
      if(!publicReference&&S.identity.readSession(req,res)?.id!==asset.owner_id)return res.status(404).send('Not found.');
    }else if(!S.db.prepare("SELECT 1 FROM post_media pm JOIN posts p ON p.id=pm.post_id WHERE pm.media_id=? AND p.status='published'").get(mediaId)&&S.identity.readSession(req,res)?.id!==mediaRow.owner_id)return res.status(404).send('Not found.');
  }
  req.pathname=req.pathname.slice(6)||'/';web.static(path.join(S.dataDir,'media'))(req,res,()=>{req.pathname=original;next();});
});
const legalEscape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
for(const [route,file] of [['/privacy.html','privacy.html'],['/cookies.html','cookies.html'],['/terms.html','terms.html']])app.get(route,(req,res)=>{
  if(!S.config.legalReady)return errors(res,503,'LEGAL_CONFIG_REQUIRED','Juridisk kontaktinformasjon mangler.');
  const html=fs.readFileSync(path.resolve(__dirname,'..','public',file),'utf8')
    .replaceAll('{{CONTROLLER}}',legalEscape(S.config.legalController))
    .replaceAll('{{CONTACT}}',legalEscape(S.config.legalContact))
    .replaceAll('{{PROCESSORS}}',legalEscape(S.config.legalProcessors));
  res.set('Content-Type','text/html; charset=utf-8').set('Cache-Control','no-store').send(html);
});
app.use(web.static(path.resolve(__dirname,'..','public'),{extensions:['html']}));
function appShell(name,res){res.set('Content-Type','text/html; charset=utf-8').send(fs.readFileSync(path.resolve(__dirname,'..','public',name)));}
app.get('/chat',(req,res)=>appShell('chat.html',res));
app.get('/chat/:id',(req,res)=>appShell('chat.html',res));
app.get('/staff',(req,res)=>appShell('index.html',res));
app.get('/me',(req,res)=>appShell('index.html',res));
app.get('/u/:id',(req,res)=>appShell('index.html',res));

app.get('/api/live',(req,res)=>res.json({ok:true,name:'HerEme'}));
app.get('/api/health',(req,res)=>{const worker=S.db.prepare('SELECT last_run FROM push_worker_state WHERE id=1').get();res.json({ok:true,name:'HerEme',storage:'SQLite',runtime:runtimeMetrics,chat_worker:S.db.prepare('SELECT last_run,overdue FROM chat_worker_state WHERE id=1').get()||null,push:{enabled:S.push.enabled(),worker_fresh:!S.push.enabled()||Boolean(worker&&Date.now()-new Date(worker.last_run+'Z').getTime()<120000)}});});
app.get('/api/admin/content-git/status',read('staff:read'),(req,res)=>res.json({jobs:S.db.prepare('SELECT status,count(*) count FROM content_git_outbox GROUP BY status').all(),purges_pending:S.db.prepare('SELECT count(*) count FROM content_git_purges WHERE completed_at IS NULL').get().count,media_purges_pending:S.db.prepare('SELECT count(*) count FROM content_media_purges WHERE completed_at IS NULL').get().count,last_error:S.db.prepare("SELECT last_error FROM content_git_outbox WHERE status='failed' ORDER BY next_attempt_at DESC LIMIT 1").get()?.last_error||null}));
app.get('/api/ready',(req,res)=>{
  const checks={database:false,foreign_keys:false,media:false,disk:false,schema:false,chat_worker:false};let message='';
  try{
    S.db.exec('BEGIN IMMEDIATE');try{S.db.prepare('UPDATE schema_migrations SET applied_at=applied_at WHERE version=24').run();S.db.exec('ROLLBACK');checks.database=true;}catch(error){if(S.db.isTransaction)S.db.exec('ROLLBACK');throw error;}
    if(process.env.HEREME_REGISTRATION_POLICY){checks.registration_policy=false;registrationOpen();checks.registration_policy=true;}
    checks.legal=S.config.legalReady;
    checks.foreign_keys=S.db.prepare('PRAGMA foreign_key_check').all().length===0;
    checks.schema=S.db.prepare('SELECT max(version) version FROM schema_migrations').get().version===24;
    const worker=S.db.prepare('SELECT last_run,overdue FROM chat_worker_state WHERE id=1').get();
    checks.chat_worker=Date.now()-new Date(runtimeMetrics.started_at).getTime()<120000||Boolean(worker&&Date.now()-new Date(worker.last_run).getTime()<120000&&worker.overdue===0);
    checks.media=['media','uploads','avatars','tmp'].every(name=>{const directory=path.join(S.dataDir,name);fs.accessSync(directory,fs.constants.R_OK|fs.constants.W_OK);return fs.statSync(directory).isDirectory();})&&S.avatars.verify();
    const stat=fs.statfsSync(S.dataDir);checks.disk=stat.bavail*stat.bsize>=S.config.minFreeBytes;
  }catch(error){message=error.message;}
  const ok=Object.values(checks).every(Boolean);res.status(ok?200:503).json({ok,checks,message:message||undefined});
});
app.get('/api/categories',(req,res)=>res.json({categories:themes}));
app.get('/api/meta',(req,res)=>{
  const port=req.socket.localPort;
  const features={video:S.config.enableVideo,locations:S.config.enableLocations,verification:S.config.enableVerification,staff_panel:true,web_push:S.push.enabled()};
  if(S.config.production)return res.json({port,public_origin:S.config.publicOrigin,connect_url:S.config.publicOrigin,features,release:process.env.HEREME_RELEASE||null});
  const ips=lanIps();res.json({port,connect_url:ips.length?`http://${ips[0].ip}:${port}`:`http://localhost:${port}`,addresses:ips.map(item=>({...item,url:`http://${item.ip}:${port}`})),features});
});
app.get('/api/connect-qr.svg',async(req,res,next)=>{if(S.config.production)return errors(res,404,'NOT_FOUND','Ikke tilgjengelig.');try{const ips=lanIps(),url=ips.length?`http://${ips[0].ip}:${req.socket.localPort}`:`http://localhost:${req.socket.localPort}`;res.type('svg').send(await qrcode.toString(url,{type:'svg',margin:2,width:260}));}catch(error){next(error);}});

app.post('/api/session',(req,res)=>{
  S.rate.check('profile:'+ipKey(req),30);
  const operationId=S.securityEvents.operation(),actor=S.identity.readSession(req,res,{allowLegacy:false});security(req,'registration_attempt',{operationId,actor,statusCode:null});
  try{
    if(!registrationOpen())throw new DomainError('REGISTRATION_CLOSED','Registrering er stengt i dette fellesskapet.',403);
    const result=S.identity.createProfile({name:req.body?.name,userAgent:req.headers['user-agent'],onCreated:({user,session})=>{
      S.identity.markFresh(user.id,S.identity.sha256(session.raw),'new_account');
      security(req,'registration_success',{operationId,actor:actor||user,subject:user,statusCode:201});
    }});S.identity.setCookie(res,result.session);
    res.status(201).json({user:result.user,csrf_token:result.session.csrf,recovery_key:result.recoveryKey,recovery_key_shown_once:true});
  }catch(error){if(error.code!=='SECURITY_LOG_UNAVAILABLE')security(req,'registration_failure',{operationId,actor,reasonCode:error.code||'INVALID_INPUT',statusCode:error.status||500});throw error;}
});
app.post('/api/session/recover',(req,res)=>{
  S.rate.check('recover:'+ipKey(req),10);
  const operationId=S.securityEvents.operation(),actor=S.identity.readSession(req,res,{allowLegacy:false});security(req,'login_attempt',{operationId,actor,authMethod:'recovery'});
  try{
    S.db.exec('BEGIN IMMEDIATE');let result;
    try{
      result=S.identity.recover({name:req.body?.name,recoveryKey:req.body?.recovery_key,userAgent:req.headers['user-agent']});
      S.identity.markFresh(result.user.id,S.identity.sha256(result.session.raw),'recovery');
      security(req,'login_success',{operationId,actor:actor||result.user,subject:result.user,authMethod:'recovery',statusCode:200});
      S.db.exec('COMMIT');
    }catch(error){S.db.exec('ROLLBACK');throw error;}
    S.identity.setCookie(res,result.session);
    res.json({user:result.user,csrf_token:result.session.csrf});
  }catch(error){if(error.code!=='SECURITY_LOG_UNAVAILABLE')security(req,'login_failure',{operationId,actor,authMethod:'recovery',reasonCode:error.code||'INVALID_INPUT',statusCode:error.status||500});throw error;}
});
app.post('/api/recovery/confirm',async(req,res,next)=>{try{
  const form=new URLSearchParams((await web.readBody(req,4096)).toString('utf8')),current=S.identity.requireUser(req,res);
  S.identity.requireCsrf(req,current,form.get('csrf_token'));
  if(form.get('username')!==current.name)return errors(res,400,'IDENTITY_MISMATCH','Pseudonymet samsvarer ikke med den aktive kontoen.');
  S.identity.confirmRecovery(current,form.get('password'));
  res.status(303).set('Location','/?recovery-saved=1').send('');
}catch(error){next(error);}});
app.get('/api/me',(req,res)=>{const current=S.identity.readSession(req,res);if(!current)return errors(res,401,'AUTH_REQUIRED','Ingen aktiv sesjon.');res.json({user:current,csrf_token:current.csrf||null,legacy_migrated:Boolean(current.legacyMigrated),recovery_key:current.recoveryKey||null,recovery_key_shown_once:Boolean(current.recoveryKey)});});
app.get('/api/avatars/:id/:version/:size',(req,res)=>{const file=S.avatars.file(req.params.id,req.params.version,req.params.size);res.set('Content-Type','image/webp').set('Cache-Control','private, no-store').send(fs.readFileSync(file));});
app.post('/api/me/avatar',write(null,10),avatarUpload.single('image'),async(req,res)=>res.status(201).json(await S.avatars.save(req.auth,req.file,req.body)));
app.delete('/api/me/avatar',write(null,10),(req,res)=>res.json(S.avatars.remove(req.auth)));
app.post('/api/session/logout',write(null,20),(req,res)=>{S.db.exec('BEGIN IMMEDIATE');try{S.push.disableDevice(req.auth,{id:req.body?.push_subscription_id,endpoint:req.body?.push_endpoint});S.identity.logout(req.auth);security(req,'logout',{actor:req.auth,statusCode:200});S.db.exec('COMMIT');}catch(error){S.db.exec('ROLLBACK');throw error;}S.identity.logout(null,res);res.json({ok:true});});
app.post('/api/session/revoke-all',write(null,5),(req,res)=>{S.db.exec('BEGIN IMMEDIATE');try{S.push.disableAll(req.auth);const sessions=S.db.prepare("SELECT id_hash FROM sessions WHERE user_id=? AND revoked_at IS NULL AND expires_at>datetime('now')").all(req.auth.id);S.identity.revokeAll(req.auth);for(const session of sessions)security(req,'session_revoked',{actor:req.auth,subject:req.auth,reasonCode:'USER_REVOKED',statusCode:200});S.db.exec('COMMIT');}catch(error){S.db.exec('ROLLBACK');throw error;}S.identity.logout(null,res);res.json({ok:true});});
app.post('/api/recovery/rotate',write(null,5),(req,res)=>{S.identity.requireFresh(req.auth);res.json({recovery_key:S.identity.rotateRecovery(req.auth),recovery_key_shown_once:true});});
app.patch('/api/me',write(null,10),(req,res)=>res.json({user:S.identity.rename(req.auth,req.body?.name)}));
app.get('/api/me/language',read(null),(req,res)=>res.json({preferred_language:req.auth.preferred_language}));
app.put('/api/me/language',write(null,20),(req,res)=>res.json(S.identity.language(req.auth,req.body?.preferred_language)));
app.get('/api/passkeys/config',(req,res)=>res.json(S.passkeys.configView()));
app.post('/api/passkeys/step-up',write(null,10),(req,res)=>res.json(S.identity.stepUp(req.auth,req.body?.recovery_key)));
app.post('/api/passkeys/registration/options',write(null,10),async(req,res,next)=>{try{res.json(await S.passkeys.registrationOptions(req.auth,req.body?.label));}catch(error){next(error);}});
app.post('/api/passkeys/registration/verify',write(null,10),async(req,res)=>res.status(201).json(await S.passkeys.verifyRegistration(req.auth,req.body)));
app.post('/api/passkeys/login/options',(req,res,next)=>{if(req.headers.origin!==S.config.webauthnOrigins[0])return errors(res,403,'ORIGIN_INVALID','Ugyldig forespørselsopprinnelse.');S.rate.check('passkey-options:'+ipKey(req),20);S.passkeys.loginOptions().then(result=>{res.set('Set-Cookie',`hereme_passkey_challenge=${encodeURIComponent(result.binding)}; Path=/api/passkeys/login; HttpOnly; SameSite=Strict; Max-Age=300${S.config.production?'; Secure':''}`);delete result.binding;res.json(result);},next);});
app.post('/api/passkeys/login/verify',async(req,res)=>{S.rate.check('passkey-login:'+ipKey(req),10);const operationId=S.securityEvents.operation(),actor=S.identity.readSession(req,res,{allowLegacy:false});security(req,'login_attempt',{operationId,actor,authMethod:'passkey'});try{if(req.headers.origin!==S.config.webauthnOrigins[0])throw new DomainError('ORIGIN_INVALID','Ugyldig forespørselsopprinnelse.',403);const result=await S.passkeys.verifyLogin(req.body,req.headers['user-agent'],S.identity.parseCookies(req).hereme_passkey_challenge||'',authenticated=>security(req,'login_success',{operationId,actor:actor||authenticated,subject:authenticated,authMethod:'passkey',statusCode:200}));S.identity.setCookie(res,result.session);res.json({user:result.user,csrf_token:result.session.csrf});}catch(error){if(error.code!=='SECURITY_LOG_UNAVAILABLE')security(req,'login_failure',{operationId,actor,authMethod:'passkey',reasonCode:error.code||'INVALID_INPUT',statusCode:error.status||500});throw error;}});
app.get('/api/me/passkeys',read(null),(req,res)=>res.json({passkeys:S.passkeys.list(req.auth)}));
app.patch('/api/me/passkeys/:id',write(null,10),(req,res)=>res.json(S.passkeys.rename(req.auth,req.params.id,req.body?.label)));
app.delete('/api/me/passkeys/:id',write(null,10),(req,res)=>res.json(S.passkeys.remove(req.auth,req.params.id,req.body?.confirm_recovery)));
app.delete('/api/me',write(null,3),(req,res)=>{S.push.disableAll(req.auth);S.accounts.deactivate(req.auth);S.identity.logout(req.auth,res);res.json({ok:true});});
app.get('/api/push/config',(req,res)=>res.json(S.push.configView()));
app.get('/api/push/subscriptions',read(null),(req,res)=>res.json({subscriptions:S.push.list(req.auth)}));
app.post('/api/push/subscriptions',write(null,20),(req,res)=>res.status(201).json({subscription:S.push.subscribe(req.auth,req.body)}));
app.delete('/api/push/subscriptions/:id',write(null,20),(req,res)=>res.json(S.push.disable(req.auth,req.params.id)));
app.get('/api/notification-settings',read(null),(req,res)=>res.json({settings:S.push.preferences(req.auth)}));
app.put('/api/notification-settings',write(null,20),(req,res)=>res.json({settings:S.push.setPreferences(req.auth,req.body)}));
app.get('/api/notifications',read(null),(req,res)=>res.json({notifications:S.notifications.list(req.auth,req.query.before),unread:S.notifications.unread(req.auth)}));
app.post('/api/notifications/:id/read',write(null,60),(req,res)=>{const result=S.notifications.read(req.auth,req.params.id);req.socket.server.emit('notification-read',req.auth.id);res.json({...result,unread:S.notifications.unread(req.auth)});});
app.get('/api/admin/push/health',read('staff:read'),(req,res)=>res.json({worker:S.db.prepare('SELECT * FROM push_worker_state WHERE id=1').get()||null,subscriptions:S.db.prepare('SELECT count(*) count FROM push_subscriptions WHERE disabled_at IS NULL').get().count,states:S.db.prepare('SELECT state,count(*) count FROM push_deliveries GROUP BY state').all()}));
app.get('/api/me/summary',read(null),(req,res)=>res.json(S.profile.summary(req.auth,req.query)));
app.get('/api/users/:id/public',(req,res)=>res.set('Cache-Control','no-store').json(S.publicProfiles.read(req.params.id)));
app.get('/api/chat/users',read(null),(req,res)=>{S.rate.check(`chat-search:${req.auth.id}`,180);res.json({users:S.chat.search(req.auth,req.query.q)});});
app.get('/api/chat/direct/:user',read(null),(req,res)=>res.json(S.chat.direct(req.auth,req.params.user)));
app.post('/api/chats/direct',write(null,30),(req,res)=>res.status(201).json(S.chat.startDirect(req.auth,req.body?.target_user_id,req.body?.body,req.body?.client_key,req.body?.attachment_ids)));
app.get('/api/chat/inbox',read(null),(req,res)=>res.json(S.chat.inbox(req.auth)));
app.post('/api/chat/requests/:id',write(null,30),(req,res)=>res.json(S.chat.decide(req.auth,req.params.id,req.body?.accept===true)));
app.post('/api/chat/blocks',write(null,30),(req,res)=>res.json(S.chat.block(req.auth,req.body?.user_id)));
app.get('/api/chats',read(null),(req,res)=>res.json({chats:S.chat.list(req.auth)}));
app.get('/api/chat/notifications',read(null),(req,res)=>res.json({notifications:S.chat.notifications(req.auth,req.query.before)}));
app.post('/api/chats/:id/read',write(null,120),(req,res)=>res.json(S.chat.markRead(req.auth,req.params.id)));
app.post('/api/chats',write(null,10,'chat:group:create'),(req,res)=>res.status(201).json(S.chat.group(req.auth,req.body?.name,req.body?.recipients,req.body?.opening)));
app.get('/api/chats/:id/messages',read(null),(req,res)=>res.json({messages:S.chat.messages(req.auth,req.params.id,req.query.before)}));
app.post('/api/chats/:id/messages',write(null,120),(req,res)=>res.status(201).json(S.chat.send(req.auth,req.params.id,req.body?.body,req.body?.client_key,req.body?.attachment_ids)));
app.get('/api/chats/:id/people',read(null),(req,res)=>res.json({people:S.chat.peers(req.auth,req.params.id)}));
app.post('/api/chats/:id/invites',write(null,30),(req,res)=>res.json(S.chat.invite(req.auth,req.params.id,req.body?.recipient_id)));
app.get('/api/chats/:id/invites',read(null),(req,res)=>res.json({invites:S.chat.pendingInvites(req.auth,req.params.id)}));
app.delete('/api/chats/:id/invites/:invite',write(null,30),(req,res)=>res.json(S.chat.cancelInvite(req.auth,req.params.id,req.params.invite)));
app.post('/api/chat/invites/:id',write(null,30),(req,res)=>res.json(S.chat.decideInvite(req.auth,req.params.id,req.body?.accept===true)));
app.delete('/api/chats/:id/membership',write(null,10),(req,res)=>res.json(S.chat.leave(req.auth,req.params.id)));
app.put('/api/chat/presence',write(null,120),(req,res)=>res.json(S.chat.presence(req.auth,req.body?.visible)));
app.post('/api/chat-uploads/stage',write(null,30),(req,res)=>res.status(201).json(S.chat.stage(req.auth,req.body||{})));
app.get('/api/chat-uploads/:id',read(null),(req,res)=>res.json((({id,bytes,received,status,name})=>({id,bytes,received,status,name}))(S.chat.stagedFile(req.auth,req.params.id))));
app.patch('/api/chat-uploads/:id',write(null,300),async(req,res)=>res.json(await S.chat.stageChunk(req.auth,req.params.id,req.headers['x-upload-offset'],req)));
app.delete('/api/chat-uploads/:id',write(null,30),(req,res)=>res.json(S.chat.discardStage(req.auth,req.params.id)));
app.get('/api/chat/files/:id',read(null),(req,res)=>res.json((({id,bytes,received,status,expires_at,name})=>({id,bytes,received,status,expires_at,name}))(S.chat.file(req.auth,req.params.id))));
app.get('/api/chat/files/:id/download',read(null),(req,res)=>S.chat.download(req.auth,req.params.id,res));
app.get('/api/chat/files/:id/preview',read(null),(req,res)=>S.chat.preview(req.auth,req.params.id,req,res));

app.get('/api/posts',(req,res)=>{const current=S.identity.readSession(req,res);res.json(S.posts.list({...req.query,userId:current?.id}));});
app.get('/api/activity',(req,res)=>{const current=S.identity.readSession(req,res);const page=S.posts.list({...req.query,limit:Math.min(Number(req.query.limit)||50,50),userId:current?.id});res.json({...activity(page.posts),next_cursor:page.next_cursor});});
app.get('/api/posts/:id',(req,res)=>{const current=S.identity.readSession(req,res),post=S.posts.visible(Number(req.params.id),current?.id);if(!post)return errors(res,404,'POST_NOT_FOUND','Innlegget finnes ikke.');res.json({post});});
app.post('/api/posts',write('post:create',12),imageUpload.single('image'),async(req,res)=>{const result=await S.posts.create(req.body||{},req.auth,req.file),post=S.posts.visible(result.id);if(post)await S.sharePreviews.queue(post);res.status(201).json(result);});
app.post('/api/article-assets/images',write('post:create',24),imageUpload.single('image'),async(req,res)=>res.status(201).json(await S.articles.uploadImage(req.file,req.auth)));
app.get('/api/article-assets/:id',(req,res)=>{const user=S.identity.readSession(req,res);if(!user)return errors(res,401,'AUTH_REQUIRED','Innlogging kreves.');res.json(S.articles.asset(req.params.id,user));});
app.post('/api/articles',write('post:create',12),async(req,res)=>{const result=S.articles.create(req.body||{},req.auth),post=S.posts.visible(result.id);if(post)await S.sharePreviews.queue(post);res.status(201).json(result);});
app.get('/api/me/article-drafts',read(),(req,res)=>res.set('Cache-Control','no-store').json(S.contentRevisions.listDrafts(req.auth)));
app.post('/api/articles/drafts',write('post:create',60,'article:draft'),(req,res)=>res.status(201).set('Cache-Control','no-store').json(S.contentRevisions.createDraft(req.body||{},req.auth)));
app.get('/api/articles/drafts/:id',read(),(req,res)=>res.set('Cache-Control','no-store').json(S.contentRevisions.getDraft(req.params.id,req.auth)));
app.patch('/api/articles/drafts/:id',write('post:create',120,'article:draft'),(req,res)=>res.set('Cache-Control','no-store').json(S.contentRevisions.saveDraft(req.params.id,req.body||{},req.auth)));
app.delete('/api/articles/drafts/:id',write('post:create',60,'article:draft'),(req,res)=>res.json(S.contentRevisions.deleteDraft(req.params.id,req.auth)));
app.post('/api/articles/drafts/:id/publish',write('post:create',12,'article:publish'),async(req,res)=>{const result=S.contentRevisions.publishDraft(req.params.id,req.auth,req.body?.request_key,req.body?.change_summary),post=S.posts.visible(result.post_id);if(post)await S.sharePreviews.queue(post);res.json(result);});
app.post('/api/articles/:id/edit',write('post:create',40,'article:draft'),(req,res)=>res.set('Cache-Control','no-store').json(S.contentRevisions.startEdit(req.params.id,req.auth)));
app.patch('/api/posts/:id/text',write('post:create',30,'poster:edit'),async(req,res)=>{const result=S.contentRevisions.editPoster(req.params.id,req.body||{},req.auth);await syncSharePreview(req.params.id);res.json(result);});
app.get('/api/posts/:id/revisions',(req,res)=>{S.rate.check('revision:read:'+ipKey(req),120);res.set('Cache-Control','no-store').json(S.contentRevisions.list(req.params.id,req.query));});
app.get('/api/posts/:id/revisions/:version',(req,res)=>{S.rate.check('revision:read:'+ipKey(req),120);res.set('Cache-Control','no-store').json(S.contentRevisions.get(req.params.id,req.params.version));});
app.get('/api/posts/:id/revisions/:version/diff',(req,res)=>{S.rate.check('revision:read:'+ipKey(req),120);res.set('Cache-Control','no-store').json(S.contentRevisions.diff(req.params.id,req.params.version,req.query.to));});
app.post('/api/admin/posts/:id/revisions/:version/hide',write('moderate',30),(req,res)=>res.json(S.contentRevisions.hide(req.params.id,req.params.version,req.auth,req.body?.reason)));
app.post('/api/admin/posts/:id/revisions/:version/inspect',write('moderate',60,'revision:inspect'),(req,res)=>res.set('Cache-Control','no-store').json(S.contentRevisions.inspect(req.params.id,req.params.version,req.auth,req.body?.reason)));
app.post('/api/admin/posts/:id/revisions/:version/erase',write('content:manage',10),(req,res)=>res.json(S.contentRevisions.erase(req.params.id,req.params.version,req.auth,req.body?.reason)));
app.post('/api/posts/:id/vote',write('vote',180),(req,res)=>res.json(S.interactions.vote(req.params.id,req.auth,req.body?.value)));
app.get('/api/posts/:id/comments',(req,res)=>{const current=S.identity.readSession(req,res);res.json(S.interactions.comments(req.params.id,{...req.query,userId:current?.id}));});
app.post('/api/comments/:id/vote',write('vote',180),(req,res)=>res.json(S.interactions.voteComment(req.params.id,req.auth,req.body?.value)));
app.post('/api/posts/:id/comments',write('comment',40),(req,res)=>res.status(201).json(S.interactions.comment(req.params.id,req.auth,req.body||{})));
app.post('/api/posts/:id/report',write('report',20),(req,res)=>{const result=S.interactions.report(req.params.id,req.auth,req.body?.reason);if(result.automatically_held)S.sharePreviews.invalidate(Number(req.params.id));res.status(201).json(result);});
app.post('/api/video-uploads',write('post:create',3),(req,res)=>res.status(201).json(S.video.begin(req.body||{},req.auth)));
app.post('/api/article-assets/videos',write('post:create',12),(req,res)=>res.status(201).json(S.video.beginArticleAsset(req.body||{},req.auth)));
app.put('/api/video-uploads/:id',write('post:create',3),async(req,res)=>res.json(await S.video.receive(req.params.id,req.auth,req)));
app.patch('/api/video-uploads/:id',write('post:create',300),async(req,res)=>res.json(await S.video.receiveChunk(req.params.id,req.auth,req)));
app.get('/api/video-uploads/:id',(req,res)=>{const current=S.identity.requireUser(req,res);res.json(S.video.status(req.params.id,current));});
app.delete('/api/video-uploads/:id',write('post:create',6),(req,res)=>res.json(S.video.cancel(req.params.id,req.auth)));
app.get('/api/areas',(req,res)=>res.json({areas:S.locations.list()}));
app.get('/api/areas/geometry',(req,res)=>res.json(S.locations.geometry(req.query.version)));
app.get('/api/me/areas',(req,res)=>res.json({areas:S.locations.subscriptions(S.identity.requireUser(req,res))}));
app.put('/api/me/areas',write(null,20),(req,res)=>res.json({areas:S.locations.setSubscriptions(req.auth,req.body?.area_ids)}));

app.get('/api/rooms',(req,res)=>errors(res,410,'ROOMS_RETIRED','Rom er historiske data. Bruk den felles veggen.'));
app.post('/api/rooms',(req,res)=>errors(res,410,'ROOMS_RETIRED','Rom kan ikke opprettes i den nye veggen.'));
app.post('/api/rooms/:id/membership',(req,res)=>errors(res,410,'ROOMS_RETIRED','Rommedlemskap er avviklet.'));
app.get('/api/admin/overview',read('staff:read'),(req,res)=>res.json(S.administration.overview(req.auth)));
app.get('/api/admin/security-events',read('security:read'),(req,res)=>res.set('Cache-Control','no-store').json(S.securityEvents.list(req.auth,req.query)));
app.get('/api/admin/security-events/:id',read('security:read'),(req,res)=>res.set('Cache-Control','no-store').json(S.securityEvents.detail(req.auth,req.params.id)));
app.post('/api/admin/users/:id/restriction',write('users:delete',10),(req,res)=>{
  const status=req.body?.status,reason=String(req.body?.reason||'').trim();
  if(!['active','suspended','banned'].includes(status)||reason.length<3||reason.length>300)throw new DomainError('INVALID_INPUT','Ugyldig begrensning eller begrunnelse.',400);
  const subject=S.db.prepare("SELECT id,name FROM users WHERE id=? AND status='active'").get(req.params.id);
  if(!subject)throw new DomainError('USER_NOT_FOUND','Brukeren finnes ikke.',404);
  if(subject.id===req.auth.id)throw new DomainError('INVALID_ACTION','Du kan ikke begrense egen konto.',409);
  S.db.exec('BEGIN IMMEDIATE');
  try{
    const existing=S.db.prepare('SELECT status FROM security_account_restrictions WHERE user_id=?').get(subject.id);
    if(existing?.status===status||status==='active'&&!existing)throw new DomainError('INVALID_STATE','Begrensningen gjelder allerede.',409);
    if(status==='active')S.db.prepare('DELETE FROM security_account_restrictions WHERE user_id=?').run(subject.id);
    else{
      S.db.prepare('INSERT INTO security_account_restrictions(user_id,status,changed_by,reason) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET status=excluded.status,changed_at=datetime(\'now\'),changed_by=excluded.changed_by,reason=excluded.reason').run(subject.id,status,req.auth.id,reason);
      const sessions=S.db.prepare("SELECT id_hash FROM sessions WHERE user_id=? AND revoked_at IS NULL AND expires_at>datetime('now')").all(subject.id);
      S.db.prepare("UPDATE sessions SET revoked_at=datetime('now') WHERE user_id=? AND revoked_at IS NULL").run(subject.id);
      security(req,status==='banned'?'account_banned':'account_suspended',{actor:req.auth,subject,reasonCode:status==='banned'?'BANNED':'SUSPENDED',routeClass:'moderation',statusCode:200});
      for(const session of sessions)security(req,'session_revoked',{actor:req.auth,subject,reasonCode:status==='banned'?'BANNED':'SUSPENDED',routeClass:'moderation',statusCode:200});
    }
    S.audit.record({actorId:req.auth.id,action:'account.'+status,subjectType:'user',subjectId:subject.id,reason});
    S.db.exec('COMMIT');
  }catch(error){S.db.exec('ROLLBACK');throw error;}
  res.json({ok:true,status});
});
app.get('/api/admin/queue',read('moderate'),(req,res)=>res.json({posts:S.moderation.queue()}));
app.post('/api/admin/posts/:id/moderation',write('moderate',60),async(req,res)=>{const result=S.moderation.act(req.auth,req.params.id,req.body?.action,req.body?.reason);await syncSharePreview(req.params.id);res.json(result);});
app.patch('/api/admin/posts/:id',write('content:manage',120),async(req,res)=>{const result=S.administration.updatePost(req.auth,req.params.id,req.body||{});await syncSharePreview(req.params.id);res.json(result);});
app.delete('/api/admin/posts/:id',write('content:manage',30),(req,res)=>{const result=S.administration.deletePost(req.auth,req.params.id,req.body||{});S.sharePreviews.invalidate(Number(req.params.id));res.json(result);});
app.patch('/api/admin/comments/:id',write('content:manage',120),(req,res)=>res.json(S.administration.updateComment(req.auth,req.params.id,req.body||{})));
app.delete('/api/admin/comments/:id',write('content:manage',30),(req,res)=>res.json(S.administration.deleteComment(req.auth,req.params.id,req.body||{})));
app.delete('/api/admin/users/:id',write('users:delete',20),(req,res)=>res.json(S.administration.deleteUser(req.auth,req.params.id,req.body||{})));
app.use('/api',(req,res)=>errors(res,404,'NOT_FOUND','Ukjent API-endepunkt.'));
app.use((error,req,res,next)=>{
  if(error instanceof upload.MulterError)return errors(res,error.code==='LIMIT_FILE_SIZE'?413:400,error.code,error.code==='LIMIT_FILE_SIZE'?'Bildet er for stort.':'Ugyldig bildeopplasting.');
  if(error instanceof DomainError){if(error.status>=500)runtimeMetrics.errors++;if(error.code==='RATE_LIMITED'){runtimeMetrics.rate_limited++;if(error.firstTrigger)security(req,'rate_limit_triggered',{actor:req.auth,reasonCode:'RATE_LIMITED',routeClass:req.pathname.startsWith('/api/session')||req.pathname.startsWith('/api/passkeys')?'authentication':'other',statusCode:429});}if(error.status===429&&error.details?.retryAfter)res.set('Retry-After',String(error.details.retryAfter));return errors(res,error.status,error.code,error.message,error.details);}
  runtimeMetrics.errors++;console.error(JSON.stringify({level:'error',request_id:req.id,error:error.message,stack:S.config.production?undefined:error.stack}));errors(res,500,'INTERNAL','Noe gikk galt på serveren.');
});

if(require.main===module){
  if(!S.config.production)setInterval(()=>{try{const overdue=S.chat.cleanup();if(overdue)throw Error(`${overdue} expired chat files remain`);}catch(error){console.error('Chat expiry cleanup failed:',error);process.exit(1);}},60000);
  const options={port:S.config.port,host:S.config.host,attempts:S.config.production?1:20,onBusy:port=>console.log(`  Port ${port} er opptatt. Prøver neste port...`)};
  listenAvailable(app,options).then(server=>{const port=server.address().port;console.log(`\n  HerEme kjører!\n  På PC:     http://localhost:${port}`);if(!S.config.production)for(const {name,ip:address} of lanIps())console.log(`  På mobilen: http://${address}:${port}  (${name})`);console.log(`  Data: ${S.dataDir}\n`);}).catch(error=>{console.error(error);S.db.close();process.exitCode=1;});
}
module.exports=app;
