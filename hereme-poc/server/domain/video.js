'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const {spawnSync}=require('node:child_process');
const {fail}=require('./errors');const V=require('./validation');const {parseDesign,insertDesign}=require('../post-design');const {nextId}=require('../migrations');
function hashFile(filename){return new Promise((resolve,reject)=>{const digest=crypto.createHash('sha256'),stream=fs.createReadStream(filename);stream.on('data',chunk=>digest.update(chunk));stream.on('end',()=>resolve(digest.digest('hex')));stream.on('error',reject);});}
function createVideoService(db,dataDir,config,{audit,run=spawnSync}={}){
  function enabled(){if(!config.enableVideo)fail('VIDEO_DISABLED','Video er ikke aktivert på denne instansen.',404);}
  function begin(input,user){
    enabled();const modern=input.format==='poster',body=modern?V.text(input.body,{name:'Plakattekst',min:3,max:3000}):V.optionalText(input.body,{name:'Innlegg',max:3000}),title=modern?body.slice(0,160):V.text(input.title,{name:'Overskrift',min:3,max:160});
    const bytes=V.integer(input.bytes,{name:'Filstørrelse',min:1,max:config.maxVideoBytes});
    const normalizedMime=String(input.mime_type||'').split(';')[0].trim().toLowerCase();
    const mime=V.enumValue(normalizedMime,['video/mp4','video/quicktime','video/webm','video/x-m4v','video/3gpp'],'Videotype');
    const design=parseDesign({...input,poster_style:input.category},input.category);
    const stat=fs.statfsSync(dataDir);if(stat.bavail*stat.bsize-bytes<config.minFreeBytes)fail('DISK_PRESSURE','Ikke nok reservert lagringsplass.',503);
    const mediaId=crypto.randomUUID(),relative=`tmp/${mediaId}.upload`;
    db.exec('BEGIN IMMEDIATE');try{
      db.prepare(`INSERT INTO media(id,owner_id,kind,status,original_path,mime_type,bytes,sha256)
        VALUES(?,?,'video','uploading',?,?,?,'')`).run(mediaId,user.id,relative,mime,bytes);
      const post=db.prepare(`INSERT INTO posts(id,author_id,title,body,type,status) VALUES(?,?,?,?, 'video','processing')`).run(nextId(db,'posts'),user.id,title,body);
      const postId=Number(post.lastInsertRowid);insertDesign(db,postId,design);if(modern)db.prepare('INSERT INTO poster_content(post_id,text) VALUES(?,?)').run(postId,body);db.prepare('INSERT INTO post_media(post_id,media_id) VALUES(?,?)').run(postId,mediaId);db.prepare('INSERT INTO votes(post_id,user_id,value) VALUES(?,?,1)').run(postId,user.id);
      if(input.area_id){if(!config.enableLocations)fail('LOCATIONS_DISABLED','Områder er ikke aktivert.',404);if(!db.prepare('SELECT id FROM areas WHERE id=? AND active=1').get(input.area_id))fail('INVALID_AREAS','Ugyldig område.');db.prepare('INSERT INTO post_areas(post_id,area_id) VALUES(?,?)').run(postId,input.area_id);}
      db.exec('COMMIT');return {media_id:mediaId,post_id:postId,upload_url:`/api/video-uploads/${mediaId}`,bytes};
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  function beginArticleAsset(input,user){
    enabled();const bytes=V.integer(input.bytes,{name:'Filstørrelse',min:1,max:config.maxVideoBytes});
    const mime=V.enumValue(String(input.mime_type||'').split(';')[0].trim().toLowerCase(),['video/mp4','video/quicktime','video/webm','video/x-m4v','video/3gpp'],'Videotype');
    const stat=fs.statfsSync(dataDir);if(stat.bavail*stat.bsize-bytes<config.minFreeBytes)fail('DISK_PRESSURE','Ikke nok reservert lagringsplass.',503);
    const id=crypto.randomUUID();db.exec('BEGIN IMMEDIATE');try{
      db.prepare("INSERT INTO media(id,owner_id,kind,status,original_path,mime_type,bytes,sha256) VALUES(?,?,'video','uploading',?,?,?,'')").run(id,user.id,`tmp/${id}.upload`,mime,bytes);
      db.prepare('INSERT INTO article_assets(media_id,owner_id) VALUES(?,?)').run(id,user.id);
      db.exec('COMMIT');return {media_id:id,upload_url:`/api/video-uploads/${id}`,bytes};
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  function receive(id,user,req){
    enabled();const row=db.prepare("SELECT * FROM media WHERE id=? AND owner_id=? AND kind='video' AND status='uploading'").get(id,user.id);if(!row)fail('UPLOAD_NOT_FOUND','Videoopplastingen finnes ikke.',404);
    const length=Number(req.headers['content-length']);if(!Number.isSafeInteger(length)||length!==row.bytes)fail('CONTENT_LENGTH','Filstørrelsen samsvarer ikke med reservasjonen.',400);
    const temporary=path.resolve(dataDir,row.original_path),directory=path.join(dataDir,'media',id),destination=path.join(directory,'original.upload');fs.mkdirSync(directory,{recursive:false});
    return new Promise((resolve,reject)=>{
      const digest=crypto.createHash('sha256'),stream=fs.createWriteStream(temporary,{flags:'wx'});let received=0,settled=false;
      const failUpload=error=>{if(settled)return;settled=true;stream.destroy();fs.rmSync(temporary,{force:true});fs.rmSync(directory,{recursive:true,force:true});reject(error);};
      req.on('data',chunk=>{received+=chunk.length;if(received>row.bytes){req.destroy();failUpload(new Error('Upload exceeded reservation.'));return;}digest.update(chunk);});
      req.on('aborted',()=>failUpload(new Error('Upload interrupted.')));req.on('error',failUpload);stream.on('error',failUpload);
      stream.on('finish',()=>{if(settled)return;if(received!==row.bytes)return failUpload(new Error('Upload was incomplete.'));try{fs.renameSync(temporary,destination);const relative=`media/${id}/original.upload`;db.exec('BEGIN IMMEDIATE');db.prepare("UPDATE media SET original_path=?,sha256=?,status='queued',updated_at=datetime('now') WHERE id=?").run(relative,digest.digest('hex'),id);db.prepare("INSERT INTO media_jobs(media_id,kind,status) VALUES(?,'video','queued')").run(id);db.exec('COMMIT');settled=true;resolve({media_id:id,status:'queued'});}catch(error){if(db.isTransaction)db.exec('ROLLBACK');failUpload(error);}});
      req.pipe(stream);
    });
  }
  function receiveChunk(id,user,req){
    enabled();const row=db.prepare("SELECT * FROM media WHERE id=? AND owner_id=? AND kind='video' AND status='uploading'").get(id,user.id);if(!row)fail('UPLOAD_NOT_FOUND','Videoopplastingen finnes ikke.',404);
    const match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(String(req.headers['content-range']||''));
    if(!match)fail('CONTENT_RANGE','Content-Range mangler eller er ugyldig.',400);
    const [start,end,total]=match.slice(1).map(Number),length=Number(req.headers['content-length']);
    if(![start,end,total,length].every(Number.isSafeInteger)||start<0||end<start||total!==row.bytes||length!==end-start+1||length>8*1024*1024)fail('CONTENT_RANGE','Videobiten samsvarer ikke med reservasjonen.',400);
    const temporary=path.resolve(dataDir,row.original_path),directory=path.join(dataDir,'media',id);
    fs.mkdirSync(path.dirname(temporary),{recursive:true});fs.mkdirSync(directory,{recursive:true});
    const offset=fs.existsSync(temporary)?fs.statSync(temporary).size:0;
    if(start!==offset)fail('UPLOAD_OFFSET','Videobiten starter pÃ¥ feil sted.',409,{expected_offset:offset});
    return new Promise((resolve,reject)=>{
      const stream=fs.createWriteStream(temporary,{flags:'a'});let received=0,settled=false;
      const failed=error=>{if(settled)return;settled=true;stream.destroy();reject(error);};
      req.on('data',chunk=>{received+=chunk.length;if(received>length){req.destroy();failed(new Error('Chunk exceeded Content-Range.'));}});
      req.on('aborted',()=>failed(new Error('Upload interrupted.')));req.on('error',failed);stream.on('error',failed);
      stream.on('finish',async()=>{if(settled)return;if(received!==length)return failed(new Error('Upload chunk was incomplete.'));settled=true;
        const uploaded=end+1;if(uploaded<total)return resolve({media_id:id,status:'uploading',uploaded_bytes:uploaded,bytes:total});
        try{
          const destination=path.join(directory,'original.upload'),digest=await hashFile(temporary);
          fs.renameSync(temporary,destination);const relative=`media/${id}/original.upload`;
          db.exec('BEGIN IMMEDIATE');db.prepare("UPDATE media SET original_path=?,sha256=?,status='queued',updated_at=datetime('now') WHERE id=? AND status='uploading'").run(relative,digest,id);db.prepare("INSERT INTO media_jobs(media_id,kind,status) VALUES(?,'video','queued')").run(id);db.exec('COMMIT');resolve({media_id:id,status:'queued',uploaded_bytes:total,bytes:total});
        }catch(error){if(db.isTransaction)db.exec('ROLLBACK');reject(error);}
      });req.pipe(stream);
    });
  }
  function status(id,user){const row=db.prepare('SELECT id,status,error_code,duration_ms,thumbnail_path,display_path,original_path,bytes FROM media WHERE id=? AND owner_id=?').get(id,user.id);if(!row)fail('UPLOAD_NOT_FOUND','Videoopplastingen finnes ikke.',404);const temporary=path.resolve(dataDir,row.original_path),uploaded=row.status==='uploading'&&fs.existsSync(temporary)?fs.statSync(temporary).size:row.bytes;delete row.original_path;return {...row,uploaded_bytes:uploaded,thumbnail_url:row.thumbnail_path?'/'+row.thumbnail_path:null,media_url:row.display_path?'/'+row.display_path:null};}
  function cancel(id,user){const row=db.prepare("SELECT m.*,pm.post_id,a.post_id article_post_id FROM media m LEFT JOIN post_media pm ON pm.media_id=m.id LEFT JOIN article_assets a ON a.media_id=m.id WHERE m.id=? AND m.owner_id=? AND m.status IN ('uploading','queued','failed','rejected')").get(id,user.id);if(!row||row.article_post_id)fail('UPLOAD_NOT_CANCELLABLE','Opplastingen kan ikke avbrytes.',409);db.exec('BEGIN IMMEDIATE');try{if(row.post_id)db.prepare('DELETE FROM posts WHERE id=?').run(row.post_id);db.prepare('DELETE FROM media WHERE id=?').run(id);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}for(const relative of [row.original_path,row.display_path,row.thumbnail_path].filter(Boolean))fs.rmSync(path.resolve(dataDir,relative),{force:true});fs.rmSync(path.join(dataDir,'media',id),{recursive:true,force:true});return {ok:true};}
  function processOne(){
    enabled();db.exec('BEGIN IMMEDIATE');let job;
    try{db.exec(`UPDATE media_jobs SET status='queued',locked_at=NULL,available_at=datetime('now') WHERE status='processing' AND locked_at<datetime('now','-30 minutes') AND attempts<3;
      UPDATE media SET status='queued',updated_at=datetime('now') WHERE id IN (SELECT media_id FROM media_jobs WHERE status='queued') AND status='processing';
      UPDATE media_jobs SET status='failed',error='WORKER_TIMEOUT' WHERE status='processing' AND locked_at<datetime('now','-30 minutes') AND attempts>=3;
      UPDATE media SET status='failed',error_code='WORKER_TIMEOUT',updated_at=datetime('now') WHERE id IN (SELECT media_id FROM media_jobs WHERE status='failed' AND error='WORKER_TIMEOUT');
      UPDATE posts SET status='rejected' WHERE id IN (SELECT pm.post_id FROM post_media pm JOIN media_jobs j ON j.media_id=pm.media_id WHERE j.status='failed' AND j.error='WORKER_TIMEOUT');`);
      job=db.prepare("SELECT * FROM media_jobs WHERE status='queued' AND available_at<=datetime('now') ORDER BY id LIMIT 1").get();if(!job){db.exec('COMMIT');return null;}db.prepare("UPDATE media_jobs SET status='processing',attempts=attempts+1,locked_at=datetime('now') WHERE id=?").run(job.id);db.prepare("UPDATE media SET status='processing',updated_at=datetime('now') WHERE id=?").run(job.media_id);db.exec('COMMIT');}
    catch(error){db.exec('ROLLBACK');throw error;}
    const media=db.prepare('SELECT * FROM media WHERE id=?').get(job.media_id),input=path.resolve(dataDir,media.original_path),dir=path.join(dataDir,'media',media.id),output=path.join(dir,'display.mp4'),thumbnail=path.join(dir,'thumbnail.jpg');
    try{
      const probe=run(config.ffprobe,['-v','error','-show_entries','format=duration:stream=codec_type,width,height','-of','json',input],{encoding:'utf8',timeout:120000,windowsHide:true});
      if(probe.status!==0)throw new Error('ffprobe rejected media: '+String(probe.stderr).slice(0,300));
      const parsed=JSON.parse(probe.stdout),duration=Math.round(Number(parsed.format?.duration)*1000),video=parsed.streams?.find(stream=>stream.codec_type==='video');
      if(!video||!Number.isFinite(duration)||duration<1)throw new Error('Video stream or duration missing.');
      if(duration>180000){db.exec('BEGIN IMMEDIATE');db.prepare("UPDATE media SET status='rejected',error_code='DURATION_LIMIT',duration_ms=?,updated_at=datetime('now') WHERE id=?").run(duration,media.id);db.prepare("UPDATE posts SET status='rejected' WHERE id=(SELECT post_id FROM post_media WHERE media_id=?)").run(media.id);db.prepare("UPDATE media_jobs SET status='failed',error='DURATION_LIMIT' WHERE id=?").run(job.id);db.exec('COMMIT');return {id:media.id,status:'rejected'};}
      const transcode=run(config.ffmpeg,['-nostdin','-y','-i',input,'-map_metadata','-1','-vf','scale=trunc(min(1280\\,iw)/2)*2:-2','-c:v','libx264','-preset','medium','-crf','23','-c:a','aac','-b:a','128k','-movflags','+faststart',output],{encoding:'utf8',timeout:30*60*1000,windowsHide:true});
      if(transcode.status!==0)throw new Error('ffmpeg transcode failed: '+String(transcode.stderr).slice(-400));
      const frame=run(config.ffmpeg,['-nostdin','-y','-ss',String(Math.min(duration/2000,3)),'-i',output,'-frames:v','1','-vf','scale=960:-2',thumbnail],{encoding:'utf8',timeout:120000,windowsHide:true});
      if(frame.status!==0)throw new Error('ffmpeg thumbnail failed: '+String(frame.stderr).slice(-300));
      const display=`media/${media.id}/display.mp4`,thumb=`media/${media.id}/thumbnail.jpg`;
      db.exec('BEGIN IMMEDIATE');db.prepare("UPDATE media SET status='ready',display_path=?,thumbnail_path=?,duration_ms=?,width=?,height=?,updated_at=datetime('now') WHERE id=?").run(display,thumb,duration,video.width||null,video.height||null,media.id);db.prepare("UPDATE posts SET status='published',image_url=? WHERE id=(SELECT post_id FROM post_media WHERE media_id=?)").run('/'+thumb,media.id);db.prepare("UPDATE media_jobs SET status='done',error=NULL WHERE id=?").run(job.id);audit?.record({action:'media.ready',subjectType:'media',subjectId:media.id,next:{duration_ms:duration}});db.exec('COMMIT');return {id:media.id,status:'ready'};
    }catch(error){if(db.isTransaction)db.exec('ROLLBACK');db.exec('BEGIN IMMEDIATE');const attempts=db.prepare('SELECT attempts FROM media_jobs WHERE id=?').get(job.id).attempts,final=attempts>=3;db.prepare("UPDATE media_jobs SET status=?,error=?,available_at=datetime('now','+5 minutes') WHERE id=?").run(final?'failed':'queued',error.message.slice(0,500),job.id);db.prepare("UPDATE media SET status=?,error_code='PROCESSING_FAILED',updated_at=datetime('now') WHERE id=?").run(final?'failed':'queued',media.id);if(final)db.prepare("UPDATE posts SET status='rejected' WHERE id=(SELECT post_id FROM post_media WHERE media_id=?)").run(media.id);db.exec('COMMIT');throw error;}
  }
  return {begin,beginArticleAsset,receive,receiveChunk,status,cancel,processOne};
}
module.exports={createVideoService};
