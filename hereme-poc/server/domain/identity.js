'use strict';
const crypto=require('node:crypto');
const {fail}=require('./errors');
const {text}=require('./validation');
const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');
const secretHash=(secret,salt)=>crypto.scryptSync(secret,Buffer.from(salt,'base64url'),32,{N:16384,r:8,p:1}).toString('base64url');
const normalize=name=>name.normalize('NFKC').toLocaleLowerCase('no');
function createIdentityService(db,{sessionDays=30,production=false}={}){
  let securityEvents=null;
  const setSecurityEvents=service=>{securityEvents=service;};
  const capabilities={
    member:['post:create','vote','comment','report'],
    moderator:['staff:read','moderate'],
    admin:['staff:read','moderate','content:manage','users:delete','roles:manage'],
    operator:['staff:read','moderate','content:manage','users:delete','roles:manage','security:read']
  };
  const cookieName='hereme_session';
  const parseCookies=req=>Object.fromEntries(String(req.headers.cookie||'').split(';').map(part=>part.trim()).filter(Boolean).map(part=>{const i=part.indexOf('=');return [decodeURIComponent(part.slice(0,i)),decodeURIComponent(part.slice(i+1))];}));
  const roleRows=db.prepare('SELECT role FROM user_roles WHERE user_id=?');
  function userProjection(user){
    const roles=roleRows.all(user.id).map(row=>row.role);
    const caps=new Set();for(const role of roles)for(const cap of capabilities[role]||[])caps.add(cap);
    const avatar=db.prepare('SELECT version FROM user_avatars WHERE user_id=?').get(user.id);
    return {id:user.id,name:user.name,status:user.status,secured:Boolean(user.secured_at),preferred_language:user.preferred_language??null,avatar_url:avatar?`/api/avatars/${encodeURIComponent(user.id)}/${avatar.version}/small`:null,avatar_large_url:avatar?`/api/avatars/${encodeURIComponent(user.id)}/${avatar.version}/large`:null,roles,capabilities:[...caps]};
  }
  function issueSession(userId,userAgent=''){
    const raw=crypto.randomBytes(32).toString('base64url'),csrf=crypto.randomBytes(24).toString('base64url');
    const expires=new Date(Date.now()+sessionDays*86400000).toISOString().replace('T',' ').slice(0,19);
    db.prepare('INSERT INTO sessions(id_hash,user_id,csrf_hash,expires_at,user_agent) VALUES(?,?,?,?,?)')
      .run(sha256(raw),userId,sha256(csrf),expires,userAgent.slice(0,200));
    return {raw,csrf,expires};
  }
  function markFresh(userId,sessionHash,proofType='new_account',seconds=300){
    db.prepare("INSERT INTO authentication_stepups(session_hash,user_id,expires_at,proof_type) VALUES(?,?,datetime('now',?),?) ON CONFLICT(session_hash) DO UPDATE SET user_id=excluded.user_id,verified_at=datetime('now'),expires_at=excluded.expires_at,proof_type=excluded.proof_type").run(sessionHash,userId,`+${seconds} seconds`,proofType);
  }
  function requireFresh(auth,proofType=null){const row=db.prepare("SELECT proof_type FROM authentication_stepups WHERE session_hash=? AND user_id=? AND expires_at>datetime('now')").get(auth.sessionHash,auth.id);if(!row||proofType&&row.proof_type!==proofType)fail('STEP_UP_REQUIRED','Bekreft kontoeierskap før du endrer passnøkler.',403);return row;}
  function requireActive(auth){if(!db.prepare("SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id_hash=? AND s.user_id=? AND s.revoked_at IS NULL AND s.expires_at>datetime('now') AND u.status='active' AND NOT EXISTS(SELECT 1 FROM security_account_restrictions r WHERE r.user_id=u.id)").get(auth.sessionHash,auth.id))fail('AUTH_REQUIRED','Sesjonen er ikke lenger aktiv.',401);}
  function setCookie(res,session){
    res.set('Set-Cookie',[`${cookieName}=${encodeURIComponent(session.raw)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionDays*86400}${production?'; Secure':''}`,
      `hereme_csrf=${encodeURIComponent(session.csrf)}; Path=/; SameSite=Lax; Max-Age=${sessionDays*86400}${production?'; Secure':''}`]);
  }
  function clearCookie(res){res.set('Set-Cookie',[`${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${production?'; Secure':''}`,`hereme_csrf=; Path=/; SameSite=Lax; Max-Age=0${production?'; Secure':''}`]);}
  function readSession(req,res,{allowLegacy=true}={}){
    const raw=parseCookies(req)[cookieName];
    if(raw){
      const hash=sha256(raw);
      const expired=db.prepare("SELECT s.user_id FROM sessions s WHERE s.id_hash=? AND s.revoked_at IS NULL AND s.expires_at<=datetime('now')").get(hash);
      if(expired){
        db.exec('SAVEPOINT expired_session');
        try{const changed=db.prepare("UPDATE sessions SET revoked_at=datetime('now') WHERE id_hash=? AND revoked_at IS NULL AND expires_at<=datetime('now')").run(hash);if(changed.changes)securityEvents?.record('session_expired',{req,subject:{id:expired.user_id},routeClass:'authentication',statusCode:401});db.exec('RELEASE expired_session');}
        catch(error){db.exec('ROLLBACK TO expired_session');db.exec('RELEASE expired_session');throw error;}
      }
      const row=db.prepare(`SELECT s.*,u.name,u.status,u.secured_at,u.preferred_language FROM sessions s JOIN users u ON u.id=s.user_id
        WHERE s.id_hash=? AND s.revoked_at IS NULL AND s.expires_at>datetime('now') AND u.status='active'
        AND NOT EXISTS(SELECT 1 FROM security_account_restrictions r WHERE r.user_id=u.id)`).get(hash);
      if(row){db.prepare("UPDATE sessions SET last_seen_at=datetime('now') WHERE id_hash=? AND last_seen_at<datetime('now','-1 hour')").run(row.id_hash);return {...userProjection({id:row.user_id,name:row.name,status:row.status,secured_at:row.secured_at,preferred_language:row.preferred_language}),sessionHash:row.id_hash,csrfHash:row.csrf_hash};}
    }
    if(allowLegacy){
      const match=/^Bearer ([a-f0-9]{64})$/i.exec(req.headers.authorization||'');
      if(match){
        const user=db.prepare("SELECT * FROM users WHERE token_hash=? AND status='active' AND NOT EXISTS(SELECT 1 FROM security_account_restrictions r WHERE r.user_id=users.id)").get(sha256(match[1]));
        if(user){
          let recoveryKey=null;
          db.exec('BEGIN IMMEDIATE');
          try{
            db.prepare("INSERT OR IGNORE INTO user_roles(user_id,role) VALUES(?,'member')").run(user.id);
            if(!db.prepare('SELECT 1 FROM recovery_credentials WHERE user_id=?').get(user.id)){
              recoveryKey=crypto.randomBytes(24).toString('base64url');const salt=crypto.randomBytes(16).toString('base64url');
              db.prepare('INSERT INTO recovery_credentials(user_id,secret_hash,salt) VALUES(?,?,?)').run(user.id,secretHash(recoveryKey,salt),salt);
              db.prepare("UPDATE users SET secured_at=datetime('now') WHERE id=?").run(user.id);user.secured_at=new Date().toISOString();
            }
            const session=issueSession(user.id,req.headers['user-agent']);db.exec('COMMIT');setCookie(res,session);
            return {...userProjection(user),sessionHash:sha256(session.raw),csrfHash:sha256(session.csrf),csrf:session.csrf,legacyMigrated:true,recoveryKey};
          }catch(error){db.exec('ROLLBACK');throw error;}
        }
      }
    }
    return null;
  }
  function requireUser(req,res){const auth=readSession(req,res);if(!auth)fail('AUTH_REQUIRED','Velg et pseudonym eller logg inn for å delta.',401);return auth;}
  function requireCsrf(req,auth,value=req.headers['x-csrf-token']){
    if(!value||sha256(String(value))!==auth.csrfHash)fail('CSRF_INVALID','Sikkerhetstoken mangler eller er utløpt.',403);
  }
  function confirmRecovery(auth,recoveryKey){
    recoveryKey=text(recoveryKey,{name:'Gjenopprettingsnøkkel',min:20,max:200});
    const row=db.prepare('SELECT secret_hash,salt FROM recovery_credentials WHERE user_id=?').get(auth.id);
    const candidate=row?secretHash(recoveryKey,row.salt):secretHash(recoveryKey,Buffer.alloc(16).toString('base64url'));
    if(!row||candidate.length!==row.secret_hash.length||!crypto.timingSafeEqual(Buffer.from(candidate),Buffer.from(row.secret_hash)))fail('RECOVERY_FAILED','Gjenopprettingsnøkkelen er feil.',401);
    return {ok:true};
  }
  function stepUp(auth,recoveryKey){confirmRecovery(auth,recoveryKey);markFresh(auth.id,auth.sessionHash,'recovery');return {ok:true,expires_in:300};}
  function requireCapability(auth,capability){if(!auth.capabilities.includes(capability))fail('FORBIDDEN','Du har ikke tilgang til denne handlingen.',403);}
  function createProfile({name,userAgent='',onCreated=null}){
    name=text(name,{name:'Pseudonym',min:2,max:24});
    const normalized=normalize(name);if(db.prepare('SELECT id FROM users WHERE normalized_name=?').get(normalized))fail('NAME_TAKEN','Pseudonymet er allerede i bruk.',409);
    const id=crypto.randomUUID(),legacy=crypto.randomBytes(32).toString('hex');
    const recovery=crypto.randomBytes(24).toString('base64url'),salt=crypto.randomBytes(16).toString('base64url');
    db.exec('BEGIN IMMEDIATE');
    try{
      db.prepare("INSERT INTO users(id,token_hash,name,normalized_name,secured_at) VALUES(?,?,?,?,datetime('now'))").run(id,sha256(legacy),name,normalized);
      db.prepare("INSERT INTO user_roles(user_id,role) VALUES(?,'member')").run(id);
      db.prepare('INSERT INTO recovery_credentials(user_id,secret_hash,salt) VALUES(?,?,?)').run(id,secretHash(recovery,salt),salt);
      const session=issueSession(id,userAgent);
      const user=userProjection({id,name,status:'active',secured_at:new Date().toISOString()});
      if(onCreated)onCreated({user,session});
      db.exec('COMMIT');
      return {user,session,recoveryKey:recovery};
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  function recover({name,recoveryKey,userAgent=''}){
    name=text(name,{name:'Pseudonym',min:2,max:24});recoveryKey=text(recoveryKey,{name:'Gjenopprettingsnøkkel',min:20,max:200});
    const row=db.prepare(`SELECT u.*,r.secret_hash,r.salt FROM users u JOIN recovery_credentials r ON r.user_id=u.id
      WHERE u.normalized_name=? AND u.status='active' AND NOT EXISTS(SELECT 1 FROM security_account_restrictions x WHERE x.user_id=u.id)`).get(normalize(name));
    const candidate=row?secretHash(recoveryKey,row.salt):secretHash(recoveryKey,Buffer.alloc(16).toString('base64url'));
    if(!row||candidate.length!==row.secret_hash.length||!crypto.timingSafeEqual(Buffer.from(candidate),Buffer.from(row.secret_hash)))fail('RECOVERY_FAILED','Pseudonym eller nøkkel er feil.',401);
    const session=issueSession(row.id,userAgent);return {user:userProjection(row),session};
  }
  function rotateRecovery(auth){
    const recovery=crypto.randomBytes(24).toString('base64url'),salt=crypto.randomBytes(16).toString('base64url');
    db.prepare("UPDATE recovery_credentials SET secret_hash=?,salt=?,version=version+1,rotated_at=datetime('now') WHERE user_id=?").run(secretHash(recovery,salt),salt,auth.id);
    return recovery;
  }
  function revokeAll(auth,current=false){
    db.prepare("UPDATE sessions SET revoked_at=datetime('now') WHERE user_id=? AND revoked_at IS NULL"+(current?' AND id_hash<>?':'')).run(...(current?[auth.id,auth.sessionHash]:[auth.id]));
  }
  function logout(auth,res){if(auth)db.prepare("UPDATE sessions SET revoked_at=datetime('now') WHERE id_hash=?").run(auth.sessionHash);if(res)clearCookie(res);}
  function rename(auth,name){name=text(name,{name:'Pseudonym',min:2,max:24});const normalized=normalize(name);if(db.prepare('SELECT id FROM users WHERE normalized_name=? AND id<>?').get(normalized,auth.id))fail('NAME_TAKEN','Pseudonymet er allerede i bruk.',409);db.prepare('UPDATE users SET name=?,normalized_name=? WHERE id=?').run(name,normalized,auth.id);return {...auth,name};}
  function language(auth,preferredLanguage){
    if(preferredLanguage!=='nb'&&preferredLanguage!=='en')fail('INVALID_LANGUAGE','Språket må være nb eller en.',400);
    db.prepare('UPDATE users SET preferred_language=? WHERE id=?').run(preferredLanguage,auth.id);
    return {preferred_language:preferredLanguage};
  }
  return {readSession,requireUser,requireCsrf,requireCapability,createProfile,recover,confirmRecovery,stepUp,markFresh,requireFresh,requireActive,issueSession,rotateRecovery,revokeAll,logout,rename,language,setCookie,userProjection,sha256,parseCookies,setSecurityEvents};
}
module.exports={createIdentityService};
