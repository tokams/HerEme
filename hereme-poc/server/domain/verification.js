'use strict';
const crypto=require('node:crypto');const {fail}=require('./errors');
function createVerificationService(db,config,{audit}={}){
  function linkFromTrustedProvider(user,{provider,subject,status='verified'}){
    if(!config.enableVerification)fail('VERIFICATION_DISABLED','Identitetsverifisering er ikke aktivert.',404);
    if(!provider||!subject)fail('INVALID_VERIFICATION','Leverandørens identitetsreferanse mangler.');
    const subjectHash=crypto.createHash('sha256').update(`${provider}:\0${subject}`).digest('hex');
    db.exec('BEGIN IMMEDIATE');try{db.prepare(`INSERT INTO identity_verifications(user_id,provider,subject_hash,status,verified_at)
      VALUES(?,?,?,? ,CASE WHEN ?='verified' THEN datetime('now') END)
      ON CONFLICT(user_id) DO UPDATE SET provider=excluded.provider,subject_hash=excluded.subject_hash,status=excluded.status,verified_at=excluded.verified_at,revoked_at=NULL`).run(user.id,provider,subjectHash,status,status);
    audit?.record({actorId:user.id,action:'verification.linked',subjectType:'user',subjectId:user.id,next:{provider,status}});db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
    return {status,provider};
  }
  function revoke(actor,userId,reason){if(!config.enableVerification)fail('VERIFICATION_DISABLED','Identitetsverifisering er ikke aktivert.',404);db.exec('BEGIN IMMEDIATE');try{db.prepare("UPDATE identity_verifications SET status='revoked',revoked_at=datetime('now') WHERE user_id=?").run(userId);audit?.record({actorId:actor.id,action:'verification.revoked',subjectType:'user',subjectId:userId,reason});db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}}
  return {linkFromTrustedProvider,revoke};
}
module.exports={createVerificationService};
