'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {once} = require('node:events');
const {chromium} = require('playwright');

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'hereme-mobile-wall-'));
process.env.HEREME_DATA_DIR = data;
process.env.HEREME_ENV = 'test';
const app = require('../server/index');
const services = require('../server/services');

async function seedWall() {
  const {user} = services.identity.createProfile({name:'RowReader'});
  const formats = ['poster','article','poster','article', ...Array(18).fill('poster'), 'article','poster','poster'];
  const setRank = services.db.prepare("UPDATE posts SET created_at=datetime('now', ?), base_score=? WHERE id=?");
  for (const [index, format] of formats.entries()) {
    const title = 'Rowcheck ' + index;
    const post = format === 'article'
      ? services.articles.create({title, category:'story', abstract:'Community article', chapters:[{heading:'News', markdown:title}]}, user)
      : await services.posts.create({format, type:'text', category:'story', body:title}, user);
    setRank.run('-' + index + ' hours', index % 4, post.id);
  }
}

async function checkMobile(page, ranked) {
  const rows = new Map();
  const cards = await page.locator('#feed > .post-card').evaluateAll(items => items.map(item => {
    const {x,y,width,height} = item.getBoundingClientRect();
    return {id:Number(item.dataset.postId), x,y,width,height, article:item.classList.contains('article-card')};
  }));
  const {width} = await page.locator('#feed').boundingBox();
  for (const card of cards) {
    assert.ok(Math.abs(card.width - (card.article ? width : (width - 10) / 2)) < 1, 'Original card width');
    if (!rows.has(card.y)) rows.set(card.y, []);
    rows.get(card.y).push(card);
  }
  for (const format of ['article','poster']) {
    assert.deepEqual(cards.filter(c => c.article === (format === 'article')).map(c => c.id),
      ranked.filter(p => p.content_format === format).map(p => p.id));
  }
  const groups = [...rows.values()];
  let lastRank = -1;
  for (const [index, row] of groups.entries()) {
    const [first, second] = row;
    if (first.article) assert.equal(row.length, 1);
    else if (second) {
      assert.equal(row.length, 2);
      assert.equal(second.article, false);
      assert.ok(Math.abs(second.x - first.x - first.width - 2) < 1, '2px horizontal gap');
      assert.ok(Math.abs(first.height - second.height) < 1, 'Even bottom edges');
    } else assert.equal(index, groups.length - 1, 'Only the last row may contain a lone poster');
    if (index) {
      const prior = groups[index - 1][0];
      assert.ok(Math.abs(first.y - prior.y - prior.height - 2) < 1, '2px vertical gap');
    }
    if (first.article || second) {
      const rank = ranked.findIndex(post => post.id === row.at(-1).id);
      assert.ok(rank > lastRank, 'Completed poster pairs stay ahead of lower-ranked articles');
      lastRank = rank;
    }
  }
}

(async () => {
  let server, browser;
  try {
    await seedWall();
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch();
    const page = await browser.newPage({viewport:{width:1280,height:844}});
    await page.goto(base);
    await page.locator('.post-card').first().waitFor();
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/posts?') && new URL(r.url()).searchParams.get('q') === 'Rowcheck'),
      page.locator('#searchInput').fill('Rowcheck')
    ]);
    const settled = () => page.locator('#feed[aria-busy=false]').waitFor();
    await settled();
    for (const [sort, width] of [['new',320], ['top',390], ['hot',760]]) {
      await page.setViewportSize({width,height:844});
      if (await page.locator('#filterToggle').getAttribute('aria-expanded') === 'false') await page.locator('#filterToggle').click();
      await page.locator('#sortSelect').selectOption(sort);
      await settled();
      const ranked = await page.request.get(base + '/api/posts?q=Rowcheck&sort=' + sort + '&limit=50').then(r => r.json());
      await checkMobile(page, ranked.posts.slice(0,24));
      await page.locator('.load-more').click();
      await page.waitForFunction(() => document.querySelectorAll('#feed .post-card').length === 25);
      await checkMobile(page, ranked.posts);
      assert.equal(await page.locator('#feedCounter').textContent(), '25');
      assert.equal(await page.locator('.load-more').count(), 0);
      await page.setViewportSize({width:1280,height:844});
      await page.locator('.masthead #sortSelect').waitFor();
      const ids = await page.locator('#feed > .post-card').evaluateAll(cards => cards.map(c => Number(c.dataset.postId)));
      assert.deepEqual(ids, ranked.posts.map(p => p.id), 'Desktop restores the selected ranking');
    }
    console.log('Mobile wall widths, spacing, row order, all three sorts, pagination and desktop order passed.');
  } finally {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
    services.db.close();
    fs.rmSync(data,{recursive:true,force:true});
  }
})().catch(error => {console.error(error); process.exitCode=1;});
