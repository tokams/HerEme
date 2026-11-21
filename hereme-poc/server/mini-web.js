'use strict';
// Small zero-dependency HTTP router for this self-contained local PoC.
// Not intended as a general-purpose web framework.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {URL}=require('node:url');
const {requestedLocale}=require('./error-localization');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8','.mp4':'video/mp4'};
function createApp(){
  const stack=[];
  const app=(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    req.pathname=url.pathname;req.query=Object.fromEntries(url.searchParams.entries());req.params={};req.body={};
    req.get=name=>req.headers[name.toLowerCase()];
    res.status=n=>{res.statusCode=n;return res;};
    res.set=(name,value)=>{res.setHeader(name,value);return res;};
    res.type=t=>res.set('Content-Type',t==='svg'?'image/svg+xml':t);
    res.json=obj=>{if(res.writableEnded)return res;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(obj));return res;};
    res.send=body=>{if(res.writableEnded)return res;if(!res.getHeader('Content-Type'))res.type('text/plain; charset=utf-8');res.end(body);return res;};
    let index=0;
    const next=err=>{
      if(res.writableEnded)return;
      while(index<stack.length){
        const layer=stack[index++];
        if(err && !layer.error)return skip();
        if(!err && layer.error)continue;
        if(layer.kind==='route'){
          if(layer.method!==req.method)continue;
          const match=layer.pattern.exec(req.pathname);
          if(!match)continue;
          req.params={};layer.keys.forEach((k,i)=>req.params[k]=decodeURIComponent(match[i+1]));
        }else if(layer.path && !(req.pathname===layer.path || req.pathname.startsWith(layer.path+'/')))continue;
        try{
          const result=layer.error?layer.fn(err,req,res,next):layer.fn(req,res,next);
          if(result && typeof result.catch==='function')result.catch(next);
        }catch(e){next(e);}
        return;
      }
      if(err){console.error(err);res.status(500).json({error:requestedLocale(req)==='en'?'Internal server error.':'Intern feil på serveren.'});}
      else res.status(404).json({error:requestedLocale(req)==='en'?'Page not found.':'Fant ikke siden.'});
      function skip(){return next(err);}
    };
    next();
  };
  app.disable=()=>{};
  app.use=(p,fn)=>{if(typeof p==='function'){fn=p;p=null;}stack.push({kind:'middleware',path:p,fn,error:fn.length===4});return app;};
  const route=(method,route,handlers)=>{
    const keys=[];
    const pattern='^'+route.split('/').map(s=>s.startsWith(':')?(keys.push(s.slice(1)),'([^/]+)'):s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('/')+'/?$';
    handlers.forEach(fn=>stack.push({kind:'route',method,pattern:new RegExp(pattern),keys,fn,error:false}));return app;
  };
  app.get=(p,...handlers)=>route('GET',p,handlers);
  app.post=(p,...handlers)=>route('POST',p,handlers);
  app.put=(p,...handlers)=>route('PUT',p,handlers);
  app.patch=(p,...handlers)=>route('PATCH',p,handlers);
  app.delete=(p,...handlers)=>route('DELETE',p,handlers);
  app.listen=(...args)=>http.createServer(app).listen(...args);
  return app;
}
createApp.json=({limit='128kb'}={})=> (req,res,next)=>{
  if(!['POST','PUT','PATCH','DELETE'].includes(req.method)||!req.headers['content-type']?.startsWith('application/json'))return next();
  const max=parseLimit(limit);readBody(req,max).then(buffer=>{
    try{req.body=JSON.parse(buffer.toString('utf8')||'{}');next();}
    catch{res.status(400).json({error:requestedLocale(req)==='en'?'Invalid JSON.':'Ugyldig JSON.'});}
  }).catch(err=>res.status(err.code===413?413:400).json({error:requestedLocale(req)==='en'?'The request is too large.':err.message}));
};
function parseLimit(input){return Number.parseInt(input,10)*(String(input).includes('mb')?1024*1024:String(input).includes('kb')?1024:1);}
function readBody(req,max){return new Promise((resolve,reject)=>{
  let length=0;const chunks=[];
  req.on('data',chunk=>{length+=chunk.length;if(length>max){const e=new Error('Forespørselen er for stor.');e.code=413;reject(e);req.pause();return;}chunks.push(chunk);});
  req.on('end',()=>resolve(Buffer.concat(chunks)));req.on('error',reject);
});}
createApp.readBody=readBody;
createApp.static=(root,opts={})=>{
  const dir=path.resolve(root);
  return (req,res,next)=>{
    if(req.method!=='GET'&&req.method!=='HEAD')return next();
    let filename;
    try{filename=decodeURIComponent(req.pathname);}catch{return next();}
    if(filename.includes('\0'))return next();
    // Prefixes are stripped by the calling code when the file middleware is mounted.
    let file=path.resolve(dir,'.'+filename);
    if(file!==dir&&!file.startsWith(dir+path.sep))return next();
    if(path.basename(file).startsWith('.'))return next();
    if(filename.endsWith('/'))file=path.join(file,'index.html');
    if(!path.extname(file)&&opts.extensions?.includes('html'))file+='.html';
    const ext=path.extname(file).toLowerCase();if(!mime[ext])return next();
    fs.stat(file,(err,stat)=>{
      if(err||!stat.isFile())return next();
      res.setHeader('Content-Type',mime[ext]);res.setHeader('Accept-Ranges','bytes');
      res.setHeader('Cache-Control','no-cache');
      let start=0,end=stat.size-1;const range=req.headers.range;
      if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match)return next();start=match[1]?Number(match[1]):0;end=match[2]?Number(match[2]):end;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>=stat.size){res.statusCode=416;res.setHeader('Content-Range',`bytes */${stat.size}`);return res.end();}res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${stat.size}`);}else res.statusCode=200;
      res.setHeader('Content-Length',String(end-start+1));
      const stream=fs.createReadStream(file,{start,end});
      stream.on('error',next);stream.pipe(res);
    });
  };
};
module.exports=createApp;
