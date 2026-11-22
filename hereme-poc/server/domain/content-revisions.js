'use strict';
const crypto=require('node:crypto');
const {fail}=require('./errors');
const V=require('./validation');
const {nextId}=require('../migrations');
const {insertDesign}=require('../post-design');

const hash=source=>crypto.createHash('sha256').update(source).digest('hex');
const postId=value=>V.integer(value,{name:'Innleggs-ID'});
const version=value=>V.integer(value,{name:'Versjon'});
function insertRevision(db,{id,format,editor,snapshot,summary='',origin='edit',expected=0,mediaIds=[],visibility='public'}){
  const current=db.prepare('SELECT COALESCE(MAX(version),0) version FROM content_revisions WHERE post_id=?').get(id).version;
  if(current!==expected)fail('STALE_VERSION','Innholdet er endret. Last inn gjeldende versjon og sammenlign.',409);
  const next=current+1,source=JSON.stringify(snapshot);
  db.prepare('INSERT INTO content_revisions(post_id,version,format,editor_user_id,snapshot,content_hash,change_summary,origin,visibility) VALUES(?,?,?,?,?,?,?,?,?)').run(id,next,format,editor,source,hash(source),summary,origin,visibility);
  for(const mediaId of mediaIds)db.prepare('INSERT INTO content_media_references(post_id,version,media_id) VALUES(?,?,?)').run(id,next,mediaId);
  db.prepare('INSERT INTO content_git_outbox(post_id,version) VALUES(?,?)').run(id,next);
  return next;
}
function createContentRevisionService(db,{articles,audit}={}){
  const requireOwner=(id,user,format)=>{
    const post=db.prepare(`SELECT p.id,p.author_id,p.status,p.title,p.body,p.type,p.link_url,p.image_url,p.created_at,
      d.category,pc.text poster_text,a.post_id article_id FROM posts p LEFT JOIN post_design d ON d.post_id=p.id
      LEFT JOIN poster_content pc ON pc.post_id=p.id LEFT JOIN articles a ON a.post_id=p.id WHERE p.id=?`).get(id);
    if(!post||post.status!=='published'||(format==='article')!==Boolean(post.article_id))fail('POST_NOT_FOUND','Innlegget finnes ikke.',404);
    if(post.author_id!==user.id&&!user.capabilities?.includes('content:manage'))fail('POST_NOT_FOUND','Innlegget finnes ikke.',404);
    return post;
  };
  const currentVersion=id=>db.prepare('SELECT COALESCE(MAX(version),0) version FROM content_revisions WHERE post_id=?').get(id).version;
  const draftInput=input=>{
    if(!input||typeof input!=='object'||Array.isArray(input))fail('INVALID_DRAFT','Ugyldig utkast.',400);
    const chapters=Array.isArray(input.chapters)?input.chapters:[];
    if(chapters.length>24)fail('INVALID_CHAPTERS','For mange kapitler.',400);
    const bounded=(value,max)=>{if(typeof value!=='string'||value.length>max)fail('INVALID_DRAFT','Ugyldig utkast.',400);return value;};
    return {title:bounded(input.title||'',160),abstract:bounded(input.abstract||'',500),category:V.enumValue(input.category,['question','opinion','story','alert','tip'],'Kategori'),cover_media_id:input.cover_media_id||null,chapters:chapters.map(c=>({heading:bounded(c.heading||'',120),markdown:bounded(c.markdown||'',20000),alt:bounded(c.alt||'',200),media_id:c.media_id||null}))};
  };
  function validateDraftMedia(content,user,post=null){
    const ids=[content.cover_media_id,...content.chapters.map(c=>c.media_id)].filter(Boolean);
    if(new Set(ids).size!==ids.length)fail('DUPLICATE_ARTICLE_MEDIA','Vedlegg kan bare brukes én gang.',400);
    for(const id of ids){const row=db.prepare('SELECT m.status FROM article_assets a JOIN media m ON m.id=a.media_id WHERE a.media_id=? AND ((a.owner_id=? AND a.post_id IS NULL) OR a.post_id=?)').get(id,user.id,post);if(row?.status!=='ready')fail('ARTICLE_MEDIA_NOT_READY','Vedlegget er ikke klart.',409);}
  }
  function listDrafts(user){return {drafts:db.prepare('SELECT id,post_id,base_version,edit_counter,updated_at,content_json FROM article_working_copies WHERE owner_id=? ORDER BY updated_at DESC LIMIT 100').all(user.id).map(row=>({...row,content:JSON.parse(row.content_json)}))};}
  function getDraft(id,user){const row=db.prepare('SELECT * FROM article_working_copies WHERE id=? AND owner_id=?').get(id,user.id);if(!row)fail('DRAFT_NOT_FOUND','Utkastet finnes ikke.',404);return {...row,content:JSON.parse(row.content_json)};}
  function createDraft(input,user){const content=draftInput(input);validateDraftMedia(content,user);const id=input.draft_id||crypto.randomUUID();if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))fail('INVALID_DRAFT','Ugyldig utkast-ID.',400);const value=JSON.stringify(content);db.prepare('INSERT OR IGNORE INTO article_working_copies(id,owner_id,content_json) VALUES(?,?,?)').run(id,user.id,value);const row=getDraft(id,user);if(row.content_json!==value)fail('STALE_DRAFT','Utkastet er endret i en annen fane.',409);return row;}
  function saveDraft(id,input,user){const previous=getDraft(id,user);if(Number(input.edit_counter)!==previous.edit_counter)fail('STALE_DRAFT','Utkastet er endret i en annen fane.',409);const content=draftInput(input);validateDraftMedia(content,user,previous.post_id);const changed=db.prepare("UPDATE article_working_copies SET content_json=?,edit_counter=edit_counter+1,updated_at=datetime('now') WHERE id=? AND owner_id=? AND edit_counter=?").run(JSON.stringify(content),id,user.id,previous.edit_counter);if(changed.changes!==1)fail('STALE_DRAFT','Utkastet er endret i en annen fane.',409);return getDraft(id,user);}
  function deleteDraft(id,user){getDraft(id,user);db.prepare('DELETE FROM article_working_copies WHERE id=? AND owner_id=?').run(id,user.id);return {ok:true};}
  function startEdit(id,user){id=postId(id);requireOwner(id,user,'article');const existing=db.prepare('SELECT id FROM article_working_copies WHERE post_id=? AND owner_id=?').get(id,user.id);if(existing)return getDraft(existing.id,user);
    const a=db.prepare('SELECT abstract,chapters_json,cover_media_id FROM articles WHERE post_id=?').get(id),p=db.prepare('SELECT title FROM posts WHERE id=?').get(id),d=db.prepare('SELECT category FROM post_design WHERE post_id=?').get(id);
    const content={title:p.title,abstract:a.abstract,category:d.category,cover_media_id:a.cover_media_id,chapters:JSON.parse(a.chapters_json)};
    const draftId=crypto.randomUUID();db.prepare('INSERT OR IGNORE INTO article_working_copies(id,post_id,owner_id,base_version,content_json) VALUES(?,?,?,?,?)').run(draftId,id,user.id,currentVersion(id),JSON.stringify(content));return getDraft(db.prepare('SELECT id FROM article_working_copies WHERE post_id=? AND owner_id=?').get(id,user.id).id,user);
  }
  function publishDraft(id,user,key,summary=''){
    key=V.text(key,{name:'Forespørselsnøkkel',min:8,max:100});summary=V.optionalText(summary,{name:'Endringsbeskrivelse',max:300});
    db.exec('BEGIN IMMEDIATE');try{
      const existing=db.prepare('SELECT post_id,version FROM content_publish_requests WHERE actor_id=? AND request_key=?').get(user.id,key);if(existing){db.exec('COMMIT');return existing;}
      const draft=getDraft(id,user),content=draft.content;
      if(draft.post_id)requireOwner(draft.post_id,user,'article');
      const article=articles.validate(content,user,draft.post_id),cover=article.coverId?article.assets.get(article.coverId):null;
      const coverUrl=cover?'/'+(cover.thumbnail_path||cover.display_path).replaceAll('\\','/'):null;
      let post=draft.post_id,expected=draft.base_version,origin='edit';
      if(post){if(currentVersion(post)!==expected)fail('STALE_VERSION','Artikkelen er endret siden utkastet ble startet.',409);
        db.prepare('UPDATE posts SET title=?,body=?,image_url=? WHERE id=?').run(article.title,article.abstract,coverUrl,post);
        db.prepare('UPDATE post_design SET category=? WHERE post_id=?').run(article.design.category,post);
        db.prepare("UPDATE articles SET abstract=?,markdown_source=?,chapters_json=?,cover_media_id=?,updated_at=datetime('now') WHERE post_id=?").run(article.abstract,article.markdown_source,JSON.stringify(article.chapters),article.coverId,post);
      }else{
        const row=db.prepare("INSERT INTO posts(id,room_id,author_id,title,body,type,image_url,base_score) VALUES(?,NULL,?,?,?,'text',?,0)").run(nextId(db,'posts'),user.id,article.title,article.abstract,coverUrl);post=Number(row.lastInsertRowid);expected=0;origin='publish';
        insertDesign(db,post,article.design);db.prepare('INSERT INTO votes(post_id,user_id,value) VALUES(?,?,1)').run(post,user.id);
        db.prepare('INSERT INTO articles(post_id,abstract,markdown_source,chapters_json,cover_media_id) VALUES(?,?,?,?,?)').run(post,article.abstract,article.markdown_source,JSON.stringify(article.chapters),article.coverId);
      }
      for(const mediaId of article.ids)db.prepare('UPDATE article_assets SET post_id=? WHERE media_id=? AND owner_id=? AND post_id IS NULL').run(post,mediaId,user.id);
      const snapshot={format:'article',title:article.title,abstract:article.abstract,category:article.design.category,cover_media_id:article.coverId,chapters:article.chapters,markdown_source:article.markdown_source};
      const published=insertRevision(db,{id:post,format:'article',editor:user.id,snapshot,summary,origin,expected,mediaIds:article.ids});
      db.prepare('INSERT INTO content_publish_requests(actor_id,request_key,post_id,version) VALUES(?,?,?,?)').run(user.id,key,post,published);
      db.prepare('DELETE FROM article_working_copies WHERE id=?').run(id);
      audit?.record({actorId:user.id,action:'article.revision.published',subjectType:'post',subjectId:post,next:{version:published,summary}});
      db.exec('COMMIT');return {post_id:post,version:published};
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  function editPoster(id,input,user){id=postId(id);const post=requireOwner(id,user,'poster');
    const keys=Object.keys(input||{});if(keys.some(key=>!['text','base_version','request_key','change_summary'].includes(key)))fail('POSTER_TEXT_ONLY','Bare tekst kan endres.',400);
    const key=V.text(input.request_key,{name:'Forespørselsnøkkel',min:8,max:100});
    const text=V.text(input.text,{name:'Plakattekst',min:3,max:3000}),base=version(input.base_version),summary=V.optionalText(input.change_summary,{name:'Endringsbeskrivelse',max:300});
    db.exec('BEGIN IMMEDIATE');try{
      const prior=db.prepare('SELECT post_id,version FROM content_publish_requests WHERE actor_id=? AND request_key=?').get(user.id,key);if(prior){db.exec('COMMIT');return prior;}
      if(currentVersion(id)!==base)fail('STALE_VERSION','Innlegget er endret siden du åpnet det.',409);
      const title=post.poster_text!==null?text.slice(0,160):post.title;
      db.prepare('UPDATE posts SET title=?,body=? WHERE id=?').run(title,post.poster_text!==null?text:post.body,id);
      db.prepare('INSERT INTO poster_content(post_id,text) VALUES(?,?) ON CONFLICT(post_id) DO UPDATE SET text=excluded.text').run(id,text);
      const snapshot={format:'poster',text,title,body:post.poster_text!==null?text:post.body,category:post.category,type:post.type,link_url:post.link_url,image_url:post.image_url};
      const refs=db.prepare('SELECT media_id FROM post_media WHERE post_id=?').all(id).map(r=>r.media_id);
      const published=insertRevision(db,{id,format:'poster',editor:user.id,snapshot,summary,expected:base,mediaIds:refs});
      db.prepare('INSERT INTO content_publish_requests(actor_id,request_key,post_id,version) VALUES(?,?,?,?)').run(user.id,key,id,published);
      audit?.record({actorId:user.id,action:'poster.revision.published',subjectType:'post',subjectId:id,next:{version:published,summary}});db.exec('COMMIT');return {post_id:id,version:published};
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  function publicPost(id){const row=db.prepare("SELECT id FROM posts WHERE id=? AND status='published'").get(postId(id));if(!row)fail('POST_NOT_FOUND','Innlegget finnes ikke.',404);return row;}
  function list(id,{limit=50,offset=0}={}){publicPost(id);limit=V.integer(limit,{name:'Grense',min:1,max:50});offset=V.integer(offset,{name:'Sideforskyvning',min:0,max:100000});
    return {revisions:db.prepare(`SELECT r.version,r.format,r.change_summary,r.created_at,r.origin,r.visibility,
      CASE WHEN u.status='active' THEN u.name ELSE NULL END editor
      FROM content_revisions r LEFT JOIN users u ON u.id=r.editor_user_id WHERE r.post_id=? ORDER BY r.version DESC LIMIT ? OFFSET ?`).all(id,limit,offset).map(r=>r.visibility==='public'?r:{version:r.version,visibility:'unavailable'}),total:db.prepare('SELECT count(*) n FROM content_revisions WHERE post_id=?').get(id).n};
  }
  function get(id,v){publicPost(id);const row=db.prepare("SELECT version,format,snapshot,change_summary,created_at FROM content_revisions WHERE post_id=? AND version=? AND visibility='public'").get(id,version(v));if(!row)fail('REVISION_NOT_FOUND','Versjonen er ikke tilgjengelig.',404);const assets=db.prepare('SELECT m.id,m.kind,m.display_path,m.thumbnail_path FROM content_media_references r JOIN media m ON m.id=r.media_id WHERE r.post_id=? AND r.version=?').all(id,v).map(asset=>({media_id:asset.id,kind:asset.kind,url:asset.display_path?'/'+asset.display_path.replaceAll('\\','/'):null,thumbnail_url:asset.thumbnail_path?'/'+asset.thumbnail_path.replaceAll('\\','/'):null}));return {...row,content:JSON.parse(row.snapshot),assets};}
  function inspect(id,v,user,reason){if(!user.capabilities?.includes('moderate'))fail('FORBIDDEN','Ingen tilgang.',403);id=postId(id);v=version(v);reason=V.text(reason,{name:'Begrunnelse',min:3,max:300});const row=db.prepare("SELECT version,format,snapshot,change_summary,created_at,visibility FROM content_revisions WHERE post_id=? AND version=? AND visibility!='erased'").get(id,v);if(!row)fail('REVISION_NOT_FOUND','Versjonen er ikke tilgjengelig.',404);audit?.record({actorId:user.id,action:'revision.inspected',subjectType:'post',subjectId:id,next:{version:v,visibility:row.visibility},reason});return {...row,content:JSON.parse(row.snapshot)};}
  function diff(id,from,to){
    const a=get(id,from),b=get(id,to);
    const lines=content=>content.format==='poster'?[`Category: ${content.category}`,`Media: ${content.image_url||'none'}`,...content.text.replace(/\r\n?/g,'\n').split('\n')]:[
      `Category: ${content.category}`,`Title: ${content.title}`,`Abstract: ${content.abstract}`,`Cover: ${content.cover_media_id||'none'}`,
      ...content.chapters.flatMap((chapter,index)=>[`Chapter ${index+1}: ${chapter.heading}`,`Media: ${chapter.media_id||'none'} · ${chapter.alt||''}`,...chapter.markdown.replace(/\r\n?/g,'\n').split('\n')])];
    const old=lines(a.content),next=lines(b.content);
    if(old.length>1000||next.length>1000||old.join('').length+next.join('').length>150000)fail('DIFF_TOO_LARGE','Sammenligningen er for stor.',413);
    const width=next.length+1,table=new Uint16Array((old.length+1)*width);
    for(let i=old.length-1;i>=0;i--)for(let j=next.length-1;j>=0;j--)table[i*width+j]=old[i]===next[j]?table[(i+1)*width+j+1]+1:Math.max(table[(i+1)*width+j],table[i*width+j+1]);
    const result=[];let i=0,j=0;
    while(i<old.length||j<next.length){
      if(i<old.length&&j<next.length&&old[i]===next[j]){result.push({kind:'context',text:old[i]});i++;j++;}
      else if(i<old.length&&(j===next.length||table[(i+1)*width+j]>=table[i*width+j+1]))result.push({kind:'removed',text:old[i++]});
      else result.push({kind:'added',text:next[j++]});
    }
    return {from:a.version,to:b.version,lines:result};
  }
  function hide(id,v,user,reason){if(!user.capabilities?.includes('moderate'))fail('FORBIDDEN','Ingen tilgang.',403);id=postId(id);v=version(v);reason=V.text(reason,{name:'Begrunnelse',min:3,max:300});const row=db.prepare('SELECT visibility FROM content_revisions WHERE post_id=? AND version=?').get(id,v),post=db.prepare('SELECT status FROM posts WHERE id=?').get(id);if(!row||!post)fail('REVISION_NOT_FOUND','Versjonen finnes ikke.',404);if(v===currentVersion(id)&&post.status==='published')fail('HIDE_CURRENT_POST','Skjul innlegget før gjeldende versjon skjules.',409);db.prepare("UPDATE content_revisions SET visibility='hidden' WHERE post_id=? AND version=?").run(id,v);audit?.record({actorId:user.id,action:'revision.hidden',subjectType:'post',subjectId:id,previous:row,next:{version:v,visibility:'hidden'},reason});return {ok:true};}
  function erase(id,v,user,reason){
    if(!user.capabilities?.includes('content:manage'))fail('FORBIDDEN','Ingen tilgang.',403);
    id=postId(id);v=version(v);reason=V.text(reason,{name:'Begrunnelse',min:3,max:300});
    db.exec('BEGIN IMMEDIATE');try{
      const row=db.prepare('SELECT visibility FROM content_revisions WHERE post_id=? AND version=?').get(id,v),post=db.prepare('SELECT status FROM posts WHERE id=?').get(id);
      if(!row||!post)fail('REVISION_NOT_FOUND','Versjonen finnes ikke.',404);
      if(v===currentVersion(id)&&post.status==='published')fail('ERASE_CURRENT_POST','Skjul innlegget før gjeldende versjon slettes.',409);
      const mediaIds=db.prepare('SELECT media_id FROM content_media_references WHERE post_id=? AND version=?').all(id,v).map(item=>item.media_id);
      db.prepare("UPDATE content_revisions SET snapshot='{}',content_hash=?,change_summary='',visibility='erased' WHERE post_id=? AND version=?").run(hash('{}'),id,v);
      db.prepare('DELETE FROM content_media_references WHERE post_id=? AND version=?').run(id,v);
      for(const mediaId of mediaIds){
        if(db.prepare('SELECT 1 FROM content_media_references WHERE media_id=? LIMIT 1').get(mediaId))continue;
        if(db.prepare("SELECT 1 FROM article_working_copies WHERE content_json LIKE '%'||?||'%' LIMIT 1").get(mediaId))continue;
        const current=db.prepare('SELECT cover_media_id,chapters_json FROM articles WHERE post_id=?').get(id);
        if(current&&(current.cover_media_id===mediaId||JSON.parse(current.chapters_json).some(chapter=>chapter.media_id===mediaId)))continue;
        if(db.prepare('SELECT 1 FROM post_media WHERE media_id=?').get(mediaId))continue;
        const media=db.prepare('SELECT original_path,display_path,thumbnail_path FROM media WHERE id=?').get(mediaId);
        if(!media)continue;
        db.prepare('DELETE FROM article_assets WHERE media_id=?').run(mediaId);
        db.prepare('DELETE FROM media WHERE id=?').run(mediaId);
        db.prepare('INSERT OR IGNORE INTO content_media_purges(media_id,paths_json) VALUES(?,?)').run(mediaId,JSON.stringify([media.original_path,media.display_path,media.thumbnail_path].filter(Boolean)));
      }
      db.prepare("UPDATE content_git_outbox SET status='cancelled',commit_oid=NULL WHERE post_id=? AND version=?").run(id,v);
      db.prepare("INSERT INTO content_git_purges(post_id) VALUES(?) ON CONFLICT(post_id) DO UPDATE SET requested_at=datetime('now'),completed_at=NULL").run(id);
      audit?.record({actorId:user.id,action:'revision.erased',subjectType:'post',subjectId:id,previous:{version:v,visibility:row.visibility},next:{version:v,visibility:'erased'},reason});
      db.exec('COMMIT');return {ok:true};
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  return {listDrafts,getDraft,createDraft,saveDraft,deleteDraft,startEdit,publishDraft,editPoster,list,get,inspect,diff,hide,erase,currentVersion};
}
module.exports={createContentRevisionService,insertRevision};
