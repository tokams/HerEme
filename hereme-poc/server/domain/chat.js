'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {fail}=require('./errors');const V=require('./validation');
function createChatService(db,dataDir,config,{audit,notifications:notificationService,avatars}){
  const root=path.join(dataDir,'chat');fs.mkdirSync(root,{recursive:true});
  const id=()=>crypto.randomUUID();const uploads=new Set();
  const record=(actor,action,type,subject)=>audit.record({actorId:actor?.id||null,action,subjectType:type,subjectId:subject});
  const pairKey=(a,b)=>[a,b].sort().join(':');
  function event(recipient,chatId,kind){db.prepare('INSERT INTO chat_events(recipient_id,chat_id,kind) VALUES(?,?,?)').run(recipient,chatId,kind);}
  function notify(recipient,actor,chatId,kind,key){const result=db.prepare('INSERT OR IGNORE INTO chat_notifications(recipient_id,actor_id,chat_id,kind,dedupe_key) VALUES(?,?,?,?,?)').run(recipient,actor,chatId,kind,key);if(result.changes){const messageId=kind==='message'?Number(key.split(':')[1]):null;notificationService.chat(Number(result.lastInsertRowid),{recipientId:recipient,actorId:actor,chatId,kind,messageId});event(recipient,chatId,kind==='message'?'message.created':kind==='request'||kind==='invite'?'invitation.created':'invitation.decided');}}
  function editDistance(left,right){const a=[...left],b=[...right],row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let previous=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const above=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,previous+(a[i-1]===b[j-1]?0:1));previous=above;}}return row[b.length];}
  function member(chatId,user){if(!db.prepare('SELECT 1 FROM chat_members WHERE chat_id=? AND user_id=?').get(chatId,user.id))fail('FORBIDDEN','Ingen tilgang til samtalen.',403);}
  function active(userId){return db.prepare("SELECT id,name FROM users WHERE id=? AND status='active'").get(userId);}
  function blocked(a,b){return db.prepare('SELECT 1 FROM chat_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)').get(a,b,b,a);}
  function reachable(chatId,user){member(chatId,user);const chat=db.prepare('SELECT kind FROM chats WHERE id=?').get(chatId);if(chat.kind==='direct'){const other=db.prepare('SELECT user_id FROM chat_members WHERE chat_id=? AND user_id<>?').get(chatId,user.id);if(!other||blocked(user.id,other.user_id))fail('CHAT_BLOCKED','Samtalen er blokkert.',403);}}
  function search(user,q){
    q=V.text(q,{name:'Søk',min:2,max:24}).normalize('NFKC').toLocaleLowerCase('no');
    const prefix=[...q][0];
    const first=db.prepare("SELECT id,name,normalized_name FROM users WHERE normalized_name>=? AND normalized_name<? AND status='active' AND id<>? AND NOT EXISTS(SELECT 1 FROM chat_blocks WHERE (blocker_id=users.id AND blocked_id=?) OR (blocker_id=? AND blocked_id=users.id)) ORDER BY normalized_name LIMIT 200").all(prefix,prefix+'\uffff',user.id,user.id,user.id);
    const second=db.prepare("SELECT id,name,normalized_name FROM users WHERE substr(normalized_name,2,1)=? AND status='active' AND id<>? AND NOT EXISTS(SELECT 1 FROM chat_blocks WHERE (blocker_id=users.id AND blocked_id=?) OR (blocker_id=? AND blocked_id=users.id)) ORDER BY normalized_name LIMIT 200").all([...q][1],user.id,user.id,user.id);
    const candidates=[...new Map([...first,...second].map(item=>[item.id,item])).values()];
    const tolerance=Math.min(3,Math.max(1,Math.floor([...q].length/3)));
    return candidates.map(item=>{const distance=editDistance(q,item.normalized_name);const tier=item.normalized_name===q?0:item.normalized_name.startsWith(q)?1:item.normalized_name.includes(q)?2:distance<=tolerance?3:4;return {...item,tier,distance};}).filter(item=>item.tier<4).sort((a,b)=>a.tier-b.tier||a.distance-b.distance||a.normalized_name.localeCompare(b.normalized_name,'no')||a.id.localeCompare(b.id)).slice(0,8).map(({id,name})=>({id,name,...avatars.publicView(id)}));
  }
  function direct(user,targetId){
    if(user.id===targetId||!active(targetId)||blocked(user.id,targetId))fail('RECIPIENT_UNAVAILABLE','Brukeren kan ikke kontaktes.',404);
    const chat=db.prepare('SELECT id,direct_state state FROM chats WHERE pair_key=?').get(pairKey(user.id,targetId));
    if(!chat)return {chat_id:null,state:'new'};
    if(chat.state==='declined')return {chat_id:null,state:'declined'};
    const requester=db.prepare('SELECT sender_id FROM chat_requests WHERE chat_id=? ORDER BY created_at DESC LIMIT 1').get(chat.id);
    if(chat.state==='pending'&&requester?.sender_id!==user.id)return {chat_id:null,state:'incoming'};
    if(!db.prepare('SELECT 1 FROM chat_members WHERE chat_id=? AND user_id=?').get(chat.id,user.id))return {chat_id:null,state:'new'};
    return {chat_id:chat.id,state:chat.state};
  }
  function startDirect(user,targetId,body,clientKey,attachmentIds=[]){
    body=V.optionalText(body,{name:'Melding',max:5000});clientKey=V.text(clientKey,{name:'Meldingsnøkkel',min:8,max:100});attachmentIds=attachmentList(attachmentIds);
    if(!body&&!attachmentIds.length)fail('EMPTY_MESSAGE','Skriv en melding eller legg ved en fil.');
    if(user.id===targetId||!active(targetId)||blocked(user.id,targetId))fail('RECIPIENT_UNAVAILABLE','Brukeren kan ikke kontaktes.',404);
    db.exec('BEGIN IMMEDIATE');try{
      let chat=db.prepare('SELECT id,direct_state state FROM chats WHERE pair_key=?').get(pairKey(user.id,targetId));
      if(!chat){
        const chatId=id(),legacy=db.prepare("SELECT id,opening FROM chat_requests WHERE sender_id=? AND recipient_id=? AND state='pending' AND chat_id IS NULL ORDER BY created_at LIMIT 1").get(user.id,targetId),requestId=legacy?.id||id();
        db.prepare("INSERT INTO chats(id,kind,pair_key,creator_id,direct_state,updated_at) VALUES(?,'direct',?,?,'pending',?)").run(chatId,pairKey(user.id,targetId),user.id,new Date().toISOString());
        db.prepare('INSERT INTO chat_members(chat_id,user_id) VALUES(?,?)').run(chatId,user.id);
        if(legacy){db.prepare('UPDATE chat_requests SET chat_id=? WHERE id=?').run(chatId,requestId);if(legacy.opening)db.prepare('INSERT INTO chat_messages(chat_id,sender_id,body) VALUES(?,?,?)').run(chatId,user.id,legacy.opening);}
        else db.prepare("INSERT INTO chat_requests(id,sender_id,recipient_id,state,chat_id) VALUES(?,?,?,'pending',?)").run(requestId,user.id,targetId,chatId);
        notify(targetId,user.id,chatId,'request','request:'+requestId);
        record(user,'chat.request.sent','chat_request',requestId);
        chat={id:chatId,state:'pending'};
      }else if(chat.state==='declined')fail('REQUEST_DECLINED','Forespørselen ble avslått.',409);
      else if(chat.state==='pending'&&!db.prepare('SELECT 1 FROM chat_members WHERE chat_id=? AND user_id=?').get(chat.id,user.id)){
        const request=db.prepare("SELECT id,sender_id FROM chat_requests WHERE chat_id=? AND state='pending'").get(chat.id);
        if(!request||request.sender_id===user.id)fail('FORBIDDEN','Ingen tilgang til samtalen.',403);
        db.prepare("UPDATE chat_requests SET state='accepted' WHERE id=?").run(request.id);
        db.prepare('INSERT INTO chat_members(chat_id,user_id) VALUES(?,?)').run(chat.id,user.id);
        db.prepare("UPDATE chats SET direct_state='accepted',updated_at=? WHERE id=?").run(new Date().toISOString(),chat.id);
        notify(request.sender_id,user.id,chat.id,'accepted','accepted:'+request.id);
        chat.state='accepted';
      }
      if(!db.prepare('SELECT 1 FROM chat_members WHERE chat_id=? AND user_id=?').get(chat.id,user.id))fail('FORBIDDEN','Ingen tilgang til samtalen.',403);
      const existing=db.prepare('SELECT id FROM chat_messages WHERE chat_id=? AND sender_id=? AND client_key=?').get(chat.id,user.id,clientKey);
      let messageId=existing?.id;
      if(!existing){if(chat.state==='pending'&&db.prepare("SELECT count(*) n FROM chat_messages WHERE chat_id=? AND kind!='system'").get(chat.id).n>=5)fail('PENDING_LIMIT','Vent på at forespørselen blir besvart.',429);const inserted=db.prepare('INSERT INTO chat_messages(chat_id,sender_id,body,client_key) VALUES(?,?,?,?)').run(chat.id,user.id,body,clientKey);messageId=Number(inserted.lastInsertRowid);claimAttachments(user,chat.id,targetId,messageId,attachmentIds);db.prepare('UPDATE chats SET updated_at=? WHERE id=?').run(new Date().toISOString(),chat.id);if(chat.state==='accepted')for(const member of db.prepare('SELECT user_id FROM chat_members WHERE chat_id=? AND user_id<>?').all(chat.id,user.id))notify(member.user_id,user.id,chat.id,'message','message:'+messageId+':'+member.user_id);event(user.id,chat.id,'message.created');}
      db.exec('COMMIT');return {chat_id:chat.id,state:chat.state,message_id:messageId};
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  function inbox(user){return {requests:db.prepare("SELECT r.id,r.opening,r.created_at,u.name sender FROM chat_requests r JOIN users u ON u.id=r.sender_id WHERE r.recipient_id=? AND r.state='pending' ORDER BY r.created_at DESC").all(user.id),invites:db.prepare("SELECT i.id,c.name,u.name inviter FROM chat_invites i JOIN chats c ON c.id=i.chat_id JOIN users u ON u.id=i.inviter_id WHERE i.recipient_id=? AND i.state='pending'").all(user.id)};}
  function decide(user,requestId,accept){const row=db.prepare("SELECT * FROM chat_requests WHERE id=? AND recipient_id=? AND state='pending'").get(requestId,user.id);if(!row)fail('REQUEST_NOT_FOUND','Forespørselen finnes ikke.',404);if(blocked(row.sender_id,user.id))fail('RECIPIENT_UNAVAILABLE','Brukeren kan ikke kontaktes.',404);
    db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE chat_requests SET state=? WHERE id=?').run(accept?'accepted':'declined',requestId);db.prepare("UPDATE chat_notifications SET read_at=datetime('now') WHERE recipient_id=? AND dedupe_key=? AND read_at IS NULL").run(user.id,'request:'+requestId);let chatId=row.chat_id||null;if(row.chat_id){if(accept)db.prepare('INSERT OR IGNORE INTO chat_members(chat_id,user_id) VALUES(?,?)').run(chatId,user.id);db.prepare('UPDATE chats SET direct_state=?,updated_at=? WHERE id=?').run(accept?'accepted':'declined',new Date().toISOString(),chatId);}
      else if(accept){const key=pairKey(row.sender_id,user.id);const existing=db.prepare('SELECT id FROM chats WHERE pair_key=?').get(key);chatId=existing?.id||id();if(!existing)db.prepare("INSERT INTO chats(id,kind,pair_key,updated_at) VALUES(?,'direct',?,datetime('now'))").run(chatId,key);for(const userId of [row.sender_id,user.id])db.prepare('INSERT OR IGNORE INTO chat_members(chat_id,user_id) VALUES(?,?)').run(chatId,userId);if(row.opening)db.prepare('INSERT INTO chat_messages(chat_id,sender_id,body) VALUES(?,?,?)').run(chatId,row.sender_id,row.opening);}
      if(chatId){notify(row.sender_id,user.id,chatId,accept?'accepted':'declined',(accept?'accepted:':'declined:')+requestId);event(user.id,chatId,'invitation.decided');}record(user,accept?'chat.request.accepted':'chat.request.declined','chat_request',requestId);db.exec('COMMIT');return {chat_id:chatId};}catch(error){db.exec('ROLLBACK');throw error;}}
  function block(user,targetId){if(!active(targetId)||targetId===user.id)fail('USER_NOT_FOUND','Brukeren finnes ikke.',404);db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT OR IGNORE INTO chat_blocks(blocker_id,blocked_id) VALUES(?,?)').run(user.id,targetId);for(const row of db.prepare("SELECT id,chat_id FROM chat_requests WHERE recipient_id=? AND sender_id=? AND state='pending'").all(user.id,targetId)){db.prepare("UPDATE chat_requests SET state='declined' WHERE id=?").run(row.id);db.prepare("UPDATE chat_notifications SET read_at=datetime('now') WHERE recipient_id=? AND dedupe_key=?").run(user.id,'request:'+row.id);if(row.chat_id)db.prepare("UPDATE chats SET direct_state='declined' WHERE id=?").run(row.chat_id);}record(user,'chat.user.blocked','user',targetId);db.exec('COMMIT');return {ok:true};}catch(error){db.exec('ROLLBACK');throw error;}}
  function group(user,name,recipients,opening=''){name=V.optionalText(name,{name:'Gruppenavn',max:80});opening=V.optionalText(opening,{name:'Melding',max:2000});if(!Array.isArray(recipients)||!recipients.length||recipients.length>50)fail('INVALID_GROUP','Velg 1–50 deltakere.');const unique=[...new Set(recipients)];for(const recipient of unique)if(recipient===user.id||!active(recipient)||blocked(user.id,recipient))fail('RECIPIENT_UNAVAILABLE','En deltaker kan ikke inviteres.',404);if(!name)name='Gruppe med '+unique.map(recipient=>active(recipient).name).join(', ').slice(0,68);const chatId=id();db.exec('BEGIN IMMEDIATE');try{db.prepare("INSERT INTO chats(id,kind,creator_id,name,updated_at) VALUES(?,'group',?,?,?)").run(chatId,user.id,name,new Date().toISOString());db.prepare('INSERT INTO chat_members(chat_id,user_id) VALUES(?,?)').run(chatId,user.id);if(opening)db.prepare('INSERT INTO chat_messages(chat_id,sender_id,body) VALUES(?,?,?)').run(chatId,user.id,opening);for(const recipient of unique){const inviteId=id();db.prepare("INSERT INTO chat_invites(id,chat_id,inviter_id,recipient_id,state) VALUES(?,?,?,?,'pending')").run(inviteId,chatId,user.id,recipient);notify(recipient,user.id,chatId,'invite','invite:'+inviteId);}event(user.id,chatId,'conversation.updated');record(user,'chat.group.created','chat',chatId);db.exec('COMMIT');return {id:chatId};}catch(error){db.exec('ROLLBACK');throw error;}}
  function invite(user,chatId,recipient){member(chatId,user);if(!db.prepare("SELECT 1 FROM chats WHERE id=? AND kind='group'").get(chatId))fail('INVALID_GROUP','Ikke en gruppe.',400);if(!active(recipient)||blocked(user.id,recipient)||db.prepare('SELECT 1 FROM chat_members WHERE chat_id=? AND user_id=?').get(chatId,recipient)||db.prepare("SELECT 1 FROM chat_invites WHERE chat_id=? AND recipient_id=? AND state='pending'").get(chatId,recipient))fail('RECIPIENT_UNAVAILABLE','Kan ikke invitere brukeren.',404);const inviteId=id();db.exec('BEGIN IMMEDIATE');try{db.prepare("INSERT INTO chat_invites(id,chat_id,inviter_id,recipient_id,state) VALUES(?,?,?,?,'pending')").run(inviteId,chatId,user.id,recipient);notify(recipient,user.id,chatId,'invite','invite:'+inviteId);record(user,'chat.invite.sent','chat_invite',inviteId);db.exec('COMMIT');return {id:inviteId};}catch(error){db.exec('ROLLBACK');throw error;}}
  function pendingInvites(user,chatId){const chat=db.prepare("SELECT creator_id FROM chats WHERE id=? AND kind='group'").get(chatId);if(!chat||chat.creator_id!==user.id)fail('FORBIDDEN','Bare gruppeoppretteren kan se invitasjoner.',403);return db.prepare("SELECT i.id,u.name recipient FROM chat_invites i JOIN users u ON u.id=i.recipient_id WHERE i.chat_id=? AND i.state='pending'").all(chatId);}
  function cancelInvite(user,chatId,inviteId){const chat=db.prepare("SELECT creator_id FROM chats WHERE id=? AND kind='group'").get(chatId);if(!chat||chat.creator_id!==user.id)fail('FORBIDDEN','Bare gruppeoppretteren kan avlyse invitasjoner.',403);db.exec('BEGIN IMMEDIATE');try{const result=db.prepare("UPDATE chat_invites SET state='cancelled' WHERE id=? AND chat_id=? AND state='pending'").run(inviteId,chatId);if(!result.changes)fail('INVITE_NOT_FOUND','Invitasjonen finnes ikke.',404);db.prepare("UPDATE chat_notifications SET read_at=datetime('now') WHERE dedupe_key=? AND read_at IS NULL").run('invite:'+inviteId);event(db.prepare('SELECT recipient_id FROM chat_invites WHERE id=?').get(inviteId).recipient_id,chatId,'invitation.decided');record(user,'chat.invite.cancelled','chat_invite',inviteId);db.exec('COMMIT');return {ok:true};}catch(error){db.exec('ROLLBACK');throw error;}}
  function decideInvite(user,inviteId,accept){const row=db.prepare("SELECT * FROM chat_invites WHERE id=? AND recipient_id=? AND state='pending'").get(inviteId,user.id);if(!row)fail('INVITE_NOT_FOUND','Invitasjonen finnes ikke.',404);if(accept&&blocked(user.id,row.inviter_id))fail('RECIPIENT_UNAVAILABLE','Invitasjonen kan ikke godtas.',404);db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE chat_invites SET state=? WHERE id=?').run(accept?'accepted':'declined',inviteId);db.prepare("UPDATE chat_notifications SET read_at=datetime('now') WHERE recipient_id=? AND dedupe_key=? AND read_at IS NULL").run(user.id,'invite:'+inviteId);if(accept){db.prepare('INSERT OR IGNORE INTO chat_members(chat_id,user_id) VALUES(?,?)').run(row.chat_id,user.id);db.prepare("INSERT INTO chat_messages(chat_id,sender_id,kind,body) VALUES(?,?,'system','joined')").run(row.chat_id,user.id);}notify(row.inviter_id,user.id,row.chat_id,accept?'accepted':'declined',(accept?'accepted:':'declined:')+inviteId);event(user.id,row.chat_id,'invitation.decided');record(user,accept?'chat.invite.accepted':'chat.invite.declined','chat_invite',inviteId);db.exec('COMMIT');return {chat_id:accept?row.chat_id:null};}catch(error){db.exec('ROLLBACK');throw error;}}
  function leave(user,chatId){
    member(chatId,user);db.exec('BEGIN IMMEDIATE');try{
      for(const invite of db.prepare("SELECT id FROM chat_invites WHERE chat_id=? AND inviter_id=? AND state='pending'").all(chatId,user.id))db.prepare("UPDATE chat_notifications SET read_at=datetime('now') WHERE dedupe_key=? AND read_at IS NULL").run('invite:'+invite.id);
      db.prepare("UPDATE chat_invites SET state='cancelled' WHERE chat_id=? AND inviter_id=? AND state='pending'").run(chatId,user.id);
      db.prepare('DELETE FROM chat_members WHERE chat_id=? AND user_id=?').run(chatId,user.id);
      db.prepare("INSERT INTO chat_messages(chat_id,sender_id,kind,body) VALUES(?,?,'system','left')").run(chatId,user.id);
      event(user.id,chatId,'conversation.updated');record(user,'chat.member.left','chat',chatId);db.exec('COMMIT');return {ok:true};
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  function list(user){
    const joined=db.prepare("SELECT c.id,c.kind,c.creator_id,c.direct_state state,CASE WHEN c.kind='direct' THEN COALESCE((SELECT u.name FROM users u WHERE u.id=CASE WHEN c.creator_id=? THEN (SELECT recipient_id FROM chat_requests WHERE chat_id=c.id LIMIT 1) ELSE c.creator_id END),(SELECT u.name FROM chat_members peer JOIN users u ON u.id=peer.user_id WHERE peer.chat_id=c.id AND peer.user_id<>?),'slettet bruker') ELSE c.name END name,c.created_at,c.updated_at,(SELECT m.body FROM chat_messages m WHERE m.chat_id=c.id ORDER BY m.id DESC LIMIT 1) last_body,(SELECT m.kind FROM chat_messages m WHERE m.chat_id=c.id ORDER BY m.id DESC LIMIT 1) last_kind,(SELECT count(*) FROM chat_files f WHERE f.message_id=(SELECT id FROM chat_messages WHERE chat_id=c.id ORDER BY id DESC LIMIT 1)) last_attachment,(SELECT count(*) FROM chat_notifications n WHERE n.chat_id=c.id AND n.recipient_id=? AND n.read_at IS NULL) unread FROM chats c JOIN chat_members cm ON cm.chat_id=c.id WHERE cm.user_id=?").all(user.id,user.id,user.id,user.id);
    const incoming=db.prepare("SELECT c.id,'direct' kind,c.creator_id,'incoming' state,u.name name,c.created_at,c.updated_at,NULL last_body,NULL last_kind,(SELECT count(*) FROM chat_notifications n WHERE n.chat_id=c.id AND n.recipient_id=? AND n.read_at IS NULL) unread,r.id request_id FROM chat_requests r JOIN chats c ON c.id=r.chat_id JOIN users u ON u.id=r.sender_id WHERE r.recipient_id=? AND r.state='pending' AND NOT EXISTS(SELECT 1 FROM chat_members m WHERE m.chat_id=c.id AND m.user_id=?)").all(user.id,user.id,user.id);
    const invited=db.prepare("SELECT c.id,'group' kind,c.creator_id,'invited' state,c.name,c.created_at,i.created_at updated_at,NULL last_body,NULL last_kind,(SELECT count(*) FROM chat_notifications n WHERE n.chat_id=c.id AND n.recipient_id=? AND n.read_at IS NULL) unread,i.id invite_id FROM chat_invites i JOIN chats c ON c.id=i.chat_id WHERE i.recipient_id=? AND i.state='pending'").all(user.id,user.id);
    const legacy=db.prepare("SELECT 'legacy:'||r.id id,'direct' kind,NULL creator_id,'incoming' state,u.name,r.created_at,r.created_at updated_at,NULL last_body,NULL last_kind,1 unread,r.id request_id FROM chat_requests r JOIN users u ON u.id=r.sender_id WHERE r.recipient_id=? AND r.state='pending' AND r.chat_id IS NULL").all(user.id);
    const participants=db.prepare(`SELECT u.id,u.name FROM chat_members cm JOIN users u ON u.id=cm.user_id
      WHERE cm.chat_id=? AND u.status='active' AND (u.id<>? OR ?='group')
      ORDER BY (SELECT max(m.id) FROM chat_messages m WHERE m.chat_id=cm.chat_id AND m.sender_id=u.id) DESC,cm.joined_at DESC,u.id LIMIT 3`);
    const requestPeer=db.prepare('SELECT sender_id,recipient_id FROM chat_requests WHERE id=? OR chat_id=? ORDER BY created_at DESC LIMIT 1');
    return [...joined,...incoming,...invited,...legacy].map(row=>{
      const visible=row.state==='invited'?[]:row.state==='incoming'||row.id.startsWith('legacy:')?[]:participants.all(row.id,user.id,row.kind);
      if(!visible.length&&row.kind==='direct'){
        const request=requestPeer.get(row.request_id||'',row.id),peerId=request&&(request.sender_id===user.id?request.recipient_id:request.sender_id);
        visible.push({id:peerId||undefined,name:row.name});
      }
      return {...row,participants:visible.map(person=>({...person,...(person.id?avatars.publicView(person.id):{avatar_url:null})}))};
    }).sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at))||b.id.localeCompare(a.id));
  }
  function notifications(user,before){const cursor=before?V.integer(before,{name:'Sidepeker',min:1}):Number.MAX_SAFE_INTEGER;return db.prepare('SELECT id,actor_id,chat_id,kind,created_at,read_at FROM chat_notifications WHERE recipient_id=? AND id<? ORDER BY id DESC LIMIT 50').all(user.id,cursor);}
  function markRead(user,chatId){const changed=db.prepare("UPDATE chat_notifications SET read_at=datetime('now') WHERE recipient_id=? AND chat_id=? AND read_at IS NULL").run(user.id,chatId);if(changed.changes)event(user.id,chatId,'conversation.updated');return {ok:true};}
  function messages(user,chatId,before){member(chatId,user);const cursor=before?V.integer(before,{name:'Sidepeker'}):Number.MAX_SAFE_INTEGER;const rows=db.prepare(`SELECT m.id,m.kind,m.sender_id,CASE WHEN m.kind='system' THEN COALESCE(u.name,'slettet bruker') || CASE m.body WHEN 'joined' THEN ' ble med i gruppen.' ELSE ' forlot samtalen.' END ELSE m.body END body,m.created_at,CASE WHEN m.kind='system' THEN 'System' ELSE COALESCE(u.name,'slettet bruker') END sender FROM chat_messages m LEFT JOIN users u ON u.id=m.sender_id WHERE m.chat_id=? AND m.id<? ORDER BY m.id DESC LIMIT 50`).all(chatId,cursor).reverse();const attachments=db.prepare('SELECT id,name,bytes,status,expires_at,media_kind,mime_type FROM chat_files WHERE message_id=? ORDER BY display_order,id');return rows.map(row=>{const files=attachments.all(row.id);return {...row,attachments:files,file_id:files[0]?.id||null,file_name:files[0]?.name||null,file_bytes:files[0]?.bytes||null,file_status:files[0]?.status||null,expires_at:files[0]?.expires_at||null};});}
  function attachmentList(ids){if(!Array.isArray(ids)||ids.length>12||new Set(ids).size!==ids.length||ids.some(value=>typeof value!=='string'||!/^[0-9a-f-]{36}$/.test(value)))fail('INVALID_ATTACHMENTS','Ugyldige vedlegg.');return ids;}
  function claimAttachments(user,chatId,targetId,messageId,ids){
    const expiry=new Date(Date.now()+7*86400000).toISOString();
    ids.forEach((fileId,index)=>{const staged=db.prepare("SELECT * FROM chat_staged_files WHERE id=? AND sender_id=? AND status='staged'").get(fileId,user.id);if(!staged||staged.chat_id!==null&&staged.chat_id!==chatId||staged.target_user_id!==null&&staged.target_user_id!==targetId)fail('STAGED_FILE_NOT_FOUND','Vedlegget er ikke klart for denne samtalen.',409);
      db.prepare("INSERT INTO chat_files(id,chat_id,sender_id,message_id,name,bytes,received,status,stored_path,expires_at,media_kind,mime_type,display_order) VALUES(?,?,?,?,?,?,?,'ready',?,?,?,?,?)").run(fileId,chatId,user.id,messageId,staged.name,staged.bytes,staged.bytes,fileId,expiry,staged.media_kind,staged.mime_type,index);
      db.prepare('DELETE FROM chat_staged_files WHERE id=?').run(fileId);
    });
  }
  function send(user,chatId,body,clientKey,attachmentIds=[]){
    member(chatId,user);body=V.optionalText(body,{name:'Melding',max:5000});attachmentIds=attachmentList(attachmentIds);if(!body&&!attachmentIds.length)fail('EMPTY_MESSAGE','Skriv en melding eller legg ved en fil.');
    if(clientKey!=null)clientKey=V.text(clientKey,{name:'Meldingsnøkkel',min:8,max:100});
    const chat=db.prepare('SELECT kind,direct_state state,pair_key FROM chats WHERE id=?').get(chatId);
    if(chat.kind==='direct'){
      const other=chat.pair_key.split(':').find(id=>id!==user.id);
      if(blocked(user.id,other)||chat.state==='declined')fail('CHAT_BLOCKED','Samtalen er avsluttet.',403);
      const existing=clientKey?db.prepare('SELECT id FROM chat_messages WHERE chat_id=? AND sender_id=? AND client_key=?').get(chatId,user.id,clientKey):null;
      if(existing)return {id:existing.id};
      if(chat.state==='pending'&&db.prepare("SELECT count(*) n FROM chat_messages WHERE chat_id=? AND kind!='system'").get(chatId).n>=5)fail('PENDING_LIMIT','Vent på at forespørselen blir besvart.',429);
    }
    db.exec('BEGIN IMMEDIATE');try{
      const existing=clientKey?db.prepare('SELECT id FROM chat_messages WHERE chat_id=? AND sender_id=? AND client_key=?').get(chatId,user.id,clientKey):null;
      if(existing){db.exec('COMMIT');return {id:existing.id};}
      const row=db.prepare('INSERT INTO chat_messages(chat_id,sender_id,body,client_key) VALUES(?,?,?,?)').run(chatId,user.id,body,clientKey||null),messageId=Number(row.lastInsertRowid);
      claimAttachments(user,chatId,null,messageId,attachmentIds);
      db.prepare('UPDATE chats SET updated_at=? WHERE id=?').run(new Date().toISOString(),chatId);
      if(chat.state==='accepted'||chat.kind==='group')for(const recipient of db.prepare('SELECT user_id FROM chat_members WHERE chat_id=? AND user_id<>?').all(chatId,user.id))notify(recipient.user_id,user.id,chatId,'message','message:'+messageId+':'+recipient.user_id);
      event(user.id,chatId,'message.created');db.exec('COMMIT');return {id:messageId};
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  function presence(user,visible){if(typeof visible!=='boolean')fail('INVALID_INPUT','Ugyldig synlighet.');db.prepare("INSERT INTO chat_presence(user_id,visible,seen_at) VALUES(?,?,datetime('now')) ON CONFLICT(user_id) DO UPDATE SET visible=excluded.visible,seen_at=excluded.seen_at").run(user.id,Number(visible));return {visible};}
  function peers(user,chatId){member(chatId,user);return db.prepare("SELECT u.id,u.name,CASE WHEN p.visible=1 AND p.seen_at>datetime('now','-90 seconds') AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE (b.blocker_id=u.id AND b.blocked_id=?) OR (b.blocker_id=? AND b.blocked_id=u.id)) THEN 1 ELSE 0 END online FROM chat_members m JOIN users u ON u.id=m.user_id LEFT JOIN chat_presence p ON p.user_id=u.id WHERE m.chat_id=?").all(user.id,user.id,chatId).map(person=>({...person,...avatars.publicView(person.id)}));}
  function stage(user,input){
    const name=V.text(input.name,{name:'Filnavn',min:1,max:255}).replace(/[\\/]/g,'_');
    const bytes=V.integer(input.bytes,{name:'Filstørrelse',min:1,max:config.maxVideoBytes});
    const kind=V.enumValue(input.media_kind,['image','video','file'],'Filtype');
    const chatId=input.chat_id||null,targetId=input.target_user_id||null;
    if(Boolean(chatId)===Boolean(targetId))fail('INVALID_TARGET','Velg én samtale eller mottaker.');
    if(chatId)reachable(chatId,user);
    if(targetId&&(targetId===user.id||!active(targetId)||blocked(user.id,targetId)))fail('RECIPIENT_UNAVAILABLE','Brukeren kan ikke kontaktes.',404);
    if(db.prepare("SELECT count(*) n FROM chat_staged_files WHERE sender_id=? AND status IN ('uploading','staged')").get(user.id).n>=12)fail('UPLOAD_LIMIT','For mange klargjorte vedlegg.',429);
    const disk=fs.statfsSync(dataDir);if(disk.bavail*disk.bsize-bytes<config.minFreeBytes)fail('STORAGE_FULL','Ikke nok lagringsplass.',507);
    const fileId=id();fs.writeFileSync(path.join(root,fileId),'',{flag:'wx'});
    try{db.prepare("INSERT INTO chat_staged_files(id,sender_id,chat_id,target_user_id,name,bytes,status,media_kind,mime_type) VALUES(?,?,?,?,?,?,'uploading',?,'application/octet-stream')").run(fileId,user.id,chatId,targetId,name,bytes,kind);}catch(error){fs.rmSync(path.join(root,fileId));throw error;}
    return {id:fileId,received:0};
  }
  function stagedFile(user,fileId){const row=db.prepare('SELECT * FROM chat_staged_files WHERE id=? AND sender_id=?').get(fileId,user.id);if(!row)fail('STAGED_FILE_NOT_FOUND','Vedlegget finnes ikke.',404);return row;}
  function inspectStaged(row){
    const filename=path.join(root,row.id),header=Buffer.alloc(16),fd=fs.openSync(filename,'r');try{fs.readSync(fd,header,0,16,0);}finally{fs.closeSync(fd);}
    if(row.media_kind==='image'){
      if(header.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))return 'image/png';
      if(header.subarray(0,3).equals(Buffer.from('ffd8ff','hex')))return 'image/jpeg';
      if(header.toString('ascii',0,4)==='RIFF'&&header.toString('ascii',8,12)==='WEBP')return 'image/webp';
      fail('INVALID_MEDIA','Bildet har et ugyldig format.',400);
    }
    if(row.media_kind==='video'){
      const probe=spawnSync(config.ffprobe,['-v','error','-show_entries','format=duration,format_name','-of','json',filename],{encoding:'utf8',timeout:30000,maxBuffer:65536});
      if(probe.error)throw probe.error;
      if(probe.status!==0)fail('INVALID_MEDIA','Videoen kan ikke leses.',400);
      const info=JSON.parse(probe.stdout).format,duration=Number(info?.duration),format=String(info?.format_name||'');
      if(!Number.isFinite(duration)||duration<=0||duration>180)fail('VIDEO_DURATION','Videoen må være høyst 3 minutter.',400);
      if(format.includes('mp4')||format.includes('mov'))return 'video/mp4';
      if(format.includes('webm')||format.includes('matroska'))return 'video/webm';
      fail('INVALID_MEDIA','Videoformatet støttes ikke.',400);
    }
    return 'application/octet-stream';
  }
  async function stageChunk(user,fileId,offset,req){
    if(uploads.has(fileId))fail('UPLOAD_BUSY','En filblokk behandles allerede.',409);
    if(uploads.size>=8)fail('UPLOAD_LIMIT','Serveren behandler for mange filblokker.',429);
    uploads.add(fileId);
    try{
      const row=stagedFile(user,fileId);if(row.status!=='uploading')fail('UPLOAD_CLOSED','Opplastingen er avsluttet.',409);
      offset=V.integer(offset,{name:'Posisjon',min:0});if(offset!==row.received)fail('UPLOAD_OFFSET','Feil opplastingsposisjon.',409);
      const length=Number(req.headers['content-length']);if(!Number.isSafeInteger(length)||length<1||length>4*1024*1024||offset+length>row.bytes)fail('INVALID_CHUNK','Ugyldig filblokk.',400);
      const disk=fs.statfsSync(dataDir);if(disk.bavail*disk.bsize-length<config.minFreeBytes)fail('STORAGE_FULL','Ikke nok lagringsplass til filblokken.',507);
      const handle=await fs.promises.open(path.join(root,fileId),'r+');let written=0;
      try{for await(const data of req){let sent=0;while(sent<data.length){const result=await handle.write(data,sent,data.length-sent,offset+written);if(!result.bytesWritten)throw Error('File write made no progress.');sent+=result.bytesWritten;written+=result.bytesWritten;}}if(written!==length)fail('INVALID_CHUNK','Ufullstendig filblokk.',400);await handle.sync();}finally{await handle.close();}
      const received=offset+written;
      if(received===row.bytes){const mime=inspectStaged(row);db.prepare("UPDATE chat_staged_files SET received=?,status='staged',mime_type=? WHERE id=? AND received=?").run(received,mime,fileId,offset);}
      else db.prepare('UPDATE chat_staged_files SET received=? WHERE id=? AND received=?').run(received,fileId,offset);
      return {received,bytes:row.bytes,status:received===row.bytes?'staged':'uploading'};
    }finally{uploads.delete(fileId);}
  }
  function discardStage(user,fileId){stagedFile(user,fileId);db.prepare('DELETE FROM chat_staged_files WHERE id=?').run(fileId);fs.rmSync(path.join(root,fileId),{force:true});return {ok:true};}
  function file(user,fileId){const row=db.prepare('SELECT * FROM chat_files WHERE id=?').get(fileId);if(!row)fail('FILE_NOT_FOUND','Filen finnes ikke.',404);member(row.chat_id,user);return row;}
  function download(user,fileId,res){const row=file(user,fileId);reachable(row.chat_id,user);if(row.status!=='ready'||row.expires_at<=new Date().toISOString())fail('FILE_EXPIRED','Filen er utløpt.',410);res.set('Content-Type','application/octet-stream');res.set('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`);res.set('Content-Length',String(row.bytes));fs.createReadStream(path.join(root,row.stored_path)).pipe(res);}
  function preview(user,fileId,req,res){const row=file(user,fileId);reachable(row.chat_id,user);if(row.status!=='ready'||row.expires_at<=new Date().toISOString())fail('FILE_EXPIRED','Filen er utløpt.',410);if(!['image','video'].includes(row.media_kind))fail('PREVIEW_UNAVAILABLE','Forhåndsvisning er ikke tilgjengelig.',404);
    res.set('Content-Type',row.mime_type);res.set('Content-Disposition','inline');res.set('Cache-Control','private, no-store');res.set('Accept-Ranges','bytes');
    const match=/^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range||''));let start=0,end=row.bytes-1;if(req.headers.range){if(!match)fail('INVALID_RANGE','Ugyldig filområde.',416);start=Number(match[1]);end=match[2]?Number(match[2]):end;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||end>=row.bytes)fail('INVALID_RANGE','Ugyldig filområde.',416);res.status(206).set('Content-Range',`bytes ${start}-${end}/${row.bytes}`);}res.set('Content-Length',String(end-start+1));fs.createReadStream(path.join(root,row.stored_path),{start,end}).pipe(res);
  }
  function cleanup(){
    const now=new Date().toISOString();
    db.prepare("DELETE FROM chat_events WHERE created_at<datetime('now','-30 days')").run();
    db.prepare("DELETE FROM notification_events WHERE created_at<datetime('now','-30 days')").run();
    for(const row of db.prepare('SELECT id,created_at FROM chat_staged_files').all())if(Date.parse(row.created_at.replace(' ','T')+'Z')<Date.now()-86400000&&!uploads.has(row.id)){db.prepare('DELETE FROM chat_staged_files WHERE id=?').run(row.id);fs.rmSync(path.join(root,row.id),{force:true});}
    for(const row of db.prepare("SELECT id,stored_path,status,expires_at,created_at FROM chat_files WHERE status IN ('ready','uploading')").all()){
      if(uploads.has(row.id))continue;
      const expired=row.status==='ready'&&row.expires_at<=now;
      const abandoned=row.status==='uploading'&&Date.parse(row.created_at.replace(' ','T')+'Z')<Date.now()-86400000;
      const missing=!fs.existsSync(path.join(root,row.stored_path));
      if(expired||abandoned||missing){
        fs.rmSync(path.join(root,row.stored_path),{force:true});
        db.exec('BEGIN IMMEDIATE');try{
          db.prepare("UPDATE chat_files SET status='expired' WHERE id=?").run(row.id);
          record(null,'chat.file.expired','chat_file',row.id);
          db.exec('COMMIT');
        }catch(error){db.exec('ROLLBACK');throw error;}
      }
    }
    const known=new Set([...db.prepare("SELECT stored_path FROM chat_files WHERE status IN ('ready','uploading')").all().map(row=>row.stored_path),...db.prepare('SELECT id FROM chat_staged_files').all().map(row=>row.id)]);
    for(const entry of fs.readdirSync(root))if(!known.has(entry)&&!uploads.has(entry))fs.rmSync(path.join(root,entry),{force:true});
    const overdue=db.prepare("SELECT count(*) n FROM chat_files WHERE status='ready' AND expires_at<=?").get(now).n;
    db.prepare("INSERT INTO chat_worker_state(id,last_run,overdue) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET last_run=excluded.last_run,overdue=excluded.overdue").run(now,overdue);
    return overdue;
  }
  return {search,direct,startDirect,inbox,decide,block,group,invite,pendingInvites,cancelInvite,decideInvite,leave,list,notifications,markRead,messages,send,presence,peers,stage,stagedFile,stageChunk,discardStage,file,download,preview,cleanup};
}
module.exports={createChatService};
