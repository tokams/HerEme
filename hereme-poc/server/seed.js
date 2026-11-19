'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {nextId}=require('./migrations');
const {backfillDesigns}=require('./post-design');
const defaultPack=path.resolve(__dirname,'../seed/example_posts.json');
const date=value=>new Date(value).toISOString().replace('T',' ').slice(0,19);

function seedDemo(db,packFile=defaultPack,publicDir=path.resolve(__dirname,'../public')) {
  const pack=JSON.parse(fs.readFileSync(packFile,'utf8'));
  if(pack.schema_version!=='1.0'||pack.dataset_id!=='hereme-poster-demo-nov-2026'||pack.synthetic_demo!==true)
    throw new Error('Unsupported or unlabeled seed pack.');
  const seen=new Set();
  for(const post of pack.posts){
    if(seen.has(post.seed_key)||!post.seed_key)throw new Error('Duplicate or missing seed key.');
    seen.add(post.seed_key);
    if(post.synthetic_demo!==true||!['poster','image','text','link'].includes(post.type))throw new Error(`Invalid demo post: ${post.seed_key}`);
    if(!pack.rooms.some(room=>room.slug===post.room_slug))throw new Error(`Unknown seed room: ${post.room_slug}`);
    if(post.type==='link'&&!/^https?:\/\//.test(post.link_url))throw new Error(`Invalid link: ${post.seed_key}`);
    for(const url of [post.image_url,post.poster?.source_image_url].filter(Boolean)){
      if(!/^\/assets\/demo\/(posts|sources)\/[a-z0-9_-]+\.jpg$/.test(url))throw new Error(`Invalid seed asset: ${url}`);
      if(!fs.statSync(path.join(publicDir,url.slice(1))).isFile())throw new Error(`Missing seed asset: ${url}`);
    }
  }
  let added=0,skipped=0;
  db.exec('BEGIN IMMEDIATE');
  try{
    for(const post of pack.posts){
      const imported=db.prepare('SELECT post_id FROM hereme_demo_imports WHERE seed_key=?').get(post.seed_key);
      if(imported){
        // Older supplied importers tracked the seed but did not retain display metadata.
        db.prepare('INSERT INTO post_presentation(post_id,synthetic_demo,poster_json) VALUES(?,1,?) ON CONFLICT(post_id) DO NOTHING')
          .run(imported.post_id,post.poster?JSON.stringify(post.poster):null);
        skipped++;continue;
      }
      let room=db.prepare('SELECT id FROM rooms WHERE slug=?').get(post.room_slug);
      if(!room){
        const info=pack.rooms.find(r=>r.slug===post.room_slug);
        const result=db.prepare('INSERT INTO rooms(id,slug,name,description,emoji) VALUES(?,?,?,?,?)')
          .run(nextId(db,'rooms'),info.slug,info.name,info.description,info.emoji);
        room={id:Number(result.lastInsertRowid)};
      }
      const result=db.prepare(`INSERT INTO posts(id,room_id,demo_author,title,body,type,link_url,image_url,base_score,status,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(nextId(db,'posts'),room.id,post.demo_author,post.title,post.body,post.type,
        post.link_url??null,post.image_url??null,post.base_score,post.status,date(post.created_at));
      const id=Number(result.lastInsertRowid),comments=new Map();
      for(const comment of post.comments??[]){
        const parent=comment.parent_local_id?comments.get(comment.parent_local_id):null;
        if(comment.parent_local_id&&!parent)throw new Error(`Unknown seed parent: ${comment.parent_local_id}`);
        const depth=parent?parent.depth+1:0;
        if(depth>3)throw new Error('Seed reply nesting exceeds four levels.');
        const row=db.prepare('INSERT INTO comments(id,post_id,parent_id,demo_author,body,depth,created_at) VALUES(?,?,?,?,?,?,?)')
          .run(nextId(db,'comments'),id,parent?.id??null,comment.demo_author,comment.body,depth,date(comment.created_at));
        comments.set(comment.local_id,{id:Number(row.lastInsertRowid),depth});
      }
      db.prepare('INSERT INTO hereme_demo_imports(seed_key,post_id) VALUES(?,?)').run(post.seed_key,id);
      db.prepare('INSERT INTO post_presentation(post_id,synthetic_demo,poster_json) VALUES(?,1,?)')
        .run(id,post.poster?JSON.stringify(post.poster):null);
      added++;
    }
    backfillDesigns(db);
    db.exec('COMMIT');return {added,skipped};
  }catch(error){db.exec('ROLLBACK');throw error;}
}
module.exports={seedDemo};
