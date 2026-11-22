'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {fail}=require('./errors');
const V=require('./validation');
const {insertRevision}=require('./content-revisions');

function createAdministrationService(db,dataDir,{audit,identity,avatars}={}){
  const postStatuses=['draft','processing','published','review','hidden','rejected'];
  const postCategories=['question','opinion','story','alert','tip'];
  const reason=value=>V.text(value,{name:'Begrunnelse',min:3,max:300});
  const requireAdmin=actor=>identity.requireCapability(actor,'content:manage');

  function overview(actor){
    identity.requireCapability(actor,'staff:read');
    const posts=db.prepare(`SELECT p.id,p.title,p.body,p.type,p.status,p.base_score,p.created_at,p.author_id,
      COALESCE(u.name,p.demo_author,'anonym') author,COALESCE(pp.synthetic_demo,0) synthetic_demo,d.category,
      p.base_score+COALESCE((SELECT sum(v.value) FROM votes v WHERE v.post_id=p.id),0) score,
      (SELECT count(*) FROM votes v WHERE v.post_id=p.id) vote_count,
      (SELECT count(*) FROM comments c WHERE c.post_id=p.id) comment_count,
      (SELECT count(*) FROM reports r WHERE r.post_id=p.id AND r.resolved=0) report_count
      FROM posts p LEFT JOIN users u ON u.id=p.author_id LEFT JOIN post_presentation pp ON pp.post_id=p.id
      LEFT JOIN post_design d ON d.post_id=p.id ORDER BY p.created_at DESC,abs(p.id) DESC`).all();
    if(!actor.capabilities.includes('content:manage')){const moderatable=posts.filter(post=>['published','review','hidden'].includes(post.status));return {posts:moderatable,users:[],comments:[],reports:[],stats:{posts:moderatable.length}};}
    const users=db.prepare(`SELECT u.id,u.name,u.status,u.created_at,group_concat(ur.role) roles,
      (SELECT count(*) FROM posts p WHERE p.author_id=u.id) post_count,
      (SELECT count(*) FROM comments c WHERE c.author_id=u.id) comment_count,
      (SELECT count(*) FROM votes v WHERE v.user_id=u.id) vote_count
      FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id GROUP BY u.id ORDER BY u.created_at DESC`).all()
      .map(user=>({...user,roles:user.roles?user.roles.split(','):[]}));
    const comments=db.prepare(`SELECT c.id,c.post_id,c.parent_id,c.body,c.depth,c.created_at,c.author_id,
      COALESCE(u.name,c.demo_author,'anonym') author,p.title post_title
      FROM comments c JOIN posts p ON p.id=c.post_id LEFT JOIN users u ON u.id=c.author_id
      ORDER BY c.created_at DESC,abs(c.id) DESC`).all();
    const reports=db.prepare(`SELECT r.id,r.post_id,r.reason,r.resolved,r.created_at,u.name reporter,p.title post_title
      FROM reports r JOIN posts p ON p.id=r.post_id LEFT JOIN users u ON u.id=r.user_id
      ORDER BY r.created_at DESC,abs(r.id) DESC`).all();
    return {posts,users,comments,reports,stats:{posts:posts.length,users:users.length,comments:comments.length,reports:reports.length,published:posts.filter(p=>p.status==='published').length}};
  }

  function updatePost(actor,postId,input){
    requireAdmin(actor);postId=V.integer(postId,{name:'Innleggs-ID'});const why=reason(input.reason);
    const previous=db.prepare('SELECT p.id,p.title,p.body,p.status,p.base_score,d.category FROM posts p LEFT JOIN post_design d ON d.post_id=p.id WHERE p.id=?').get(postId);if(!previous)fail('POST_NOT_FOUND','Innlegget finnes ikke.',404);
    const title=V.text(input.title,{name:'Overskrift',min:3,max:160});
    const isArticle=Boolean(db.prepare('SELECT 1 FROM articles WHERE post_id=?').get(postId));
    const body=isArticle?V.text(input.body,{name:'Sammendrag',min:10,max:500}):V.optionalText(input.body,{name:'Innlegg',max:3000});
    const status=V.enumValue(input.status,postStatuses,'Status');
    const category=V.enumValue(input.category,postCategories,'Kategori');
    const score=V.integer(input.score,{name:'Poengsum'});if(score < -1000000||score > 1000000)fail('INVALID_SCORE','Poengsum må være mellom -1000000 og 1000000.');
    const voteSum=db.prepare('SELECT COALESCE(sum(value),0) value FROM votes WHERE post_id=?').get(postId).value;
    db.exec('BEGIN IMMEDIATE');try{
      const contentChanged=title!==previous.title||body!==previous.body||category!==previous.category;
      if(status==='published'&&!contentChanged&&db.prepare('SELECT visibility FROM content_revisions WHERE post_id=? ORDER BY version DESC LIMIT 1').get(postId)?.visibility!=='public')fail('HIDDEN_CURRENT_REVISION','Skriv en trygg ny versjon før innlegget publiseres.',409);
      db.prepare('UPDATE posts SET title=?,body=?,status=?,base_score=? WHERE id=?').run(title,body,status,score-voteSum,postId);
      const article=db.prepare('SELECT chapters_json FROM articles WHERE post_id=?').get(postId);
      if(article){const source=require('./article-markdown').source({title,abstract:body,category,chapters:JSON.parse(article.chapters_json)});db.prepare("UPDATE articles SET abstract=?,markdown_source=?,updated_at=datetime('now') WHERE post_id=?").run(body,source,postId);}
      else db.prepare('UPDATE poster_content SET text=? WHERE post_id=?').run(body?`${title}\n\n${body}`:title,postId);
      db.prepare('UPDATE post_design SET category=? WHERE post_id=?').run(category,postId);
      if(contentChanged){
        const current=db.prepare('SELECT MAX(version) version FROM content_revisions WHERE post_id=?').get(postId).version||0;
        const details=db.prepare('SELECT title,body,type,link_url,image_url FROM posts WHERE id=?').get(postId);
        const articleRow=db.prepare('SELECT abstract,markdown_source,chapters_json,cover_media_id FROM articles WHERE post_id=?').get(postId);
        const snapshot=articleRow?{format:'article',title:details.title,abstract:articleRow.abstract,category,chapters:JSON.parse(articleRow.chapters_json),cover_media_id:articleRow.cover_media_id,markdown_source:articleRow.markdown_source}:{format:'poster',text:db.prepare('SELECT text FROM poster_content WHERE post_id=?').get(postId)?.text||details.title,title:details.title,body:details.body,category,type:details.type,link_url:details.link_url,image_url:details.image_url};
        const mediaIds=articleRow?[articleRow.cover_media_id,...JSON.parse(articleRow.chapters_json).map(chapter=>chapter.media_id)].filter(Boolean):db.prepare('SELECT media_id FROM post_media WHERE post_id=?').all(postId).map(r=>r.media_id);
        insertRevision(db,{id:postId,format:articleRow?'article':'poster',editor:actor.id,snapshot,summary:why,expected:current,mediaIds,visibility:status==='published'?'public':'hidden'});
      }
      audit.record({actorId:actor.id,action:'admin.post.updated',subjectType:'post',subjectId:postId,previous,next:{title,body,status,score,category},reason:why});
      db.exec('COMMIT');return {ok:true};
    }catch(error){db.exec('ROLLBACK');throw error;}
  }

  function stagePostFiles(postIds){
    if(!postIds.length)return {commit(){},rollback(){}};
    const placeholders=postIds.map(()=>'?').join(','),files=[];
    for(const row of db.prepare(`SELECT m.original_path,m.display_path,m.thumbnail_path FROM media m JOIN post_media pm ON pm.media_id=m.id WHERE pm.post_id IN (${placeholders})`).all(...postIds))
      for(const value of [row.original_path,row.display_path,row.thumbnail_path])if(value)files.push(path.resolve(dataDir,value));
    for(const row of db.prepare(`SELECT m.original_path,m.display_path,m.thumbnail_path FROM media m JOIN article_assets a ON a.media_id=m.id WHERE a.post_id IN (${placeholders})`).all(...postIds))
      for(const value of [row.original_path,row.display_path,row.thumbnail_path])if(value)files.push(path.resolve(dataDir,value));
    for(const row of db.prepare(`SELECT image_url FROM posts p WHERE p.id IN (${placeholders}) AND image_url LIKE '/uploads/%'
      AND NOT EXISTS(SELECT 1 FROM posts other WHERE other.id NOT IN (${placeholders}) AND other.image_url=p.image_url)`).all(...postIds,...postIds))files.push(path.resolve(dataDir,row.image_url.slice(1)));
    const root=path.resolve(dataDir),unique=[...new Set(files)].filter(file=>file.startsWith(root+path.sep)&&fs.existsSync(file));
    if(!unique.length)return {commit(){},rollback(){}};
    const staging=path.join(dataDir,'tmp','admin-delete-'+crypto.randomUUID());fs.mkdirSync(staging,{recursive:true});
    const moved=[];try{for(const [index,file] of unique.entries()){const target=path.join(staging,index+'-'+path.basename(file));fs.renameSync(file,target);moved.push({file,target});}}
    catch(error){for(const item of moved.reverse())fs.renameSync(item.target,item.file);fs.rmSync(staging,{recursive:true,force:true});throw error;}
    return {commit(){fs.rmSync(staging,{recursive:true,force:true});},rollback(){for(const item of moved.reverse()){fs.mkdirSync(path.dirname(item.file),{recursive:true});fs.renameSync(item.target,item.file);}fs.rmSync(staging,{recursive:true,force:true});}};
  }

  function deletePosts(actor,postIds,why,action='admin.post.deleted'){
    const ids=[...new Set(postIds.map(id=>V.integer(id,{name:'Innleggs-ID'})))];if(!ids.length)return 0;
    const placeholders=ids.map(()=>'?').join(','),existing=db.prepare(`SELECT id,title,status FROM posts WHERE id IN (${placeholders})`).all(...ids);
    if(existing.length!==ids.length)fail('POST_NOT_FOUND','Ett eller flere innlegg finnes ikke.',404);
    const mediaIds=[...new Set([...db.prepare(`SELECT media_id FROM post_media WHERE post_id IN (${placeholders})`).all(...ids),...db.prepare(`SELECT media_id FROM article_assets WHERE post_id IN (${placeholders})`).all(...ids)].map(row=>row.media_id))],staged=stagePostFiles(ids);
    db.exec('BEGIN IMMEDIATE');try{
      for(const post of existing)audit.record({actorId:actor.id,action,subjectType:'post',subjectId:post.id,previous:post,reason:why});
      for(const post of existing)db.prepare('INSERT INTO content_git_purges(post_id) VALUES(?) ON CONFLICT(post_id) DO UPDATE SET requested_at=datetime(\'now\'),completed_at=NULL').run(post.id);
      db.prepare(`DELETE FROM posts WHERE id IN (${placeholders})`).run(...ids);
      if(mediaIds.length)db.prepare(`DELETE FROM media WHERE id IN (${mediaIds.map(()=>'?').join(',')})`).run(...mediaIds);
      db.exec('COMMIT');staged.commit();return ids.length;
    }catch(error){if(db.isTransaction){db.exec('ROLLBACK');staged.rollback();}throw error;}
  }

  function deletePost(actor,postId,input){requireAdmin(actor);return {ok:true,deleted:deletePosts(actor,[postId],reason(input.reason))};}

  function updateComment(actor,commentId,input){
    requireAdmin(actor);commentId=V.integer(commentId,{name:'Kommentar-ID'});const why=reason(input.reason),body=V.text(input.body,{name:'Kommentar',min:1,max:1200});
    const previous=db.prepare('SELECT id,body FROM comments WHERE id=?').get(commentId);if(!previous)fail('COMMENT_NOT_FOUND','Kommentaren finnes ikke.',404);
    db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE comments SET body=? WHERE id=?').run(body,commentId);audit.record({actorId:actor.id,action:'admin.comment.updated',subjectType:'comment',subjectId:commentId,previous,next:{body},reason:why});db.exec('COMMIT');return {ok:true};}catch(error){db.exec('ROLLBACK');throw error;}
  }

  function deleteComment(actor,commentId,input){
    requireAdmin(actor);commentId=V.integer(commentId,{name:'Kommentar-ID'});const why=reason(input.reason);
    const rows=db.prepare(`WITH RECURSIVE tree(id,depth) AS (SELECT id,depth FROM comments WHERE id=? UNION ALL SELECT c.id,c.depth FROM comments c JOIN tree t ON c.parent_id=t.id) SELECT * FROM tree ORDER BY depth DESC`).all(commentId);
    if(!rows.length)fail('COMMENT_NOT_FOUND','Kommentaren finnes ikke.',404);
    db.exec('BEGIN IMMEDIATE');try{for(const row of rows)db.prepare('DELETE FROM comments WHERE id=?').run(row.id);audit.record({actorId:actor.id,action:'admin.comment.deleted',subjectType:'comment',subjectId:commentId,previous:{comment_ids:rows.map(row=>row.id)},reason:why});db.exec('COMMIT');return {ok:true,deleted:rows.length};}catch(error){db.exec('ROLLBACK');throw error;}
  }

  function deleteUser(actor,userId,input){
    identity.requireCapability(actor,'users:delete');if(userId===actor.id)fail('SELF_DELETE_FORBIDDEN','Du kan ikke slette din egen administratorkonto.',409);
    const why=reason(input.reason),withPosts=Boolean(input.delete_posts),user=db.prepare('SELECT id,name,status FROM users WHERE id=?').get(userId);if(!user)fail('USER_NOT_FOUND','Brukeren finnes ikke.',404);
    const isAdmin=db.prepare("SELECT 1 FROM user_roles WHERE user_id=? AND role IN ('admin','operator')").get(userId);
    if(isAdmin&&db.prepare("SELECT count(DISTINCT user_id) n FROM user_roles WHERE role IN ('admin','operator')").get().n<=1)fail('LAST_ADMIN','Den siste administratorkontoen kan ikke slettes.',409);
    const postIds=withPosts?db.prepare('SELECT id FROM posts WHERE author_id=?').all(userId).map(row=>row.id):[],staged=stagePostFiles(postIds);
    db.exec('BEGIN IMMEDIATE');try{
      for(const row of db.prepare('SELECT DISTINCT post_id FROM content_revisions WHERE editor_user_id=?').all(userId))db.prepare('INSERT INTO content_git_purges(post_id) VALUES(?) ON CONFLICT(post_id) DO UPDATE SET requested_at=datetime(\'now\'),completed_at=NULL').run(row.post_id);
      if(withPosts&&postIds.length){const placeholders=postIds.map(()=>'?').join(','),mediaIds=[...new Set([...db.prepare(`SELECT media_id FROM post_media WHERE post_id IN (${placeholders})`).all(...postIds),...db.prepare(`SELECT media_id FROM article_assets WHERE post_id IN (${placeholders})`).all(...postIds)].map(row=>row.media_id))];for(const postId of postIds)db.prepare('INSERT INTO content_git_purges(post_id) VALUES(?) ON CONFLICT(post_id) DO UPDATE SET requested_at=datetime(\'now\'),completed_at=NULL').run(postId);db.prepare(`DELETE FROM posts WHERE id IN (${placeholders})`).run(...postIds);if(mediaIds.length)db.prepare(`DELETE FROM media WHERE id IN (${mediaIds.map(()=>'?').join(',')})`).run(...mediaIds);}
      else db.prepare("UPDATE posts SET author_id=NULL,demo_author='slettet bruker' WHERE author_id=?").run(userId);
      db.prepare("UPDATE comments SET author_id=NULL,demo_author='slettet bruker' WHERE author_id=?").run(userId);
      db.prepare('UPDATE rooms SET created_by=NULL WHERE created_by=?').run(userId);db.prepare('UPDATE media SET owner_id=NULL WHERE owner_id=?').run(userId);db.prepare('DELETE FROM reports WHERE user_id=?').run(userId);
      audit.record({actorId:actor.id,action:'admin.user.deleted',subjectType:'user',subjectId:userId,previous:user,next:{deleted:true,posts_deleted:withPosts,post_count:postIds.length},reason:why});
      db.prepare('DELETE FROM users WHERE id=?').run(userId);db.exec('COMMIT');staged.commit();avatars.purgeUser(userId);return {ok:true,posts_deleted:postIds.length};
    }catch(error){if(db.isTransaction){db.exec('ROLLBACK');staged.rollback();}throw error;}
  }

  return {overview,updatePost,deletePost,updateComment,deleteComment,deleteUser};
}
module.exports={createAdministrationService};
