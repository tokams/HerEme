'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const sharp=require('sharp');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'hereme-avatar-test-'));
process.env.HEREME_DATA_DIR=data;process.env.HEREME_ENV='test';
const app=require('../server/index'),S=require('../server/services');
let server,base;
test.before(async()=>{server=await new Promise(resolve=>{const running=app.listen(0,'127.0.0.1',()=>resolve(running));});base=`http://127.0.0.1:${server.address().port}`;});
test.after(async()=>{await new Promise(resolve=>server.close(resolve));S.db.close();fs.rmSync(data,{recursive:true,force:true});});
async function account(name){const response=await fetch(base+'/api/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});assert.equal(response.status,201);const result=await response.json();return {id:result.user.id,cookie:response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; '),csrf:result.csrf_token};}
async function request(url,{method='GET',user,form,body}={}){const headers={};if(user){headers.cookie=user.cookie;if(method!=='GET')headers['x-csrf-token']=user.csrf;}if(body!==undefined)headers['content-type']='application/json';return fetch(base+url,{method,headers,body:form||(body===undefined?undefined:JSON.stringify(body))});}
function form(image,{x='50',y='50',zoom='1'}={}){const value=new FormData();value.append('image',new Blob([image],{type:'image/png'}),'face.png');value.append('x',x);value.append('y',y);value.append('zoom',zoom);return value;}

test('avatar upload validates, strips metadata, projects safe URLs and survives replacement',async()=>{
  const alice=await account('AvatarAlice'),bob=await account('AvatarBob');
  assert.equal((await request('/api/me/avatar',{method:'POST',form:form(Buffer.from('not an image'))})).status,401);
  const input=await sharp({create:{width:480,height:320,channels:3,background:'#7f976f'}}).png().withMetadata({orientation:6}).toBuffer();
  const denied=await request('/api/me/avatar',{method:'POST',user:{...alice,csrf:'wrong'},form:form(input)});assert.equal(denied.status,403);
  const first=await request('/api/me/avatar',{method:'POST',user:alice,form:form(input,{x:'80',y:'20',zoom:'1.5'})});assert.equal(first.status,201);
  const saved=await first.json();assert.match(saved.avatar_url,new RegExp(`/api/avatars/${alice.id}/1/small`));
  const image=await request(saved.avatar_large_url);assert.equal(image.status,200);assert.equal(image.headers.get('cache-control'),'private, no-store');
  const metadata=await sharp(Buffer.from(await image.arrayBuffer())).metadata();assert.equal(metadata.width,256);assert.equal(metadata.height,256);assert.equal(metadata.exif,undefined);
  const me=await request('/api/me',{user:alice});assert.equal((await me.json()).user.avatar_url,saved.avatar_url);
  const summary=await request('/api/me/summary',{user:alice});assert.equal((await summary.json()).profile.avatar_url,saved.avatar_url);
  const search=await request('/api/chat/users?q=AvatarAlice',{user:bob});assert.equal((await search.json()).users[0].avatar_url,saved.avatar_url);
  const started=await request('/api/chats/direct',{method:'POST',user:alice,body:{target_user_id:bob.id,body:'Hello',client_key:crypto.randomUUID()}});assert.equal(started.status,201);
  const incoming=(await request('/api/chats',{user:bob}).then(result=>result.json())).chats[0];
  assert.equal(incoming.participants[0].avatar_url,saved.avatar_url);
  assert.equal((await request(`/api/chat/requests/${incoming.request_id}`,{method:'POST',user:bob,body:{accept:true}})).status,200);
  const accepted=(await request('/api/chats',{user:bob}).then(result=>result.json())).chats[0];assert.equal(accepted.participants[0].avatar_url,saved.avatar_url);
  const carol=await account('AvatarCarol');
  const group=await request('/api/chats',{method:'POST',user:alice,body:{name:'Neighbors',recipients:[bob.id,carol.id]}});assert.equal(group.status,201);
  const groupId=(await group.json()).id;
  for(const member of [bob,carol]){
    const pending=(await request('/api/chats',{user:member}).then(result=>result.json())).chats.find(item=>item.id===groupId);
    assert.equal(pending.state,'invited');assert.deepEqual(pending.participants,[],'Unaccepted invite hides member identities.');
    assert.equal((await request(`/api/chat/invites/${pending.invite_id}`,{method:'POST',user:member,body:{accept:true}})).status,200);
  }
  for(const member of [bob,carol])assert.equal((await request(`/api/chats/${groupId}/messages`,{method:'POST',user:member,body:{body:'Hi',client_key:crypto.randomUUID()}})).status,201);
  const participants=(await request('/api/chats',{user:alice}).then(result=>result.json())).chats.find(item=>item.id===groupId).participants;
  assert.deepEqual(participants.map(person=>person.name),['AvatarCarol','AvatarBob','AvatarAlice']);
  const rejected=await request('/api/me/avatar',{method:'POST',user:alice,form:form(Buffer.from('<svg/>'))});assert.equal(rejected.status,400);
  assert.equal((await request(saved.avatar_url)).status,200,'Rejected replacement keeps the existing photo.');
  const second=await request('/api/me/avatar',{method:'POST',user:alice,form:form(input,{zoom:'2'})});assert.equal(second.status,201);
  const replaced=await second.json();assert.match(replaced.avatar_url,/\/2\/small$/);assert.equal((await request(saved.avatar_url)).status,404);
  assert.equal((await request('/api/me/avatar',{method:'DELETE',user:bob})).status,200);
  assert.equal((await request(replaced.avatar_url)).status,200);
  const removed=await request('/api/me/avatar',{method:'DELETE',user:alice});assert.equal(removed.status,200);assert.equal((await removed.json()).avatar_url,null);assert.equal((await request(replaced.avatar_url)).status,404);
  assert.equal((await request('/api/me',{user:alice}).then(result=>result.json())).user.avatar_url,null);
  const toDelete=await account('AvatarDelete');
  const final=await request('/api/me/avatar',{method:'POST',user:toDelete,form:form(input)});assert.equal(final.status,201);
  const finalUrl=(await final.json()).avatar_url,stored=path.join(data,'avatars',crypto.createHash('sha256').update(toDelete.id).digest('hex'));
  assert.equal(fs.existsSync(stored),true);
  assert.equal((await request('/api/me',{method:'DELETE',user:toDelete})).status,200);
  assert.equal(fs.existsSync(stored),false,'Account deletion removes avatar bytes.');
  assert.equal((await request(finalUrl)).status,404);
});
