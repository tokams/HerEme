'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {db,dataDir}=require('./db');
const root=path.resolve(process.env.HEREME_CONTENT_GIT_DIR||path.join(dataDir,'content-git'));
const repo=path.join(root,'repo');
const env={...process.env,GIT_AUTHOR_NAME:'HerEme Content Archive',GIT_AUTHOR_EMAIL:'archive@localhost',GIT_COMMITTER_NAME:'HerEme Content Archive',GIT_COMMITTER_EMAIL:'archive@localhost',GIT_CONFIG_NOSYSTEM:'1'};
const git=(directory,...args)=>execFileSync('git',['-C',directory,...args],{env,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000}).trim();
function init(directory){fs.mkdirSync(directory,{recursive:true});if(!fs.existsSync(path.join(directory,'.git')))git(directory,'init','--initial-branch=main');}
function recoverDirectory(){
  fs.mkdirSync(root,{recursive:true});
  const old=fs.readdirSync(root).filter(name=>/^old-\d+$/.test(name));
  if(!fs.existsSync(repo)&&old.length)fs.renameSync(path.join(root,old.pop()),repo);
  if(fs.existsSync(repo))for(const name of old)fs.rmSync(path.join(root,name),{recursive:true,force:true});
  for(const name of fs.readdirSync(root).filter(name=>/^rebuild-\d+$/.test(name)))fs.rmSync(path.join(root,name),{recursive:true,force:true});
}
function fileName(row){return `${row.format==='article'?'articles':'posters'}/${row.post_id}.md`;}
function source(row){
  if(crypto.createHash('sha256').update(row.snapshot).digest('hex')!==row.content_hash)throw Error(`Revision checksum mismatch: ${row.post_id}/${row.version}`);
  const snapshot=JSON.parse(row.snapshot);
  if(row.format==='article')return `${snapshot.markdown_source}\n\n<!-- HerEme attachment manifest\n${JSON.stringify({cover_media_id:snapshot.cover_media_id,chapters:snapshot.chapters.map(({media_id,alt})=>({media_id,alt}))},null,2)}\n-->\n`;
  return `---\nformat: poster\ncategory: ${JSON.stringify(snapshot.category)}\ntitle: ${JSON.stringify(snapshot.title)}\ntype: ${JSON.stringify(snapshot.type)}\nmedia: ${JSON.stringify(snapshot.image_url||null)}\n---\n\n${snapshot.text}\n`;
}
function commit(directory,row){
  const relative=fileName(row),target=path.join(directory,...relative.split('/'));
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,source(row),'utf8');
  git(directory,'add','--',relative);
  const message=`Publish content revision\n\nHerEme-Revision: ${row.post_id}/${row.version}\nHerEme-Hash: ${row.content_hash}\nHerEme-Editor: ${row.editor_user_id||'deleted'}\n`;
  git(directory,'-c','commit.gpgsign=false','commit','--allow-empty','-m',message);
  return git(directory,'rev-parse','HEAD');
}
function findCommit(directory,row){
  if(!fs.existsSync(path.join(directory,'.git')))return null;
  const log=git(directory,'log','--all','--format=%H%x1f%B%x1e','--',fileName(row));
  for(const entry of log.split('\x1e')){
    const [oid,message]=entry.trim().split('\x1f');
    if(message?.includes(`HerEme-Revision: ${row.post_id}/${row.version}\n`)&&message.includes(`HerEme-Hash: ${row.content_hash}\n`))return oid;
  }
  return null;
}
function acknowledge(row,oid){db.prepare("UPDATE content_git_outbox SET status='synced',commit_oid=?,last_error=NULL WHERE post_id=? AND version=?").run(oid,row.post_id,row.version);}
function processMediaPurges(){
  let removed=0;
  for(const row of db.prepare('SELECT media_id,paths_json FROM content_media_purges WHERE completed_at IS NULL LIMIT 25').all()){
    for(const relative of JSON.parse(row.paths_json)){
      const file=path.resolve(dataDir,relative);
      if(!file.startsWith(path.resolve(dataDir)+path.sep))throw Error(`Unsafe media purge path: ${relative}`);
      fs.rmSync(file,{force:true});
    }
    const folder=path.resolve(dataDir,'media',row.media_id);
    if(folder.startsWith(path.resolve(dataDir)+path.sep))fs.rmSync(folder,{recursive:true,force:true});
    db.prepare("UPDATE content_media_purges SET completed_at=datetime('now') WHERE media_id=?").run(row.media_id);removed++;
  }
  return removed;
}
function rebuild(){
  recoverDirectory();
  const temporary=path.join(root,`rebuild-${process.pid}`);if(fs.existsSync(temporary))throw Error('An archive rebuild is already present.');
  init(temporary);
  const rows=db.prepare("SELECT r.* FROM content_revisions r WHERE r.visibility!='erased' ORDER BY r.created_at,r.post_id,r.version").all();
  const mapping=[];
  try{
    for(const row of rows)mapping.push({...row,oid:commit(temporary,row)});
    const old=path.join(root,`old-${process.pid}`);
    if(fs.existsSync(repo))fs.renameSync(repo,old);
    fs.renameSync(temporary,repo);
    db.exec('BEGIN IMMEDIATE');try{
      db.prepare("UPDATE content_git_outbox SET status='pending',commit_oid=NULL WHERE status!='cancelled'").run();
      for(const row of mapping)acknowledge(row,row.oid);
      db.prepare("UPDATE content_git_purges SET completed_at=datetime('now') WHERE completed_at IS NULL").run();
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    if(fs.existsSync(old))fs.rmSync(old,{recursive:true,force:true});
    return {replayed:mapping.length};
  }catch(error){if(fs.existsSync(temporary))fs.rmSync(temporary,{recursive:true,force:true});throw error;}
}
function runOnce(){
  recoverDirectory();
  const mediaPurged=processMediaPurges();
  if(db.prepare('SELECT 1 FROM content_git_purges WHERE completed_at IS NULL LIMIT 1').get())return {...rebuild(),mediaPurged};
  init(repo);
  let synced=0,failed=0;
  const rows=db.prepare("SELECT r.* FROM content_git_outbox o JOIN content_revisions r ON r.post_id=o.post_id AND r.version=o.version WHERE o.status IN ('pending','failed') AND o.next_attempt_at<=datetime('now') AND r.visibility!='erased' AND NOT EXISTS(SELECT 1 FROM content_git_outbox prior WHERE prior.post_id=o.post_id AND prior.version<o.version AND prior.status NOT IN ('synced','cancelled')) ORDER BY r.created_at,r.post_id,r.version LIMIT 25").all();
  for(const row of rows){
    try{acknowledge(row,findCommit(repo,row)||commit(repo,row));synced++;}
    catch(error){failed++;const previous=db.prepare('SELECT attempts FROM content_git_outbox WHERE post_id=? AND version=?').get(row.post_id,row.version);const seconds=Math.min(3600,2**Math.min(previous.attempts+1,11));db.prepare("UPDATE content_git_outbox SET status='failed',attempts=attempts+1,last_error=?,next_attempt_at=datetime('now',?) WHERE post_id=? AND version=?").run(String(error.message).slice(0,500),`+${seconds} seconds`,row.post_id,row.version);}
  }
  return {synced,failed,mediaPurged,pending:db.prepare("SELECT count(*) n FROM content_git_outbox WHERE status!='synced' AND status!='cancelled'").get().n};
}
function reconcile(){
  recoverDirectory();
  const rows=db.prepare("SELECT r.*,o.status,o.commit_oid FROM content_revisions r JOIN content_git_outbox o ON o.post_id=r.post_id AND o.version=r.version WHERE r.visibility!='erased' ORDER BY r.created_at,r.post_id,r.version").all();
  if(!rows.length)return {checked:0,repaired:false};
  if(!fs.existsSync(path.join(repo,'.git')))return {...rebuild(),checked:rows.length,repaired:true};
  for(const row of rows){
    let oid,archivedSource;
    try{
      oid=findCommit(repo,row);
      if(row.status==='synced'&&oid)archivedSource=git(repo,'show',`${oid}:${fileName(row)}`);
    }catch(error){
      if(error.code==='ENOENT')throw error;
      return {...rebuild(),checked:rows.length,repaired:true};
    }
    if(row.status==='synced'&&(!oid||oid!==row.commit_oid||archivedSource!==source(row).trim()))return {...rebuild(),checked:rows.length,repaired:true};
    if(row.status!=='synced'&&oid)acknowledge(row,oid);
  }
  return {checked:rows.length,repaired:false};
}
if(require.main===module){
  const once=process.argv.includes('--once'),rebuildRequested=process.argv.includes('--rebuild'),reconcileRequested=process.argv.includes('--reconcile');
  if(rebuildRequested){console.log(JSON.stringify(rebuild()));db.close();}
  else if(reconcileRequested){console.log(JSON.stringify(reconcile()));db.close();}
  else if(once){console.log(JSON.stringify(runOnce()));db.close();}
  else {try{console.log(JSON.stringify({event:'content_git_reconcile',...reconcile()}));}catch(error){console.error(JSON.stringify({event:'content_git_reconcile_failed',message:error.message}));}const tick=()=>{try{const result=runOnce();if(result.failed||result.pending)console.log(JSON.stringify({event:'content_git_sync',...result}));}catch(error){console.error(JSON.stringify({event:'content_git_error',message:error.message}));}};tick();setInterval(tick,5000);setInterval(()=>{try{console.log(JSON.stringify({event:'content_git_reconcile',...reconcile()}));}catch(error){console.error(JSON.stringify({event:'content_git_reconcile_failed',message:error.message}));}},3600000);}
}
module.exports={runOnce,rebuild,reconcile,source,findCommit};
