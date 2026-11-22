'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {chromium}=require('playwright');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'hereme-logout-browser-'));
process.env.HEREME_DATA_DIR=data;
process.env.HEREME_ENV='test';
const app=require('../server/index');
const services=require('../server/services');

(async()=>{
  const server=await new Promise(resolve=>{const running=app.listen(0,'127.0.0.1',()=>resolve(running));});
  let browser;
  try{
    const base=`http://127.0.0.1:${server.address().port}`;
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({viewport:{width:390,height:844},locale:'nb-NO'});
    const page=await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base);
    await page.locator('.menu-button').click();
    await page.locator('[data-action=auth-register]').click();
    await page.locator('[data-auth-form=register] input[name=name]').fill('QuickLogout');
    await page.locator('[data-auth-form=register] button').click();
    await page.locator('[data-auth-continue]').click();
    await page.waitForFunction(()=>document.querySelector('#profileLabel')?.textContent==='QuickLogout');
    assert.equal(await page.locator('#notificationButton svg').count(),1);
    assert.equal(await page.locator('#notificationButton img').count(),0);
    await page.evaluate(()=>{window.HeremePwa.ready=Promise.resolve({});});
    await page.locator('.menu-button').click();
    await page.locator('[data-action=logout]').click();
    await page.waitForFunction(()=>document.querySelector('#notificationButton')?.hidden===true);
    assert.equal((await context.request.get(base+'/api/me')).status(),401);
    assert.deepEqual(errors,[]);
    console.log('Mobile quick logout passed without PushManager.');
  }finally{
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
    services.db.close();
    fs.rmSync(data,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
