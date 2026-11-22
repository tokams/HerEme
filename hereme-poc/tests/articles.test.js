'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),sharp=require('sharp');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'hereme-articles-'));process.env.HEREME_DATA_DIR=root;process.env.HEREME_ENV='test';
const app=require('../server/index'),S=require('../server/services');let server,base;
test.before(async()=>{server=await new Promise(resolve=>{const value=app.listen(0,'127.0.0.1',()=>resolve(value));});base=`http://127.0.0.1:${server.address().port}`;});
test.after(async()=>{await new Promise(resolve=>server.close(resolve));S.db.close();fs.rmSync(root,{recursive:true,force:true});});
async function account(name){const result=S.identity.createProfile({name});return {id:result.user.id,csrf:result.session.csrf,cookie:`hereme_session=${encodeURIComponent(result.session.raw)}; hereme_csrf=${encodeURIComponent(result.session.csrf)}`};}
async function request(route,{method='GET',user,body,form}={}){const headers={};if(user){headers.cookie=user.cookie;if(method!=='GET')headers['x-csrf-token']=user.csrf;}if(body!==undefined)headers['content-type']='application/json';const response=await fetch(base+route,{method,headers,body:form||(body===undefined?undefined:JSON.stringify(body))});return {status:response.status,data:await response.json()};}
test('articles preserve canonical post interactions and sanitize chapter Markdown',async()=>{
  const owner=await account('ArticleOwner'),other=await account('ArticleOther');
  const image=await sharp({create:{width:24,height:16,channels:3,background:'#4b694e'}}).png().toBuffer(),form=new FormData();form.set('image',new Blob([image],{type:'image/png'}),'cover.png');
  const uploaded=await request('/api/article-assets/images',{method:'POST',user:owner,form});assert.equal(uploaded.status,201);
  assert.equal((await request('/api/article-assets/'+uploaded.data.media_id,{user:owner})).data.url,uploaded.data.url);
  assert.equal((await request('/api/article-assets/'+uploaded.data.media_id,{user:other})).status,404);
  assert.equal((await fetch(base+uploaded.data.url)).status,404);
  assert.equal((await fetch(base+uploaded.data.url,{headers:{cookie:owner.cookie}})).status,200);
  const mediaId=uploaded.data.media_id,chapter={heading:'The first trail',markdown:'A **good** walk with [directions](https://example.test) and <script>alert(1)</script>.',media_id:null};
  const input={title:'Local walks',abstract:'A short guide to nearby walks.',category:'story',cover_media_id:mediaId,chapters:[chapter]};
  assert.equal((await request('/api/articles',{method:'POST',user:other,body:input})).status,409);
  const created=await request('/api/articles',{method:'POST',user:owner,body:input});assert.equal(created.status,201);
  const id=created.data.id,post=(await request(`/api/posts/${id}`)).data.post;
  assert.equal((await fetch(base+uploaded.data.url)).status,200);
  assert.equal(post.content_format,'article');assert.equal(post.article.cover.id,mediaId);assert.equal(post.article.chapters.length,1);
  assert.match(post.article.markdown_source,/^---\ntitle: "Local walks"/);
  assert.match(post.article.chapters[0].body_html,/<strong>good<\/strong>/);
  assert.doesNotMatch(post.article.chapters[0].body_html,/<script>/);
  assert.equal((await request('/api/posts?categories=story')).data.posts.find(item=>item.id===id).content_format,'article');
  assert.equal((await request(`/api/posts/${id}/vote`,{method:'POST',user:other,body:{value:1}})).status,200);
  assert.equal((await request(`/api/posts/${id}/comments`,{method:'POST',user:other,body:{body:'Useful guide'}})).status,201);
  assert.equal((await request(`/api/posts/${id}`)).data.post.comment_count,1);
  assert.equal(S.db.prepare('SELECT post_id FROM article_assets WHERE media_id=?').get(mediaId).post_id,id);
  assert.equal(S.db.prepare('PRAGMA foreign_key_check').all().length,0);
});
test('new posters need no separate title and retain one full text source',async()=>{
  const owner=await account('PosterOnly');const result=await request('/api/posts',{method:'POST',user:owner,form:(()=>{const form=new FormData();for(const [key,value] of Object.entries({format:'poster',type:'text',category:'opinion',body:'Five opening words belong here, followed by the rest of the post.'}))form.set(key,value);return form;})()});
  assert.equal(result.status,201);const post=(await request(`/api/posts/${result.data.id}`)).data.post;
  assert.equal(post.poster_text,'Five opening words belong here, followed by the rest of the post.');
  assert.equal(post.content_format,'poster');assert.equal(S.db.prepare('SELECT text FROM poster_content WHERE post_id=?').get(post.id).text,post.poster_text);
});
