'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const sharp=require('sharp');
const {chromium}=require('playwright');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'hereme-avatar-browser-'));
process.env.HEREME_DATA_DIR=data;process.env.HEREME_ENV='test';
const app=require('../server/index'),S=require('../server/services');
(async()=>{
  const server=await new Promise(resolve=>{const running=app.listen(0,'127.0.0.1',()=>resolve(running));});
  const base=`http://127.0.0.1:${server.address().port}`;let browser;
  try{
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'nb-NO'});
    assert.equal((await context.request.post(base+'/api/session',{data:{name:'AvatarBrowser'}})).status(),201);
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base+'/me');await page.locator('.profile-header').waitFor();
    assert.equal(await page.locator('.profile-avatar .avatar-initial').textContent(),'A');
    for(const width of [320,390]){
      await page.setViewportSize({width,height:844});
      await page.getByRole('button',{name:'Endre profilbilde'}).click();
      const dialog=page.locator('#avatarDialog');assert.equal(await dialog.isVisible(),true);
      const bounds=await dialog.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width);
      await page.locator('#avatarCancel').click();
    }
    const image=await sharp({create:{width:600,height:400,channels:3,background:'#518c69'}}).png().toBuffer();
    await page.getByRole('button',{name:'Endre profilbilde'}).click();
    await page.locator('#avatarFile').setInputFiles({name:'portrait.png',mimeType:'image/png',buffer:image});
    await page.locator('#avatarPreview').waitFor({state:'visible'});
    assert.match(await page.locator('#avatarFile').inputValue(),/portrait\.png$/);
    await page.locator('#avatarZoom').fill('1.5');
    if(process.env.HEREME_AVATAR_SCREENSHOT)await page.screenshot({path:process.env.HEREME_AVATAR_SCREENSHOT+'-crop.png'});
    await page.locator('#avatarSave').click();
    await page.locator('#avatarDialog').waitFor({state:'hidden'});
    await page.locator('.profile-avatar img').waitFor();
    assert.match(await page.locator('.profile-avatar img').getAttribute('src'),/\/api\/avatars\//);
    if(process.env.HEREME_AVATAR_SCREENSHOT)await page.screenshot({path:process.env.HEREME_AVATAR_SCREENSHOT+'-profile.png'});
    await page.getByRole('button',{name:'Endre profilbilde'}).click();
    await page.locator('#avatarRemove').click();
    await page.locator('#avatarDialog').waitFor({state:'hidden'});
    assert.equal(await page.locator('.profile-avatar img').count(),0);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({mobile:[320,390],upload:true,crop:true,remove:true}));
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));S.db.close();fs.rmSync(data,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
