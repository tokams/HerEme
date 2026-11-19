'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {cropRect,surface}=require('../public/poster');
const {card,filters}=require('../public/feed');
const {themes}=require('../public/themes');
test('poster crop always covers the output at every supported aspect and pan extreme',()=>{
  for(const [iw,ih] of [[1200,800],[800,1200],[900,900]])for(const [w,h] of [[800,1000],[900,900],[1200,800]])for(const x of [0,50,100])for(const y of [0,50,100])for(const zoom of [1,2,3]){
    const crop=cropRect(iw,ih,w,h,zoom,x,y);
    assert.ok(crop.x<=0&&crop.y<=0);assert.ok(crop.x+crop.width>=w-.001&&crop.y+crop.height>=h-.001);
  }
  assert.throws(()=>cropRect(0,800,800,1000),/Invalid/);
});
test('five themes share tile anatomy, accessible votes and category filters without room/report controls',()=>{
  assert.deepEqual(themes.map(t=>t.id),['question','opinion','story','alert','tip']);
  for(const theme of themes)for(const type of ['text','link','image','poster']){
    const p={id:1,category:theme.id,type,title:'<script>bad</script>',created_at:'2026-11-18 12:00:00',
      score:3,my_vote:0,comment_count:2,image_url:['image','poster'].includes(type)?'/assets/demo/posts/poster-01-rain_bus_stop.jpg':null,synthetic_demo:true};
    const html=card(p);
    for(const part of ['tile-header','poster-surface','tile-actions'])assert.match(html,new RegExp(part));
    assert.ok(!html.includes('<script>bad</script>'));
    assert.match(html,/Syntetisk demo/);assert.match(html,/aria-label="Stem opp"/);
    assert.doesNotMatch(html,/data-action="(room|report|share)"/);
    if(type==='poster')assert.match(html,/original-poster/);
    if(type==='text')assert.match(html,/without-image/);
  }
  assert.equal((filters(['question','alert']).match(/checked/g)||[]).length,2);
  assert.throws(()=>surface({category:'unknown'}),/Unknown/);
});
