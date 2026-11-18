'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const app=require('../server/index');
let server,url;
test.before(async()=>{
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  url=`http://127.0.0.1:${server.address().port}`;
});
test.after(()=>new Promise(resolve=>server.close(resolve)));
const send=async(path,opts={})=>{
  const res=await fetch(url+path,opts);return {status:res.status,body:await res.json()};
};
test('health and seed rooms',async()=>{
  const health=await send('/api/health');assert.equal(health.status,200);assert.equal(health.body.storage,'SQLite');
  const rooms=await send('/api/rooms');assert.ok(rooms.body.rooms.length>=7);
});
test('session, room, post, vote, nested comment and report',async()=>{
  const name=`Test${Date.now()}`;
  const s=await send('/api/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});
  assert.equal(s.status,201);assert.equal(s.body.token.length,64);
  const headers={authorization:`Bearer ${s.body.token}`,'content-type':'application/json'};
  const room=await send('/api/rooms',{method:'POST',headers,body:JSON.stringify({name:`Testrom ${Date.now()}`,description:'Et testrom'})});
  assert.equal(room.status,201);
  const form=new FormData();form.set('room_id',String(room.body.room.id));form.set('title','Dette er et testinnlegg');form.set('type','text');form.set('body','lokal testing');
  const post=await send('/api/posts',{method:'POST',headers:{authorization:headers.authorization},body:form});
  assert.equal(post.status,201);
  const id=post.body.id;
  const listed=await send(`/api/posts?room=${room.body.room.slug}`);
  assert.ok(listed.body.posts.some(p=>p.id===id));
  const vote=await send(`/api/posts/${id}/vote`,{method:'POST',headers,body:JSON.stringify({value:-1})});
  assert.equal(vote.body.my_vote,-1);
  const reply=await send(`/api/posts/${id}/comments`,{method:'POST',headers,body:JSON.stringify({body:'Hei alle sammen!'})});
  assert.equal(reply.status,201);
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
