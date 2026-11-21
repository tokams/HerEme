'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'hereme-passkeys-browser-'));
process.env.HEREME_DATA_DIR=data;process.env.HEREME_ENV='test';process.env.WEBAUTHN_ENABLED='true';process.env.WEBAUTHN_RP_ID='localhost';process.env.WEBAUTHN_ALLOWED_ORIGINS='http://localhost:3399';
const app=require('../server/index'),S=require('../server/services');
(async()=>{let browser,server;try{
  server=await new Promise(resolve=>{const value=app.listen(3399,'127.0.0.1',()=>resolve(value));});
  browser=await chromium.launch({headless:true});const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  const cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable');const firstAuthenticator=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
  await page.goto('http://localhost:3399/');await page.locator('.menu-button').click();await page.locator('[data-action=auth-register]').click();
  await page.locator('[data-auth-form=register] input[name=name]').fill('PasskeyBrowser');await page.locator('[data-auth-form=register] button').click();
  await page.locator('[data-save-passkey]').waitFor({state:'visible'});const recovery=await page.locator('.recovery-key').textContent();assert.ok(recovery.length>=20);
  const before=await context.request.get('http://localhost:3399/api/me').then(response=>response.json());
  await page.locator('[data-save-passkey]').click();await page.locator('[role=status]').getByText('Enheten er klar for innlogging.',{exact:false}).waitFor();await page.locator('form[action="/api/recovery/confirm"] button[type=submit]').click();await page.waitForURL('**/?recovery-saved=1');
  await page.waitForFunction(()=>document.querySelector('#profileLabel')?.textContent==='PasskeyBrowser');if(await page.locator('.modal-close').count())await page.locator('.modal-close').click();await page.locator('.menu-button').click();await page.getByRole('button',{name:'Logg ut',exact:true}).click();await page.waitForFunction(async()=>{const response=await fetch('/api/me');return response.status===401;});
  await page.reload();await page.locator('.menu-button').click();await page.locator('[data-action=auth-login]').click();
  for(const mutation of ['signature','origin','uv','rp','handle','credential','disabled','revoked']){
    await page.locator('.auth-error').evaluate(element=>element.hidden=true);
    if(mutation==='disabled')S.db.prepare("UPDATE users SET status='deactivated' WHERE id=?").run(before.user.id);
    if(mutation==='revoked')S.db.prepare("UPDATE passkey_credentials SET revoked_at=datetime('now') WHERE user_id=?").run(before.user.id);
    let rejectedStatus;
    await page.route('**/api/passkeys/login/verify',async route=>{const body=route.request().postDataJSON(),response=body.response.response;
      if(mutation==='signature'){const bytes=Buffer.from(response.signature,'base64url');bytes[bytes.length-1]^=1;response.signature=bytes.toString('base64url');}
      if(mutation==='origin'){const client=JSON.parse(Buffer.from(response.clientDataJSON,'base64url'));client.origin='https://wrong.example';response.clientDataJSON=Buffer.from(JSON.stringify(client)).toString('base64url');}
      if(mutation==='uv'||mutation==='rp'){const bytes=Buffer.from(response.authenticatorData,'base64url');if(mutation==='uv')bytes[32]&=~4;else bytes[0]^=1;response.authenticatorData=bytes.toString('base64url');}
      if(mutation==='handle')response.userHandle=Buffer.alloc(32).toString('base64url');
      if(mutation==='credential')body.response.id='unknown-credential';
      const result=await route.fetch({postData:body});rejectedStatus=result.status();await route.fulfill({response:result});
    });
    await page.locator('[data-passkey-login]').click();await page.locator('.auth-error').waitFor({state:'visible'});assert.equal(rejectedStatus,401,mutation);await page.unroute('**/api/passkeys/login/verify');
    if(mutation==='disabled')S.db.prepare("UPDATE users SET status='active' WHERE id=?").run(before.user.id);
    if(mutation==='revoked')S.db.prepare('UPDATE passkey_credentials SET revoked_at=NULL WHERE user_id=?').run(before.user.id);
  }
  await page.locator('[data-passkey-login]').click();await page.locator('.auth-overlay').waitFor({state:'detached'});
  const after=await context.request.get('http://localhost:3399/api/me').then(response=>response.json());assert.equal(after.user.id,before.user.id);assert.deepEqual(after.user.roles,before.user.roles);
  await page.locator('.menu-button').click();await page.getByRole('button',{name:'Sikkerhet · Passnøkler'}).click();
  await page.locator('.passkey-security input[name=recovery_key]').fill(recovery);await page.locator('.passkey-security form button').click();await page.getByText('Kontoen er bekreftet. Du kan nå endre passnøkler.',{exact:true}).waitFor();
  await cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId:firstAuthenticator.authenticatorId});await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
  await page.locator('[data-add]').click();await page.getByText('Passnøkkelen er lagret.',{exact:true}).waitFor();assert.equal(await page.locator('[data-list] input').count(),2);
  await page.locator('[data-list] input').first().fill('Min passnøkkel');await page.getByRole('button',{name:'Lagre navn',exact:true}).first().click();await page.waitForFunction(()=>document.querySelector('[data-list] input')?.value==='Min passnøkkel');
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Fjern',exact:true}).first().click();await page.waitForFunction(()=>document.querySelectorAll('[data-list] input').length===1);
  assert.deepEqual(errors,[]);console.log('Passkey browser: real virtual-authenticator enrollment and discoverable login preserve account and roles.');
}finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));S.db.close();fs.rmSync(data,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
