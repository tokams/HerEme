'use strict';
const {fail}=require('./errors');
const crypto=require('node:crypto');

const categories={message:'chat_messages',request:'chat_requests_and_invitations',invite:'chat_requests_and_invitations',accepted:'chat_requests_and_invitations',declined:'chat_requests_and_invitations',post_reply:'forum_replies',comment_reply:'forum_replies'};

function createNotificationService(db){
  function enqueue({eventKey,recipientId,kind,actorId=null,chatId=null,postId=null,commentId=null,route}){
    if(recipientId===actorId)return;
    db.prepare(`INSERT OR IGNORE INTO push_outbox(event_key,recipient_id,category,kind,actor_id,chat_id,post_id,comment_id,route)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(eventKey,recipientId,categories[kind],kind,actorId,chatId,postId,commentId,route);
  }
  function chat(notificationId,{recipientId,actorId,chatId,kind}){
    enqueue({eventKey:'chat:'+notificationId,recipientId,actorId,chatId,kind,route:kind==='message'?'/chat/'+chatId:'/chat'});
  }
  function forum({recipientId,actorId,postId,commentId,kind}){
    if(!recipientId||recipientId===actorId)return;
    const key=`${kind}:${commentId}:${recipientId}`;
    const row=db.prepare(`INSERT OR IGNORE INTO forum_notifications(recipient_id,actor_id,post_id,comment_id,kind,dedupe_key)
      VALUES(?,?,?,?,?,?) RETURNING id`).get(recipientId,actorId,postId,commentId,kind,key);
    if(row)enqueue({eventKey:'forum:'+row.id,recipientId,actorId,postId,commentId,kind,route:'/?post='+postId});
  }
  function list(user,before=''){
    let cursor=Number.MAX_SAFE_INTEGER;
    if(before){cursor=Number(before);if(!Number.isSafeInteger(cursor)||cursor<1)fail('INVALID_CURSOR','Ugyldig sidepeker.');}
    const chat=db.prepare(`SELECT id,'chat' source,kind,actor_id,chat_id,NULL post_id,NULL comment_id,created_at,read_at
      FROM chat_notifications WHERE recipient_id=?`).all(user.id);
    const forum=db.prepare(`SELECT id,'forum' source,kind,actor_id,NULL chat_id,post_id,comment_id,created_at,read_at
      FROM forum_notifications WHERE recipient_id=?`).all(user.id);
    return [...chat,...forum].map(item=>({...item,notification_id:item.source+':'+item.id,sort_id:Number(item.id),route:item.source==='forum'?'/?post='+item.post_id:item.kind==='message'?'/chat/'+item.chat_id:'/chat'}))
      .sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))||b.sort_id-a.sort_id).filter(item=>item.sort_id<cursor).slice(0,50);
  }
  function read(user,notificationId){
    const match=/^(chat|forum):(\d+)$/.exec(String(notificationId||''));if(!match)fail('NOTIFICATION_NOT_FOUND','Varslingen finnes ikke.',404);
    const table=match[1]==='chat'?'chat_notifications':'forum_notifications';
    const changed=db.prepare(`UPDATE ${table} SET read_at=datetime('now') WHERE id=? AND recipient_id=?`).run(Number(match[2]),user.id);
    if(!changed.changes)fail('NOTIFICATION_NOT_FOUND','Varslingen finnes ikke.',404);return {ok:true};
  }
  function unread(user){return db.prepare(`SELECT (SELECT count(*) FROM chat_notifications WHERE recipient_id=? AND read_at IS NULL)+(SELECT count(*) FROM forum_notifications WHERE recipient_id=? AND read_at IS NULL) count`).get(user.id,user.id).count;}
  function token(){return crypto.randomUUID();}
  return {chat,forum,list,read,unread,token};
}
module.exports={createNotificationService,categories};
