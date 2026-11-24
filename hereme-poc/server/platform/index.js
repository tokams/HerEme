'use strict';
const fs=require('node:fs');
const path=require('node:path');
const web=require('../mini-web');
const qrcode=require('../qr');
const {openRegistry,login,hash}=require('./operator');
const {readPolicy,writePolicy}=require('./policy');

function createPanel({registry,sites,origin='https://admin.hereme.no',health=siteHealth}) {
  const app=web(),host=new URL(origin).host;
  const cookie='__Host-hereme_operator';
  const session=req=>{
    const value=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookie+'='))?.slice(cookie.length+1);
    return value && registry.prepare('SELECT * FROM sessions WHERE token=? AND expires>?').get(hash(value),Date.now());
  };
  const reject=(res,code,message)=>res.status(code).json({error:message});
  app.use((req,res,next)=>{
    res.set('Cache-Control','no-store');
    res.set('X-Content-Type-Options','nosniff');
    res.set('Referrer-Policy','no-referrer');
    res.set('Content-Security-Policy',"default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if(req.headers.host!==host)return reject(res,421,'Unknown host.');
    if(req.method!=='GET' && req.headers.origin!==origin)return reject(res,403,'Incorrect origin.');
    next();
  });
  app.use(web.json({limit:'4kb'}));
  app.get('/live',(_req,res)=>res.json({service:'hereme-platform'}));
  app.post('/api/login',(req,res)=>{
    // Only the private gateway connects to this listener. It overwrites X-Hereme-Client.
    const result=login(registry,req.headers['x-hereme-client']||req.socket.remoteAddress,req.body);
    if(!result)return reject(res,401,'Check your operator credentials and authenticator code.');
    res.set('Set-Cookie',cookie+'='+result.token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800');
    res.json({ok:true});
  });
  app.use('/api',(req,res,next)=>{
    req.operator=session(req);
    if(!req.operator)return reject(res,401,'Sign in as a platform operator.');
    if(req.method!=='GET' && req.headers['x-csrf-token']!==req.operator.csrf)return reject(res,403,'Invalid session token.');
    next();
  });
  app.post('/api/logout',(req,res)=>{
    registry.prepare('DELETE FROM sessions WHERE token=?').run(req.operator.token);
    res.set('Set-Cookie',cookie+'=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
    res.json({ok:true});
  });
  app.get('/api/sites',async(req,res)=>{
    const items=await Promise.all(sites.map(async site=>({
      id:site.id,hostname:site.hostname,label:site.label,...readPolicy(site.policy),...await health(site)
    })));
    res.json({operator:req.operator.operator,csrf:req.operator.csrf,sites:items,
      audit:registry.prepare('SELECT time,actor,action,site,detail FROM audit ORDER BY id DESC LIMIT 20').all()});
  });
  app.get('/api/sites/:id/qr.svg',async(req,res,next)=>{
    const site=sites.find(item=>item.id===req.params.id);
    if(!site)return reject(res,404,'Unknown community.');
    try {
      const svg=await qrcode.toString('https://'+site.hostname,{type:'svg',margin:2});
      res.set('Content-Type','image/svg+xml; charset=utf-8').set('Content-Disposition','inline').send(svg);
    } catch(error) { next(error); }
  });
  app.post('/api/sites/:id/registration',(req,res)=>{
    const site=sites.find(s=>s.id===req.params.id);
    if(!site)return reject(res,404,'Unknown community.');
    const value=req.body?.registrationOpen;
    if(typeof value!=='boolean')return reject(res,400,'Choose open or closed registration.');
    const change=registry.prepare("INSERT INTO audit(actor,action,site,detail) VALUES(?,'registration requested',?,?)")
      .run(req.operator.operator,site.id,value?'open':'closed');
    writePolicy(site.policy,value);
    registry.prepare("UPDATE audit SET action='registration applied' WHERE id=?").run(change.lastInsertRowid);
    res.json(readPolicy(site.policy));
  });
  app.use(web.static(path.join(__dirname,'web')));
  app.use((err,req,res,next)=>{
    if(!err.status)console.error('Platform request failed:',err.message);
    reject(res,err.status||500,err.status?err.message:'Platform operation failed.');
  });
  return app;
}
async function siteHealth(site) {
  try {
    const origin='https://'+site.hostname;
    const get=async name=>{
      const response=await fetch(origin+'/api/'+name,{redirect:'error',signal:AbortSignal.timeout(3500)});
      if(!response.ok && !(name==='ready' && response.status===503))throw Error('HTTP '+response.status);
      return response.json();
    };
    const [ready,meta,health]=await Promise.all([get('ready'),get('meta'),get('health')]);
    if(meta.public_origin!==origin)throw Error('Unexpected site identity');
    const failed=Object.entries(ready.checks || {}).filter(([,ok])=>ok===false).map(([name])=>name);
    if(health.push?.enabled && !health.push.worker_fresh)failed.push('push worker');
    return {ready:ready.ok===true && failed.length===0,release:meta.release||null,
      checked:new Date().toISOString(),problem:failed.length?'Check '+failed.join(', '):null};
  } catch(error) {return {ready:false,release:null,checked:new Date().toISOString(),problem:error.message};}
}
function loadSites(dir) {
  const config=JSON.parse(fs.readFileSync(path.join(dir,'sites.json'),'utf8'));
  const ids=new Set(),hosts=new Set();
  return config.map(({id,hostname,label})=>{
    if(!/^[a-z0-9_-]+$/.test(id)||! /^(?:[a-z0-9-]+\.)?hereme\.no$/.test(hostname)||hostname==='admin.hereme.no'||ids.has(id)||hosts.has(hostname)||typeof label!=='string')throw Error('Invalid or duplicate community in sites.json');
    ids.add(id);hosts.add(hostname);
    return {id,hostname,label,policy:path.join(dir,id,'policy.json')};
  });
}
if(require.main===module) {
  const registry=openRegistry('/var/lib/platform/registry.sqlite');
  createPanel({registry,sites:loadSites('/etc/hereme-sites')}).listen(3100,'0.0.0.0');
}
module.exports={createPanel,siteHealth,loadSites};
