'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {chromium}=require('playwright');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'hereme-security-browser-'));
process.env.HEREME_DATA_DIR=data;
process.env.HEREME_ENV='test';
process.env.HEREME_DATABASE_START='empty';
const app=require('../server/index');
const S=require('../server/services');

(async()=>{
  const server=await new Promise(resolve=>{const running=app.listen(0,'127.0.0.1',()=>resolve(running));});
  let browser;
  try{
    const origin=`http://127.0.0.1:${server.address().port}`;
    const operator=S.identity.createProfile({name:'BrowserSecurityOperator'});
    S.db.prepare("INSERT INTO user_roles(user_id,role) VALUES(?,'operator')").run(operator.user.id);
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({viewport:{width:390,height:844},userAgent:'<img src=x onerror=window.securityInjected=1>'});
    await context.addCookies([{name:'hereme_session',value:operator.session.raw,url:origin},{name:'hereme_csrf',value:operator.session.csrf,url:origin}]);
    const page=await context.newPage();
    const shared=await context.newPage();
    const post=await S.posts.create({title:'Shared post',body:'Read this post',type:'text',category:'question'},operator.user);
    const sharedPath='/?post='+post.id;
    assert.equal((await shared.goto(origin+sharedPath+'&token=excluded')).status(),200);
    await shared.close();
    await page.goto(origin);
    await page.locator('.menu-button').click();
    await page.locator('[data-action="staff-panel"]').click();
    await page.waitForURL('**/staff');
    await page.reload();
    await page.locator('main .staff-page h1').waitFor();
    assert.equal(await page.locator('[role="dialog"]:visible').count(),0);
    await page.locator('[data-action="staff-tab"][data-tab="security"]').click();
    await page.getByRole('cell',{name:'GET '+S.config.publicOrigin+sharedPath,exact:true}).waitFor();
    await page.locator('[data-action="security-detail"]').first().click();
    await page.locator('.security-raw').waitFor({state:'visible'});
    assert.match(await page.locator('.security-raw').textContent(),/<img src=x onerror=window.securityInjected=1>/);
    assert.equal(await page.evaluate(()=>window.securityInjected),undefined);
    assert.equal(await page.locator('.security-raw img').count(),0);
    assert.ok(S.db.prepare("SELECT 1 FROM audit_events WHERE action='security.event.inspect'").get());
    await page.goBack();
    await page.waitForURL(origin+'/');
    assert.equal(await page.locator('.utility-line').count(),0);
    const sender=S.identity.createProfile({name:'NotificationSender'}).user;
    const chat=S.chat.startDirect(sender,operator.user.id,'Hello','browser-open').chat_id;
    S.chat.decide(operator.user,S.chat.inbox(operator.user).requests[0].id,true);
    S.chat.markRead(operator.user,chat);
    S.chat.send(sender,chat,'First message','browser-first');
    S.chat.send(sender,chat,'Second message','browser-second');
    const observer=await context.newPage();
    await observer.goto(origin);
    await observer.waitForFunction(()=>document.querySelector('#notificationBadge').textContent==='2');
    await page.locator('#notificationButton').click();
    await page.locator('.notification-row.unread').first().click();
    await page.waitForURL('**/chat/**');
    await observer.waitForFunction(()=>document.querySelector('#notificationBadge').hidden);
    await page.goBack();
    await page.waitForFunction(()=>document.querySelector('#notificationBadge')?.textContent==='0');
    const reason='Repeated abuse <b>reported</b>';
    const victim=S.identity.createProfile({name:'RemovedMember'});
    const second=S.identity.issueSession(victim.user.id);
    const createClient=async session=>{
      const client=await browser.newContext({viewport:{width:390,height:844}});
      await client.addCookies([{name:'hereme_session',value:session.raw,url:origin},{name:'hereme_csrf',value:session.csrf,url:origin}]);
      return client.newPage();
    };
    const openWall=await createClient(victim.session),nextVisit=await createClient(second);
    await openWall.goto(origin);
    await openWall.locator('.menu-button').click();
    const logout=openWall.locator('[data-action="logout"]');
    await logout.click({trial:true});
    const deletion=await context.request.delete(origin+'/api/admin/users/'+victim.user.id,{
      headers:{'x-csrf-token':operator.session.csrf},data:{reason,delete_posts:false}
    });
    assert.equal(deletion.status(),200);
    await logout.click();
    await nextVisit.goto(origin+'/chat');
    for(const client of [openWall,nextVisit]){
      const notice=client.locator('#accountDeleted');
      await notice.waitFor();
      assert.ok((await notice.textContent()).includes(victim.user.name));
      assert.ok((await notice.textContent()).includes(reason));
      assert.equal(await notice.locator('b').count(),0);
      await Promise.all([client.waitForNavigation(),notice.getByRole('button').click()]);
      assert.equal((await client.context().cookies()).some(cookie=>cookie.name==='hereme_session'),false);
      await client.context().close();
    }
    await context.close();
    console.log('Shared post URL, security explorer, notification counts and deleted-session browser flows passed.');
  }finally{
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
    S.db.close();
    fs.rmSync(data,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
