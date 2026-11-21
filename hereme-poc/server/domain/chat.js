'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {fail}=require('./errors');const V=require('./validation');
function createChatService(db,dataDir,config,{audit}){
  const root=path.join(dataDir,'chat');fs.mkdirSync(root,{recursive:true});
  const id=()=>crypto.randomUUID();const uploads=new Set();
  const record=(actor,action,type,subject)=>audit.record({actorId:actor?.id||null,action,subjectType:type,subjectId:subject});
  function member(chatId,user){if(!db.prepare('SELECT 1 FROM chat_members WHERE chat_id=? AND user_id=?').get(chatId,user.id))fail('FORBIDDEN','Ingen tilgang til samtalen.',403);}
  function active(userId){return db.prepare("SELECT id,name FROM users WHERE id=? AND status='active'").get(userId);}
  function blocked(a,b){return db.prepare('SELECT 1 FROM chat_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)').get(a,b,b,a);}
  function reachable(chatId,user){member(chatId,user);const chat=db.prepare('SELECT kind FROM chats WHERE id=?').get(chatId);if(chat.kind==='direct'){const other=db.prepare('SELECT user_id FROM chat_members WHERE chat_id=? AND user_id<>?').get(chatId,user.id);if(!other||blocked(user.id,other.user_id))fail('CHAT_BLOCKED','Samtalen er blokkert.',403);}}
  function search(user,q){q=V.text(q,{name:'Søk',min:2,max:24}).toLocaleLowerCase('no');return db.prepare("SELECT id,name FROM users WHERE instr(normalized_name,?)>0 AND status='active' AND id<>? AND NOT EXISTS(SELECT 1 FROM chat_blocks WHERE blocker_id=users.id AND blocked_id=?) ORDER BY name LIMIT 20").all(q,user.id,user.id);}
  function request(user,recipientId,opening=''){if(user.id===recipientId||!active(recipientId)||blocked(user.id,recipientId))fail('RECIPIENT_UNAVAILABLE','Brukeren kan ikke kontaktes.',404);
    opening=V.optionalText(opening,{name:'Melding',max:2000});
    const previous=db.prepare("SELECT id FROM chat_requests WHERE sender_id=? AND recipient_id=? AND state='pending'").get(user.id,recipientId);if(previous)fail('REQUEST_PENDING','Forespørselen venter allerede.',409);
    if(db.prepare('SELECT 1 FROM chats c JOIN chat_members a ON a.chat_id=c.id AND a.user_id=? JOIN chat_members b ON b.chat_id=c.id AND b.user_id=? WHERE c.kind=\'direct\'').get(user.id,recipientId))fail('CHAT_EXISTS','Samtalen finnes allerede.',409);
    const requestId=id();db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT INTO chat_requests(id,sender_id,recipient_id,opening,state) VALUES(?,?,?,?,\'pending\')').run(requestId,user.id,recipientId,opening);record(user,'chat.request.sent','chat_request',requestId);db.exec('COMMIT');return {id:requestId};}catch(error){db.exec('ROLLBACK');throw error;}}
  function inbox(user){return {requests:db.prepare("SELECT r.id,r.opening,r.created_at,u.name sender FROM chat_requests r JOIN users u ON u.id=r.sender_id WHERE r.recipient_id=? AND r.state='pending' ORDER BY r.created_at DESC").all(user.id),invites:db.prepare("SELECT i.id,c.name,u.name inviter FROM chat_invites i JOIN chats c ON c.id=i.chat_id JOIN users u ON u.id=i.inviter_id WHERE i.recipient_id=? AND i.state='pending'").all(user.id)};}
  function decide(user,requestId,accept){const row=db.prepare("SELECT * FROM chat_requests WHERE id=? AND recipient_id=? AND state='pending'").get(requestId,user.id);if(!row)fail('REQUEST_NOT_FOUND','Forespørselen finnes ikke.',404);if(blocked(row.sender_id,user.id))fail('RECIPIENT_UNAVAILABLE','Brukeren kan ikke kontaktes.',404);
    db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE chat_requests SET state=? WHERE id=?').run(accept?'accepted':'declined',requestId);let chatId=null;if(accept){const pairKey=[row.sender_id,user.id].sort().join(':');const existing=db.prepare('SELECT id FROM chats WHERE pair_key=?').get(pairKey);chatId=existing?.id||id();if(!existing)db.prepare("INSERT INTO chats(id,kind,pair_key) VALUES(?,'direct',?)").run(chatId,pairKey);for(const userId of [row.sender_id,user.id])db.prepare('INSERT OR IGNORE INTO chat_members(chat_id,user_id) VALUES(?,?)').run(chatId,userId);if(row.opening)db.prepare('INSERT INTO chat_messages(chat_id,sender_id,body) VALUES(?,?,?)').run(chatId,row.sender_id,row.opening);}record(user,accept?'chat.request.accepted':'chat.request.declined','chat_request',requestId);db.exec('COMMIT');return {chat_id:chatId};}catch(error){db.exec('ROLLBACK');throw error;}}
  function block(user,targetId){if(!active(targetId)||targetId===user.id)fail('USER_NOT_FOUND','Brukeren finnes ikke.',404);db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT OR IGNORE INTO chat_blocks(blocker_id,blocked_id) VALUES(?,?)').run(user.id,targetId);db.prepare("UPDATE chat_requests SET state='declined' WHERE recipient_id=? AND sender_id=? AND state='pending'").run(user.id,targetId);record(user,'chat.user.blocked','user',targetId);db.exec('COMMIT');return {ok:true};}catch(error){db.exec('ROLLBACK');throw error;}}
  function group(user,name,recipients,opening=''){name=V.text(name,{name:'Gruppenavn',min:2,max:80});opening=V.optionalText(opening,{name:'Melding',max:2000});if(!Array.isArray(recipients)||!recipients.length||recipients.length>50)fail('INVALID_GROUP','Velg 1–50 deltakere.');const unique=[...new Set(recipients)];for(const recipient of unique)if(recipient===user.id||!active(recipient)||blocked(user.id,recipient))fail('RECIPIENT_UNAVAILABLE','En deltaker kan ikke inviteres.',404);const chatId=id();db.exec('BEGIN IMMEDIATE');try{db.prepare("INSERT INTO chats(id,kind,creator_id,name) VALUES(?,'group',?,?)").run(chatId,user.id,name);db.prepare('INSERT INTO chat_members(chat_id,user_id) VALUES(?,?)').run(chatId,user.id);if(opening)db.prepare('INSERT INTO chat_messages(chat_id,sender_id,body) VALUES(?,?,?)').run(chatId,user.id,opening);for(const recipient of unique)db.prepare("INSERT INTO chat_invites(id,chat_id,inviter_id,recipient_id,state) VALUES(?,?,?,?,'pending')").run(id(),chatId,user.id,recipient);record(user,'chat.group.created','chat',chatId);db.exec('COMMIT');return {id:chatId};}catch(error){db.exec('ROLLBACK');throw error;}}
  function invite(user,chatId,recipient){member(chatId,user);if(!db.prepare("SELECT 1 FROM chats WHERE id=? AND kind='group'").get(chatId))fail('INVALID_GROUP','Ikke en gruppe.',400);if(!active(recipient)||blocked(user.id,recipient)||db.prepare('SELECT 1 FROM chat_members WHERE chat_id=? AND user_id=?').get(chatId,recipient)||db.prepare("SELECT 1 FROM chat_invites WHERE chat_id=? AND recipient_id=? AND state='pending'").get(chatId,recipient))fail('RECIPIENT_UNAVAILABLE','Kan ikke invitere brukeren.',404);const inviteId=id();db.exec('BEGIN IMMEDIATE');try{db.prepare("INSERT INTO chat_invites(id,chat_id,inviter_id,recipient_id,state) VALUES(?,?,?,?,'pending')").run(inviteId,chatId,user.id,recipient);record(user,'chat.invite.sent','chat_invite',inviteId);db.exec('COMMIT');return {id:inviteId};}catch(error){db.exec('ROLLBACK');throw error;}}
  function pendingInvites(user,chatId){const chat=db.prepare("SELECT creator_id FROM chats WHERE id=? AND kind='group'").get(chatId);if(!chat||chat.creator_id!==user.id)fail('FORBIDDEN','Bare gruppeoppretteren kan se invitasjoner.',403);return db.prepare("SELECT i.id,u.name recipient FROM chat_invites i JOIN users u ON u.id=i.recipient_id WHERE i.chat_id=? AND i.state='pending'").all(chatId);}
  function cancelInvite(user,chatId,inviteId){const chat=db.prepare("SELECT creator_id FROM chats WHERE id=? AND kind='group'").get(chatId);if(!chat||chat.creator_id!==user.id)fail('FORBIDDEN','Bare gruppeoppretteren kan avlyse invitasjoner.',403);db.exec('BEGIN IMMEDIATE');try{const result=db.prepare("UPDATE chat_invites SET state='cancelled' WHERE id=? AND chat_id=? AND state='pending'").run(inviteId,chatId);if(!result.changes)fail('INVITE_NOT_FOUND','Invitasjonen finnes ikke.',404);record(user,'chat.invite.cancelled','chat_invite',inviteId);db.exec('COMMIT');return {ok:true};}catch(error){db.exec('ROLLBACK');throw error;}}
  function decideInvite(user,inviteId,accept){const row=db.prepare("SELECT * FROM chat_invites WHERE id=? AND recipient_id=? AND state='pending'").get(inviteId,user.id);if(!row)fail('INVITE_NOT_FOUND','Invitasjonen finnes ikke.',404);if(accept&&blocked(user.id,row.inviter_id))fail('RECIPIENT_UNAVAILABLE','Invitasjonen kan ikke godtas.',404);db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE chat_invites SET state=? WHERE id=?').run(accept?'accepted':'declined',inviteId);if(accept){db.prepare('INSERT OR IGNORE INTO chat_members(chat_id,user_id) VALUES(?,?)').run(row.chat_id,user.id);db.prepare("INSERT INTO chat_messages(chat_id,sender_id,kind,body) VALUES(?,?,'system','joined')").run(row.chat_id,user.id);}record(user,accept?'chat.invite.accepted':'chat.invite.declined','chat_invite',inviteId);db.exec('COMMIT');return {chat_id:accept?row.chat_id:null};}catch(error){db.exec('ROLLBACK');throw error;}}
  function leave(user,chatId){member(chatId,user);db.exec('BEGIN IMMEDIATE');try{db.prepare("UPDATE chat_invites SET state='cancelled' WHERE chat_id=? AND inviter_id=? AND state='pending'").run(chatId,user.id);db.prepare('DELETE FROM chat_members WHERE chat_id=? AND user_id=?').run(chatId,user.id);db.prepare("INSERT INTO chat_messages(chat_id,sender_id,kind,body) VALUES(?,?,'system','left')").run(chatId,user.id);record(user,'chat.member.left','chat',chatId);db.exec('COMMIT');return {ok:true};}catch(error){db.exec('ROLLBACK');throw error;}}
  function list(user){return db.prepare("SELECT c.id,c.kind,c.creator_id,CASE WHEN c.kind='direct' THEN COALESCE((SELECT u.name FROM chat_members peer JOIN users u ON u.id=peer.user_id WHERE peer.chat_id=c.id AND peer.user_id<>?),'slettet bruker') ELSE c.name END name,c.created_at FROM chats c JOIN chat_members m ON m.chat_id=c.id WHERE m.user_id=? ORDER BY c.created_at DESC").all(user.id,user.id);}
  function messages(user,chatId,before){member(chatId,user);const cursor=before?V.integer(before,{name:'Sidepeker'}):Number.MAX_SAFE_INTEGER;return db.prepare(`SELECT m.id,m.kind,CASE WHEN m.kind='system' THEN COALESCE(u.name,'slettet bruker') || CASE m.body WHEN 'joined' THEN ' ble med i gruppen.' ELSE ' forlot samtalen.' END ELSE m.body END body,m.created_at,CASE WHEN m.kind='system' THEN 'System' ELSE COALESCE(u.name,'slettet bruker') END sender,f.id file_id,f.name file_name,f.bytes file_bytes,f.status file_status,f.expires_at FROM chat_messages m LEFT JOIN users u ON u.id=m.sender_id LEFT JOIN chat_files f ON f.message_id=m.id WHERE m.chat_id=? AND m.id<? ORDER BY m.id DESC LIMIT 50`).all(chatId,cursor).reverse();}
  function send(user,chatId,body){reachable(chatId,user);body=V.text(body,{name:'Melding',min:1,max:5000});const row=db.prepare('INSERT INTO chat_messages(chat_id,sender_id,body) VALUES(?,?,?)').run(chatId,user.id,body);return {id:Number(row.lastInsertRowid)};}
  function presence(user,visible){if(typeof visible!=='boolean')fail('INVALID_INPUT','Ugyldig synlighet.');db.prepare("INSERT INTO chat_presence(user_id,visible,seen_at) VALUES(?,?,datetime('now')) ON CONFLICT(user_id) DO UPDATE SET visible=excluded.visible,seen_at=excluded.seen_at").run(user.id,Number(visible));return {visible};}
  function peers(user,chatId){member(chatId,user);return db.prepare("SELECT u.id,u.name,CASE WHEN p.visible=1 AND p.seen_at>datetime('now','-90 seconds') AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE (b.blocker_id=u.id AND b.blocked_id=?) OR (b.blocker_id=? AND b.blocked_id=u.id)) THEN 1 ELSE 0 END online FROM chat_members m JOIN users u ON u.id=m.user_id LEFT JOIN chat_presence p ON p.user_id=u.id WHERE m.chat_id=?").all(user.id,user.id,chatId);}
  function beginFile(user,chatId,name,bytes){
    reachable(chatId,user);name=V.text(name,{name:'Filnavn',min:1,max:255}).replace(/[\\/]/g,'_');bytes=V.integer(bytes,{name:'Filstørrelse',min:1});
    if(db.prepare("SELECT count(*) n FROM chat_files WHERE sender_id=? AND status='uploading'").get(user.id).n>=3)fail('UPLOAD_LIMIT','Fullfør eller vent på tidligere opplastinger.',429);
    const fileId=id();fs.writeFileSync(path.join(root,fileId),'',{flag:'wx'});
    db.exec('BEGIN IMMEDIATE');try{
      db.prepare("INSERT INTO chat_files(id,chat_id,sender_id,name,bytes,status,stored_path) VALUES(?,?,?,?,?,'uploading',?)").run(fileId,chatId,user.id,name,bytes,fileId);
      record(user,'chat.file.started','chat_file',fileId);db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');fs.rmSync(path.join(root,fileId));throw error;}
    return {id:fileId,received:0};
  }
  function file(user,fileId){const row=db.prepare('SELECT * FROM chat_files WHERE id=?').get(fileId);if(!row)fail('FILE_NOT_FOUND','Filen finnes ikke.',404);member(row.chat_id,user);return row;}
  async function chunk(user,fileId,offset,req){
    if(uploads.has(fileId))fail('UPLOAD_BUSY','En filblokk behandles allerede.',409);
    if(uploads.size>=8)fail('UPLOAD_LIMIT','Serveren behandler for mange filblokker.',429);
    uploads.add(fileId);
    try{
      const row=file(user,fileId);reachable(row.chat_id,user);
      if(row.sender_id!==user.id||row.status!=='uploading')fail('UPLOAD_CLOSED','Opplastingen er avsluttet.',409);
      offset=V.integer(offset,{name:'Posisjon',min:0});
      if(offset!==row.received)fail('UPLOAD_OFFSET','Feil opplastingsposisjon.',409);
      const length=Number(req.headers['content-length']);
      if(!Number.isSafeInteger(length)||length<1||offset+length>row.bytes||length>4*1024*1024)fail('INVALID_CHUNK','Ugyldig filblokk.',400);
      const disk=fs.statfsSync(dataDir);
      if(disk.bavail*disk.bsize-length<config.minFreeBytes)fail('STORAGE_FULL','Ikke nok lagringsplass til filblokken.',507);
      const handle=await fs.promises.open(path.join(root,fileId),'r+');let written=0;
      try{
        for await(const data of req){
          let sent=0;
          while(sent<data.length){
            const result=await handle.write(data,sent,data.length-sent,offset+written);
            if(!result.bytesWritten)throw Error('File write made no progress.');
            sent+=result.bytesWritten;written+=result.bytesWritten;
          }
        }
        if(written!==length)fail('INVALID_CHUNK','Ufullstendig filblokk.',400);
        await handle.sync();
      }finally{await handle.close();}
      const received=offset+written;
      db.exec('BEGIN IMMEDIATE');try{
        const updated=db.prepare('UPDATE chat_files SET received=? WHERE id=? AND received=?').run(received,fileId,offset);
        if(updated.changes!==1)fail('UPLOAD_OFFSET','Feil opplastingsposisjon.',409);
        if(received===row.bytes){
          const expiry=new Date(Date.now()+7*86400000).toISOString();
          const message=db.prepare("INSERT INTO chat_messages(chat_id,sender_id,kind) VALUES(?,?,'file')").run(row.chat_id,user.id);
          db.prepare("UPDATE chat_files SET status='ready',expires_at=?,message_id=? WHERE id=?").run(expiry,Number(message.lastInsertRowid),fileId);
          record(user,'chat.file.completed','chat_file',fileId);
        }
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
      return {received,bytes:row.bytes,status:received===row.bytes?'ready':'uploading'};
    }finally{uploads.delete(fileId);}
  }
  function download(user,fileId,res){const row=file(user,fileId);reachable(row.chat_id,user);if(row.status!=='ready'||row.expires_at<=new Date().toISOString())fail('FILE_EXPIRED','Filen er utløpt.',410);res.set('Content-Type','application/octet-stream');res.set('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`);res.set('Content-Length',String(row.bytes));fs.createReadStream(path.join(root,row.stored_path)).pipe(res);}
  function cleanup(){
    const now=new Date().toISOString();
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
    const known=new Set(db.prepare("SELECT stored_path FROM chat_files WHERE status IN ('ready','uploading')").all().map(row=>row.stored_path));
    for(const entry of fs.readdirSync(root))if(!known.has(entry)&&!uploads.has(entry))fs.rmSync(path.join(root,entry),{force:true});
    const overdue=db.prepare("SELECT count(*) n FROM chat_files WHERE status='ready' AND expires_at<=?").get(now).n;
    db.prepare("INSERT INTO chat_worker_state(id,last_run,overdue) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET last_run=excluded.last_run,overdue=excluded.overdue").run(now,overdue);
    return overdue;
  }
  return {search,request,inbox,decide,block,group,invite,pendingInvites,cancelInvite,decideInvite,leave,list,messages,send,presence,peers,beginFile,file,chunk,download,cleanup};
}
module.exports={createChatService};
