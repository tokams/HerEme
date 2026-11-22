'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const view=require('../public/article-view'),markdown=require('../public/article-markdown');
const id='123e4567-e89b-42d3-a456-426614174000';
test('article preview and reader share safe image/video media markup',()=>{
  const image=view.mediaButton({kind:'image',url:`/media/${id}/display.jpg`},'Chapter image',{preview:true});
  const video=view.mediaButton({kind:'video',url:`/media/${id}/display.mp4`,thumbnail_url:`/media/${id}/thumbnail.jpg`},'Chapter video',{preview:true});
  assert.match(image,/<img /);assert.match(image,/data-action="article-media"/);
  assert.match(video,/<video /);assert.match(video,/poster="\/media\//);
  assert.equal(view.safeMediaUrl('https://other.example/image.jpg',{preview:true}),'');
  assert.doesNotMatch(view.mediaButton({kind:'image',url:'javascript:alert(1)'},'bad',{preview:true}),/javascript:/);
  assert.match(markdown.render('A **good** walk <script>alert(1)</script>'),/<strong>good<\/strong>/);
  assert.doesNotMatch(markdown.render('<script>alert(1)</script>'),/<script>/);
});
