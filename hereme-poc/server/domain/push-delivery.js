'use strict';
const webPush=require('web-push');
const {allowedHosts}=require('./push');

function createPushDeliveryService(db,config,{sender=webPush,now=()=>new Date()}={}){
  if(config.enableWebPush){if(!config.vapidPrivateKey)throw new Error('VAPID private key is required by the push worker.');sender.setVapidDetails(config.vapidSubject,config.vapidPublicKey,config.vapidPrivateKey);}
  const iso=date=>date.toISOString().replace('T',' ').slice(0,19);
  function expand(){
    if(!config.enableWebPush)return 0;
    return db.prepare(`INSERT OR IGNORE INTO push_deliveries(outbox_id,subscription_id)
      SELECT o.id,s.id FROM push_outbox o JOIN push_subscriptions s ON s.user_id=o.recipient_id AND s.disabled_at IS NULL
      LEFT JOIN notification_preferences p ON p.user_id=o.recipient_id
      WHERE o.id>s.start_outbox_id AND CASE o.category WHEN 'chat_messages' THEN COALESCE(p.chat_messages,1)
        WHEN 'chat_requests_and_invitations' THEN COALESCE(p.chat_requests_and_invitations,1)
        WHEN 'forum_replies' THEN COALESCE(p.forum_replies,1) ELSE 0 END=1`).run().changes;
  }
  function authorized(row){
    if(row.disabled_at||row.subscription_user_id!==row.recipient_id)return false;
    if(!db.prepare("SELECT 1 FROM users WHERE id=? AND status='active'").get(row.recipient_id))return false;
    if(row.actor_id&&db.prepare('SELECT 1 FROM chat_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)').get(row.recipient_id,row.actor_id,row.actor_id,row.recipient_id))return false;
    const preference=db.prepare('SELECT chat_messages,chat_requests_and_invitations,forum_replies FROM notification_preferences WHERE user_id=?').get(row.recipient_id);if(preference&&preference[row.category]!==1)return false;
    if(row.category==='forum_replies')return Boolean(db.prepare("SELECT 1 FROM forum_notifications n JOIN posts p ON p.id=n.post_id WHERE n.id=? AND n.recipient_id=? AND p.status='published'").get(Number(row.event_key.slice(6)),row.recipient_id));
    if(row.kind==='request')return Boolean(db.prepare("SELECT 1 FROM chat_requests WHERE chat_id=? AND recipient_id=? AND state='pending'").get(row.chat_id,row.recipient_id));
    if(row.kind==='invite')return Boolean(db.prepare("SELECT 1 FROM chat_invites WHERE chat_id=? AND recipient_id=? AND state='pending'").get(row.chat_id,row.recipient_id));
    if(row.kind==='message')return Boolean(db.prepare(`SELECT 1 FROM chat_members m JOIN chats c ON c.id=m.chat_id WHERE m.chat_id=? AND m.user_id=? AND (c.kind='group' OR c.direct_state='accepted')`).get(row.chat_id,row.recipient_id));
    if(row.kind==='accepted'||row.kind==='declined')return Boolean(db.prepare('SELECT 1 FROM chat_members WHERE chat_id=? AND user_id=?').get(row.chat_id,row.recipient_id));
    return true;
  }
  function payload(row){
    const content={request:['Meldingsforespørsel','Du har en meldingsforespørsel'],invite:['Gruppeinvitasjon','Du har en gruppeinvitasjon'],accepted:['Forespørsel oppdatert','En forespørsel ble godtatt'],declined:['Forespørsel oppdatert','En forespørsel ble avslått'],post_reply:['Nytt svar','Noen svarte på innlegget ditt'],comment_reply:['Nytt svar','Noen svarte på kommentaren din']};
    content.message=['Ny chatmelding','Du har en ny melding'];
    const [title,body]=content[row.kind]||['Ny varsling','Du har en ny varsling'];return {notification_id:row.event_key,kind:row.kind,title,body,route:row.route,tag:row.chat_id?'chat:'+row.chat_id:row.event_key};
  }
  function claim(){
    const timestamp=now(),current=iso(timestamp),lease=iso(new Date(timestamp.getTime()+60000));
    db.prepare("UPDATE push_deliveries SET state='retry',lease_until=NULL,next_attempt_at=?,updated_at=? WHERE state='leased' AND lease_until<=?").run(current,current,current);
    const row=db.prepare(`SELECT d.id FROM push_deliveries d WHERE d.state IN ('pending','retry') AND d.next_attempt_at<=? ORDER BY d.id LIMIT 1`).get(current);if(!row)return null;
    const changed=db.prepare("UPDATE push_deliveries SET state='leased',lease_until=?,attempts=attempts+1,updated_at=? WHERE id=? AND state IN ('pending','retry')").run(lease,current,row.id);if(!changed.changes)return null;
    return db.prepare(`SELECT d.*,o.event_key,o.recipient_id,o.category,o.kind,o.actor_id,o.chat_id,o.post_id,o.comment_id,o.route,s.user_id subscription_user_id,s.endpoint,s.p256dh,s.auth,s.disabled_at
      FROM push_deliveries d JOIN push_outbox o ON o.id=d.outbox_id JOIN push_subscriptions s ON s.id=d.subscription_id WHERE d.id=?`).get(row.id);
  }
  function permanent(row,code){db.prepare("UPDATE push_deliveries SET state='permanent',lease_until=NULL,last_error_code=?,updated_at=datetime('now') WHERE id=?").run(String(code).slice(0,80),row.id);}
  async function deliver(row){
    if(!authorized(row)){permanent(row,'access_revoked');return 'permanent';}
    let target;try{target=new URL(row.endpoint);}catch{target=null;}if(!target||target.protocol!=='https:'||!allowedHosts(target.hostname.toLowerCase())){permanent(row,'invalid_endpoint');return 'permanent';}
    let timeout;try{const push=sender.sendNotification({endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth}},JSON.stringify(payload(row)),{TTL:3600,urgency:'normal',timeout:Math.min(config.pushTimeoutMs||30000,30000)}),deadline=new Promise((_,reject)=>{timeout=setTimeout(()=>{const error=new Error('Push provider timed out.');error.code='PUSH_TIMEOUT';reject(error);},Math.min(config.pushTimeoutMs||30000,30000));});await Promise.race([push,deadline]);clearTimeout(timeout);db.prepare("UPDATE push_deliveries SET state='sent',lease_until=NULL,last_error_code=NULL,updated_at=datetime('now') WHERE id=?").run(row.id);db.prepare("UPDATE push_subscriptions SET last_success_at=datetime('now'),last_failure_at=NULL WHERE id=?").run(row.subscription_id);return 'sent';}
    catch(error){clearTimeout(timeout);const status=Number(error.statusCode||error.status);db.prepare("UPDATE push_subscriptions SET last_failure_at=datetime('now') WHERE id=?").run(row.subscription_id);if(status===404||status===410){db.prepare("UPDATE push_subscriptions SET disabled_at=datetime('now'),updated_at=datetime('now') WHERE id=?").run(row.subscription_id);permanent(row,'endpoint_'+status);return 'permanent';}if(row.attempts>=5||status>=400&&status<500){permanent(row,status||'delivery_rejected');return 'permanent';}const delay=[60,300,1800,7200][Math.min(row.attempts-1,3)],next=iso(new Date(now().getTime()+delay*1000));db.prepare("UPDATE push_deliveries SET state='retry',lease_until=NULL,next_attempt_at=?,last_error_code=?,updated_at=datetime('now') WHERE id=?").run(next,String(status||error.code||'temporary').slice(0,80),row.id);return 'retried';}
  }
  async function runOnce({limit=20}={}){const added=expand(),counts={sent:0,retried:0,permanent:0};if(config.enableWebPush)for(let i=0;i<limit;i++){const row=claim();if(!row)break;counts[await deliver(row)]++;}db.prepare("DELETE FROM push_outbox WHERE created_at<datetime('now','-30 days')").run();const queued=db.prepare("SELECT count(*) count FROM push_deliveries WHERE state IN ('pending','retry','leased')").get().count;db.prepare(`INSERT INTO push_worker_state(id,last_run,queued,sent,retried,permanent_failures) VALUES(1,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET last_run=excluded.last_run,queued=excluded.queued,sent=push_worker_state.sent+excluded.sent,retried=push_worker_state.retried+excluded.retried,permanent_failures=push_worker_state.permanent_failures+excluded.permanent_failures`).run(iso(now()),queued,counts.sent,counts.retried,counts.permanent);return {added,queued,...counts};}
  return {expand,claim,authorized,payload,deliver,runOnce};
}
module.exports={createPushDeliveryService};
