'use strict';
const {WebSocketServer,WebSocket}=require('ws');

function attachChatSocket(server,{db,identity,config}){
  const wss=new WebSocketServer({noServer:true,maxPayload:1024,perMessageDeflate:false});
  const clients=new Set();
  const reject=(socket,status)=>{socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);socket.destroy();};
  server.on('upgrade',(req,socket,head)=>{
    if(new URL(req.url,'http://localhost').pathname!=='/api/chat-socket')return reject(socket,'404 Not Found');
    const origin=req.headers.origin,expected=config.production?config.publicOrigin:`http://${req.headers.host}`;
    if (config.production && req.headers.host !== new URL(expected).host) return reject(socket,'421 Misdirected Request');
    if(origin!==expected)return reject(socket,'403 Forbidden');
    const user=identity.readSession(req,{set(){}},{allowLegacy:false});
    if(!user)return reject(socket,'401 Unauthorized');
    if(clients.size>=200||[...clients].filter(item=>item.user.id===user.id).length>=4)return reject(socket,'429 Too Many Requests');
    wss.handleUpgrade(req,socket,head,ws=>{
      const client={ws,user,cursor:db.prepare('SELECT COALESCE(max(id),0) id FROM chat_events').get().id,notificationCursor:db.prepare('SELECT COALESCE(max(id),0) id FROM notification_events').get().id,alive:true};clients.add(client);
      ws.on('pong',()=>{client.alive=true;});ws.on('message',()=>ws.close(1008,'Read-only channel'));
      ws.on('close',()=>clients.delete(client));
      ws.send(JSON.stringify({type:'connected',cursor:client.cursor}));
    });
  });
  const timer=setInterval(()=>{
    for(const client of clients){
      if(client.ws.readyState!==WebSocket.OPEN)continue;
      const active=db.prepare("SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id_hash=? AND s.revoked_at IS NULL AND s.expires_at>datetime('now') AND u.status='active'").get(client.user.sessionHash);
      if(!active){client.ws.close(1008,'Session ended');continue;}
      const events=db.prepare('SELECT id,chat_id,kind FROM chat_events WHERE recipient_id=? AND id>? ORDER BY id LIMIT 100').all(client.user.id,client.cursor);
      for(const event of events){client.cursor=event.id;const allowed=db.prepare("SELECT 1 FROM chat_members WHERE chat_id=? AND user_id=? UNION SELECT 1 FROM chat_requests WHERE chat_id=? AND recipient_id=? AND state='pending' UNION SELECT 1 FROM chat_invites WHERE chat_id=? AND recipient_id=? AND state='pending'").get(event.chat_id,client.user.id,event.chat_id,client.user.id,event.chat_id,client.user.id);client.ws.send(JSON.stringify(allowed?{type:event.kind,id:event.id,chat_id:event.chat_id}:{type:'sync',id:event.id}));}
      const notifications=db.prepare('SELECT id,notification_id FROM notification_events WHERE recipient_id=? AND id>? ORDER BY id LIMIT 100').all(client.user.id,client.notificationCursor);
      for(const event of notifications){client.notificationCursor=event.id;client.ws.send(JSON.stringify({type:'notification.created',id:event.id,notification_id:event.notification_id}));}
    }
  },1000);
  const heartbeat=setInterval(()=>{for(const client of clients){if(!client.alive){client.ws.terminate();continue;}client.alive=false;client.ws.ping();}},30000);
  server.on('close',()=>{clearInterval(timer);clearInterval(heartbeat);for(const client of clients)client.ws.terminate();wss.close();});
}
module.exports={attachChatSocket};
