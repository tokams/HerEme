'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {descriptors}=require('../public/chat-render');
const {html,group,safeUrl}=require('../public/avatar');

const t=(key,{count,name}={})=>key==='attachment.count'?`${count} files`:key==='attachment.bundle'?`View ${count} files`:key==='attachment.view'?`View ${name}`:key==='attachment.play'?`Play ${name}`:key;
const message=(id,sender,day='2026-11-22',attachments=[])=>({id,kind:'text',sender_id:sender,sender,created_at:`${day} 10:20:00`,body:'Hi',attachments});

test('sender runs restart on author and day while retaining every message identity',()=>{
  const rows=[message(1,'Kari'),message(2,'Kari'),message(3,'Ola'),message(4,'Kari','2026-11-23')];
  const rendered=descriptors(rows,{me:'Kari',t});
  assert.deepEqual(rendered.map(item=>item.key),['day:2026-11-22','message:1','message:2','message:3','day:2026-11-23','message:4']);
  assert.match(rendered[1].html,/run-start/);
  assert.match(rendered[2].html,/run-continuation/);
  assert.match(rendered[2].html,/message-meta sr-only/);
  assert.match(rendered[2].html,/data-message-id="2"/);
  assert.match(rendered[3].html,/run-start/);
  assert.match(rendered[5].html,/run-start/);
});

test('sender runs restart after five minutes but remain grouped at the threshold',()=>{
  const first=message(1,'Kari'),within={...message(2,'Kari'),created_at:'2026-11-22 10:25:00'},after={...message(3,'Kari'),created_at:'2026-11-22 10:30:01'};
  const rendered=descriptors([first,within,after],{me:'Kari',t}).filter(item=>item.key.startsWith('message:'));
  assert.deepEqual(rendered.map(item=>item.runStart),[true,false,true]);
});

test('single private media is bare, bundles retain order and escaped names',()=>{
  const expires_at='2026-11-30T00:00:00.000Z';
  const files=[{id:'first',name:'<photo>.jpg',status:'ready',expires_at,media_kind:'image'},{id:'second',name:'clip.mov',status:'ready',expires_at,media_kind:'video'},{id:'third',name:'notes.txt',status:'ready',expires_at,media_kind:'file'}];
  const single=descriptors([{...message(1,'Kari'),body:'',attachments:[files[0]]}],{me:'Kari',t,now:'2026-11-22T00:00:00.000Z'}).at(-1).html;
  assert.match(single,/bare-media/);assert.match(single,/attachment-preview/);assert.doesNotMatch(single,/<photo>/);
  const bundle=descriptors([{...message(2,'Kari'),body:'',attachments:files}],{me:'Kari',t,now:'2026-11-22T00:00:00.000Z'}).at(-1).html;
  assert.match(bundle,/bundle-stack/);assert.match(bundle,/aria-expanded="false"/);assert.match(bundle,/bundle-items/);assert.ok(bundle.indexOf('first')<bundle.indexOf('second'));assert.equal((bundle.match(/stack-layer-\d/g)||[]).length,3);
});

test('avatar component accepts only canonical URLs and keeps deterministic initials',()=>{
  assert.equal(safeUrl('https://example.com/x.png'),null);
  assert.match(html({id:'user',name:'Åse',avatar_url:'https://example.com/x.png'}),/Å/);
  assert.equal((group([{name:'A'},{name:'B'},{name:'C'},{name:'D'}]).match(/avatar-initial/g)||[]).length,3);
});
