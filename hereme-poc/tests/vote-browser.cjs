'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'hereme-vote-browser-'));
let server,browser;

async function start() {
  server=spawn(process.execPath,['server/index.js'],{cwd:root,env:{...process.env,HEREME_DATA_DIR:data,PORT:'3307'},stdio:['ignore','pipe','pipe'],windowsHide:true});
  return new Promise((resolve,reject)=>{
    let output='';const timer=setTimeout(()=>reject(Error('Server startup timed out: '+output)),15000);
    server.on('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code+': '+output));});
    for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>{output+=chunk;if(output.includes('http://localhost:3307')){clearTimeout(timer);resolve('http://localhost:3307');}});
  });
}
async function stop(){if(server?.exitCode===null){const done=new Promise(resolve=>server.once('exit',resolve));server.kill();await done;}}

(async()=>{
  const base=await start();browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'nb-NO'});
  await page.goto(base);await page.locator('.post-card .poster-photo').first().waitFor();
  await page.locator('.create-button').click();
  await page.locator('[data-auth-mode=register]').click();
  await page.locator('[data-auth-form=register] input[name=name]').fill('VoteTester');
  await page.locator('[data-auth-form=register] button').click();
  await page.locator('[data-auth-continue]').click();
  await page.locator('.auth-overlay').waitFor({state:'detached'});
  await page.locator('.modal-close').click();

  const card=page.locator('.post-card:has(.poster-photo)').first(),id=await card.getAttribute('data-post-id');
  await card.scrollIntoViewIfNeeded();
  const baseline=await card.evaluate(node=>{window.__voteCard=node;window.__voteMedia=node.querySelector('.poster-photo');return {scrollY,nodeOrder:[...node.parentElement.children].map(item=>item.dataset.postId||'more'),src:window.__voteMedia.currentSrc||window.__voteMedia.src};});
  await page.route(`**/api/posts/${id}/vote`,async route=>{await new Promise(resolve=>setTimeout(resolve,80));await route.continue();});
  await card.locator('.vote-up').click();
  await card.locator('.vote-down').click();
  await card.locator('.vote-down').click();
  await page.waitForFunction(postId=>!document.querySelector(`[data-post-id="${postId}"] .vote-up`).matches('[aria-pressed="true"]')&&!document.querySelector(`[data-post-id="${postId}"] .vote-down`).matches('[aria-pressed="true"]'),id);
  await page.waitForTimeout(300);
  const stable=await card.evaluate((node,baseline)=>({sameCard:node===window.__voteCard,sameMedia:node.querySelector('.poster-photo')===window.__voteMedia,scrollY,order:[...node.parentElement.children].map(item=>item.dataset.postId||'more'),src:window.__voteMedia.currentSrc||window.__voteMedia.src}),baseline);
  assert.equal(stable.sameCard,true);assert.equal(stable.sameMedia,true);assert.equal(stable.src,baseline.src);
  assert.deepEqual(stable.order,baseline.nodeOrder);assert.ok(Math.abs(stable.scrollY-baseline.scrollY)<2);

  const fiveIds=await page.locator('.post-card').evaluateAll(cards=>cards.slice(0,5).map(card=>card.dataset.postId));
  await page.evaluate(ids=>{window.__fiveCards=new Map(ids.map(id=>{const card=document.querySelector(`[data-post-id="${id}"]`);return [id,{card,media:card.querySelector('.poster-photo')}];}));},fiveIds);
  for(const postId of fiveIds)for(let tap=0;tap<4;tap++){
    await Promise.all([
      page.waitForResponse(response=>response.url().endsWith(`/api/posts/${postId}/vote`)&&response.status()===200),
      page.locator(`.post-card[data-post-id="${postId}"] .vote-up`).click()
    ]);
  }
  assert.equal(await page.evaluate(()=>[...window.__fiveCards].every(([postId,ref])=>{const card=document.querySelector(`[data-post-id="${postId}"]`);return card===ref.card&&card.querySelector('.poster-photo')===ref.media;})),true,'20 votes across five posts must retain each card and media node.');

  await page.unroute(`**/api/posts/${id}/vote`);
  const beforeFailure=await card.locator('.vote-number').textContent();
  await page.route(`**/api/posts/${id}/vote`,route=>route.abort('failed'));
  await card.locator('.vote-up').click();
  await page.waitForFunction(({postId,score})=>document.querySelector(`[data-post-id="${postId}"] .vote-number`)?.textContent===score,{postId:id,score:beforeFailure});
  assert.equal(await card.locator('.vote-number').textContent(),beforeFailure);
  assert.equal(await card.locator('.vote-up').getAttribute('aria-pressed'),'false');
  assert.equal(await card.evaluate(node=>node===window.__voteCard&&node.querySelector('.poster-photo')===window.__voteMedia),true);
  console.log(JSON.stringify({mobile:'390x844',votesAcrossFivePosts:20,stableCard:true,stableMedia:true,rapidTaps:true,failureRollback:true}));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();await stop();fs.rmSync(data,{recursive:true,force:true});});
