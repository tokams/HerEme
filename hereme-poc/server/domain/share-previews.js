'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const sharp=require('sharp');
const {themes}=require('../../public/themes');
const WIDTH=1200,HEIGHT=630;
const xml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
function createSharePreviewService(posts,dataDir){
  const root=path.join(dataDir,'share-previews');fs.mkdirSync(root,{recursive:true});
  const pending=new Map(),failedUntil=new Map();let pipeline=Promise.resolve();
  const revision=post=>crypto.createHash('sha256').update(JSON.stringify([post.id,post.title,post.body,post.category,post.type,post.image_url,post.media_thumbnail_url,post.media_url,post.poster?.source_image_url,post.synthetic_demo])).digest('hex').slice(0,20);
  const filename=(id,hash)=>path.join(root,`${id}-${hash}.jpg`);
  function source(post){
    const candidate=post.type==='video'?post.media_thumbnail_url:post.media_url||post.image_url;
    if(!candidate||!/^\/(media|uploads)\/[A-Za-z0-9_./-]+\.(jpg|jpeg|png|webp)$/.test(candidate)||candidate.includes('..'))return null;
    const full=path.resolve(dataDir,'.'+candidate);
    if(!full.startsWith(path.resolve(dataDir)+path.sep)||!fs.existsSync(full))return null;
    return full;
  }
  function titleLines(title){
    const words=String(title||'').trim().split(/\s+/),lines=[];let line='';
    for(const word of words){if((line+' '+word).trim().length>32&&line){lines.push(line);line=word;}else line=(line+' '+word).trim();if(lines.length===3)break;}
    if(line&&lines.length<3)lines.push(line);
    return lines.map(value=>value.length>38?value.slice(0,37)+'…':value);
  }
  async function render(post,target){
    const theme=themes.find(item=>item.id===post.category)||themes[2],photo=source(post);
    let base=photo?sharp(photo,{limitInputPixels:50_000_000,failOn:'error'}).rotate().resize(WIDTH,HEIGHT,{fit:'cover'}):sharp({create:{width:WIDTH,height:HEIGHT,channels:3,background:theme.background}});
    const lines=titleLines(post.title).map((line,index)=>`<text x="72" y="${390+index*67}" font-family="monospace" font-size="54" font-weight="700" fill="#ffffff">${xml(line)}</text>`).join('');
    const overlay=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="#101315" stop-opacity="${photo?'.08':'.2'}"/><stop offset="1" stop-color="#101315" stop-opacity=".97"/></linearGradient></defs><rect width="${WIDTH}" height="${HEIGHT}" fill="url(#g)"/><rect x="72" y="68" width="16" height="85" fill="${theme.color}"/><text x="112" y="119" font-size="34" font-family="sans-serif" font-weight="700" fill="#ffffff">HEREME · ${xml(post.category.toUpperCase())}</text>${lines}<text x="72" y="588" font-size="24" font-family="sans-serif" fill="#ffffff">hereme.no${post.synthetic_demo?' · SYNTHETIC DEMO':''}</text></svg>`);
    const bytes=await base.composite([{input:overlay}]).jpeg({quality:84,mozjpeg:true}).toBuffer();
    const current=posts.visible(post.id);if(!current||revision(current)!==revision(post))return;
    const temporary=target+'.tmp-'+crypto.randomUUID();fs.writeFileSync(temporary,bytes,{flag:'wx'});fs.renameSync(temporary,target);
    for(const name of fs.readdirSync(root))if(name.startsWith(`${post.id}-`)&&name!==path.basename(target))fs.rmSync(path.join(root,name));
  }
  function queue(post){
    const hash=revision(post),target=filename(post.id,hash),key=`${post.id}:${hash}`;
    if(fs.existsSync(target)||Date.now()<(failedUntil.get(key)||0))return Promise.resolve();if(pending.has(key))return pending.get(key);
    const work=pipeline.then(()=>render(post,target)).catch(error=>{failedUntil.set(key,Date.now()+5*60_000);console.error(`Share preview ${post.id}:`,error);}).finally(()=>pending.delete(key));pending.set(key,work);pipeline=work;return work;
  }
  function image(post){const hash=revision(post),target=filename(post.id,hash);if(fs.existsSync(target))return `/share-previews/${post.id}/${hash}.jpg`;queue(post);return '/assets/pwa/icon-512.png';}
  function file(id,hash){
    if(!/^\d+$/.test(id)||!/^[0-9a-f]{20}$/.test(hash))return null;
    const post=posts.visible(Number(id));if(!post||revision(post)!==hash)return null;
    const target=filename(post.id,hash);return fs.existsSync(target)?target:null;
  }
  function invalidate(id){if(!Number.isSafeInteger(Number(id)))return;for(const name of fs.readdirSync(root))if(name.startsWith(`${id}-`))fs.rmSync(path.join(root,name));}
  function cleanup(){for(const name of fs.readdirSync(root)){
    const match=/^(\d+)-([0-9a-f]{20})\.jpg$/.exec(name),post=match&&posts.visible(Number(match[1]));
    if(!post||revision(post)!==match[2])fs.rmSync(path.join(root,name));
  }}
  function backfill(){cleanup();let cursor='';do{const page=posts.list({limit:50,cursor});for(const post of page.posts)queue(post);cursor=page.next_cursor||'';}while(cursor);}
  return {image,file,queue,invalidate,backfill,revision};
}
module.exports={createSharePreviewService};
