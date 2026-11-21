'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'hereme-passkeys-'));
process.env.HEREME_DATA_DIR=root;
process.env.HEREME_ENV='test';
process.env.WEBAUTHN_ENABLED='1';
process.env.WEBAUTHN_RP_ID='localhost';
process.env.WEBAUTHN_ALLOWED_ORIGINS='http://localhost:3000';
const S=require('../server/services');
test.after(()=>{S.db.close();fs.rmSync(root,{recursive:true,force:true});});

function account(name){
  const created=S.identity.createProfile({name}),sessionHash=S.identity.sha256(created.session.raw);
  const auth={...created.user,sessionHash,csrfHash:S.identity.sha256(created.session.csrf)};
  S.identity.markFresh(auth.id,sessionHash,'new_account');
  return {created,auth};
}

test('schema 19 is additive and retains account, recovery and session identity',()=>{
  const {created}=account('Migreringsvenn'),id=created.user.id;
  assert.equal(S.db.prepare('SELECT max(version) version FROM schema_migrations').get().version,19);
  assert.equal(S.db.prepare('SELECT id FROM users WHERE id=?').get(id).id,id);
  assert.ok(S.db.prepare('SELECT secret_hash FROM recovery_credentials WHERE user_id=?').get(id));
  assert.ok(S.db.prepare('SELECT user_id FROM sessions WHERE user_id=?').get(id));
  for(const table of ['webauthn_user_handles','passkey_credentials','passkey_challenges','authentication_stepups'])assert.ok(S.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table));
});

test('registration options require freshness and enforce discoverable UV credentials',async()=>{
  const {auth}=account('Alternativvenn');
  S.db.prepare("UPDATE authentication_stepups SET expires_at=datetime('now','-1 second') WHERE session_hash=?").run(auth.sessionHash);
  await assert.rejects(S.passkeys.registrationOptions(auth),error=>error.code==='STEP_UP_REQUIRED');
  S.identity.markFresh(auth.id,auth.sessionHash,'recovery');
  const offered=await S.passkeys.registrationOptions(auth,'Telefon');
  assert.equal(offered.options.rp.id,'localhost');
  assert.equal(offered.options.authenticatorSelection.residentKey,'required');
  assert.equal(offered.options.authenticatorSelection.userVerification,'required');
  assert.equal(offered.options.user.id,S.db.prepare('SELECT user_handle FROM webauthn_user_handles WHERE user_id=?').get(auth.id).user_handle);
});

test('registration challenge rejects cross-session use and is consumed atomically',async()=>{
  const {auth}=account('Sesjonsvenn'),offered=await S.passkeys.registrationOptions(auth);
  const second=S.identity.issueSession(auth.id),stolen={...auth,sessionHash:S.identity.sha256(second.raw)};
  S.identity.markFresh(auth.id,stolen.sessionHash,'recovery');
  await assert.rejects(S.passkeys.verifyRegistration(stolen,{challenge_id:offered.challenge_id,response:{}}),error=>error.code==='CHALLENGE_INVALID');
  await assert.rejects(S.passkeys.verifyRegistration(auth,{challenge_id:offered.challenge_id,response:{}}),error=>error.code==='CHALLENGE_INVALID');
  assert.ok(S.db.prepare('SELECT consumed_at FROM passkey_challenges WHERE id=?').get(offered.challenge_id).consumed_at);
});

test('expired and wrong-ceremony challenges fail without reaching crypto verification',async()=>{
  const offered=await S.passkeys.loginOptions();
  S.db.prepare("UPDATE passkey_challenges SET expires_at=datetime('now','-1 second') WHERE id=?").run(offered.challenge_id);
  await assert.rejects(S.passkeys.verifyLogin({challenge_id:offered.challenge_id,response:{}},'',offered.binding),error=>error.code==='CHALLENGE_INVALID');
  const {auth}=account('Seremonivenn'),registration=await S.passkeys.registrationOptions(auth);
  await assert.rejects(S.passkeys.verifyLogin({challenge_id:registration.challenge_id,response:{}},'','binding'),error=>error.code==='CHALLENGE_INVALID');
});

test('anonymous options disclose no account and cookie binding mismatch consumes the challenge',async()=>{
  const offered=await S.passkeys.loginOptions();
  assert.deepEqual(offered.options.allowCredentials,[]);
  assert.equal(offered.options.userVerification,'required');
  assert.equal(Object.hasOwn(offered.options,'user'),false);
  await assert.rejects(S.passkeys.verifyLogin({challenge_id:offered.challenge_id,response:{}},'','wrong-binding'),error=>error.code==='CHALLENGE_INVALID');
  await assert.rejects(S.passkeys.verifyLogin({challenge_id:offered.challenge_id,response:{}},'',offered.binding),error=>error.code==='CHALLENGE_INVALID');
});

test('credential removal requires explicit confirmation and recovery-typed freshness',()=>{
  const {auth}=account('Fjerningsvenn');
  S.db.prepare("INSERT INTO passkey_credentials(credential_id,user_id,public_key,device_type,label) VALUES('credential',?,X'01','singleDevice','Test')").run(auth.id);
  assert.throws(()=>S.passkeys.remove(auth,'credential',true),error=>error.code==='STEP_UP_REQUIRED');
  S.identity.markFresh(auth.id,auth.sessionHash,'recovery');
  assert.throws(()=>S.passkeys.remove(auth,'credential',false),error=>error.code==='RECOVERY_CONFIRMATION_REQUIRED');
  assert.deepEqual(S.passkeys.remove(auth,'credential',true),{ok:true});
  assert.equal(S.passkeys.list(auth).length,0);
});

test('production configuration rejects noncanonical RP, origin, and invalid feature flags',()=>{
  const {runtimeConfig}=require('../server/config'),base={HEREME_ENV:'production',HOST:'127.0.0.1',HEREME_PUBLIC_ORIGIN:'https://hereme.no',WEBAUTHN_ENABLED:'1'};
  assert.throws(()=>runtimeConfig(process.cwd(),{...base,WEBAUTHN_RP_ID:'wrong.example',WEBAUTHN_ALLOWED_ORIGINS:'https://hereme.no'}),/canonical/);
  assert.throws(()=>runtimeConfig(process.cwd(),{...base,WEBAUTHN_RP_ID:'hereme.no',WEBAUTHN_ALLOWED_ORIGINS:'https://www.hereme.no'}),/canonical/);
  assert.throws(()=>runtimeConfig(process.cwd(),{...base,WEBAUTHN_ENABLED:'yes'}),/must be/);
});
