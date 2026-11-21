'use strict';
const crypto=require('node:crypto');
const {generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse}=require('@simplewebauthn/server');
const {fail}=require('./errors');

function createPasskeyService(db,config,{identity,audit}){
  const enabled=()=>Boolean(config.webauthnEnabled);
  const requireEnabled=()=>{if(!enabled())fail('PASSKEYS_DISABLED','Passnøkler er ikke aktivert ennå.',503);};
  const clean=()=>db.prepare("DELETE FROM passkey_challenges WHERE expires_at<datetime('now','-1 day') OR consumed_at<datetime('now','-1 day')").run();
  const label=value=>{const result=String(value||'Passnøkkel').trim();if(!result||[...result].length>60)fail('LABEL_INVALID','Navnet må være mellom 1 og 60 tegn.',400);return result;};
  function handle(userId){
    let row=db.prepare('SELECT user_handle FROM webauthn_user_handles WHERE user_id=?').get(userId);
    if(!row){db.prepare('INSERT OR IGNORE INTO webauthn_user_handles(user_id,user_handle) VALUES(?,?)').run(userId,crypto.randomBytes(32).toString('base64url'));row=db.prepare('SELECT user_handle FROM webauthn_user_handles WHERE user_id=?').get(userId);}
    return row.user_handle;
  }
  function challenge(ceremony,{userId=null,sessionHash=null,value}){
    clean();
    if(userId)db.prepare('DELETE FROM passkey_challenges WHERE ceremony=? AND user_id=? AND consumed_at IS NULL').run(ceremony,userId);
    if(ceremony==='authenticate')db.prepare("DELETE FROM passkey_challenges WHERE id IN (SELECT id FROM passkey_challenges WHERE ceremony='authenticate' AND consumed_at IS NULL ORDER BY created_at DESC LIMIT -1 OFFSET 99)").run();
    const id=crypto.randomUUID();
    db.prepare("INSERT INTO passkey_challenges(id,challenge,ceremony,user_id,session_hash,rp_id,origin,expires_at) VALUES(?,?,?,?,?,?,?,datetime('now','+5 minutes'))")
      .run(id,value,ceremony,userId,sessionHash,config.webauthnRpId,config.webauthnOrigins[0]);
    return id;
  }
  function consume(id,ceremony,{auth=null,bindingHash=null}={}){
    if(typeof id!=='string'||!/^[0-9a-f-]{36}$/.test(id))fail('CHALLENGE_INVALID','Ugyldig utfordring.',400);
    const row=db.prepare("UPDATE passkey_challenges SET consumed_at=datetime('now') WHERE id=? AND ceremony=? AND consumed_at IS NULL AND expires_at>datetime('now') RETURNING *").get(id,ceremony);
    if(!row)fail('CHALLENGE_INVALID','Utfordringen er utløpt eller allerede brukt.',400);
    if(row.rp_id!==config.webauthnRpId||row.origin!==config.webauthnOrigins[0]||(auth&&(row.user_id!==auth.id||row.session_hash!==auth.sessionHash))||(!auth&&row.session_hash!==bindingHash))fail('CHALLENGE_INVALID','Utfordringen tilhører ikke denne sesjonen.',400);
    return row;
  }
  function credentialView(row){return {id:row.credential_id,label:row.label,created_at:row.created_at,last_used_at:row.last_used_at,backed_up:Boolean(row.backed_up)};}
  function configView(){return {enabled:enabled(),rp_id:enabled()?config.webauthnRpId:null};}
  async function registrationOptions(auth,requestedLabel){
    requireEnabled();identity.requireFresh(auth);
    const credentials=db.prepare('SELECT credential_id,transports_json FROM passkey_credentials WHERE user_id=? AND revoked_at IS NULL').all(auth.id);
    const options=await generateRegistrationOptions({rpName:'HerEme',rpID:config.webauthnRpId,userName:auth.name,userDisplayName:auth.name,userID:Buffer.from(handle(auth.id),'base64url'),attestationType:'none',authenticatorSelection:{residentKey:'required',userVerification:'required'},excludeCredentials:credentials.map(row=>({id:row.credential_id,transports:JSON.parse(row.transports_json)})),supportedAlgorithmIDs:[-7,-257]});
    return {challenge_id:challenge('register',{userId:auth.id,sessionHash:auth.sessionHash,value:options.challenge}),options,label:label(requestedLabel)};
  }
  async function verifyRegistration(auth,body){
    requireEnabled();identity.requireFresh(auth);const stored=consume(body?.challenge_id,'register',{auth});
    let verified;try{verified=await verifyRegistrationResponse({response:body?.response,expectedChallenge:stored.challenge,expectedOrigin:stored.origin,expectedRPID:stored.rp_id,requireUserPresence:true,requireUserVerification:true,supportedAlgorithmIDs:[-7,-257]});}catch{fail('PASSKEY_VERIFICATION_FAILED','Passnøkkelen kunne ikke bekreftes.',400);}
    if(!verified.verified||!verified.registrationInfo?.userVerified)fail('PASSKEY_VERIFICATION_FAILED','Passnøkkelen kunne ikke bekreftes.',400);
    identity.requireActive(auth);identity.requireFresh(auth);
    const info=verified.registrationInfo,c=info.credential,transports=Array.isArray(body.response?.response?.transports)?body.response.response.transports:[];
    try{db.prepare('INSERT INTO passkey_credentials(credential_id,user_id,public_key,counter,transports_json,device_type,backed_up,aaguid,label) VALUES(?,?,?,?,?,?,?,?,?)').run(c.id,auth.id,Buffer.from(c.publicKey),c.counter,JSON.stringify(transports),info.credentialDeviceType,info.credentialBackedUp?1:0,info.aaguid,label(body?.label));}
    catch(error){if(String(error.message).includes('UNIQUE'))fail('PASSKEY_EXISTS','Passnøkkelen er allerede registrert.',409);throw error;}
    audit.record({actorId:auth.id,action:'passkey.enrolled',subjectType:'passkey',subjectId:c.id,next:{label:label(body?.label)}});
    return {passkey:credentialView(db.prepare('SELECT * FROM passkey_credentials WHERE credential_id=?').get(c.id))};
  }
  async function loginOptions(){
    requireEnabled();const options=await generateAuthenticationOptions({rpID:config.webauthnRpId,userVerification:'required',allowCredentials:[]});
    const binding=crypto.randomBytes(32).toString('base64url');
    return {challenge_id:challenge('authenticate',{sessionHash:identity.sha256(binding),value:options.challenge}),options,binding};
  }
  async function verifyLogin(body,userAgent='',binding=''){
    requireEnabled();const stored=consume(body?.challenge_id,'authenticate',{bindingHash:identity.sha256(binding)});const response=body?.response;
    if(typeof response?.id!=='string'||response.id.length>2048)fail('PASSKEY_LOGIN_FAILED','Passnøkkelen kunne ikke brukes.',401);
    const row=db.prepare(`SELECT p.*,h.user_handle,u.status,u.name,u.secured_at FROM passkey_credentials p JOIN webauthn_user_handles h ON h.user_id=p.user_id JOIN users u ON u.id=p.user_id WHERE p.credential_id=? AND p.revoked_at IS NULL`).get(response?.id);
    if(!row||row.status!=='active')fail('PASSKEY_LOGIN_FAILED','Passnøkkelen kunne ikke brukes.',401);
    if(!response.response?.userHandle||response.response.userHandle!==row.user_handle)fail('PASSKEY_LOGIN_FAILED','Passnøkkelen kunne ikke brukes.',401);
    let verified;try{verified=await verifyAuthenticationResponse({response,expectedChallenge:stored.challenge,expectedOrigin:stored.origin,expectedRPID:stored.rp_id,credential:{id:row.credential_id,publicKey:new Uint8Array(row.public_key),counter:row.counter,transports:JSON.parse(row.transports_json)},requireUserVerification:true,advancedFIDOConfig:{userVerification:'required'}});}catch{fail('PASSKEY_LOGIN_FAILED','Passnøkkelen kunne ikke brukes.',401);}
    if(!verified.verified||!verified.authenticationInfo.userVerified)fail('PASSKEY_LOGIN_FAILED','Passnøkkelen kunne ikke brukes.',401);
    if(!db.prepare("SELECT 1 FROM users WHERE id=? AND status='active'").get(row.user_id))fail('PASSKEY_LOGIN_FAILED','Passnøkkelen kunne ikke brukes.',401);
    const changed=db.prepare("UPDATE passkey_credentials SET counter=?,last_used_at=datetime('now'),backed_up=? WHERE credential_id=? AND revoked_at IS NULL AND counter=?").run(verified.authenticationInfo.newCounter,verified.authenticationInfo.credentialBackedUp?1:0,row.credential_id,row.counter);
    if(!changed.changes)fail('PASSKEY_LOGIN_FAILED','Passnøkkelen ble endret under innlogging. Prøv igjen.',409);
    const session=identity.issueSession(row.user_id,userAgent);identity.markFresh(row.user_id,identity.sha256(session.raw),'passkey');
    audit.record({actorId:row.user_id,action:'passkey.authenticated',subjectType:'passkey',subjectId:row.credential_id});
    return {user:identity.userProjection({id:row.user_id,name:row.name,status:row.status,secured_at:row.secured_at}),session};
  }
  const list=auth=>db.prepare('SELECT * FROM passkey_credentials WHERE user_id=? AND revoked_at IS NULL ORDER BY created_at').all(auth.id).map(credentialView);
  function rename(auth,id,newLabel){requireEnabled();identity.requireFresh(auth);const before=db.prepare('SELECT * FROM passkey_credentials WHERE credential_id=? AND user_id=? AND revoked_at IS NULL').get(id,auth.id);if(!before)fail('NOT_FOUND','Passnøkkelen finnes ikke.',404);const value=label(newLabel);db.prepare('UPDATE passkey_credentials SET label=? WHERE credential_id=?').run(value,id);audit.record({actorId:auth.id,action:'passkey.renamed',subjectType:'passkey',subjectId:id,previous:{label:before.label},next:{label:value}});return {passkey:{...credentialView(before),label:value}};}
  function remove(auth,id,confirmed){requireEnabled();if(confirmed!==true)fail('RECOVERY_CONFIRMATION_REQUIRED','Bekreft at gjenopprettingsnøkkelen er tilgjengelig.',400);identity.requireFresh(auth,'recovery');const result=db.prepare("UPDATE passkey_credentials SET revoked_at=datetime('now') WHERE credential_id=? AND user_id=? AND revoked_at IS NULL").run(id,auth.id);if(!result.changes)fail('NOT_FOUND','Passnøkkelen finnes ikke.',404);audit.record({actorId:auth.id,action:'passkey.revoked',subjectType:'passkey',subjectId:id});return {ok:true};}
  return {configView,registrationOptions,verifyRegistration,loginOptions,verifyLogin,list,rename,remove,cleanup:clean};
}
module.exports={createPasskeyService};
