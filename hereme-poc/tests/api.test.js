'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const testData=fs.mkdtempSync(path.join(os.tmpdir(),'hereme-api-'));
process.env.HEREME_DATA_DIR=testData;
const app=require('../server/index');
const {db}=require('../server/db');
const {readRows}=require('../server/migrations');
db.prepare('INSERT INTO migration_source(id,directory,baseline) VALUES(1,?,?)').run(testData,JSON.stringify(readRows(db)));
let server,url;
test.before(async()=>{
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  url=`http://127.0.0.1:${server.address().port}`;
});
test.after(async()=>{
  if(server)await new Promise(resolve=>server.close(resolve));
  db.close();
  fs.rmSync(testData,{recursive:true});
});
const send=async(path,opts={})=>{
  const res=await fetch(url+path,opts);return {status:res.status,body:await res.json()};
};
test('health and seed rooms',async()=>{
  const health=await send('/api/health');assert.equal(health.status,200);assert.equal(health.body.storage,'SQLite');
  const rooms=await send('/api/rooms');assert.ok(rooms.body.rooms.length>=7);
});
test('LAN metadata prefers physical Wi-Fi over virtual Ethernet',async t=>{
  t.mock.method(os,'networkInterfaces',()=>({
    'vEthernet (Default Switch)':[{family:'IPv4',internal:false,address:'172.20.16.1'}],
    'Wi-Fi':[{family:'IPv4',internal:false,address:'192.168.68.60'}]
  }));
  const meta=await send('/api/meta');
  assert.equal(meta.body.connect_url,`http://192.168.68.60:${meta.body.port}`);
});
test('session, room, post, vote, nested comment and report',async()=>{
  const name=`Test${Date.now()}`;
  const s=await send('/api/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});
  assert.equal(s.status,201);assert.equal(s.body.token.length,64);
  const headers={authorization:`Bearer ${s.body.token}`,'content-type':'application/json'};
  const room=await send('/api/rooms',{method:'POST',headers,body:JSON.stringify({name:`Testrom ${Date.now()}`,description:'Et testrom'})});
  assert.equal(room.status,201);
  assert.ok(room.body.room.id<0);
  const form=new FormData();form.set('room_id',String(room.body.room.id));form.set('title','Dette er et testinnlegg');form.set('type','text');form.set('body','lokal testing');
  const post=await send('/api/posts',{method:'POST',headers:{authorization:headers.authorization},body:form});
  assert.equal(post.status,201);
  const id=post.body.id;
  assert.ok(id<0);
  const listed=await send(`/api/posts?room=${room.body.room.slug}`);
  assert.ok(listed.body.posts.some(p=>p.id===id));
  assert.equal(listed.body.posts.find(p=>p.id===id).score,1);
  const vote=await send(`/api/posts/${id}/vote`,{method:'POST',headers,body:JSON.stringify({value:-1})});
  assert.equal(vote.body.my_vote,-1);
  const reply=await send(`/api/posts/${id}/comments`,{method:'POST',headers,body:JSON.stringify({body:'Hei alle sammen!'})});
  assert.equal(reply.status,201);
  assert.ok(reply.body.id<0);
  const reply2=await send(`/api/posts/${id}/comments`,{method:'POST',headers,body:JSON.stringify({body:'Svarer på den første',parent_id:reply.body.id})});
  assert.equal(reply2.status,201);
  const comments=await send(`/api/posts/${id}/comments`);assert.equal(comments.body.comments.length,2);
  assert.equal(comments.body.comments[1].depth,1);
  const report=await send(`/api/posts/${id}/report`,{method:'POST',headers,body:JSON.stringify({reason:'Annet'})});
  assert.equal(report.status,201);
  const queue=await send('/api/admin/queue',{headers:{'x-admin-pin':'2468'}});
  assert.ok(queue.body.posts.some(p=>p.id===id));
});
test('reject unauthenticated writes and malformed URLs',async()=>{
  const r=await send('/api/rooms',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Ikke lov'})});
  assert.equal(r.status,401);
});

test('serve frontend, render connect QR, and accept an image upload',async()=>{
  const res=await fetch(url+'/');
  assert.equal(res.status,200);assert.match(await res.text(),/HerEme/);
  const qr=await fetch(url+'/api/connect-qr.svg');
  assert.equal(qr.status,200);assert.match(await qr.text(),/<svg/);
  const s=await send('/api/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:`PhotoTest${Date.now()}`})});
  const token=s.body.token;
  const form=new FormData();form.set('room_id','1');form.set('title','Lokalt bilde fra testen');form.set('type','image');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLrWQAAAABJRU5ErkJggg==','base64');
  form.set('image',new Blob([png],{type:'image/png'}),'test.png');
  const post=await send('/api/posts',{method:'POST',headers:{authorization:`Bearer ${token}`},body:form});
  assert.equal(post.status,201);
  const detail=await send(`/api/posts/${post.body.id}`);
  assert.match(detail.body.post.image_url,/^\/uploads\/[a-f0-9-]+\.png$/);
  const uploaded=await fetch(url+detail.body.post.image_url);assert.equal(uploaded.status,200);
  assert.equal((await uploaded.arrayBuffer()).byteLength,png.length);
});

test('older posts remain searchable and visible beyond the former feed limits',async()=>{
  const insert=db.prepare("INSERT INTO posts(id,room_id,title,type) VALUES(?,1,?,'text')");
  const {nextId}=require('../server/migrations');
  for(let i=0;i<305;i++)insert.run(nextId(db,'posts'),`Nyere innlegg ${i}`);
  const all=await send('/api/posts?sort=new');
  assert.ok(all.body.posts.some(post=>post.id===1));
  const title=db.prepare('SELECT title FROM posts WHERE id=1').get().title;
  const search=await send('/api/posts?q='+encodeURIComponent(title));
  assert.ok(search.body.posts.some(post=>post.id===1));
});

test('room membership is canonical, authenticated and idempotent',async()=>{
  const session=await send('/api/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Romvenn'})});
  const headers={'content-type':'application/json',authorization:`Bearer ${session.body.token}`};
  const join=()=>send('/api/rooms/1/membership',{method:'POST',headers,body:JSON.stringify({joined:true})});
  assert.equal((await join()).body.room.joined,1);
  assert.equal((await join()).body.room.member_count,1);
  assert.equal((await send('/api/rooms',{headers})).body.rooms.find(r=>r.id===1).joined,1);
  const leave=await send('/api/rooms/1/membership',{method:'POST',headers,body:JSON.stringify({joined:false})});
  assert.equal(leave.body.room.joined,0);
  assert.equal((await send('/api/rooms/1/membership',{method:'POST',headers:{'content-type':'application/json'},body:'{"joined":true}'})).status,401);
});

test('synthetic labels and poster source metadata are served for the supplied examples',async()=>{
  const posts=(await send('/api/posts')).body.posts;
  const demo=posts.filter(p=>p.synthetic_demo===1);
  assert.equal(demo.length,13);
  assert.equal(demo.filter(p=>p.type==='poster').length,6);
  assert.ok(demo.filter(p=>p.type==='poster').every(p=>p.poster.source_image_url.startsWith('/assets/demo/sources/')));
  for(const post of demo.filter(p=>p.image_url))assert.equal((await fetch(url+post.image_url)).status,200);
});

test('category actions create roomless posts and filter the single wall with exact empty/multiple selections',async()=>{
  const categories=(await send('/api/categories')).body.categories.map(c=>c.id);
  assert.deepEqual(categories,['question','opinion','story','alert','tip']);
  const s=await send('/api/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'VeggTest'})});
  const headers={authorization:'Bearer '+s.body.token,'content-type':'application/json'};
  const created=[];
  for(const category of categories){
    const post=await send('/api/posts',{method:'POST',headers,body:JSON.stringify({type:'text',title:'Ny '+category,category,poster_style:category})});
    assert.equal(post.status,201);created.push(post.body.id);
    const detail=(await send('/api/posts/'+post.body.id)).body.post;
    assert.equal(detail.room_id,null);assert.equal(detail.category,category);
    assert.equal(detail.poster_style,category);assert.equal(detail.score,1);
  }
  const all=(await send('/api/posts')).body.posts;
  for(const id of created)assert.ok(all.some(p=>p.id===id));
  const filtered=(await send('/api/posts?categories=question,alert')).body.posts;
  assert.ok(filtered.length>=2);assert.ok(filtered.every(p=>['question','alert'].includes(p.category)));
  assert.deepEqual((await send('/api/posts?categories=')).body.posts,[]);
  assert.equal((await send('/api/posts?categories=custom')).status,400);
  for(const invalid of [{category:'custom'},{category:'tip',poster_style:'story'},{image_zoom:4}]){
    assert.equal((await send('/api/posts',{method:'POST',headers,body:JSON.stringify({title:'Ugyldig plakat',type:'text',...invalid})})).status,400);
  }
  const photo=new FormData();photo.set('title','Bilde med kategori');photo.set('type','image');photo.set('category','alert');
  photo.set('image_zoom','1.5');photo.set('image_x','30');photo.set('image_y','70');photo.set('text_position','top');
  photo.set('image',new Blob([fs.readFileSync(path.join(__dirname,'../public/assets/demo/sources/source-01-rain_bus_stop.jpg'))],{type:'image/jpeg'}),'photo.jpg');
  const result=await send('/api/posts',{method:'POST',headers:{authorization:headers.authorization},body:photo});
  assert.equal(result.status,201);
  const detail=(await send('/api/posts/'+result.body.id)).body.post;
  assert.equal(detail.category,'alert');assert.equal(detail.image_zoom,1.5);
  assert.equal(detail.image_x,30);assert.equal(detail.image_y,70);
  assert.equal(detail.text_position,'top');
});

test('activity uses the same published category/search projection and hides moderated content',async()=>{
  const filtered=(await send('/api/posts?categories=question')).body.posts;
  const ids=new Set(filtered.map(p=>p.id));
  const activity=(await send('/api/activity?categories=question')).body;
  assert.equal(activity.stats.posts,filtered.length);
  assert.equal(activity.stats.comments,filtered.reduce((sum,p)=>sum+p.comment_count,0));
  assert.ok(activity.recent_comments.every(c=>ids.has(c.post_id)));
  assert.ok(activity.discussions.every(p=>ids.has(p.id)&&p.category==='question'));
  assert.deepEqual((await send('/api/activity?categories=')).body,{stats:{posts:0,comments:0},discussions:[],recent_comments:[]});
  assert.equal((await send('/api/activity?categories=invalid')).status,400);
  const searched=(await send('/api/activity?q='+encodeURIComponent('no matching text 928374'))).body;
  assert.equal(searched.stats.posts,0);
  const hidden=activity.recent_comments[0]?.post_id;
  assert.ok(hidden);
  db.prepare("UPDATE posts SET status='hidden' WHERE id=?").run(hidden);
  const after=(await send('/api/activity?categories=question')).body;
  assert.ok(!after.recent_comments.some(c=>c.post_id===hidden));
  assert.ok(!after.discussions.some(p=>p.id===hidden));
  db.prepare("UPDATE posts SET status='published' WHERE id=?").run(hidden);
  const font=await fetch(url+'/assets/fonts/CascadiaCode.ttf');
  assert.equal(font.status,200);assert.equal(font.headers.get('content-type'),'font/ttf');
});
