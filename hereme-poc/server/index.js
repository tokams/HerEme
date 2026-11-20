'use strict';
const web=require('./mini-web');
const upload=require('./mini-upload');
const qrcode=require('./qr');
const os=require('node:os');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {DomainError}=require('./domain/errors');
const {themes}=require('../public/themes');
const S=require('./services');
const {listenAvailable}=require('./listen');
const app=web();
const runtimeMetrics={errors:0,rate_limited:0,started_at:new Date().toISOString()};
const imageUpload=upload({storage:upload.memoryStorage(),limits:{fileSize:12*1024*1024,files:1}});
const errors=(res,status,code,message,details)=>res.status(status).json({error:{code,message,details:details||undefined}});
const loopback=value=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(value);
const ip=req=>S.config.trustProxy&&loopback(req.socket.remoteAddress)?String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',')[0].trim():req.socket.remoteAddress;
const ipKey=req=>crypto.createHash('sha256').update(String(ip(req))).digest('hex').slice(0,20);
const recordSecurity=(req,event,result,actorId=null)=>S.db.prepare('INSERT INTO security_events(event,result,actor_id,ip_hash,request_id) VALUES(?,?,?,?,?)').run(event,result,actorId,ipKey(req),req.id);
S.db.prepare("DELETE FROM security_events WHERE created_at<datetime('now','-30 days')").run();
function lanIps(){
  const found=[];for(const [name,entries] of Object.entries(os.networkInterfaces()))for(const entry of entries||[])if(entry.family==='IPv4'&&!entry.internal&&!entry.address.startsWith('169.254.'))found.push({name,ip:entry.address});
  found.sort((a,b)=>{const score=x=>/vpn|virtual|docker|vethernet|veth|tailscale|wsl|hyper-v/i.test(x.name)?2:/wi-?fi|wireless|wlan|ethernet|eth\d/i.test(x.name)?0:1;return score(a)-score(b);});return found;
}
function write(capability,limit=60){return (req,res,next)=>{req.auth=S.identity.requireUser(req,res);S.identity.requireCsrf(req,req.auth);if(capability)S.identity.requireCapability(req.auth,capability);S.rate.check(`${capability||'write'}:${req.auth.id}`,limit);next();};}
function read(capability){return (req,res,next)=>{req.auth=S.identity.requireUser(req,res);S.identity.requireCapability(req.auth,capability);next();};}
function activity(items){
  const selected=new Map(items.map(post=>[post.id,post]));if(!selected.size)return {stats:{posts:0,comments:0},discussions:[],recent_comments:[]};
  const placeholders=[...selected].map(()=>'?').join(',');
  const comments=S.db.prepare(`SELECT c.id,c.post_id,c.body,c.created_at,COALESCE(u.name,c.demo_author,'anonym') author
    FROM comments c LEFT JOIN users u ON u.id=c.author_id WHERE c.post_id IN (${placeholders})
    ORDER BY c.created_at DESC,abs(c.id) DESC LIMIT 25`).all(...selected.keys());
  const latest=new Map();for(const comment of comments)if(!latest.has(comment.post_id))latest.set(comment.post_id,comment.created_at);
  return {stats:{posts:items.length,comments:items.reduce((n,p)=>n+p.comment_count,0)},
    discussions:items.filter(p=>p.comment_count).sort((a,b)=>String(latest.get(b.id)||'').localeCompare(String(latest.get(a.id)||''))||b.comment_count-a.comment_count).slice(0,4).map(({id,title,category,comment_count,synthetic_demo})=>({id,title,category,comment_count,synthetic_demo})),
    recent_comments:comments.slice(0,4).map(comment=>({...comment,body:comment.body.slice(0,140),post_title:selected.get(comment.post_id).title,category:selected.get(comment.post_id).category,synthetic_demo:selected.get(comment.post_id).synthetic_demo}))};
}

app.disable('x-powered-by');
app.use((req,res,next)=>{
  req.id=crypto.randomUUID();res.set('X-Request-Id',req.id);res.set('X-Content-Type-Options','nosniff');res.set('X-Frame-Options','DENY');res.set('Referrer-Policy','same-origin');
  res.set('Permissions-Policy','camera=(self), microphone=(self), geolocation=()');
  res.set('Content-Security-Policy',`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'${S.config.production?'; upgrade-insecure-requests':''}`);
  if(S.config.production){
    const expected=new URL(S.config.publicOrigin).host;if(req.headers.host!==expected){recordSecurity(req,'request.host','denied');return errors(res,421,'HOST_INVALID','Ugyldig vertsnavn.');}
    if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.origin!==S.config.publicOrigin){recordSecurity(req,'request.origin','denied');return errors(res,403,'ORIGIN_INVALID','Ugyldig forespørselsopprinnelse.');}
  }
  next();
});
app.use(web.json({limit:'256kb'}));
app.use('/uploads',(req,res,next)=>{const original=req.pathname;req.pathname=req.pathname.slice(8)||'/';web.static(path.join(S.dataDir,'uploads'))(req,res,()=>{req.pathname=original;next();});});
app.use('/media',(req,res,next)=>{const original=req.pathname;req.pathname=req.pathname.slice(6)||'/';web.static(path.join(S.dataDir,'media'))(req,res,()=>{req.pathname=original;next();});});
app.use(web.static(path.resolve(__dirname,'..','public'),{extensions:['html']}));

app.get('/api/live',(req,res)=>res.json({ok:true,name:'HerEme'}));
app.get('/api/health',(req,res)=>res.json({ok:true,name:'HerEme',storage:'SQLite',runtime:runtimeMetrics}));
app.get('/api/ready',(req,res)=>{
  const checks={database:false,foreign_keys:false,media:false,disk:false,schema:false};let message='';
  try{
    S.db.exec('BEGIN IMMEDIATE');try{S.db.prepare('UPDATE schema_migrations SET applied_at=applied_at WHERE version=11').run();S.db.exec('ROLLBACK');checks.database=true;}catch(error){if(S.db.isTransaction)S.db.exec('ROLLBACK');throw error;}
    checks.foreign_keys=S.db.prepare('PRAGMA foreign_key_check').all().length===0;
    checks.schema=S.db.prepare('SELECT max(version) version FROM schema_migrations').get().version===11;
    checks.media=['media','uploads','tmp'].every(name=>{const directory=path.join(S.dataDir,name);fs.accessSync(directory,fs.constants.R_OK|fs.constants.W_OK);return fs.statSync(directory).isDirectory();});
    const stat=fs.statfsSync(S.dataDir);checks.disk=stat.bavail*stat.bsize>=S.config.minFreeBytes;
  }catch(error){message=error.message;}
  const ok=Object.values(checks).every(Boolean);res.status(ok?200:503).json({ok,checks,message:message||undefined});
});
app.get('/api/categories',(req,res)=>res.json({categories:themes}));
app.get('/api/meta',(req,res)=>{
  const port=req.socket.localPort;
  const features={video:S.config.enableVideo,locations:S.config.enableLocations,verification:S.config.enableVerification,staff_panel:true};
  if(S.config.production)return res.json({port,public_origin:S.config.publicOrigin,connect_url:S.config.publicOrigin,features});
  const ips=lanIps();res.json({port,connect_url:ips.length?`http://${ips[0].ip}:${port}`:`http://localhost:${port}`,addresses:ips.map(item=>({...item,url:`http://${item.ip}:${port}`})),features});
});
app.get('/api/connect-qr.svg',async(req,res,next)=>{if(S.config.production)return errors(res,404,'NOT_FOUND','Ikke tilgjengelig.');try{const ips=lanIps(),url=ips.length?`http://${ips[0].ip}:${req.socket.localPort}`:`http://localhost:${req.socket.localPort}`;res.type('svg').send(await qrcode.toString(url,{type:'svg',margin:2,width:260}));}catch(error){next(error);}});

app.post('/api/session',(req,res)=>{
  S.rate.check('profile:'+ipKey(req),30);const result=S.identity.createProfile({name:req.body?.name,userAgent:req.headers['user-agent']});S.identity.setCookie(res,result.session);
  recordSecurity(req,'session.created','allowed',result.user.id);
  res.status(201).json({user:result.user,csrf_token:result.session.csrf,recovery_key:result.recoveryKey,recovery_key_shown_once:true});
});
app.post('/api/session/recover',(req,res)=>{
  S.rate.check('recover:'+ipKey(req),10);const result=S.identity.recover({name:req.body?.name,recoveryKey:req.body?.recovery_key,userAgent:req.headers['user-agent']});S.identity.setCookie(res,result.session);
  recordSecurity(req,'session.recovered','allowed',result.user.id);
  res.json({user:result.user,csrf_token:result.session.csrf});
});
app.post('/api/recovery/confirm',async(req,res,next)=>{try{
  const form=new URLSearchParams((await web.readBody(req,4096)).toString('utf8')),current=S.identity.requireUser(req,res);
  S.identity.requireCsrf(req,current,form.get('csrf_token'));
  if(form.get('username')!==current.name)return errors(res,400,'IDENTITY_MISMATCH','Pseudonymet samsvarer ikke med den aktive kontoen.');
  S.identity.confirmRecovery(current,form.get('password'));recordSecurity(req,'recovery.confirmed','allowed',current.id);
  res.status(303).set('Location','/?recovery-saved=1').send('');
}catch(error){next(error);}});
app.get('/api/me',(req,res)=>{const current=S.identity.readSession(req,res);if(!current)return errors(res,401,'AUTH_REQUIRED','Ingen aktiv sesjon.');res.json({user:current,csrf_token:current.csrf||null,legacy_migrated:Boolean(current.legacyMigrated),recovery_key:current.recoveryKey||null,recovery_key_shown_once:Boolean(current.recoveryKey)});});
app.post('/api/session/logout',write(null,20),(req,res)=>{S.identity.logout(req.auth,res);res.json({ok:true});});
app.post('/api/session/revoke-all',write(null,5),(req,res)=>{S.identity.revokeAll(req.auth);S.identity.logout(req.auth,res);res.json({ok:true});});
app.post('/api/recovery/rotate',write(null,5),(req,res)=>res.json({recovery_key:S.identity.rotateRecovery(req.auth),recovery_key_shown_once:true}));
app.patch('/api/me',write(null,10),(req,res)=>res.json({user:S.identity.rename(req.auth,req.body?.name)}));
app.delete('/api/me',write(null,3),(req,res)=>{S.accounts.deactivate(req.auth);S.identity.logout(req.auth,res);res.json({ok:true});});

app.get('/api/posts',(req,res)=>{const current=S.identity.readSession(req,res);res.json(S.posts.list({...req.query,userId:current?.id}));});
app.get('/api/activity',(req,res)=>{const current=S.identity.readSession(req,res);const page=S.posts.list({...req.query,limit:Math.min(Number(req.query.limit)||50,50),userId:current?.id});res.json({...activity(page.posts),next_cursor:page.next_cursor});});
app.get('/api/posts/:id',(req,res)=>{const current=S.identity.readSession(req,res),post=S.posts.visible(Number(req.params.id),current?.id);if(!post)return errors(res,404,'POST_NOT_FOUND','Innlegget finnes ikke.');res.json({post});});
app.post('/api/posts',write('post:create',12),imageUpload.single('image'),async(req,res)=>res.status(201).json(await S.posts.create(req.body||{},req.auth,req.file)));
app.post('/api/posts/:id/vote',write('vote',180),(req,res)=>res.json(S.interactions.vote(req.params.id,req.auth,req.body?.value)));
app.get('/api/posts/:id/comments',(req,res)=>res.json(S.interactions.comments(req.params.id,req.query)));
app.post('/api/posts/:id/comments',write('comment',40),(req,res)=>res.status(201).json(S.interactions.comment(req.params.id,req.auth,req.body||{})));
app.post('/api/posts/:id/report',write('report',20),(req,res)=>res.status(201).json(S.interactions.report(req.params.id,req.auth,req.body?.reason)));
app.post('/api/video-uploads',write('post:create',3),(req,res)=>res.status(201).json(S.video.begin(req.body||{},req.auth)));
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
app.get('/api/admin/queue',read('moderate'),(req,res)=>res.json({posts:S.moderation.queue()}));
app.post('/api/admin/posts/:id/moderation',write('moderate',60),(req,res)=>res.json(S.moderation.act(req.auth,req.params.id,req.body?.action,req.body?.reason)));
app.patch('/api/admin/posts/:id',write('content:manage',120),(req,res)=>res.json(S.administration.updatePost(req.auth,req.params.id,req.body||{})));
app.delete('/api/admin/posts/:id',write('content:manage',30),(req,res)=>res.json(S.administration.deletePost(req.auth,req.params.id,req.body||{})));
app.patch('/api/admin/comments/:id',write('content:manage',120),(req,res)=>res.json(S.administration.updateComment(req.auth,req.params.id,req.body||{})));
app.delete('/api/admin/comments/:id',write('content:manage',30),(req,res)=>res.json(S.administration.deleteComment(req.auth,req.params.id,req.body||{})));
app.delete('/api/admin/users/:id',write('users:delete',20),(req,res)=>res.json(S.administration.deleteUser(req.auth,req.params.id,req.body||{})));
app.use('/api',(req,res)=>errors(res,404,'NOT_FOUND','Ukjent API-endepunkt.'));
app.use((error,req,res,next)=>{
  if(error instanceof upload.MulterError)return errors(res,error.code==='LIMIT_FILE_SIZE'?413:400,error.code,error.code==='LIMIT_FILE_SIZE'?'Bildet er for stort.':'Ugyldig bildeopplasting.');
  if(error instanceof DomainError){if(error.status>=500)runtimeMetrics.errors++;if(error.code==='RATE_LIMITED')runtimeMetrics.rate_limited++;if(['AUTH_REQUIRED','CSRF_INVALID','FORBIDDEN','RATE_LIMITED','RECOVERY_FAILED'].includes(error.code))recordSecurity(req,error.code.toLowerCase().replaceAll('_','.'),'denied',req.auth?.id||null);if(error.status===429&&error.details?.retryAfter)res.set('Retry-After',String(error.details.retryAfter));return errors(res,error.status,error.code,error.message,error.details);}
  runtimeMetrics.errors++;console.error(JSON.stringify({level:'error',request_id:req.id,error:error.message,stack:S.config.production?undefined:error.stack}));errors(res,500,'INTERNAL','Noe gikk galt på serveren.');
});

if(require.main===module){
  const options={port:S.config.port,host:S.config.host,attempts:S.config.production?1:20,onBusy:port=>console.log(`  Port ${port} er opptatt. Prøver neste port...`)};
  listenAvailable(app,options).then(server=>{const port=server.address().port;console.log(`\n  HerEme kjører!\n  På PC:     http://localhost:${port}`);if(!S.config.production)for(const {name,ip:address} of lanIps())console.log(`  På mobilen: http://${address}:${port}  (${name})`);console.log(`  Data: ${S.dataDir}\n`);}).catch(error=>{console.error(error);S.db.close();process.exitCode=1;});
}
module.exports=app;
