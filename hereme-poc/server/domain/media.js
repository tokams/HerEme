'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const sharp=require('sharp');
const {fail}=require('./errors');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function imageInfo(bytes){
  if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
    return {ext:'png',mime:'image/png',width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
  if(bytes.length>=30&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'){
    const kind=bytes.toString('ascii',12,16);let width,height;
    if(kind==='VP8X'&&bytes.length>=30){width=1+bytes.readUIntLE(24,3);height=1+bytes.readUIntLE(27,3);}
    if(!width||!height)fail('MEDIA_DECODE_FAILED','WebP-bildet kunne ikke valideres.',400);
    return {ext:'webp',mime:'image/webp',width,height};
  }
  if(bytes.length>4&&bytes[0]===0xff&&bytes[1]===0xd8){
    let offset=2;
    while(offset+9<bytes.length){
      if(bytes[offset]!==0xff){offset++;continue;}
      const marker=bytes[offset+1];if(marker===0xd9||marker===0xda)break;
      const length=bytes.readUInt16BE(offset+2);if(length<2||offset+2+length>bytes.length)break;
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))
        return {ext:'jpg',mime:'image/jpeg',height:bytes.readUInt16BE(offset+5),width:bytes.readUInt16BE(offset+7)};
      offset+=2+length;
    }
    fail('MEDIA_DECODE_FAILED','JPEG-bildet kunne ikke dekodes.',400);
  }
  fail('MEDIA_UNSUPPORTED','Kun gyldig JPEG, PNG og WebP er støttet.',400);
}
function backfillLegacyMedia(db,dataDir){
  const insert=db.prepare(`INSERT OR IGNORE INTO media(id,kind,status,original_path,display_path,thumbnail_path,mime_type,bytes,sha256)
    VALUES(?,'image','ready',?,?,?,?,?,?)`);
  const link=db.prepare('INSERT OR IGNORE INTO post_media(post_id,media_id) VALUES(?,?)');
  for(const row of db.prepare("SELECT id,image_url FROM posts WHERE image_url LIKE '/uploads/%' AND NOT EXISTS(SELECT 1 FROM post_media pm WHERE pm.post_id=posts.id)").all()){
    const name=row.image_url.slice('/uploads/'.length);if(!/^[A-Za-z0-9_-]+\.(png|jpg|jpeg|webp)$/.test(name))throw new Error(`Unsafe legacy media path: ${row.image_url}`);
    const absolute=path.join(dataDir,'uploads',name);if(!fs.existsSync(absolute))throw new Error(`Missing legacy media: ${row.image_url}`);
    const bytes=fs.readFileSync(absolute),id='legacy-'+hash(Buffer.from(row.image_url)).slice(0,24),relative='uploads/'+name;
    const info=imageInfo(bytes);insert.run(id,relative,relative,relative,info.mime,bytes.length,hash(bytes));link.run(row.id,id);
  }
}
function createMediaService(db,dataDir,{uploadsSuspended=false,minFreeBytes=0}={}){
  const root=path.resolve(dataDir),mediaRoot=path.join(root,'media');
  function available(){
    if(uploadsSuspended)fail('UPLOADS_SUSPENDED','Nye opplastinger er midlertidig stoppet.',503);
    const stats=fs.statfsSync(root);const free=stats.bavail*stats.bsize;
    if(free<minFreeBytes)fail('DISK_PRESSURE','Ikke nok lagringsplass til opplasting.',503);
  }
  async function storeImage(file,ownerId){
    if(!file?.buffer)fail('MEDIA_REQUIRED','Velg et bilde først.');
    available();const info=imageInfo(file.buffer);
    if(info.width<1||info.height<1||info.width*info.height>50_000_000)fail('MEDIA_DIMENSIONS','Bildets dimensjoner er ikke støttet.');
    const id=crypto.randomUUID(),directory=path.join(mediaRoot,id),name=`original.${info.ext}`;
    fs.mkdirSync(directory,{recursive:false});const absolute=path.join(directory,name);
    try{
      fs.writeFileSync(absolute,file.buffer,{flag:'wx'});
      const pipeline=sharp(file.buffer,{failOn:'error',limitInputPixels:50_000_000}).rotate();
      const metadata=await pipeline.metadata();
      if(!metadata.width||!metadata.height)fail('MEDIA_DECODE_FAILED','Bildet kunne ikke dekodes.',400);
      const displayName='display.jpg',thumbnailName='thumbnail.jpg';
      await pipeline.clone().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:86,mozjpeg:true}).toFile(path.join(directory,displayName));
      await pipeline.clone().resize({width:720,height:806,fit:'cover',position:'centre'}).jpeg({quality:82,mozjpeg:true}).toFile(path.join(directory,thumbnailName));
      const relative=`media/${id}/${name}`,display=`media/${id}/${displayName}`,thumbnail=`media/${id}/${thumbnailName}`,url=`/${display}`;
      db.prepare(`INSERT INTO media(id,owner_id,kind,status,original_path,display_path,thumbnail_path,mime_type,bytes,sha256,width,height)
        VALUES(?,?,'image','ready',?,?,?,?,?,?,?,?)`).run(id,ownerId,relative,display,thumbnail,info.mime,file.buffer.length,hash(file.buffer),metadata.width,metadata.height);
      return {id,url,cleanup:()=>{db.prepare('DELETE FROM media WHERE id=?').run(id);fs.rmSync(directory,{recursive:true,force:true});}};
    }catch(error){fs.rmSync(directory,{recursive:true,force:true});throw error;}
  }
  function resolve(relative){
    const absolute=path.resolve(root,relative);if(absolute!==root&&!absolute.startsWith(root+path.sep))throw new Error('Unsafe media path.');return absolute;
  }
  function get(id){const row=db.prepare('SELECT * FROM media WHERE id=?').get(id);return row?{...row,url:row.display_path?'/'+row.display_path.replaceAll('\\','/'):null,thumbnail_url:row.thumbnail_path?'/'+row.thumbnail_path.replaceAll('\\','/'):null}:null;}
  return {storeImage,resolve,get,available};
}
module.exports={createMediaService,backfillLegacyMedia,imageInfo};
