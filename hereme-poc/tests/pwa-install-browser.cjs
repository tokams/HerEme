'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {chromium}=require('playwright');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'hereme-install-browser-'));
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
    await page.goto(base);
    assert.equal(await page.locator('#installBanner').isVisible(),false);
    await page.evaluate(()=>{const event=new Event('beforeinstallprompt');event.prompt=()=>{window.installPromptCalls=(window.installPromptCalls||0)+1;};event.userChoice=Promise.resolve({outcome:'dismissed'});dispatchEvent(event);});
    await page.locator('#installBanner').waitFor({state:'visible'});
    await page.getByText('Legg til appen for å kunne få varsler om meldinger og aktivitet på innlegg.',{exact:false}).first().waitFor({state:'visible'});
    assert.equal(await page.locator('.masthead + #installBanner').count(),1);
    await page.locator('#installBanner').click();
    assert.equal(await page.evaluate(()=>window.installPromptCalls),1);
    assert.equal(await page.locator('#installBanner').isVisible(),false);
    assert.equal(await page.locator('#installReason').isVisible(),false);
    await page.reload();
    assert.equal(await page.locator('#installBanner').isVisible(),false);
    await context.close();

    const iosContext=await browser.newContext({viewport:{width:390,height:844},locale:'nb-NO',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'});
    const iosPage=await iosContext.newPage();
    await iosPage.goto(base);
    await iosPage.locator('#installBanner').waitFor({state:'visible'});
    await iosPage.locator('#installBanner').click();
    await iosPage.getByRole('dialog').getByText('Legg til på Hjem-skjermen',{exact:false}).waitFor();
    await iosPage.getByRole('button',{name:'Ikke nå'}).click();
    assert.equal(await iosPage.locator('#installBanner').isVisible(),false);
    await iosPage.reload();
    assert.equal(await iosPage.locator('#installBanner').isVisible(),false);
    await iosPage.locator('.menu-button').click();
    await iosPage.locator('#installMenuButton').waitFor({state:'visible'});
    await iosContext.close();

    const desktop=await browser.newContext({viewport:{width:1280,height:800}});
    const desktopPage=await desktop.newPage();
    await desktopPage.goto(base);
    await desktopPage.evaluate(()=>{const event=new Event('beforeinstallprompt');event.prompt=()=>{};event.userChoice=Promise.resolve({outcome:'accepted'});dispatchEvent(event);});
    assert.equal(await desktopPage.locator('#installBanner').isVisible(),false);
    await desktopPage.locator('.menu-button').click();
    await desktopPage.locator('#installMenuButton').waitFor({state:'visible'});
    await desktop.close();
    console.log('Install CTA browser flows passed.');
  }finally{
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
    services.db.close();
    fs.rmSync(data,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
