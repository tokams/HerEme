'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'hereme-mobile-shell-'));
const port=3327;
let server,browser;

async function start(){
  server=spawn(process.execPath,['server/index.js'],{cwd:root,env:{...process.env,HEREME_DATA_DIR:data,PORT:String(port)},stdio:'ignore',windowsHide:true});
  for(let attempt=0;attempt<100;attempt++){
    if(server.exitCode!==null)throw new Error('Server exited during startup.');
    try{const response=await fetch(`http://localhost:${port}/`);if(response.ok)return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('Server startup timed out.');
}

(async()=>{
  await start();
  browser=await chromium.launch({headless:true});
  const checked=[];
  const screenshots=path.join(root,'docs/screenshots/mobile-ui-fix');
  fs.mkdirSync(screenshots,{recursive:true});
  for(const width of [320,359,375,390,430]){
    const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true});
    const page=await context.newPage();
    await page.goto(`http://localhost:${port}/`);
    await page.locator('.post-card').first().waitFor();
    if(width===320||width===390)await page.screenshot({path:path.join(screenshots,`wall-header-${width}.png`)});
    await page.locator('#notificationButton').evaluate(button=>button.hidden=false);
    for(const theme of ['dark','light']){
      await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);
      const result=await page.evaluate(()=>{
        const selectors=['.logo','.header-chat','.filter-toggle','.create-button','.menu-button'];
        if(!document.querySelector('#notificationButton').hidden)selectors.push('#notificationButton');
        const rects=selectors.map(selector=>{const el=document.querySelector(selector),r=el.getBoundingClientRect();return {selector,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};});
        return {viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,rects};
      });
      assert.ok(result.scrollWidth<=width,`Horizontal scroll at ${width}/${theme}: ${JSON.stringify(result)}`);
      for(const rect of result.rects){
        assert.ok(rect.left>=0&&rect.right<=width,`Header control outside ${width}/${theme}: ${JSON.stringify(rect)}`);
        assert.ok(rect.width>=44&&rect.height>=44,`Header tap target below 44px at ${width}/${theme}: ${JSON.stringify(rect)}`);
      }
      for(let i=0;i<result.rects.length;i++)for(let j=i+1;j<result.rects.length;j++){
        const a=result.rects[i],b=result.rects[j];
        assert.ok(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top,`Header controls overlap at ${width}/${theme}: ${a.selector}, ${b.selector}`);
      }
      checked.push(`${width}/${theme}`);
    }
    await context.close();
  }
  const brokenContext=await browser.newContext({viewport:{width:390,height:844}});
  const brokenPage=await brokenContext.newPage();
  await brokenPage.route('**/assets/demo/**',route=>route.abort('failed'));
  await brokenPage.goto(`http://localhost:${port}/`);
  await brokenPage.locator('.poster-surface[data-media-state=error]').first().waitFor();
  assert.ok(await brokenPage.locator('.poster-surface.without-image').count()>0,'Posts without images remain distinct.');
  assert.equal(await brokenPage.locator('.poster-surface[data-media-state=error] .poster-media-error').first().isVisible(),true);
  await brokenPage.screenshot({path:path.join(screenshots,'wall-image-error-390.png')});
  await brokenContext.close();
  console.log(JSON.stringify({checked,header:'fits with 44px targets and no overlaps'}));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  if(server&&server.exitCode===null){const exited=new Promise(resolve=>server.once('exit',resolve));server.kill();await exited;}
  fs.rmSync(data,{recursive:true,force:true});
});
