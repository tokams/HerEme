'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {snapshotData}=require('./snapshot-data');
const {applyMigrations}=require('../server/migrations');
const {backfillDesigns}=require('../server/post-design');
const {backfillLegacyMedia}=require('../server/domain/media');

const same=(a,b,fields)=>fields.every(field=>a[field]===b[field]);
const insertRow=(db,table,row,mode='')=>{const columns=Object.keys(row);return db.prepare(`INSERT ${mode} INTO ${table}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).run(...columns.map(column=>row[column]));};
const allocateId=(db,table)=>db.prepare(`SELECT min(COALESCE(min(id),0),0)-1 id FROM ${table}`).get().id;

async function importUserContent(sourceDirectory,targetDirectory,{snapshotRoot=null}={}){
  const source=fs.realpathSync(sourceDirectory),target=fs.realpathSync(targetDirectory);if(source===target)throw new Error('Source and target must differ.');
  const suffix=crypto.randomUUID(),root=snapshotRoot?path.resolve(snapshotRoot):null;
  if(root)fs.mkdirSync(root,{recursive:true});
  const incoming=root?path.join(root,'source-'+suffix):source+'.user-content-'+suffix;
  const backup=root?path.join(root,'target-before-'+suffix):target+'.before-user-content-'+suffix;
  await snapshotData(source,incoming);await snapshotData(target,backup);
  const from=new DatabaseSync(path.join(incoming,'hereme.sqlite'),{readOnly:true}),to=new DatabaseSync(path.join(target,'hereme.sqlite'));
  to.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');applyMigrations(to);
  const imported={users:0,posts:0,votes:0,comments:0,reports:0,uploads:0},copiedFiles=[];
  try{
    const sourcePosts=from.prepare(`SELECT p.* FROM posts p LEFT JOIN post_presentation pp ON pp.post_id=p.id
      WHERE p.author_id IS NOT NULL AND COALESCE(pp.synthetic_demo,0)=0 ORDER BY p.created_at,abs(p.id)`).all();
    const sourcePostIds=new Set(sourcePosts.map(post=>post.id));if(!sourcePosts.length)return {imported,incoming,backup};
    const userIds=new Set(sourcePosts.map(post=>post.author_id));
    for(const table of ['votes','comments','reports'])for(const row of from.prepare(`SELECT * FROM ${table}`).all())if(sourcePostIds.has(row.post_id)&&row.user_id)userIds.add(row.user_id);else if(sourcePostIds.has(row.post_id)&&row.author_id)userIds.add(row.author_id);
    const userMap=new Map();
    to.exec('BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON;');
    try{
      for(const sourceId of userIds){
        const user=from.prepare('SELECT * FROM users WHERE id=?').get(sourceId);if(!user)throw new Error(`Missing source user ${sourceId}`);
        let destination=to.prepare('SELECT id FROM users WHERE id=?').get(user.id)||to.prepare('SELECT id FROM users WHERE token_hash=?').get(user.token_hash)||to.prepare('SELECT id FROM users WHERE normalized_name=?').get(user.normalized_name);
        if(!destination){insertRow(to,'users',user);destination={id:user.id};imported.users++;for(const role of from.prepare('SELECT * FROM user_roles WHERE user_id=?').all(user.id))insertRow(to,'user_roles',role,'OR IGNORE');const recovery=from.prepare('SELECT * FROM recovery_credentials WHERE user_id=?').get(user.id);if(recovery)insertRow(to,'recovery_credentials',recovery,'OR IGNORE');}
        userMap.set(sourceId,destination.id);
      }
      for(const roomId of new Set(sourcePosts.map(post=>post.room_id).filter(id=>id!=null)))if(!to.prepare('SELECT id FROM rooms WHERE id=?').get(roomId))insertRow(to,'rooms',from.prepare('SELECT * FROM rooms WHERE id=?').get(roomId));
      const postMap=new Map(),newPostIds=[];
      for(const sourcePost of sourcePosts){
        const mappedAuthor=userMap.get(sourcePost.author_id),existing=to.prepare('SELECT * FROM posts WHERE id=?').get(sourcePost.id);
        if(existing&&same(existing,{...sourcePost,author_id:mappedAuthor},['title','body','type','created_at','author_id'])){postMap.set(sourcePost.id,existing.id);continue;}
        const duplicate=to.prepare('SELECT id FROM posts WHERE title=? AND body=? AND type=? AND created_at=? AND author_id=?').get(sourcePost.title,sourcePost.body,sourcePost.type,sourcePost.created_at,mappedAuthor);
        if(duplicate){postMap.set(sourcePost.id,duplicate.id);continue;}
        const id=existing?allocateId(to,'posts'):sourcePost.id,post={...sourcePost,id,author_id:mappedAuthor};insertRow(to,'posts',post);postMap.set(sourcePost.id,id);newPostIds.push(id);imported.posts++;
        const design=from.prepare('SELECT * FROM post_design WHERE post_id=?').get(sourcePost.id);if(design)insertRow(to,'post_design',{...design,post_id:id});
        const presentation=from.prepare('SELECT * FROM post_presentation WHERE post_id=?').get(sourcePost.id);if(presentation)insertRow(to,'post_presentation',{...presentation,post_id:id});
        if(sourcePost.image_url?.startsWith('/uploads/')){
          const name=sourcePost.image_url.slice('/uploads/'.length);if(!name||name.includes('/')||name.includes('\\')||name==='..')throw new Error(`Unsafe upload path on post ${sourcePost.id}`);
          const sourceFile=path.join(incoming,'uploads',name),targetFile=path.join(target,'uploads',name),bytes=fs.readFileSync(sourceFile);
          if(fs.existsSync(targetFile)){if(!bytes.equals(fs.readFileSync(targetFile)))throw new Error(`Upload collision: ${name}`);}else{fs.copyFileSync(sourceFile,targetFile,fs.constants.COPYFILE_EXCL);copiedFiles.push(targetFile);imported.uploads++;}
        }
      }
      for(const vote of from.prepare('SELECT * FROM votes').all())if(postMap.has(vote.post_id)&&userMap.has(vote.user_id)){const result=to.prepare('INSERT OR IGNORE INTO votes(post_id,user_id,value) VALUES(?,?,?)').run(postMap.get(vote.post_id),userMap.get(vote.user_id),vote.value);imported.votes+=result.changes;}
      const commentMap=new Map();
      for(const comment of from.prepare('SELECT * FROM comments ORDER BY depth,created_at,abs(id)').all())if(postMap.has(comment.post_id)){
        const author=comment.author_id?userMap.get(comment.author_id)||null:null,parent=comment.parent_id==null?null:commentMap.get(comment.parent_id),postId=postMap.get(comment.post_id);
        const duplicate=to.prepare('SELECT id FROM comments WHERE post_id=? AND body=? AND created_at=? AND author_id IS ?').get(postId,comment.body,comment.created_at,author);if(duplicate){commentMap.set(comment.id,duplicate.id);continue;}
        const id=to.prepare('SELECT id FROM comments WHERE id=?').get(comment.id)?allocateId(to,'comments'):comment.id;insertRow(to,'comments',{...comment,id,post_id:postId,parent_id:parent,author_id:author});commentMap.set(comment.id,id);imported.comments++;
      }
      for(const report of from.prepare('SELECT * FROM reports').all())if(postMap.has(report.post_id)&&userMap.has(report.user_id)){
        const postId=postMap.get(report.post_id),userId=userMap.get(report.user_id);if(to.prepare('SELECT id FROM reports WHERE post_id=? AND user_id=?').get(postId,userId))continue;
        const id=to.prepare('SELECT id FROM reports WHERE id=?').get(report.id)?allocateId(to,'reports'):report.id;insertRow(to,'reports',{...report,id,post_id:postId,user_id:userId});imported.reports++;
      }
      backfillDesigns(to);backfillLegacyMedia(to,target);
      if(to.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Selective import would break foreign keys.');
      to.exec('COMMIT');return {imported,source_posts:sourcePosts.length,incoming,backup};
    }catch(error){if(to.isTransaction)to.exec('ROLLBACK');for(const file of copiedFiles)fs.rmSync(file,{force:true});throw error;}
  }finally{from.close();to.close();}
}

if(require.main===module){const [source,target,snapshotRoot,...extra]=process.argv.slice(2);if(!source||!target||extra.length){console.error('Usage: node scripts/import-user-content.js <old-data-dir> <current-data-dir> [durable-snapshot-root]');process.exitCode=1;}else importUserContent(source,target,{snapshotRoot}).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error);process.exitCode=1;});}
module.exports={importUserContent};
