'use strict';
// Dedicated headless browser and temporary data. Never attaches to a user's browser.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'hereme-wall-browser-'));
const screenshots=path.join(root,'docs/screenshots/wall-v3');
fs.mkdirSync(screenshots,{recursive:true});
let child,browser;
async function start(){
  child=spawn(process.execPath,['server/index.js'],{cwd:root,env:{...process.env,HEREME_DATA_DIR:data,PORT:'3300'},stdio:['ignore','pipe','pipe'],windowsHide:true});
  return new Promise((resolve,reject)=>{
    let output='';const timer=setTimeout(()=>reject(new Error('Test server startup timed out.')),15000);
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.on('exit',code=>{clearTimeout(timer);reject(new Error('Server exited: '+code+' '+output));});
    child.stderr.on('data',chunk=>{output+=chunk;});
    child.stdout.on('data',chunk=>{output+=chunk;const match=/På PC:\s+(http:\/\/localhost:\d+)/.exec(output);if(match){clearTimeout(timer);resolve(match[1]);}});
  });
}
async function stop(){
  if(child&&child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;}child=null;
}
async function ready(page) {
  await page.locator('.post-card').first().waitFor();
  await page.locator('img').evaluateAll(images=>images.forEach(img=>img.loading='eager'));
  await page.evaluate(()=>Promise.all([...document.images].map(img=>img.decode())));
  await page.evaluate(()=>document.fonts.ready);
}
async function fits(page){
  const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(size.scroll<=size.width,'Horizontal overflow: '+JSON.stringify(size));
  const targets=await page.locator('.post-card .vote-btn').evaluateAll(items=>items.map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})));
  assert.ok(targets.every(t=>t.width>=44&&t.height>=44),'Votes need 44px touch targets.');
}
async function settleWall(page) {
  await page.waitForFunction(()=>document.querySelector('#feed').getAttribute('aria-busy')==='false');
}
async function publish(page,title) {
  await page.locator('#publishButton').click();
  await page.locator('.modal-panel').waitFor({state:'hidden'});
  const post=page.locator('.post-card').filter({has:page.getByRole('button',{name:'Åpne '+title,exact:true})});
  await post.waitFor();return post;
}
(async()=>{
  const base=await start();browser=await chromium.launch({headless:true});
  const errors=[];
  const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(base);await ready(page);await fits(page);
  assert.equal(await page.locator('.post-card').count(),13);
  assert.equal(await page.locator('#categoryFilters input:checked').count(),5);
  assert.equal(await page.locator('#feed [data-action="report"],[data-action="room"],[data-action="browse-rooms"]').count(),0);
  for(const category of ['question','opinion','story','alert','tip'])assert.ok(await page.locator('.post-card[data-category="'+category+'"]').count()>0);
  assert.equal(await page.locator('html').getAttribute('data-layout'),'simple');
  assert.equal(await page.locator('#leftPanel').isVisible(),false);
  assert.equal(await page.locator('#rightPanel').isVisible(),false);
  assert.equal(await page.locator('#simpleCategories button:visible').count(),5);
  assert.equal(await page.locator('#simpleCategories svg').count(),5);
  assert.equal(await page.locator('#feed').evaluate(el=>getComputedStyle(el).columnGap),'10px');
  await page.screenshot({path:path.join(screenshots,'desktop-simple-dark.png'),fullPage:true});
  for(const width of [350,390,700,900,1280,1700]){
    await page.setViewportSize({width,height:844});await fits(page);
    assert.equal(await page.locator('#simpleCategories button:visible').count(),width>=900?5:0);
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('#simpleCategories [data-category=tip]').click();await settleWall(page);
  assert.equal(await page.locator('.post-card[data-category=tip]').count(),0);
  assert.equal(await page.locator('#simpleCategories [data-category=tip]').getAttribute('aria-pressed'),'false');
  await page.locator('#themeToggle').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  await page.screenshot({path:path.join(screenshots,'desktop-simple-light.png'),fullPage:true});
  await page.locator('[data-action=layout][data-layout=advanced]').click();
  assert.equal(await page.locator('#categoryFilters input[value=tip]').isChecked(),false);
  await page.locator('#categoryFilters input[value=tip]').check();await settleWall(page);
  await page.screenshot({path:path.join(screenshots,'desktop-advanced-light.png'),fullPage:true});
  await page.reload();await ready(page);
  assert.equal(await page.locator('html').getAttribute('data-layout'),'advanced');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  await page.locator('#themeToggle').click();
  const firstTop=await page.locator('.post-card').first().evaluate(el=>el.getBoundingClientRect().top);
  assert.ok(firstTop<240,'Wall should begin immediately below the header and display controls.');
  await page.screenshot({path:path.join(screenshots,'desktop-wall.png'),fullPage:true});
  assert.equal(await page.locator('#leftPanel').isVisible(),true);assert.equal(await page.locator('#rightPanel').isVisible(),true);
  assert.ok(await page.locator('#activityPanel .activity-item').count()>0);
  assert.equal(await page.evaluate(()=>document.fonts.check('800 16px "Cascadia Code"')),true);
  assert.equal(await page.locator('#fontSelect').count(),0);
  const appearance=await page.locator('.post-card').first().evaluate(el=>({radius:getComputedStyle(el).borderRadius,gap:getComputedStyle(el.parentElement).columnGap,font:getComputedStyle(el).fontFamily,order:[...el.querySelector('.tile-actions').children].map(c=>c.className)}));
  assert.equal(appearance.radius,'0px');assert.equal(appearance.gap,'0px');assert.match(appearance.font,/Cascadia Code/);
  assert.match(appearance.order.join(','),/^vote-btn vote-up,vote-btn vote-down,vote-number/);
  for(const selector of ['.with-image','.without-image']){
    const box=await page.locator('#feed '+selector).first().boundingBox();
    assert.ok(Math.abs(box.height/box.width-(selector==='.with-image'?1.12:1))<.015);
  }
  await page.locator('.activity-item').first().click();
  await page.locator('#discussion').waitFor();
  await page.screenshot({path:path.join(screenshots,'desktop-detail.png')});
  await page.locator('.modal-close').click();
  for(const width of [350,390,700,900,1280,1700]){
    await page.setViewportSize({width,height:844});await fits(page);
    assert.equal(await page.locator('#rightPanel').isVisible(),width>=1280);
    assert.equal(await page.locator('#leftPanel').isVisible(),width>=900);
  }
  await page.setViewportSize({width:1440,height:1000});
  // Explicit empty selection, then a union of two categories.
  for(const input of await page.locator('#categoryFilters input').all())await input.uncheck();
  await settleWall(page);assert.equal(await page.locator('.post-card').count(),0);
  await page.getByText('Ingen kategorier valgt',{exact:true}).waitFor();
  for(const category of ['question','alert'])await page.locator('#categoryFilters input[value="'+category+'"]').check();
  await settleWall(page);
  const categories=await page.locator('.post-card').evaluateAll(posts=>posts.map(p=>p.dataset.category));
  assert.ok(categories.length>0&&categories.every(c=>['question','alert'].includes(c)));
  await page.locator('.logo').click();await settleWall(page);
  await page.locator('#searchInput').fill('regn');
  await page.waitForFunction(()=>document.querySelectorAll('.post-card').length<13);
  await settleWall(page);
  const searchCount=await page.locator('.post-card').count();
  assert.ok(searchCount>0);
  await page.locator('#sortSelect').selectOption('top');await settleWall(page);
  const scores=await page.locator('#feed .vote-number').allTextContents();
  assert.deepEqual(scores.map(Number),scores.map(Number).sort((a,b)=>b-a));
  await page.locator('.logo').click();await settleWall(page);
  await page.locator('#sortSelect').selectOption('new');await settleWall(page);
  // Desktop category-only creation is a complete poster, with no required image or room.
  await page.locator('.create-button').click();
  assert.equal(await page.locator('#recoverName').getAttribute('autocomplete'),'username');
  assert.equal(await page.locator('#recoverKey').getAttribute('autocomplete'),'current-password');
  await page.locator('#nicknameInput').fill('VeggTester');
  await page.locator('#profileForm button').click();
  const recovery=await page.locator('#recoveryPassword').inputValue();assert.ok(recovery.length>=20);
  assert.equal(await page.locator('#recoveryUsername').inputValue(),'VeggTester');
  assert.equal(await page.locator('#recoveryPassword').getAttribute('autocomplete'),'new-password');
  assert.equal(await page.locator('#recoverySaveForm').getAttribute('method'),'post');
  await Promise.all([page.waitForResponse(response=>response.url().endsWith('/api/recovery/confirm')),page.locator('#recoverySaveForm button[type=submit]').click()]);
  await page.waitForLoadState('domcontentloaded');await ready(page);assert.equal(await page.locator('#profileLabel').textContent(),'VeggTester');
  await page.locator('.create-button').click();
  await page.locator('input[name=postCategory][value=question]').check();
  await page.locator('#postTitle').fill('KOR E BUSSEN?');
  await page.locator('#postBody').fill('Et spørsmål fra en isolert test.');
  await page.locator('#posterPreview .without-image').waitFor();
  await page.screenshot({path:path.join(screenshots,'desktop-create-text.png')});
  const textPost=await publish(page,'KOR E BUSSEN?');
  assert.equal(await textPost.getAttribute('data-category'),'question');
  const textId=await textPost.getAttribute('data-post-id');
  // Desktop offers crop within the chosen template, without free-form fonts/styles.
  await page.locator('.create-button').click();
  await page.locator('input[name=postCategory][value=alert]').check();
  await page.locator('#postTitle').fill('REGN PÅ VEIEN');
  await page.locator('#postFileInput').setInputFiles(path.join(root,'public/assets/demo/sources/source-01-rain_bus_stop.jpg'));
  await page.locator('#photoFilename').filter({hasText:'source-01-rain_bus_stop.jpg'}).waitFor();
  await page.locator('.desktop-crop summary').click();
  await page.locator('#editorZoom').focus();await page.locator('#editorZoom').press('Home');
  for(let i=0;i<10;i++)await page.locator('#editorZoom').press('ArrowRight');
  await page.locator('#editorX').focus();await page.locator('#editorX').press('Home');
  for(let i=0;i<30;i++)await page.locator('#editorX').press('ArrowRight');
  await page.locator('#textPosition').selectOption('center');
  await page.screenshot({path:path.join(screenshots,'desktop-create-photo.png')});
  const imagePost=await publish(page,'REGN PÅ VEIEN');
  const imageId=await imagePost.getAttribute('data-post-id');
  const saved=await(await fetch(base+'/api/posts/'+imageId)).json();
  assert.equal(saved.post.room_id,null);assert.equal(saved.post.poster_style,'alert');
  assert.equal(saved.post.image_zoom,1.5);assert.equal(saved.post.image_x,30);assert.equal(saved.post.text_position,'center');
  // Demo posters use their preserved source to apply v3, while linking the untouched original.
  const seeded=page.locator('.post-card').filter({hasText:'Ka skjer i helgå?'}).first();
  await seeded.locator('.tile-open').click();
  await page.locator('.detail-modal .poster-title').waitFor();
  assert.match(await page.locator('.detail-modal .poster-photo').getAttribute('src'),/\/sources\//);
  await page.getByRole('link',{name:'Original plakat ↗'}).waitFor();
  await page.locator('.modal-close').click();
  const storage=await context.storageState();
  await context.close();
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,storageState:storage,permissions:['clipboard-read','clipboard-write']});
  const phone=await mobile.newPage();phone.on('pageerror',error=>errors.push(error.message));
  phone.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await phone.goto(base);await ready(phone);await fits(phone);
  await phone.screenshot({path:path.join(screenshots,'mobile-wall.png')});
  await phone.screenshot({path:path.join(screenshots,'mobile-wall-full.png'),fullPage:true});
  assert.equal(await phone.locator('#leftPanel').isVisible(),false);
  assert.equal(await phone.locator('#rightPanel').isVisible(),false);
  assert.ok((await phone.locator('.post-card').first().boundingBox()).y<80);
  await phone.locator('#filterToggle').click();
  await phone.locator('#categoryFilters input[value=tip]').uncheck();await settleWall(phone);
  await phone.locator('#filterToggle').click();
  await phone.locator('[data-post-id="'+imageId+'"] .vote-up').click();
  await phone.waitForFunction(id=>document.querySelector('[data-post-id="'+id+'"] .vote-up').getAttribute('aria-pressed')==='false',imageId);
  assert.equal(await phone.locator('.modal-panel').count(),0);
  await phone.locator('[data-post-id="'+imageId+'"] .vote-up').click();
  await phone.waitForFunction(id=>document.querySelector('[data-post-id="'+id+'"] .vote-up').getAttribute('aria-pressed')==='true',imageId);
  // Closing a lower tile preserves both browsing position and category selection.
  const lower=phone.locator('.tile-open').last();await lower.scrollIntoViewIfNeeded();
  const priorScroll=await phone.evaluate(()=>scrollY);
  await lower.click();await phone.locator('.modal-close').click();
  assert.ok(Math.abs(await phone.evaluate(()=>scrollY)-priorScroll)<2);
  assert.equal(await phone.locator('#categoryFilters input[value=tip]').isChecked(),false);
  await phone.locator('[data-post-id="'+imageId+'"] .tile-open').click();
  await phone.locator('.detail-modal').evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished)));
  const bounds=await phone.locator('.detail-modal').boundingBox();
  assert.equal(bounds.x,0);assert.equal(bounds.y,0);assert.equal(bounds.width,390);assert.equal(bounds.height,844);
  await phone.locator('.detail-toolbar [data-action=report]').waitFor();
  await phone.waitForFunction(id=>location.search==='?post='+id,imageId);
  await phone.locator('.modal-close').focus();
  await phone.keyboard.press('Shift+Tab');
  assert.equal(await phone.evaluate(()=>document.activeElement.closest('form')?.id),'commentForm');
  await phone.keyboard.press('Tab');
  assert.equal(await phone.evaluate(()=>document.activeElement.dataset.action),'close-modal');
  assert.equal(await phone.locator('#forumShell').evaluate(el=>el.inert),true);
  await phone.locator('.detail-toolbar [data-action=share]').click();
  assert.equal(await phone.evaluate(()=>navigator.clipboard.readText()),base+'/?post='+imageId);
  await phone.screenshot({path:path.join(screenshots,'mobile-detail.png')});
  await phone.locator('.detail-modal .vote-down').click();
  await phone.waitForFunction(()=>document.querySelector('.detail-modal .vote-number')?.textContent==='-1');
  await phone.locator('#commentText').fill('En kommentar fra mobil.');
  await phone.locator('#commentForm button').click();
  await phone.locator('.comment-body').filter({hasText:'En kommentar fra mobil.'}).waitFor();
  await phone.locator('.reply-button').first().click();
  await phone.locator('#commentText').fill('Og et trådet svar.');
  await phone.locator('#commentForm button').click();
  await phone.locator('.comment-replies .comment-body').filter({hasText:'Og et trådet svar.'}).waitFor();
  await phone.screenshot({path:path.join(screenshots,'mobile-comments.png')});
  await phone.locator('.modal-close').click();
  await phone.locator('.create-button').click();
  await phone.locator('input[name=postCategory][value=opinion]').check();
  const longTitle='EtVeldigLangtSammenhengendeOrd'.repeat(5);
  await phone.locator('#postTitle').fill(longTitle);
  await phone.locator('#posterPreview').scrollIntoViewIfNeeded();
  await phone.locator('#posterPreview').screenshot({path:path.join(screenshots,'long-title.png')});
  for(const category of ['question','opinion','story','alert','tip']) {
    await phone.locator('input[name=postCategory][value="'+category+'"]').check();
    const fit=await phone.locator('#posterPreview').evaluate(el=>el.querySelector('.poster-title').offsetHeight<=el.querySelector('.poster-surface').clientHeight*.72);
    assert.ok(fit,'Long titles must fit the '+category+' preset.');
  }
  const placements=await phone.evaluate(title=>{
    const host=document.createElement('div');host.style.width='160px';document.body.append(host);
    const results=['auto','top','center','bottom'].map(text_position=>{
      host.innerHTML=HeremePoster.surface({category:'story',title,text_position});HeremePoster.fitTitles(host);
      const face=host.querySelector('.poster-surface').getBoundingClientRect(),text=host.querySelector('.poster-title').getBoundingClientRect();
      return {text_position,fits:text.top>=face.top&&text.bottom<=face.bottom};
    });host.remove();return results;
  },longTitle);
  assert.ok(placements.every(p=>p.fits),'Desktop placement must also fit narrow mobile tiles: '+JSON.stringify(placements));
  await phone.locator('#postFileInput').setInputFiles(path.join(root,'public/assets/demo/sources/source-01-rain_bus_stop.jpg'));
  await phone.locator('#photoFilename').filter({hasText:'source-01-rain_bus_stop.jpg'}).waitFor();
  assert.equal(await phone.locator('.desktop-crop').isVisible(),false);
  await phone.locator('[data-action=remove-photo]').click();
  await phone.locator('#postTitle').fill('Ei lita meining');
  await phone.screenshot({path:path.join(screenshots,'mobile-create.png')});
  await publish(phone,'Ei lita meining');
  await stop();assert.equal(await start(),base);
  await phone.goto(base+'/?post='+imageId);
  await phone.locator('.comment-replies .comment-body').filter({hasText:'Og et trådet svar.'}).waitFor();
  assert.equal(await phone.locator('.detail-modal .vote-number').textContent(),'-1');
  const persisted=await(await fetch(base+'/api/posts/'+textId)).json();
  assert.equal(persisted.post.category,'question');assert.equal(persisted.post.room_id,null);
  assert.equal((await (await fetch(base+'/api/posts/'+imageId)).json()).post.text_position,'center');
  // Detail-only reporting remains public, while moderation is private operator work.
  await phone.locator('[data-action=report]').click();await phone.locator('#reportForm button').click();
  await phone.locator('.menu-button').click();assert.equal(await phone.locator('[data-action=admin],#adminPin').count(),0);await phone.locator('.modal-close').click();
  assert.equal((await fetch(base+'/api/admin/queue')).status,404);
  await phone.emulateMedia({reducedMotion:'reduce'});
  await phone.locator('[data-post-id="'+textId+'"] .tile-open').click();
  await phone.waitForFunction(()=>getComputedStyle(document.querySelector('.detail-modal')).animationName==='none');
  await phone.keyboard.press('Escape');
  assert.equal(await phone.locator('.modal-panel').count(),0);
  assert.deepEqual(errors,[],'Browser errors');
  await mobile.close();
  console.log(JSON.stringify({desktop:'1440x1000',mobile:'390x844',widths:[350,390,700,900,1280,1700],themes:5,seedPosts:13,createdPosts:3,filters:true,fullScreenDetail:true,reporting:true,persistence:true,screenshots}));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();await stop();fs.rmSync(data,{recursive:true});
});
