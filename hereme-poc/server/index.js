'use strict';
const express = require('./mini-web');
const multer = require('./mini-upload');
const qrcode = require('./qr');
const os = require('node:os');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { db, dataDir } = require('./db');
const { nextId } = require('./migrations');
const { runtimeConfig } = require('./config');
const { listenAvailable } = require('./listen');
const { themes } = require('../public/themes');
const { ids: categoryIds, legacyCategory, parseDesign, insertDesign } = require('./post-design');

const app = express();
const { port: requestedPort } = runtimeConfig();
const ADMIN_PIN = process.env.HEREME_ADMIN_PIN || '2468'; // Demo only. Never use in production.
const MAX_IMAGE = 8 * 1024 * 1024;
const uploadsDir = path.join(dataDir, 'uploads');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE, files: 1 } });
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const errors = (res, status, message) => res.status(status).json({ error: message });
const asText = (v, max = 3000) => typeof v === 'string' ? v.trim().slice(0, max + 1) : '';

app.disable('x-powered-by');
app.use((req,res,next)=>{
  res.set('X-Content-Type-Options','nosniff');
  res.set('X-Frame-Options','DENY');
  res.set('Referrer-Policy','same-origin');
  res.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'");
  next();
});
app.use(express.json({ limit: '128kb' }));
app.use('/uploads', (req,res,next)=>{
  // Static middleware takes an absolute URL path; remap /uploads/filename to /filename.
  const original=req.pathname;req.pathname=req.pathname.slice('/uploads'.length)||'/';
  express.static(uploadsDir)(req,res,()=>{req.pathname=original;next();});
});
app.use(express.static(path.resolve(__dirname, '..', 'public'), { extensions: ['html'] }));

function lanIps() {
  const found = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal && !entry.address.startsWith('169.254.')) {
        found.push({ name, ip: entry.address });
      }
    }
  }
  found.sort((a,b) => {
    const score = x => /vpn|virtual|docker|vethernet|veth|tailscale|wsl|hyper-v/i.test(x.name) ? 2 : /wi-?fi|wireless|wlan|ethernet|eth\d/i.test(x.name) ? 0 : 1;
    return score(a) - score(b);
  });
  return found;
}

function session(req) {
  const authorization = req.get('authorization') || '';
  const m = /^Bearer ([a-f0-9]{64})$/i.exec(authorization);
  if (!m) return null;
  return db.prepare('SELECT id,name,created_at FROM users WHERE token_hash=?').get(sha256(m[1])) || null;
}
function requireSession(req,res,next) {
  req.user = session(req);
  if (!req.user) return errors(res,401,'Velg et kallenavn for å delta.');
  next();
}
function requireAdmin(req,res,next) {
  const received = req.get('x-admin-pin') || '';
  if (received.length !== ADMIN_PIN.length || !crypto.timingSafeEqual(Buffer.from(received),Buffer.from(ADMIN_PIN))) {
    return errors(res,403,'Feil moderatorkode.');
  }
  next();
}
function roomRows(user) {
  return db.prepare(`SELECT r.*, (SELECT count(*) FROM posts p WHERE p.room_id=r.id AND p.status='published') AS post_count,
    (SELECT count(*) FROM room_memberships m WHERE m.room_id=r.id) AS member_count,
    EXISTS(SELECT 1 FROM room_memberships m WHERE m.room_id=r.id AND m.user_id=?) AS joined
    FROM rooms r ORDER BY CASE WHEN created_by IS NULL THEN 0 ELSE 1 END, id`).all(user?.id??null);
}
function postSql(where = '') {
  return `SELECT p.*, r.slug AS room_slug,r.name AS room_name,r.emoji AS room_emoji,
    COALESCE(u.name,p.demo_author,'anonym') AS author, COALESCE(pp.synthetic_demo,0) AS synthetic_demo, pp.poster_json,
    d.category,d.image_zoom,d.image_x,d.image_y,d.text_position,
    p.base_score+COALESCE((SELECT sum(v.value) FROM votes v WHERE v.post_id=p.id),0) AS score,
    (SELECT count(*) FROM comments c WHERE c.post_id=p.id) AS comment_count,
    (SELECT count(*) FROM reports rp WHERE rp.post_id=p.id AND rp.resolved=0) AS report_count
    FROM posts p LEFT JOIN rooms r ON r.id=p.room_id LEFT JOIN users u ON u.id=p.author_id
    LEFT JOIN post_presentation pp ON pp.post_id=p.id
    LEFT JOIN post_design d ON d.post_id=p.id ${where}`;
}
function enrichPosts(posts, user) {
  if (!user) return posts.map(p => ({...p, my_vote:0}));
  const stmt = db.prepare('SELECT value FROM votes WHERE post_id=? AND user_id=?');
  return posts.map(p => ({...p, my_vote:stmt.get(p.id,user.id)?.value||0}));
}
function publicPost(row) {
  if (!row) return null;
  const { author_id, demo_author, base_score, report_count, poster_json, ...result } = row;
  const design=row.category?{category:row.category,image_zoom:row.image_zoom,image_x:row.image_x,image_y:row.image_y,text_position:row.text_position}
    :parseDesign({},legacyCategory(row.room_slug,row.type));
  return {...result,...design,poster_style:design.category,poster:poster_json?JSON.parse(poster_json):null};
}
function imageExt(buf) {
  if (buf.length > 3 && buf[0]===0xFF && buf[1]===0xD8 && buf[2]===0xFF) return '.jpg';
  if (buf.length > 8 && buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return '.png';
  if (buf.length > 12 && buf.toString('ascii',0,4)==='RIFF' && buf.toString('ascii',8,12)==='WEBP') return '.webp';
  return null;
}
function slugify(s) {
  return s.toLowerCase().replace(/æ/g,'ae').replace(/ø/g,'o').replace(/å/g,'a')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40);
}

app.get('/api/health', (req,res) => res.json({ok:true,name:'HerEme',storage:'SQLite'}));
app.get('/api/categories', (req,res) => res.json({categories:themes}));
app.get('/api/meta', (req,res) => {
  const PORT = req.socket.localPort;
  const ips = lanIps();
  res.json({ port:PORT, addresses:ips.map(x => ({ ...x,url:`http://${x.ip}:${PORT}` })),
    local_url:`http://localhost:${PORT}`, connect_url:ips.length?`http://${ips[0].ip}:${PORT}`:`http://localhost:${PORT}`,
    user_count:db.prepare('SELECT count(*) AS n FROM users').get().n,
    post_count:db.prepare("SELECT count(*) AS n FROM posts WHERE status='published'").get().n });
});
app.get('/api/connect-qr.svg', async (req,res,next) => {
  try {
    const PORT = req.socket.localPort;
    const ip = lanIps()[0]?.ip || 'localhost';
    const svg = await qrcode.toString(`http://${ip}:${PORT}`, {type:'svg',margin:4,width:220,color:{dark:'#184d49',light:'#ffffff'}});
    res.type('svg').set('Cache-Control','no-store').send(svg);
  } catch(e){next(e);}
});
app.get('/api/rooms', (req,res) => res.json({rooms:roomRows(session(req))}));
app.post('/api/rooms/:id/membership',requireSession,(req,res)=>{
  const id=Number(req.params.id),joined=req.body?.joined;
  if(typeof joined!=='boolean')return errors(res,400,'Velg bli med eller forlat rommet.');
  if(!db.prepare('SELECT id FROM rooms WHERE id=?').get(id))return errors(res,404,'Rommet finnes ikke.');
  if(joined)db.prepare('INSERT INTO room_memberships(room_id,user_id) VALUES(?,?) ON CONFLICT DO NOTHING').run(id,req.user.id);
  else db.prepare('DELETE FROM room_memberships WHERE room_id=? AND user_id=?').run(id,req.user.id);
  res.json({room:roomRows(req.user).find(r=>r.id===id)});
});
app.post('/api/session', (req,res) => {
  const name = asText(req.body?.name,24);
  if (name.length<2 || name.length>24 || !/^[\p{L}\p{N} _.-]+$/u.test(name)) return errors(res,400,'Kallenavn må være 2–24 bokstaver eller tall.');
  const token = crypto.randomBytes(32).toString('hex');
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO users(id,token_hash,name) VALUES(?,?,?)').run(id,sha256(token),name);
  res.status(201).json({token,user:{id,name}});
});
app.get('/api/me', requireSession, (req,res) => res.json({user:req.user}));
app.post('/api/rooms', requireSession, (req,res) => {
  const name = asText(req.body?.name,34), description = asText(req.body?.description,280);
  if (name.length<3 || name.length>34) return errors(res,400,'Romnavn må være 3–34 tegn.');
  if (description.length>280) return errors(res,400,'Beskrivelse er for lang.');
  let slug = slugify(name);
  if (!slug) return errors(res,400,'Navnet må inneholde bokstaver eller tall.');
  const base = slug;
  for(let n=2;db.prepare('SELECT id FROM rooms WHERE slug=?').get(slug);n++)slug=`${base}-${n}`;
  const room = db.prepare('INSERT INTO rooms(id,slug,name,description,emoji,created_by) VALUES(?,?,?,?,?,?)').run(nextId(db,'rooms'),slug,name,description,'💬',req.user.id);
  res.status(201).json({room:db.prepare('SELECT * FROM rooms WHERE id=?').get(room.lastInsertRowid)});
});
function wallRows(params) {
  const room = asText(params.room,40), query = asText(params.q,100).toLowerCase();
  const sort = ['new','top','hot'].includes(params.sort)?params.sort:'hot';
  const categories=params.categories===undefined?categoryIds:String(params.categories).split(',').filter(Boolean);
  if(categories.some(category=>!categoryIds.includes(category)))return {error:'Ugyldig kategori.'};
  let items = db.prepare(postSql("WHERE p.status='published' ORDER BY p.created_at DESC, ABS(p.id) DESC")).all();
  items=items.filter(p=>categories.includes(p.category||legacyCategory(p.room_slug,p.type)));
  if (room && room !== 'all') items = items.filter(p=>p.room_slug===room);
  if (query) items = items.filter(p=>(p.title+' '+p.body).toLocaleLowerCase('no').includes(query));
  if (sort==='top') items.sort((a,b)=>b.score-a.score||b.id-a.id);
  else if (sort==='hot') {
    const now=Date.now();
    const hot=p=>Math.log1p(Math.max(0,p.score)+1)/Math.pow(2+Math.max(0,(now-Date.parse(p.created_at.replace(' ','T')+'Z'))/3600000),0.55);
    items.sort((a,b)=>hot(b)-hot(a)||b.id-a.id);
  }
  return {items};
}
app.get('/api/posts', (req,res) => {
  const result=wallRows(req.query);
  if(result.error)return errors(res,400,result.error);
  res.json({posts:enrichPosts(result.items,session(req)).map(publicPost)});
});
app.get('/api/activity', (req,res) => {
  const result=wallRows(req.query);
  if(result.error)return errors(res,400,result.error);
  res.json(require('./activity').activityProjection(db,result.items.map(publicPost)));
});
app.get('/api/posts/:id', (req,res) => {
  const p = db.prepare(postSql("WHERE p.id=? AND p.status='published'")).get(req.params.id);
  if (!p) return errors(res,404,'Innlegget finnes ikke.');
  res.json({post:publicPost(enrichPosts([p],session(req))[0])});
});
app.post('/api/posts', requireSession, upload.single('image'), (req,res) => {
  const roomId = req.body?.room_id===undefined?null:Number(req.body.room_id);
  const title = asText(req.body?.title,160), body = asText(req.body?.body,3000);
  const type = asText(req.body?.type,10), rawLink = asText(req.body?.link_url,1500);
  const synthetic = req.body?.synthetic_demo;
  if(synthetic!==undefined&&!['true','false'].includes(synthetic))return errors(res,400,'Ugyldig demomerking.');
  const room=roomId===null?null:db.prepare('SELECT id,slug FROM rooms WHERE id=?').get(roomId);
  if (roomId!==null&&!room) return errors(res,400,'Ugyldig rom.');
  let design;
  try { design=parseDesign(req.body,legacyCategory(room?.slug,type)); }
  catch(error) { return errors(res,400,error.message); }
  if (title.length<3||title.length>160) return errors(res,400,'Overskriften må være 3–160 tegn.');
  if (body.length>3000) return errors(res,400,'Innlegget er for langt.');
  if (!['text','link','image','poster'].includes(type)) return errors(res,400,'Ugyldig innleggstype.');
  let link=null;
  if(type==='link'||rawLink) {
    try {const u=new URL(rawLink);if(!['https:','http:'].includes(u.protocol)||!u.hostname)throw Error();link=u.href;}
    catch {return errors(res,400,'Bruk en gyldig http(s)-lenke.');}
  }
  if ((type==='image'||type==='poster') && !req.file) return errors(res,400,'Velg et bilde først.');
  if ((type==='text'||type==='link') && req.file) return errors(res,400,'Denne innleggstypen kan ikke ha bilde.');
  let imageUrl=null, filePath=null;
  if (req.file) {
    const ext = imageExt(req.file.buffer);
    if(!ext) return errors(res,400,'Kun JPEG, PNG og WebP er støttet.');
    const name=crypto.randomUUID()+ext;
    filePath=path.join(uploadsDir,name);
    fs.writeFileSync(filePath,req.file.buffer,{flag:'wx'});
    imageUrl=`/uploads/${name}`;
  }
  try {
    db.exec('BEGIN IMMEDIATE');
    const result=db.prepare(`INSERT INTO posts(id,room_id,author_id,title,body,type,link_url,image_url,base_score)
      VALUES(?,?,?,?,?,?,?,?,0)`).run(nextId(db,'posts'),roomId,req.user.id,title,body,type,link,imageUrl);
    db.prepare('INSERT INTO votes(post_id,user_id,value) VALUES(?,?,1)').run(result.lastInsertRowid,req.user.id);
    insertDesign(db,Number(result.lastInsertRowid),design);
    if(synthetic==='true')db.prepare('INSERT INTO post_presentation(post_id,synthetic_demo) VALUES(?,1)').run(result.lastInsertRowid);
    db.exec('COMMIT');
    res.status(201).json({id:Number(result.lastInsertRowid)});
  } catch(e) {if(db.isTransaction)db.exec('ROLLBACK');if(filePath)fs.rmSync(filePath,{force:true});throw e;}
});
app.post('/api/posts/:id/vote', requireSession, (req,res) => {
  const id=Number(req.params.id), value=Number(req.body?.value);
  if (![1,-1].includes(value)) return errors(res,400,'Stem opp eller ned.');
  const post=db.prepare("SELECT id FROM posts WHERE id=? AND status='published'").get(id);
  if(!post)return errors(res,404,'Fant ikke innlegget.');
  const old=db.prepare('SELECT value FROM votes WHERE post_id=? AND user_id=?').get(id,req.user.id)?.value;
  if (old===value) db.prepare('DELETE FROM votes WHERE post_id=? AND user_id=?').run(id,req.user.id);
  else db.prepare('INSERT INTO votes(post_id,user_id,value) VALUES(?,?,?) ON CONFLICT(post_id,user_id) DO UPDATE SET value=excluded.value').run(id,req.user.id,value);
  const current=db.prepare('SELECT base_score+(SELECT COALESCE(sum(value),0) FROM votes WHERE post_id=?) AS score FROM posts WHERE id=?').get(id,id);
  res.json({score:current.score,my_vote:old===value?0:value});
});
app.get('/api/posts/:id/comments', (req,res) => {
  const id=Number(req.params.id);
  if(!db.prepare("SELECT id FROM posts WHERE id=? AND status='published'").get(id))return errors(res,404,'Fant ikke innlegget.');
  const comments=db.prepare(`SELECT c.id,c.post_id,c.parent_id,c.body,c.depth,c.created_at,
    COALESCE(u.name,c.demo_author,'anonym') AS author
    FROM comments c LEFT JOIN users u ON u.id=c.author_id WHERE c.post_id=? ORDER BY c.created_at ASC, ABS(c.id) ASC`).all(id);
  res.json({comments});
});
app.post('/api/posts/:id/comments', requireSession, (req,res) => {
  const id=Number(req.params.id), body=asText(req.body?.body,1200), parentId=req.body?.parent_id?Number(req.body.parent_id):null;
  if(body.length<1||body.length>1200)return errors(res,400,'Kommentar må være 1–1200 tegn.');
  if(!db.prepare("SELECT id FROM posts WHERE id=? AND status='published'").get(id))return errors(res,404,'Fant ikke innlegget.');
  let depth=0;
  if(parentId){const parent=db.prepare('SELECT depth FROM comments WHERE id=? AND post_id=?').get(parentId,id);
    if(!parent)return errors(res,400,'Ugyldig svar.');
    if(parent.depth>=3)return errors(res,400,'Maks fire nivåer med svar.');
    depth=parent.depth+1;
  }
  const info=db.prepare('INSERT INTO comments(id,post_id,parent_id,author_id,body,depth) VALUES(?,?,?,?,?,?)').run(nextId(db,'comments'),id,parentId,req.user.id,body,depth);
  res.status(201).json({id:Number(info.lastInsertRowid)});
});
app.post('/api/posts/:id/report', requireSession, (req,res) => {
  const id=Number(req.params.id), reason=asText(req.body?.reason,60);
  if(!['Personopplysninger','Trakassering','Ulovlig innhold','Spam / svindel','Annet'].includes(reason))return errors(res,400,'Velg en grunn.');
  const post=db.prepare("SELECT id FROM posts WHERE id=? AND status='published'").get(id);
  if(!post)return errors(res,404,'Fant ikke innlegget.');
  const result=db.prepare('INSERT INTO reports(id,post_id,user_id,reason) VALUES(?,?,?,?) ON CONFLICT(post_id,user_id) DO NOTHING').run(nextId(db,'reports'),id,req.user.id,reason);
  if(!result.changes)return errors(res,409,'Du har allerede rapportert innlegget.');
  const count=db.prepare('SELECT count(*) AS n FROM reports WHERE post_id=? AND resolved=0').get(id).n;
  if (count>=3) db.prepare("UPDATE posts SET status='review' WHERE id=?").run(id);
  res.status(201).json({reported:true,automatically_held:count>=3});
});
app.get('/api/admin/queue', requireAdmin, (req,res) => {
  const posts=db.prepare(postSql(`WHERE p.status IN ('review','hidden') OR EXISTS
    (SELECT 1 FROM reports rr WHERE rr.post_id=p.id AND rr.resolved=0)
    ORDER BY p.id DESC LIMIT 100`)).all();
  res.json({posts:posts.map(p=>({id:p.id,title:p.title,category:p.category||legacyCategory(p.room_slug,p.type),author:p.author,status:p.status,report_count:p.report_count,
    reasons:db.prepare('SELECT reason,count(*) AS n FROM reports WHERE post_id=? AND resolved=0 GROUP BY reason').all(p.id)}))});
});
app.post('/api/admin/posts/:id', requireAdmin, (req,res) => {
  const id=Number(req.params.id), action=req.body?.action;
  if(!['publish','hide','dismiss'].includes(action))return errors(res,400,'Ugyldig handling.');
  if(!db.prepare('SELECT id FROM posts WHERE id=?').get(id))return errors(res,404,'Fant ikke innlegget.');
  if (action!=='dismiss')db.prepare('UPDATE posts SET status=? WHERE id=?').run(action==='publish'?'published':'hidden',id);
  db.prepare('UPDATE reports SET resolved=1 WHERE post_id=?').run(id);
  res.json({ok:true});
});

app.use('/api', (req,res) => errors(res,404,'Ukjent API-endepunkt.'));
app.use((err,req,res,next) => {
  if(err instanceof multer.MulterError) return errors(res,400,err.code==='LIMIT_FILE_SIZE'?'Bildet er større enn 8 MB.':'Ugyldig bildeopplasting.');
  console.error(err);
  errors(res,500,'Noe gikk galt på serveren. Se terminalen.');
});

if (require.main===module) {
  listenAvailable(app,{port:requestedPort,onBusy:port=>console.log(`  Port ${port} er opptatt. Prøver neste port...`)}).then(server=>{
    const PORT = server.address().port;
    console.log(`\n  HerEme kjører!\n  På PC:     http://localhost:${PORT}`);
    const all=lanIps();
    if(all.length)for(const {name,ip} of all)console.log(`  På mobilen: http://${ip}:${PORT}  (${name})`);
    else console.log('  Fant ingen IPv4-adresse. Sjekk Wi-Fi/nettverk.');
    console.log(`\n  Åpne samme adresse fra mobilen på samme Wi-Fi.`);
    console.log('  Hvis mobilen ikke får kontakt: tillat Node.js i Windows-brannmuren (Private nettverk).');
    console.log(`  Demo-moderatorkode: ${ADMIN_PIN}  (kun for lokal test!)`);
    console.log(`  Data lagres i ${path.join(dataDir, 'hereme.sqlite')}. Ctrl+C for å stoppe.\n`);
  }).catch(error=>{console.error(error);db.close();process.exitCode=1;});
}
module.exports=app;
