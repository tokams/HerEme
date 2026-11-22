'use strict';
const {fail}=require('./errors');
function createModerationService(db,{audit,identity}={}){
  function queue(){
    return db.prepare(`SELECT p.id,p.title,p.status,COALESCE(u.name,p.demo_author,'anonym') author,d.category,
      (SELECT count(*) FROM reports r WHERE r.post_id=p.id AND r.resolved=0) report_count
      FROM posts p LEFT JOIN users u ON u.id=p.author_id LEFT JOIN post_design d ON d.post_id=p.id
      WHERE p.status IN ('review','hidden') OR EXISTS(SELECT 1 FROM reports r WHERE r.post_id=p.id AND r.resolved=0)
      ORDER BY p.created_at DESC,abs(p.id) DESC`).all().map(post=>({...post,reasons:db.prepare('SELECT reason,count(*) n FROM reports WHERE post_id=? AND resolved=0 GROUP BY reason').all(post.id)}));
  }
  function act(actor,postId,action,reason){
    if(identity)identity.requireCapability(actor,'moderate');
    if(!['publish','hide','dismiss'].includes(action))fail('INVALID_ACTION','Ugyldig moderatortiltak.');
    const post=db.prepare('SELECT id,status FROM posts WHERE id=?').get(postId);if(!post)fail('POST_NOT_FOUND','Innlegget finnes ikke.',404);
    if(!['published','review','hidden'].includes(post.status))fail('INVALID_STATE','Innlegget kan ikke modereres i denne tilstanden.',409);
    if(action==='hide'&&post.status==='hidden')fail('INVALID_STATE','Innlegget er allerede sensurert.',409);
    if(action==='publish'&&post.status==='published')fail('INVALID_STATE','Innlegget er allerede publisert.',409);
    reason=String(reason||'').trim();if(reason.length<3||reason.length>300)fail('REASON_REQUIRED','Oppgi en kort begrunnelse.');
    const next=action==='dismiss'?post.status:action==='publish'?'published':'hidden';
    db.exec('BEGIN IMMEDIATE');
    try{if(action==='publish'&&db.prepare('SELECT visibility FROM content_revisions WHERE post_id=? ORDER BY version DESC LIMIT 1').get(postId)?.visibility!=='public')fail('HIDDEN_CURRENT_REVISION','Skriv en trygg ny versjon før innlegget publiseres.',409);if(action!=='dismiss')db.prepare('UPDATE posts SET status=? WHERE id=?').run(next,postId);db.prepare('UPDATE reports SET resolved=1 WHERE post_id=?').run(postId);audit.record({actorId:actor.id,action:`moderation.${action}`,subjectType:'post',subjectId:postId,previous:{status:post.status},next:{status:next,reportsResolved:true},reason});db.exec('COMMIT');}
    catch(error){db.exec('ROLLBACK');throw error;}
    return {ok:true,status:next};
  }
  function setRole(actor,userId,role,enabled,reason){
    identity.requireCapability(actor,'roles:manage');if(!['moderator','admin','operator'].includes(role))fail('INVALID_ROLE','Ugyldig rolle.');
    const user=db.prepare('SELECT id FROM users WHERE id=?').get(userId);if(!user)fail('USER_NOT_FOUND','Brukeren finnes ikke.',404);
    reason=String(reason||'').trim();if(reason.length<3||reason.length>300)fail('REASON_REQUIRED','Oppgi en kort begrunnelse.');
    db.exec('BEGIN IMMEDIATE');try{if(enabled)db.prepare('INSERT INTO user_roles(user_id,role,granted_by) VALUES(?,?,?) ON CONFLICT DO NOTHING').run(userId,role,actor.id);else db.prepare('DELETE FROM user_roles WHERE user_id=? AND role=?').run(userId,role);audit.record({actorId:actor.id,action:enabled?'role.granted':'role.revoked',subjectType:'user',subjectId:userId,next:{role,enabled},reason});db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
  }
  return {queue,act,setRole};
}
module.exports={createModerationService};
