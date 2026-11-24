'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {once} = require('node:events');
const {chromium} = require('playwright');
const {createPanel} = require('../server/platform');
const {openRegistry} = require('../server/platform/operator');

async function checkMark(page, selector, instance) {
  const mark = page.locator(selector + ' hereme-wordmark').first();
  await mark.waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await mark.locator('em').innerText(), '.');
  const label = mark.locator('small');
  if (!instance) {
    assert.equal(await label.count(), 0);
    return;
  }
  assert.equal(await label.innerText(), instance);
  assert.ok(await label.evaluate(el => el.scrollWidth <= el.clientWidth), 'Instance name is clipped: ' + instance);
  const box = await mark.boundingBox(), sub = await label.boundingBox();
  assert.ok(sub.y > box.y + box.height / 2 && sub.y + sub.height <= box.y + box.height);
  assert.ok(box.x >= 0 && box.x + box.width <= page.viewportSize().width);
}

async function run() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hereme-wordmark-'));
  process.env.HEREME_DATA_DIR = dir;
  process.env.HEREME_ENV = 'test';
  const app = require('../server');
  const registry = openRegistry(':memory:');
  const community = http.createServer(app), panel = http.createServer();
  let browser;
  try {
    for (const server of [community, panel]) {
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
    }
    const site = name => 'http://' + name + ':' + community.address().port;
    const admin = 'http://admin.hereme.no:' + panel.address().port;
    panel.on('request', createPanel({registry, sites: [], origin: admin}));
    browser = await chromium.launch({args: ['--no-proxy-server',
      '--host-resolver-rules=MAP hereme.no 127.0.0.1, MAP *.hereme.no 127.0.0.1']});
    const page = await browser.newPage();
    const communityUrl = site('tanteulrikkesvei.hereme.no');
    for (const width of [320, 375, 700, 1280]) {
      await page.setViewportSize({width, height: 844});
      await page.goto(site('hereme.no'));
      await checkMark(page, '.logo', '');
      const dimensions = () => page.evaluate(() => ['.logo', '.masthead-inner'].map(selector => {
        const {width, height} = document.querySelector(selector).getBoundingClientRect();
        return [width, height];
      }));
      const original = await dimensions();
      await page.goto(communityUrl);
      await checkMark(page, '.logo', 'tanteulrikkesvei');
      assert.deepEqual(await dimensions(), original, 'Community label moved the header at ' + width);
      await page.goto(admin);
      await checkMark(page, 'header', 'admin');
      assert.ok(await page.locator('#login').isVisible());
    }
    await page.setViewportSize({width: 320, height: 740});
    for (const route of ['/privacy.html', '/rules.html', '/security.html']) {
      await page.goto(communityUrl + route);
      await checkMark(page, '.policy-home', 'tanteulrikkesvei');
    }
    await page.goto(communityUrl);
    await page.locator('.post-card .tile-open').first().click();
    await checkMark(page, '.detail-toolbar', 'tanteulrikkesvei');
    await page.locator('.detail-toolbar .modal-close').click();
    await page.locator('.menu-button').click();
    await checkMark(page, '.modal-header', 'tanteulrikkesvei');
    await page.locator('[data-action="auth-login"]').click();
    await checkMark(page, '.auth-dialog', 'tanteulrikkesvei');
    const status = await page.evaluate(async () => (await fetch('/api/session', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: 'WordmarkReader'})
    })).status);
    assert.equal(status, 201);
    await page.goto(communityUrl + '/chat');
    await checkMark(page, '.inbox-header', 'tanteulrikkesvei');
    const peer = await fetch('http://127.0.0.1:' + community.address().port + '/api/session', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: 'WordmarkPeer'})
    });
    assert.equal(peer.status, 201);
    await page.goto(communityUrl + '/chat?user=' + (await peer.json()).user.id);
    await checkMark(page, '.conversation-header', 'tanteulrikkesvei');
    await page.setViewportSize({width: 1280, height: 844});
    await checkMark(page, '.inbox-header', 'tanteulrikkesvei');
    assert.equal(await page.locator('.chat-shell hereme-wordmark:visible').count(), 1);
    await page.setViewportSize({width: 320, height: 740});
    await page.goto(site('new-community.hereme.no') + '/rules.html');
    await checkMark(page, '.policy-home', 'new-community');
    console.log('Wordmark labels, responsive header dimensions and shared panel assets passed.');
  } finally {
    await browser?.close();
    for (const server of [community, panel]) {
      if (server.listening) await new Promise(resolve => server.close(resolve));
    }
    registry.close();
    require('../server/services').db.close();
    fs.rmSync(dir, {recursive: true, force: true});
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
