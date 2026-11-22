'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {descriptors}=require('../public/chat-render');
const {html,group,safeUrl}=require('../public/avatar');

const t=(key,{count,name,index}={})=>key==='attachment.count'?`${count} files`:key==='attachment.bundle'?`View ${count} files`:key==='attachment.view_all'?`View all ${count}`:key==='attachment.viewer_count'?`${index} / ${count}`:key==='attachment.view'?`View ${name}`:key==='attachment.play'?`Play ${name}`:key;
const message=(id,sender,day='2026-11-22',attachments=[])=>({id,kind:'text',sender_id:sender,sender,created_at:`${day} 10:20:00`,body:'Hi',attachments});

test('sender runs restart on author and day while retaining every message identity',()=>{
  const rows=[message(1,'Kari'),message(2,'Kari'),message(3,'Ola'),message(4,'Kari','2026-11-23')];
  const rendered=descriptors(rows,{me:'Kari',t});
  assert.deepEqual(rendered.map(item=>item.key),['day:2026-11-22','message:1','message:2','message:3','day:2026-11-23','message:4']);
  assert.match(rendered[1].html,/run-start/);
  assert.match(rendered[1].html,/<time datetime="2026-11-22 10:20:00"[^>]*>10:20<\/time>/);
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

test('three consecutive messages remain separate bubbles with one visible sender header',()=>{
  const rows=[message(1,'Kari'),{...message(2,'Kari'),created_at:'2026-11-22 10:21:00'},{...message(3,'Kari'),created_at:'2026-11-22 10:22:00'}];
  const rendered=descriptors(rows,{me:'Ola',t}).filter(item=>item.key.startsWith('message:'));
  assert.equal(rendered.length,3);assert.deepEqual(rendered.map(item=>item.runStart),[true,false,false]);
  assert.equal(rendered.filter(item=>!item.html.includes('message-meta sr-only')).length,1);
});

test('single private media is bare, bundles retain order and escaped names',()=>{
  const expires_at='2026-11-30T00:00:00.000Z';
  const files=[{id:'first',name:'<photo>.jpg',status:'ready',expires_at,media_kind:'image'},{id:'second',name:'clip.mov',status:'ready',expires_at,media_kind:'video'},{id:'third',name:'notes.txt',status:'ready',expires_at,media_kind:'file'}];
  const single=descriptors([{...message(1,'Kari'),body:'',attachments:[files[0]]}],{me:'Kari',t,now:'2026-11-22T00:00:00.000Z'}).at(-1).html;
  assert.match(single,/bare-media/);assert.match(single,/attachment-preview/);assert.doesNotMatch(single,/<photo>/);
  const bundle=descriptors([{...message(2,'Kari'),body:'',attachments:files}],{me:'Kari',t,now:'2026-11-22T00:00:00.000Z'}).at(-1).html;
  assert.match(bundle,/bundle-stack/);assert.match(bundle,/aria-expanded="false"/);assert.match(bundle,/bundle-items/);assert.ok(bundle.indexOf('first')<bundle.indexOf('second'));assert.equal((bundle.match(/stack-layer-\d/g)||[]).length,3);
  const video=descriptors([{...message(3,'Kari'),body:'',attachments:[files[1]]}],{me:'Kari',t,now:'2026-11-22T00:00:00.000Z'}).at(-1).html;
  assert.match(video,/data-video-duration/,'A single video exposes a duration slot populated from media metadata.');
});

test('bundles show at most four preview cells and 5+ opens the complete ordered gallery',()=>{
  const expires_at='2026-11-30T00:00:00.000Z';
  for(const count of [2,4,5,8]){
    const files=Array.from({length:count},(_,index)=>({id:`file-${count}-${index}`,name:`item-${index}.${index%3===0?'jpg':index%3===1?'mp4':'txt'}`,status:'ready',expires_at,media_kind:index%3===0?'image':index%3===1?'video':'file'}));
    const rendered=descriptors([{...message(count,'Kari'),body:'Bundle',attachments:files}],{me:'Kari',t,now:'2026-11-22T00:00:00.000Z'}).at(-1).html;
    assert.match(rendered,new RegExp(`>${count} files<`));
    const realCells=(rendered.match(/class="bundle-item"/g)||[]).length;
    assert.equal(realCells,count<=4?count:3);
    assert.equal((rendered.match(/data-view-message=/g)||[]).length,Math.min(count,4));
    if(count>4){assert.match(rendered,/class="bundle-item bundle-overflow"/);assert.match(rendered,new RegExp(`data-file-id="${files[3].id}"`));assert.ok(rendered.includes(`<b>+${count-3}</b>`));assert.doesNotMatch(rendered,new RegExp(`data-file-id="${files[4].id}"`));}
    else for(const file of files)assert.match(rendered,new RegExp(`data-file-id="${file.id}"`));
  }
});

test('expired attachments render no private preview endpoint',()=>{
  const expired={id:'private-expired',name:'old-photo.jpg',status:'ready',expires_at:'2026-11-21T00:00:00.000Z',media_kind:'image'};
  const rendered=descriptors([{...message(1,'Kari'),body:'',attachments:[expired]}],{me:'Kari',t,now:'2026-11-22T00:00:00.000Z'}).at(-1).html;
  assert.match(rendered,/expired-file/);assert.doesNotMatch(rendered,/\/api\/chat\/files\/private-expired/);
});

test('avatar component accepts only canonical URLs and keeps deterministic initials',()=>{
  assert.equal(safeUrl('https://example.com/x.png'),null);
  assert.match(html({id:'user',name:'Åse',avatar_url:'https://example.com/x.png'}),/Å/);
  assert.equal((group([{name:'A'},{name:'B'},{name:'C'},{name:'D'}]).match(/avatar-initial/g)||[]).length,3);
});
