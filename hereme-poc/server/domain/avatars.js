'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const sharp=require('sharp');
const {fail}=require('./errors');

const MAX_BYTES=5*1024*1024;
const MAX_PIXELS=25_000_000;
const userIdPattern=/^[A-Za-z0-9_-]{1,100}$/;
function createAvatarService(db,dataDir,{media,audit}={}){
  const root=path.resolve(dataDir,'avatars');fs.mkdirSync(root,{recursive:true});
  const directory=(userId,version)=>{
    if(!userIdPattern.test(userId)||!Number.isSafeInteger(version)||version<1)throw new Error('Invalid avatar storage identity.');
    const target=path.resolve(root,crypto.createHash('sha256').update(userId).digest('hex'),String(version));
    if(!target.startsWith(root+path.sep))throw new Error('Avatar storage path escaped its root.');
    return target;
  };
  const row=userId=>db.prepare('SELECT a.* FROM user_avatars a JOIN users u ON u.id=a.user_id WHERE a.user_id=? AND u.status=\'active\'').get(userId);
  const urls=userId=>{const current=row(userId);return current?{avatar_url:`/api/avatars/${userId}/${current.version}/small`,avatar_large_url:`/api/avatars/${userId}/${current.version}/large`}:{avatar_url:null,avatar_large_url:null};};
  const publicView=userId=>({avatar_url:urls(userId).avatar_url});
  function file(userId,version,size){
    if(!['small','large'].includes(size)||!userIdPattern.test(userId)||!Number.isSafeInteger(Number(version)))fail('AVATAR_NOT_FOUND','Profilbildet finnes ikke.',404);
    const current=row(userId);
    if(!current||current.version!==Number(version))fail('AVATAR_NOT_FOUND','Profilbildet finnes ikke.',404);
    return path.join(directory(userId,current.version),size+'.webp');
  }
  async function save(auth,file,input={}){
    if(!file?.buffer?.length)fail('AVATAR_REQUIRED','Velg et profilbilde.',400);
    if(file.buffer.length>MAX_BYTES)fail('AVATAR_TOO_LARGE','Profilbildet er for stort.',413);
    const bytes=file.buffer;
    const isPng=bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'));
    const isJpeg=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
    const isWebp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
    if(!isPng&&!isJpeg&&!isWebp)fail('AVATAR_UNSUPPORTED','Bruk JPEG, PNG eller WebP.',400);
    const crop={x:Number(input.x),y:Number(input.y),zoom:Number(input.zoom)};
    if(!Number.isFinite(crop.x)||crop.x<0||crop.x>100||!Number.isFinite(crop.y)||crop.y<0||crop.y>100||!Number.isFinite(crop.zoom)||crop.zoom<1||crop.zoom>3)fail('AVATAR_CROP','Ugyldig bildeutsnitt.',400);
    media.available();
    let oriented;
    try{oriented=await sharp(bytes,{failOn:'error',limitInputPixels:MAX_PIXELS}).rotate().toBuffer({resolveWithObject:true});}
    catch(error){if(error.message.includes('pixel limit'))fail('AVATAR_DIMENSIONS','Bildet har for mange piksler.',400);fail('AVATAR_DECODE_FAILED','Bildet kunne ikke leses.',400);}
    const {width,height}=oriented.info;if(!width||!height||width*height>MAX_PIXELS)fail('AVATAR_DIMENSIONS','Bildet har for mange piksler.',400);
    const side=Math.max(1,Math.floor(Math.min(width,height)/crop.zoom));
    const left=Math.round((width-side)*crop.x/100),top=Math.round((height-side)*crop.y/100);
    const source=sharp(oriented.data).extract({left,top,width:side,height:side});
    const [small,large]=await Promise.all([
      source.clone().resize(64,64).webp({quality:80}).toBuffer(),
      source.clone().resize(256,256).webp({quality:84}).toBuffer()
    ]);
    const previous=db.prepare('SELECT version FROM user_avatars WHERE user_id=?').get(auth.id);
    const version=(previous?.version||0)+1,target=directory(auth.id,version);
    fs.mkdirSync(path.dirname(target),{recursive:true});fs.mkdirSync(target,{recursive:false});
    try{
      fs.writeFileSync(path.join(target,'small.webp'),small,{flag:'wx'});
      fs.writeFileSync(path.join(target,'large.webp'),large,{flag:'wx'});
      db.exec('BEGIN IMMEDIATE');
      db.prepare(`INSERT INTO user_avatars(user_id,version,small_path,large_path) VALUES(?,?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET version=excluded.version,small_path=excluded.small_path,large_path=excluded.large_path,created_at=datetime('now')`)
        .run(auth.id,version,path.relative(dataDir,path.join(target,'small.webp')).replaceAll('\\','/'),path.relative(dataDir,path.join(target,'large.webp')).replaceAll('\\','/'));
      audit?.record({actorId:auth.id,action:'avatar.updated',subjectType:'user',subjectId:auth.id,next:{version}});
      db.exec('COMMIT');
    }catch(error){if(db.isTransaction)db.exec('ROLLBACK');fs.rmSync(target,{recursive:true,force:true});throw error;}
    if(previous)fs.rmSync(directory(auth.id,previous.version),{recursive:true,force:true});
    return urls(auth.id);
  }
  function remove(auth){
    const previous=db.prepare('SELECT version FROM user_avatars WHERE user_id=?').get(auth.id);
    if(!previous)return urls(auth.id);
    db.exec('BEGIN IMMEDIATE');try{db.prepare('DELETE FROM user_avatars WHERE user_id=?').run(auth.id);audit?.record({actorId:auth.id,action:'avatar.removed',subjectType:'user',subjectId:auth.id});db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
    purgeUser(auth.id);
    return urls(auth.id);
  }
  function purgeUser(userId){if(!userIdPattern.test(userId))throw new Error('Invalid avatar user identity.');const target=path.join(root,crypto.createHash('sha256').update(userId).digest('hex'));if(!target.startsWith(root+path.sep))throw new Error('Avatar purge escaped its root.');fs.rmSync(target,{recursive:true,force:true});}
  function verify(){for(const current of db.prepare('SELECT user_id,version FROM user_avatars').all())for(const size of ['small','large'])if(!fs.existsSync(path.join(directory(current.user_id,current.version),size+'.webp')))throw new Error(`Missing avatar file for ${current.user_id}.`);return true;}
  function cleanup(){
    const keep=new Map(db.prepare('SELECT user_id,version FROM user_avatars').all().map(current=>[crypto.createHash('sha256').update(current.user_id).digest('hex'),String(current.version)]));
    for(const userEntry of fs.readdirSync(root,{withFileTypes:true})){
      if(!userEntry.isDirectory()||!/^[0-9a-f]{64}$/.test(userEntry.name))throw new Error('Unexpected avatar storage entry.');
      const userPath=path.join(root,userEntry.name);if(!userPath.startsWith(root+path.sep))throw new Error('Avatar cleanup escaped its root.');
      if(!keep.has(userEntry.name)){fs.rmSync(userPath,{recursive:true,force:true});continue;}
      for(const versionEntry of fs.readdirSync(userPath,{withFileTypes:true}))if(versionEntry.name!==keep.get(userEntry.name)){
        if(!versionEntry.isDirectory()||!/^\d+$/.test(versionEntry.name))throw new Error('Unexpected avatar version entry.');
        const versionPath=path.join(userPath,versionEntry.name);if(!versionPath.startsWith(root+path.sep))throw new Error('Avatar cleanup escaped its root.');fs.rmSync(versionPath,{recursive:true,force:true});
      }
    }
    verify();
  }
  return {save,remove,file,urls,publicView,purgeUser,verify,cleanup,MAX_BYTES};
}
module.exports={createAvatarService};
