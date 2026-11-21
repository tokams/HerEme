'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const testData=fs.mkdtempSync(path.join(os.tmpdir(),'hereme-release-api-'));process.env.HEREME_DATA_DIR=testData;process.env.HEREME_ENV='test';
const app=require('../server/index');const S=require('../server/services');let server,url;
test.before(async()=>{server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});url=`http://127.0.0.1:${server.address().port}`;});
test.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));S.db.close();fs.rmSync(testData,{recursive:true,force:true});});
async function request(route,{method='GET',body,form,session,headers={}}={}){
  const outgoing={...headers};if(body!==undefined)outgoing['content-type']='application/json';if(session){outgoing.cookie=session.cookie;if(!['GET','HEAD'].includes(method))outgoing['x-csrf-token']=session.csrf;}
  const response=await fetch(url+route,{method,headers:outgoing,body:form||(body===undefined?undefined:JSON.stringify(body))});
  const type=response.headers.get('content-type')||'',payload=type.includes('json')?await response.json():await response.text();
  return {status:response.status,body:payload,headers:response.headers};
}
async function profile(name){
  const result=await request('/api/session',{method:'POST',body:{name}});assert.equal(result.status,201);
  const cookies=result.headers.getSetCookie();return {user:result.body.user,recovery:result.body.recovery_key,csrf:result.body.csrf_token,cookie:cookies.map(value=>value.split(';')[0]).join('; ')};
}
function fixtureProfile(name){const result=S.identity.createProfile({name});return {user:result.user,recovery:result.recoveryKey,csrf:result.session.csrf,cookie:`hereme_session=${encodeURIComponent(result.session.raw)}; hereme_csrf=${encodeURIComponent(result.session.csrf)}`};}
test('liveness, readiness, public pages and protected staff surfaces',async()=>{
  assert.equal((await request('/api/live')).status,200);const ready=await request('/api/ready');assert.equal(ready.status,200);assert.ok(Object.values(ready.body.checks).every(Boolean));
  assert.equal((await request('/api/rooms')).status,410);assert.equal((await request('/api/admin/queue')).status,401);
  assert.match((await request('/privacy.html')).body,/Personvern/);assert.match((await request('/rules.html')).body,/Fellesskapsregler/);
  assert.equal((await request('/manifest.webmanifest')).body.id,'/');assert.match((await request('/service-worker.js')).body,/notificationclick/);
});
test('chat consent, membership, groups, blocked delivery, resumable files and expiry',async()=>{
  const alice=await profile('ChatAlice'),bob=await profile('ChatBob'),third=await profile('ChatThird');
  assert.equal((await request('/api/chat/users?q=ChatB',{session:alice})).body.users[0].name,'ChatBob');
  const pending=await request('/api/chats/direct',{method:'POST',session:alice,body:{target_user_id:bob.user.id,body:'Hello',client_key:'legacy-test-first-message'}});
  assert.equal(pending.status,201);assert.equal((await request('/api/chats',{session:alice})).body.chats[0].state,'pending');
  const requestId=(await request('/api/chat/inbox',{session:bob})).body.requests[0].id;
  assert.equal((await request('/api/chat/requests/'+requestId,{method:'POST',session:third,body:{accept:true}})).status,404);
  const accepted=await request('/api/chat/requests/'+requestId,{method:'POST',session:bob,body:{accept:true}});const chat=accepted.body.chat_id;
  assert.equal((await request('/api/chats',{session:alice})).body.chats[0].name,'ChatBob');
  assert.equal((await request(`/api/chats/${chat}/messages`,{session:third})).status,403);
  assert.equal((await request(`/api/chats/${chat}/messages`,{session:bob})).body.messages[0].body,'Hello');
  const started=await request('/api/chat-uploads/stage',{method:'POST',session:alice,body:{chat_id:chat,name:'sample.bin',bytes:5,media_kind:'file'}});assert.equal(started.status,201);
  for(const [offset,part] of [[0,'ab'],[2,'cde']]){const uploaded=await fetch(url+'/api/chat-uploads/'+started.body.id,{method:'PATCH',headers:{cookie:alice.cookie,'x-csrf-token':alice.csrf,'x-upload-offset':String(offset)},body:new Blob([part])});assert.equal(uploaded.status,200);}
  assert.equal((await request('/api/chat-uploads/'+started.body.id,{session:alice})).body.status,'staged');
  assert.equal((await request(`/api/chats/${chat}/messages`,{session:bob})).body.messages.length,1);
  const sentFile=await request(`/api/chats/${chat}/messages`,{method:'POST',session:alice,body:{attachment_ids:[started.body.id],client_key:'single-staged-file-test'}});assert.equal(sentFile.status,201);
  assert.equal((await request('/api/chat/files/'+started.body.id,{session:alice})).body.status,'ready');
  assert.equal(await (await fetch(url+'/api/chat/files/'+started.body.id+'/download',{headers:{cookie:bob.cookie}})).text(),'abcde');
  const backupDir=fs.mkdtempSync(path.join(os.tmpdir(),'hereme-chat-backup-'));try{await require('../scripts/snapshot-data').snapshotData(testData,path.join(backupDir,'snapshot'));assert.equal(fs.existsSync(path.join(backupDir,'snapshot','chat')),false);}finally{fs.rmSync(backupDir,{recursive:true,force:true});}
  assert.equal((await request('/api/chat/files/'+started.body.id+'/download',{session:third})).status,403);
  S.db.prepare("UPDATE chat_files SET expires_at=datetime('now','-1 second') WHERE id=?").run(started.body.id);
  assert.equal((await request('/api/chat/files/'+started.body.id+'/download',{session:bob})).status,410);
  S.chat.cleanup();assert.equal(fs.existsSync(path.join(testData,'chat',started.body.id)),false);
  assert.equal((await request('/api/health')).body.chat_worker.overdue,0);
  const group=await request('/api/chats',{method:'POST',session:alice,body:{name:'Test group',recipients:[bob.user.id,third.user.id]}});assert.equal(group.status,201);
  assert.equal((await request('/api/chat/notifications',{session:bob})).body.notifications.filter(item=>item.kind==='invite'&&item.chat_id===group.body.id).length,1);
  assert.equal((await request('/api/chat/notifications',{session:third})).body.notifications.filter(item=>item.kind==='invite'&&item.chat_id===group.body.id).length,1);
  assert.equal((await request(`/api/chats/${group.body.id}/messages`,{session:bob})).status,403);
  const pendingInvites=(await request(`/api/chats/${group.body.id}/invites`,{session:alice})).body.invites;
  assert.equal(pendingInvites.length,2);assert.equal((await request(`/api/chats/${group.body.id}/invites`,{session:bob})).status,403);
  const thirdInvite=pendingInvites.find(i=>i.recipient==='ChatThird');
  assert.equal((await request(`/api/chats/${group.body.id}/invites/${thirdInvite.id}`,{method:'DELETE',session:alice})).status,200);
  assert.equal((await request('/api/chat/inbox',{session:third})).body.invites.length,0);
  assert.ok((await request('/api/chat/notifications',{session:third})).body.notifications.find(item=>item.chat_id===group.body.id).read_at);
  const invite=(await request('/api/chat/inbox',{session:bob})).body.invites[0];assert.equal((await request('/api/chat/invites/'+invite.id,{method:'POST',session:bob,body:{accept:true}})).status,200);
  assert.equal((await request(`/api/chats/${group.body.id}/messages`,{session:bob})).status,200);
  assert.match((await request(`/api/chats/${group.body.id}/messages`,{session:bob})).body.messages[0].body,/ble med/);
  await request('/api/chat/presence',{method:'PUT',session:alice,body:{visible:true}});
  assert.equal((await request(`/api/chats/${chat}/people`,{session:bob})).body.people.find(p=>p.id===alice.user.id).online,1);
  assert.equal((await request('/api/chat/blocks',{method:'POST',session:bob,body:{user_id:alice.user.id}})).status,200);
  assert.equal((await request(`/api/chats/${chat}/people`,{session:bob})).body.people.find(p=>p.id===alice.user.id).online,0);
  assert.equal((await request(`/api/chats/${chat}/messages`,{method:'POST',session:alice,body:{body:'blocked'}})).status,403);
  assert.equal((await request(`/api/chats/${group.body.id}/membership`,{method:'DELETE',session:alice})).status,200);
  const admin=await profile('ChatDeleteAdmin');S.db.prepare("insert into user_roles(user_id,role) values(?,'admin')").run(admin.user.id);
  assert.equal((await request(`/api/admin/users/${alice.user.id}`,{method:'DELETE',session:admin,body:{delete_posts:false,reason:'chat account deletion test'}})).status,200);
  const afterDeletion=await request(`/api/chats/${group.body.id}/messages`,{session:bob});assert.equal(afterDeletion.status,200);assert.match(afterDeletion.body.messages.at(-1).body,/slettet bruker/);
});
test('unified chat creates one pending request on first send and delivers durable notifications',async()=>{
  const sender=await profile('FlowSender'),recipient=await profile('FlowRecipient'),other=await profile('FlowOther');
  const suggestions=await request('/api/chat/users?q=FlowRecipien',{session:sender});assert.equal(suggestions.body.users[0].name,'FlowRecipient');
  assert.equal((await request('/api/chat/users?q=FlowRecipieht',{session:sender})).body.users[0].name,'FlowRecipient');
  assert.equal((await request('/api/chat/users?q=XlowRecipient',{session:sender})).body.users[0].name,'FlowRecipient');
  assert.deepEqual((await request('/api/chat/direct/'+recipient.user.id,{session:sender})).body,{chat_id:null,state:'new'});
  assert.equal((await request('/api/chats',{session:sender})).body.chats.some(chat=>chat.name==='FlowRecipient'),false);
  const first=await request('/api/chats/direct',{method:'POST',session:sender,body:{target_user_id:recipient.user.id,body:'First private message',client_key:'first-message-key'}});
  assert.equal(first.status,201,JSON.stringify(first.body));assert.equal(first.body.state,'pending');const chatId=first.body.chat_id;
  const repeat=await request('/api/chats/direct',{method:'POST',session:sender,body:{target_user_id:recipient.user.id,body:'First private message',client_key:'first-message-key'}});
  assert.equal(repeat.body.chat_id,chatId);assert.equal(repeat.body.message_id,first.body.message_id);
  const pending=(await request('/api/chats',{session:recipient})).body.chats.find(chat=>chat.id===chatId);
  assert.equal(pending.state,'incoming');assert.equal(pending.last_body,null);assert.equal(pending.unread,1);assert.ok(pending.request_id);
  assert.equal((await request(`/api/chats/${chatId}/messages`,{session:recipient})).status,403);
  assert.equal((await request(`/api/chats/${chatId}/messages`,{session:other})).status,403);
  assert.equal((await request('/api/chat/notifications',{session:recipient})).body.notifications.filter(item=>item.kind==='request').length,1);
  const followup=await request(`/api/chats/${chatId}/messages`,{method:'POST',session:sender,body:{body:'Second private message',client_key:'second-message-key'}});assert.equal(followup.status,201);
  assert.equal((await request('/api/chat/notifications',{session:recipient})).body.notifications.filter(item=>item.kind==='request').length,1);
  const accepted=await request('/api/chat/requests/'+pending.request_id,{method:'POST',session:recipient,body:{accept:true}});assert.equal(accepted.body.chat_id,chatId);
  assert.deepEqual((await request(`/api/chats/${chatId}/messages`,{session:recipient})).body.messages.map(item=>item.body),['First private message','Second private message']);
  assert.equal((await request('/api/chats',{session:recipient})).body.chats.find(chat=>chat.id===chatId).last_body,'Second private message');
  const delivered=await request(`/api/chats/${chatId}/messages`,{method:'POST',session:sender,body:{body:'After acceptance',client_key:'accepted-message-key'}});assert.equal(delivered.status,201);
  assert.equal((await request('/api/chat/notifications',{session:recipient})).body.notifications.filter(item=>item.kind==='message').length,1);
  assert.equal((await request(`/api/chats/${chatId}/read`,{method:'POST',session:recipient})).status,200);
  assert.equal((await request('/api/chats',{session:recipient})).body.chats.find(chat=>chat.id===chatId).unread,0);
});
test('own profile summary is private, paginated and uses actual received upvotes',async()=>{
  const owner=fixtureProfile('ProfileOwner'),peer=fixtureProfile('ProfilePeer');
  const first=await request('/api/posts',{method:'POST',session:owner,body:{title:'Profile first post',body:'First activity',type:'text',category:'story'}}),second=await request('/api/posts',{method:'POST',session:owner,body:{title:'Profile second post',body:'Second activity',type:'text',category:'tip'}});assert.equal(first.status,201);assert.equal(second.status,201);
  assert.equal((await request('/api/posts/'+first.body.id+'/vote',{method:'POST',session:peer,body:{value:1}})).status,200);
  const requested=await request('/api/me/summary?limit=1',{session:owner});assert.equal(requested.status,200);assert.equal(requested.body.profile.name,'ProfileOwner');assert.equal(requested.body.metrics.post_count,2);assert.equal(requested.body.metrics.upvotes_received,1);assert.equal(requested.body.posts.length,1);assert.ok(requested.body.next_cursor);
  const next=await request('/api/me/summary?limit=1&cursor='+encodeURIComponent(requested.body.next_cursor),{session:owner});assert.equal(next.body.posts.length,1);assert.notEqual(next.body.posts[0].id,requested.body.posts[0].id);
  assert.equal((await request('/api/me/summary')).status,401);
  const direct=await request('/api/chats/direct',{method:'POST',session:owner,body:{target_user_id:peer.user.id,body:'Profile chat',client_key:'profile-summary-chat'}});const pending=(await request('/api/chats',{session:peer})).body.chats.find(chat=>chat.id===direct.body.chat_id);await request('/api/chat/requests/'+pending.request_id,{method:'POST',session:peer,body:{accept:true}});
  const group=await request('/api/chats',{method:'POST',session:owner,body:{name:'Profile group',recipients:[peer.user.id]}});const invitation=(await request('/api/chat/inbox',{session:peer})).body.invites.find(item=>item.name==='Profile group');await request('/api/chat/invites/'+invitation.id,{method:'POST',session:peer,body:{accept:true}});
  const summary=await request('/api/me/summary',{session:owner});assert.equal(summary.body.metrics.direct_chat_count,1);assert.equal(summary.body.metrics.group_chat_count,1);
  assert.match((await request('/me')).body,/main id="profileRoot"/);assert.match((await request('/chat')).body,/chat-shell/);assert.match((await request('/chat/'+direct.body.chat_id)).body,/chat-shell/);
});
test('notification settings, canonical inbox and forum reply events remain account scoped',async()=>{
  const author=fixtureProfile('NotifyAuthor'),replier=fixtureProfile('NotifyReplier');
  assert.deepEqual((await request('/api/push/config')).body,{enabled:false,public_key:null});assert.equal((await request('/api/push/subscriptions')).status,401);
  assert.equal((await request('/api/push/subscriptions',{method:'POST',headers:{cookie:author.cookie},body:{}})).status,403);
  const post=await request('/api/posts',{method:'POST',session:author,body:{title:'Notification post',body:'Question',type:'text',category:'question'}});
  const reply=await request('/api/posts/'+post.body.id+'/comments',{method:'POST',session:replier,body:{body:'A reply'}});assert.equal(reply.status,201);
  const inbox=await request('/api/notifications',{session:author});assert.equal(inbox.status,200);const notification=inbox.body.notifications.find(item=>item.kind==='post_reply'&&item.post_id===post.body.id);assert.ok(notification);assert.equal(notification.route,'/?post='+post.body.id);assert.equal(inbox.body.unread,1);
  assert.equal((await request('/api/notifications/'+encodeURIComponent(notification.notification_id)+'/read',{method:'POST',session:replier})).status,404);
  assert.equal((await request('/api/notifications/'+encodeURIComponent(notification.notification_id)+'/read',{method:'POST',session:author})).status,200);
  const settings=await request('/api/notification-settings',{method:'PUT',session:author,body:{chat_messages:false,chat_requests_and_invitations:true,forum_replies:false}});assert.deepEqual({chat_messages:settings.body.settings.chat_messages,chat_requests_and_invitations:settings.body.settings.chat_requests_and_invitations,forum_replies:settings.body.settings.forum_replies},{chat_messages:0,chat_requests_and_invitations:1,forum_replies:0});
  const direct=await request('/api/chats/direct',{method:'POST',session:author,body:{target_user_id:replier.user.id,body:'Request body must stay out of push',client_key:'notify-request'}});assert.equal(direct.status,201);const outbox=S.db.prepare("SELECT category,kind,route FROM push_outbox WHERE recipient_id=? AND chat_id=?").get(replier.user.id,direct.body.chat_id);assert.equal(outbox.category,'chat_requests_and_invitations');assert.equal(outbox.kind,'request');assert.equal(outbox.route,'/chat');
});
test('staged mixed attachments send as one private retry-safe message',async()=>{
  const sender=await profile('BundleSender'),recipient=await profile('BundleRecipient'),stranger=await profile('BundleStranger');
  const png=await require('sharp')({create:{width:3,height:3,channels:3,background:'#376949'}}).png().toBuffer();
  async function stageFile(name,kind,bytes){
    const started=await request('/api/chat-uploads/stage',{method:'POST',session:sender,body:{target_user_id:recipient.user.id,name,bytes:bytes.length,media_kind:kind}});assert.equal(started.status,201,JSON.stringify(started.body));
    assert.equal((await request('/api/chat-uploads/'+started.body.id,{session:stranger})).status,404);
    const response=await fetch(url+'/api/chat-uploads/'+started.body.id,{method:'PATCH',headers:{cookie:sender.cookie,'x-csrf-token':sender.csrf,'x-upload-offset':'0'},body:new Blob([bytes])});assert.equal(response.status,200,await response.text());return started.body.id;
  }
  const image=await stageFile('photo.png','image',png),document=await stageFile('notes.txt','file',Buffer.from('notes'));
  assert.equal((await request('/api/chats',{session:recipient})).body.chats.length,0);
  const body={target_user_id:recipient.user.id,body:'',attachment_ids:[image,document],client_key:'bundle-first-message'};
  const sent=await request('/api/chats/direct',{method:'POST',session:sender,body});assert.equal(sent.status,201,JSON.stringify(sent.body));
  const repeated=await request('/api/chats/direct',{method:'POST',session:sender,body});assert.equal(repeated.body.message_id,sent.body.message_id);
  assert.equal((await request(`/api/chats/${sent.body.chat_id}/messages`,{session:recipient})).status,403);
  const pending=(await request('/api/chats',{session:recipient})).body.chats[0];assert.equal(pending.last_body,null);
  assert.equal((await request('/api/chat/requests/'+pending.request_id,{method:'POST',session:recipient,body:{accept:true}})).status,200);
  const messages=(await request(`/api/chats/${sent.body.chat_id}/messages`,{session:recipient})).body.messages;assert.equal(messages.length,1);assert.deepEqual(messages[0].attachments.map(file=>file.name),['photo.png','notes.txt']);
  assert.equal((await request(`/api/chats/${sent.body.chat_id}/messages`,{session:stranger})).status,403);
  assert.equal((await request('/api/chat/files/'+image+'/preview',{session:recipient})).status,200);
  assert.equal((await request('/api/chat/files/'+image+'/preview',{session:stranger})).status,403);
  assert.equal((await request('/api/chat/files/'+document+'/preview',{session:recipient})).status,404);
  assert.equal((await request('/api/chat/files/'+document+'/download',{session:recipient})).body,'notes');
  assert.equal(S.db.prepare('SELECT count(*) n FROM chat_messages WHERE chat_id=?').get(sent.body.chat_id).n,1);
});
test('WebSocket live events require a session and remain recipient-scoped',async()=>{
  const WebSocket=require('ws'),alice=await profile('SocketAlice'),bob=await profile('SocketBob'),stranger=await profile('SocketStranger');
  const address=url.replace(/^http/,'ws')+'/api/chat-socket';
  const denied=await new Promise(resolve=>{const socket=new WebSocket(address,{headers:{Origin:url}});socket.on('unexpected-response',(_,response)=>{resolve(response.statusCode);response.resume();});socket.on('error',()=>{});});assert.equal(denied,401);
  async function connect(session){const socket=new WebSocket(address,{headers:{Origin:url,Cookie:session.cookie}});await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});return socket;}
  const recipient=await connect(bob),outsider=await connect(stranger);let outsiderEvent=false;outsider.on('message',raw=>{if(JSON.parse(raw).type!=='connected')outsiderEvent=true;});
  try{
    const event=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Live event did not arrive')),4000);recipient.on('message',raw=>{const item=JSON.parse(raw);if(item.type==='invitation.created'){clearTimeout(timer);resolve(item);}});});
    const notificationEvent=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Live notification did not arrive')),4000);recipient.on('message',raw=>{const item=JSON.parse(raw);if(item.type==='notification.created'){clearTimeout(timer);resolve(item);}});});
    const sent=await request('/api/chats/direct',{method:'POST',session:alice,body:{target_user_id:bob.user.id,body:'Socket hello',client_key:'socket-first-message'}});assert.equal(sent.status,201);
    const notice=await event;assert.equal(notice.chat_id,sent.body.chat_id);assert.equal(outsiderEvent,false);
    const liveNotification=await notificationEvent;assert.match(liveNotification.notification_id,/^chat:\d+$/);assert.equal(outsiderEvent,false);
    await request('/api/session/revoke-all',{method:'POST',session:bob});
    const closed=await new Promise(resolve=>{const timer=setTimeout(()=>resolve(false),4000);recipient.once('close',()=>{clearTimeout(timer);resolve(true);});});assert.equal(closed,true);
  }finally{recipient.terminate();outsider.terminate();}
});
test('reciprocal contact accepts one direct thread and decline is terminal',async()=>{
  const first=await profile('ReciprocalOne'),second=await profile('ReciprocalTwo');
  const sent=await request('/api/chats/direct',{method:'POST',session:first,body:{target_user_id:second.user.id,body:'one',client_key:'reciprocal-first'}});assert.equal(sent.status,201);
  const answer=await request('/api/chats/direct',{method:'POST',session:second,body:{target_user_id:first.user.id,body:'two',client_key:'reciprocal-second'}});
  assert.equal(answer.status,201);assert.equal(answer.body.chat_id,sent.body.chat_id);assert.equal(answer.body.state,'accepted');
  assert.equal(S.db.prepare('SELECT count(*) n FROM chats WHERE pair_key=?').get([first.user.id,second.user.id].sort().join(':')).n,1);
  assert.deepEqual((await request(`/api/chats/${sent.body.chat_id}/messages`,{session:second})).body.messages.map(message=>message.body),['one','two']);
  const declinedSender=await profile('DeclinedSender'),declinedRecipient=await profile('DeclinedRecipient');
  const pending=await request('/api/chats/direct',{method:'POST',session:declinedSender,body:{target_user_id:declinedRecipient.user.id,body:'please',client_key:'decline-first'}});
  const requestId=(await request('/api/chats',{session:declinedRecipient})).body.chats.find(chat=>chat.id===pending.body.chat_id).request_id;
  assert.equal((await request('/api/chat/requests/'+requestId,{method:'POST',session:declinedRecipient,body:{accept:false}})).status,200);
  assert.equal((await request('/api/chat/direct/'+declinedRecipient.user.id,{session:declinedSender})).body.state,'declined');
  assert.equal((await request('/api/chats/direct',{method:'POST',session:declinedSender,body:{target_user_id:declinedRecipient.user.id,body:'retry',client_key:'decline-retry'}})).status,409);
});
test('pending direct messages have a bounded retry-safe allowance',async()=>{
  const sender=await profile('PendingLimitSender'),recipient=await profile('PendingLimitRecipient');
  const first=await request('/api/chats/direct',{method:'POST',session:sender,body:{target_user_id:recipient.user.id,body:'one',client_key:'pending-limit-first'}});
  const chat=first.body.chat_id;let last;
  for(let number=2;number<=5;number++){last=await request(`/api/chats/${chat}/messages`,{method:'POST',session:sender,body:{body:String(number),client_key:'pending-limit-'+number}});assert.equal(last.status,201);}
  const replay=await request(`/api/chats/${chat}/messages`,{method:'POST',session:sender,body:{body:'5',client_key:'pending-limit-5'}});assert.equal(replay.body.id,last.body.id);
  assert.equal((await request(`/api/chats/${chat}/messages`,{method:'POST',session:sender,body:{body:'six',client_key:'pending-limit-six'}})).status,429);
  assert.equal((await request('/api/chat/notifications',{session:recipient})).body.notifications.filter(item=>item.kind==='request').length,1);
});
test('moderator censorship and audited administrator content and user controls',async()=>{
  const author=await profile('ManagedAuthor');
  const created=await request('/api/posts',{method:'POST',session:author,body:{title:'Content to manage',body:'Original body',type:'text',category:'story'}});const postId=created.body.id;
  assert.equal((await request('/api/admin/overview',{session:author})).status,403);

  const moderator=await profile('PanelModerator');S.db.prepare("insert into user_roles(user_id,role) values(?,'moderator')").run(moderator.user.id);
  const moderatorMe=await request('/api/me',{session:moderator});moderator.user=moderatorMe.body.user;
  assert.ok(moderator.user.capabilities.includes('moderate'));assert.equal((await request('/api/admin/overview',{session:moderator})).body.users.length,0);
  assert.equal((await request(`/api/admin/posts/${postId}/moderation`,{method:'POST',session:moderator,body:{action:'hide',reason:'violates local rules'}})).status,200);
  assert.equal((await request('/api/posts/'+postId)).status,404);
  assert.equal((await request(`/api/admin/posts/${postId}`,{method:'PATCH',session:moderator,body:{title:'No',body:'',category:'story',status:'published',score:1,reason:'not allowed'}})).status,403);
  await request(`/api/admin/posts/${postId}/moderation`,{method:'POST',session:moderator,body:{action:'publish',reason:'review complete'}});

  const admin=await profile('PanelAdmin');S.db.prepare("insert into user_roles(user_id,role) values(?,'moderator'),(?,'admin')").run(admin.user.id,admin.user.id);
  admin.user=(await request('/api/me',{session:admin})).body.user;assert.ok(admin.user.capabilities.includes('content:manage'));assert.ok(admin.user.capabilities.includes('moderate'));
  const overview=await request('/api/admin/overview',{session:admin});assert.equal(overview.status,200);assert.ok(overview.body.posts.some(post=>post.id===postId));assert.ok(overview.body.users.some(user=>user.id===author.user.id));
  assert.equal((await request(`/api/admin/posts/${postId}`,{method:'PATCH',session:admin,body:{title:'Managed title',body:'Managed body',category:'tip',status:'published',score:42,reason:'corrected by administrator'}})).status,200);
  const managed=(await request('/api/posts/'+postId)).body.post;assert.equal(managed.title,'Managed title');assert.equal(managed.body,'Managed body');assert.equal(managed.category,'tip');assert.equal(managed.score,42);

  const preserved=await profile('PreservedUser'),preservedPost=(await request('/api/posts',{method:'POST',session:preserved,body:{title:'Preserve my post',body:'Keep this',type:'text',category:'question'}})).body.id;
  const deletePreserved=await request(`/api/admin/users/${preserved.user.id}`,{method:'DELETE',session:admin,body:{delete_posts:false,reason:'account removal requested'}});assert.equal(deletePreserved.status,200,JSON.stringify(deletePreserved.body));assert.equal((await request('/api/posts/'+preservedPost)).body.post.author,'slettet bruker');
  const removed=await profile('RemovedUser'),removedPost=(await request('/api/posts',{method:'POST',session:removed,body:{title:'Remove my post',body:'Delete this',type:'text',category:'alert'}})).body.id;
  const deleteRemoved=await request(`/api/admin/users/${removed.user.id}`,{method:'DELETE',session:admin,body:{delete_posts:true,reason:'account and content removal requested'}});assert.equal(deleteRemoved.body.posts_deleted,1);assert.equal((await request('/api/posts/'+removedPost)).status,404);
  assert.equal((await request(`/api/admin/posts/${postId}`,{method:'DELETE',session:admin,body:{reason:'content deletion requested'}})).status,200);assert.equal((await request('/api/posts/'+postId)).status,404);
  assert.ok(S.db.prepare("select id from audit_events where action='admin.user.deleted'").get());
});
test('pseudonym creation, CSRF, recovery, rotation and session revocation',async()=>{
  const first=await profile('ReleaseUser');assert.ok(first.recovery.length>=20);assert.match(first.headers||'',/^$/);
  const saved=await fetch(url+'/api/recovery/confirm',{method:'POST',redirect:'manual',headers:{cookie:first.cookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:'ReleaseUser',password:first.recovery,csrf_token:first.csrf})});assert.equal(saved.status,303);assert.equal(saved.headers.get('location'),'/?recovery-saved=1');
  const rejectedSave=await fetch(url+'/api/recovery/confirm',{method:'POST',redirect:'manual',headers:{cookie:first.cookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:'ReleaseUser',password:'feil-gjenopprettingsnokkel-som-er-lang',csrf_token:first.csrf})});assert.equal(rejectedSave.status,401);
  const me=await request('/api/me',{session:first});assert.equal(me.body.user.name,'ReleaseUser');assert.equal(me.body.user.secured,true);
  const without=await request('/api/posts',{method:'POST',body:{title:'Uten token',type:'text',category:'story'},headers:{cookie:first.cookie}});assert.equal(without.status,403);assert.equal(without.body.error.code,'CSRF_INVALID');
  assert.equal((await request('/api/session/recover',{method:'POST',body:{name:'ReleaseUser',recovery_key:'helt-feil-nokkel-som-er-lang'}})).status,401);
  const recovered=await request('/api/session/recover',{method:'POST',body:{name:'ReleaseUser',recovery_key:first.recovery}});assert.equal(recovered.status,200);const second={cookie:recovered.headers.getSetCookie().map(value=>value.split(';')[0]).join('; '),csrf:recovered.body.csrf_token};assert.notEqual(second.cookie,first.cookie);
  const rotated=await request('/api/recovery/rotate',{method:'POST',session:second});assert.equal(rotated.status,200);assert.notEqual(rotated.body.recovery_key,first.recovery);
  assert.equal((await request('/api/session/recover',{method:'POST',body:{name:'ReleaseUser',recovery_key:first.recovery}})).status,401);
  assert.equal((await request('/api/session/revoke-all',{method:'POST',session:second})).status,200);assert.equal((await request('/api/me',{session:first})).status,401);
  const expiring=await profile('ExpiredUser'),raw=/hereme_session=([^;]+)/.exec(expiring.cookie)[1];S.db.prepare("update sessions set expires_at=datetime('now','-1 second') where id_hash=?").run(S.identity.sha256(decodeURIComponent(raw)));assert.equal((await request('/api/posts',{method:'POST',session:expiring,body:{title:'Skal ikke lagres',type:'text',category:'story'}})).status,401);
  assert.ok(S.db.prepare("select id from security_events where event='recovery.failed' and result='denied'").get());
});
test('legacy bearer identity is upgraded once to a recoverable secure session',async()=>{
  const crypto=require('node:crypto'),token=crypto.randomBytes(32).toString('hex'),id='legacy-upgrade-user';
  S.db.prepare('insert into users(id,token_hash,name,normalized_name) values(?,?,?,?)').run(id,crypto.createHash('sha256').update(token).digest('hex'),'LegacyUpgrade','legacyupgrade');
  const upgraded=await request('/api/me',{headers:{authorization:'Bearer '+token}});assert.equal(upgraded.status,200);assert.equal(upgraded.body.legacy_migrated,true);assert.ok(upgraded.body.recovery_key.length>=20);assert.equal(upgraded.body.user.secured,true);
  assert.equal(S.db.prepare('select count(*) n from recovery_credentials where user_id=?').get(id).n,1);assert.deepEqual(S.db.prepare('select role from user_roles where user_id=?').all(id).map(row=>row.role),['member']);
  const again=await request('/api/me',{headers:{authorization:'Bearer '+token}});assert.equal(again.status,200);assert.equal(again.body.recovery_key,null);
});
test('stable post, pagination, search, vote, comment depth and report contracts',async()=>{
  const actor=await profile('ForumActor');
  const created=await request('/api/posts',{method:'POST',session:actor,body:{title:'Unik søkbar overskrift',body:'Lokal kontrakt',type:'text',category:'question',poster_style:'question'}});assert.equal(created.status,201);const id=created.body.id;
  const detail=await request('/api/posts/'+id);assert.equal(detail.body.post.category,'question');assert.equal(detail.body.post.score,1);assert.equal(detail.body.post.room_id,null);
  assert.equal((await request('/api/posts/'+id+'/vote',{method:'POST',session:actor,body:{value:1}})).body.my_vote,0);
  assert.equal((await request('/api/posts/'+id+'/vote',{method:'POST',session:actor,body:{value:-1}})).body.my_vote,-1);
  const root=await request('/api/posts/'+id+'/comments',{method:'POST',session:actor,body:{body:'nivå 1'}});let parent=root.body.id;
  for(let depth=1;depth<=3;depth++){const child=await request('/api/posts/'+id+'/comments',{method:'POST',session:actor,body:{body:'nivå '+(depth+1),parent_id:parent}});assert.equal(child.status,201);parent=child.body.id;}
  assert.equal((await request('/api/posts/'+id+'/comments',{method:'POST',session:actor,body:{body:'for dypt',parent_id:parent}})).status,400);
  const search=await request('/api/posts?q='+encodeURIComponent('Unik søkbar')+'&limit=1');assert.equal(search.body.posts[0].id,id);
  for(let index=0;index<30;index++)await S.posts.create({title:'Sidepost '+index,type:'text',category:'story'},actor.user);
  const first=await request('/api/posts?limit=10');assert.equal(first.body.posts.length,10);assert.ok(first.body.next_cursor);
  const second=await request('/api/posts?limit=10&cursor='+encodeURIComponent(first.body.next_cursor));assert.equal(second.body.posts.length,10);assert.equal(new Set([...first.body.posts,...second.body.posts].map(post=>post.id)).size,20);
  const people=[await profile('ReporterOne'),await profile('ReporterTwo')];for(const person of [actor,...people])assert.equal((await request('/api/posts/'+id+'/report',{method:'POST',session:person,body:{reason:'Annet'}})).status,201);
  assert.equal(S.db.prepare('select status from posts where id=?').get(id).status,'review');
  const local={id:'local-operator',capabilities:['moderate']};S.moderation.act(local,id,'publish','reviewed locally');assert.equal(S.db.prepare('select status from posts where id=?').get(id).status,'published');assert.ok(S.db.prepare("select id from audit_events where action='moderation.publish' and subject_id=?").get(String(id)));
});
test('server validates image bytes, records immutable media and cleans rejected input',async()=>{
  const actor=await profile('ImageActor'),good=fs.readFileSync(path.join(__dirname,'../public/assets/demo/sources/source-01-rain_bus_stop.jpg'));
  const form=new FormData();for(const [key,value] of Object.entries({title:'Bildekontrakt',type:'image',category:'alert',poster_style:'alert'}))form.set(key,value);form.set('image',new Blob([good],{type:'image/jpeg'}),'photo.jpg');
  const created=await request('/api/posts',{method:'POST',session:actor,form});assert.equal(created.status,201);
  const post=(await request('/api/posts/'+created.body.id)).body.post;assert.match(post.image_url,/^\/media\//);assert.equal(post.media_status,'ready');assert.equal((await fetch(url+post.image_url)).status,200);
  const before=fs.readdirSync(path.join(testData,'media')).length,bad=new FormData();for(const [key,value] of Object.entries({title:'Falskt bilde',type:'image',category:'tip'}))bad.set(key,value);bad.set('image',new Blob([Buffer.from('<script>bad</script>')],{type:'image/png'}),'bad.png');
  const rejected=await request('/api/posts',{method:'POST',session:actor,form:bad});assert.equal(rejected.status,400);assert.equal(fs.readdirSync(path.join(testData,'media')).length,before);
});
test('production config rejects public bind and insecure origin',()=>{
  const {runtimeConfig}=require('../server/config');assert.throws(()=>runtimeConfig(process.cwd(),{HEREME_ENV:'production',HEREME_DATA_DIR:testData,HEREME_PUBLIC_ORIGIN:'http://example.test'}),/HTTPS/);
  assert.throws(()=>runtimeConfig(process.cwd(),{HEREME_ENV:'production',HEREME_DATA_DIR:testData,HEREME_PUBLIC_ORIGIN:'https://example.test',HOST:'0.0.0.0'}),/loopback/);
});
