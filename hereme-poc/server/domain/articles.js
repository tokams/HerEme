'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {fail}=require('./errors');
const V=require('./validation');
const {parseDesign,insertDesign}=require('../post-design');
const {nextId}=require('../migrations');
const markdown=require('./article-markdown');
const {insertRevision}=require('./content-revisions');

// Detached uploads can still belong to a working copy or an older published revision.
function unclaimedArticleUploads(db, {expiredOnly = true} = {}) {
  return db.prepare(`
    SELECT a.media_id, m.original_path, m.display_path, m.thumbnail_path,
           unixepoch(a.created_at, '+1 day') AS expires_at
    FROM article_assets a JOIN media m ON m.id=a.media_id
    WHERE a.post_id IS NULL AND (?=0 OR expires_at<unixepoch('now'))
      AND NOT EXISTS (SELECT 1 FROM article_working_copies w WHERE instr(w.content_json,a.media_id)>0)
      AND NOT EXISTS (SELECT 1 FROM content_media_references r WHERE r.media_id=a.media_id)
      AND NOT EXISTS (SELECT 1 FROM post_media p WHERE p.media_id=a.media_id)
      AND NOT EXISTS (SELECT 1 FROM articles t WHERE t.cover_media_id=a.media_id OR instr(t.chapters_json,a.media_id)>0)
  `).all(Number(expiredOnly));
}

function createArticleService(db,dataDir,{media,audit,config}={}){
  function cleanup(){
    const stale=unclaimedArticleUploads(db);
    for(const row of stale){db.prepare('DELETE FROM media WHERE id=?').run(row.media_id);for(const relative of [row.original_path,row.display_path,row.thumbnail_path].filter(Boolean))fs.rmSync(media.resolve(relative),{force:true});fs.rmSync(path.join(dataDir,'media',row.media_id),{recursive:true,force:true});}
  }
  async function uploadImage(file,user){
    const stored=await media.storeImage(file,user.id);
    try{db.prepare('INSERT INTO article_assets(media_id,owner_id) VALUES(?,?)').run(stored.id,user.id);return {media_id:stored.id,status:'ready',kind:'image',url:stored.url};}
    catch(error){stored.cleanup();throw error;}
  }
  function asset(id,user){
    const row=db.prepare('SELECT m.id,m.kind,m.status,m.display_path,m.thumbnail_path FROM article_assets a JOIN media m ON m.id=a.media_id WHERE a.media_id=? AND (a.owner_id=? OR (a.post_id IS NOT NULL AND ?=1))').get(id,user.id,user.capabilities?.includes('content:manage')?1:0);
    if(!row)fail('ARTICLE_MEDIA_NOT_READY','Vedlegget er ikke klart eller tilhører en annen bruker.',404);
    return {media_id:row.id,kind:row.kind,status:row.status,url:row.display_path?'/'+row.display_path.replaceAll('\\','/'):null,thumbnail_url:row.thumbnail_path?'/'+row.thumbnail_path.replaceAll('\\','/'):null};
  }
  function validate(input,user,postId=null){
    const title=V.text(input.title,{name:'Artikkeltittel',min:3,max:160}),abstract=V.text(input.abstract,{name:'Sammendrag',min:10,max:500});
    const design=parseDesign(input,input.category);
    if(!Array.isArray(input.chapters)||input.chapters.length<1||input.chapters.length>24)fail('INVALID_CHAPTERS','Artikkelen må ha 1–24 kapitler.',400);
    const chapters=input.chapters.map((value,index)=>{
      if(!value||typeof value!=='object'||Array.isArray(value))fail('INVALID_CHAPTERS','Ugyldig kapittel.',400);
      return {heading:V.text(value.heading,{name:`Kapittel ${index+1}`,min:2,max:120}),markdown:V.text(value.markdown,{name:'Kapitteltekst',min:1,max:20000}),media_id:value.media_id?String(value.media_id):null,alt:value.alt?V.optionalText(value.alt,{name:'Bildetekst',max:200}):''};
    });
    const coverId=input.cover_media_id?String(input.cover_media_id):null,ids=[coverId,...chapters.map(chapter=>chapter.media_id)].filter(Boolean);
    if(new Set(ids).size!==ids.length)fail('DUPLICATE_ARTICLE_MEDIA','Hvert medievedlegg kan bare brukes én gang.',400);
    const assets=new Map();
    for(const id of ids){const row=db.prepare('SELECT m.* FROM article_assets a JOIN media m ON m.id=a.media_id WHERE a.media_id=? AND ((a.owner_id=? AND a.post_id IS NULL) OR a.post_id=?)').get(id,user.id,postId);if(!row||row.status!=='ready')fail('ARTICLE_MEDIA_NOT_READY','Vedlegget er ikke klart eller tilhører en annen bruker.',409);assets.set(id,row);}
    const allowed=new Set([...assets.values()].flatMap(row=>[row.display_path,row.thumbnail_path].filter(Boolean).map(relative=>'/'+relative.replaceAll('\\','/'))));
    for(const chapter of chapters)markdown.render(chapter.markdown,allowed);
    return {title,abstract,design,chapters,coverId,ids,assets,markdown_source:markdown.source({title,abstract,category:design.category,chapters})};
  }
  function create(input,user){
    const article=validate(input,user),cover=article.coverId?article.assets.get(article.coverId):null;
    const coverUrl=cover?'/'+(cover.thumbnail_path||cover.display_path).replaceAll('\\','/'):null;
    db.exec('BEGIN IMMEDIATE');try{
      const row=db.prepare("INSERT INTO posts(id,room_id,author_id,title,body,type,image_url,base_score) VALUES(?,NULL,?,?,?,'text',?,0)").run(nextId(db,'posts'),user.id,article.title,article.abstract,coverUrl),id=Number(row.lastInsertRowid);
      insertDesign(db,id,article.design);
      db.prepare('INSERT INTO votes(post_id,user_id,value) VALUES(?,?,1)').run(id,user.id);
      db.prepare('INSERT INTO articles(post_id,abstract,markdown_source,chapters_json,cover_media_id) VALUES(?,?,?,?,?)').run(id,article.abstract,article.markdown_source,JSON.stringify(article.chapters),article.coverId);
      for(const mediaId of article.ids)db.prepare('UPDATE article_assets SET post_id=? WHERE media_id=? AND owner_id=? AND post_id IS NULL').run(id,mediaId,user.id);
      insertRevision(db,{id,format:'article',editor:user.id,origin:'publish',snapshot:{format:'article',title:article.title,abstract:article.abstract,category:article.design.category,cover_media_id:article.coverId,chapters:article.chapters,markdown_source:article.markdown_source},mediaIds:article.ids});
      if(input.area_id){if(!config.enableLocations)fail('LOCATIONS_DISABLED','Områder er ikke aktivert.',404);if(!db.prepare('SELECT id FROM areas WHERE id=? AND active=1').get(input.area_id))fail('INVALID_AREAS','Ugyldig område.');db.prepare('INSERT INTO post_areas(post_id,area_id) VALUES(?,?)').run(id,input.area_id);}
      audit?.record({actorId:user.id,action:'article.created',subjectType:'post',subjectId:id,next:{status:'published',category:article.design.category,chapters:article.chapters.length}});
      db.exec('COMMIT');return {id};
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  function detail(id){
    const row=db.prepare('SELECT abstract,markdown_source,chapters_json,cover_media_id,updated_at FROM articles WHERE post_id=?').get(id);if(!row)return null;
    const mediaRows=db.prepare('SELECT a.media_id,m.kind,m.display_path,m.thumbnail_path,m.original_path,m.duration_ms FROM article_assets a JOIN media m ON m.id=a.media_id WHERE a.post_id=?').all(id);
    const assets=new Map(mediaRows.map(item=>[item.media_id,{id:item.media_id,kind:item.kind,url:item.display_path?'/'+item.display_path.replaceAll('\\','/'):null,thumbnail_url:item.thumbnail_path?'/'+item.thumbnail_path.replaceAll('\\','/'):null,original_url:item.original_path?'/'+item.original_path.replaceAll('\\','/'):null,duration_ms:item.duration_ms}]));
    const allowed=new Set([...assets.values()].flatMap(asset=>[asset.url,asset.thumbnail_url,asset.original_url].filter(Boolean)));
    return {abstract:row.abstract,markdown_source:row.markdown_source,cover:assets.get(row.cover_media_id)||null,updated_at:row.updated_at,chapters:JSON.parse(row.chapters_json).map(chapter=>({...chapter,body_html:markdown.render(chapter.markdown,allowed),media:assets.get(chapter.media_id)||null}))};
  }
  return {cleanup,uploadImage,asset,create,detail,validate};
}
module.exports={createArticleService,unclaimedArticleUploads};
