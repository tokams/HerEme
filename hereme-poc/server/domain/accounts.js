'use strict';
const {fail}=require('./errors');
function createAccountService(db,{audit,identity,avatars}={}){
  function deactivate(auth){
    db.exec('BEGIN IMMEDIATE');try{db.prepare("UPDATE users SET status='deactivated' WHERE id=?").run(auth.id);db.prepare("UPDATE sessions SET revoked_at=datetime('now') WHERE user_id=? AND revoked_at IS NULL").run(auth.id);audit.record({actorId:auth.id,action:'account.deactivated',subjectType:'user',subjectId:auth.id,next:{status:'deactivated'}});db.exec('COMMIT');avatars.remove(auth);}catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
  }
  function anonymize(actor,userId,reason){
    identity.requireCapability(actor,'users:anonymize');const user=db.prepare('SELECT id,name,status FROM users WHERE id=?').get(userId);if(!user)fail('USER_NOT_FOUND','Brukeren finnes ikke.',404);
    const anonymous='slettet-'+userId.slice(0,8);
    db.exec('BEGIN IMMEDIATE');try{
      db.prepare("UPDATE users SET name=?,status='deactivated',token_hash=lower(hex(randomblob(32))) WHERE id=?").run(anonymous,userId);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);db.prepare('DELETE FROM recovery_credentials WHERE user_id=?').run(userId);db.prepare('DELETE FROM identity_verifications WHERE user_id=?').run(userId);
      audit.record({actorId:actor.id,action:'account.anonymized',subjectType:'user',subjectId:userId,previous:{name:user.name,status:user.status},next:{name:anonymous,status:'deactivated'},reason});db.exec('COMMIT');avatars.remove({id:userId});
    }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
  }
  return {deactivate,anonymize};
}
module.exports={createAccountService};
