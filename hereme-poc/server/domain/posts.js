'use strict';
const {fail}=require('./errors');
const V=require('./validation');
const {ids:categoryIds,legacyCategory,parseDesign,insertDesign}=require('../post-design');
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const decode=value=>{try{return JSON.parse(Buffer.from(value,'base64url').toString('utf8'));}catch{fail('INVALID_CURSOR','Ugyldig sidepeker.');}};
function createPostService(db,{media,audit,articles,config={}}={}){
  const projection=`SELECT p.*,r.slug room_slug,r.name room_name,r.emoji room_emoji,
    COALESCE(CASE WHEN u.status='active' THEN u.name END,p.demo_author,'anonym') author,CASE WHEN u.status='active' AND COALESCE(pp.synthetic_demo,0)=0 THEN u.id ELSE NULL END author_public_id,COALESCE(pp.synthetic_demo,0) synthetic_demo,pp.poster_json,
    d.category,d.image_zoom,d.image_x,d.image_y,d.text_position,pa.area_id,pm.media_id,m.kind media_kind,m.status media_status,
    CASE WHEN ar.post_id IS NULL THEN 'poster' ELSE 'article' END content_format,ar.abstract article_abstract,pc.text poster_text,
    m.display_path media_display_path,m.thumbnail_path media_thumbnail_path,m.duration_ms,
    p.base_score+COALESCE((SELECT sum(v.value) FROM votes v WHERE v.post_id=p.id),0) score,
    (SELECT count(*) FROM comments c WHERE c.post_id=p.id) comment_count`;
  const joins=` FROM posts p LEFT JOIN rooms r ON r.id=p.room_id LEFT JOIN users u ON u.id=p.author_id
    LEFT JOIN post_presentation pp ON pp.post_id=p.id LEFT JOIN post_design d ON d.post_id=p.id LEFT JOIN post_areas pa ON pa.post_id=p.id
    LEFT JOIN post_media pm ON pm.post_id=p.id LEFT JOIN media m ON m.id=pm.media_id LEFT JOIN articles ar ON ar.post_id=p.id LEFT JOIN poster_content pc ON pc.post_id=p.id`;
  function publicPost(row,myVote=0){
    if(!row)return null;const {author_id,demo_author,base_score,poster_json,...result}=row;
    const design=row.category?{category:row.category,image_zoom:row.image_zoom,image_x:row.image_x,image_y:row.image_y,text_position:row.text_position}:parseDesign({},legacyCategory(row.room_slug,row.type));
    const posterText=row.poster_text||(row.body?.trim()?row.body.trim().startsWith(row.title)?row.body:`${row.title}\n\n${row.body}`:row.title);
    return {...result,...design,poster_text:posterText,poster_style:design.category,poster:poster_json?JSON.parse(poster_json):null,my_vote:myVote,
      media_url:row.media_display_path?'/'+row.media_display_path.replaceAll('\\','/'):null,
      media_thumbnail_url:row.media_thumbnail_path?'/'+row.media_thumbnail_path.replaceAll('\\','/'):null};
  }
  function visible(id,userId=null){
    const row=db.prepare(projection+joins+" WHERE p.id=? AND p.status='published'").get(id);
    const vote=userId&&row?db.prepare('SELECT value FROM votes WHERE post_id=? AND user_id=?').get(id,userId)?.value||0:0;
    const post=publicPost(row,vote);if(post?.content_format==='article')post.article=articles.detail(id);return post;
  }
  function list({categories,areas,sort='new',q='',cursor='',limit=24,userId=null}={}){
    sort=['new','top','hot'].includes(sort)?sort:fail('INVALID_SORT','Ugyldig sortering.');
    limit=Number(limit||24);if(!Number.isInteger(limit)||limit<1||limit>50)fail('INVALID_LIMIT','Grense må være 1–50.');
    const selected=categories===undefined?[...categoryIds]:String(categories).split(',').filter(Boolean);
    if(selected.some(item=>!categoryIds.includes(item)))fail('INVALID_CATEGORY','Ugyldig kategori.');
    if(!selected.length)return {posts:[],next_cursor:null,has_more:false};
    q=String(q||'').trim().slice(0,100);
    const params=[],where=["p.status='published'",`d.category IN (${selected.map(()=>'?').join(',')})`];params.push(...selected);
    if(areas!==undefined){if(!config.enableLocations)fail('LOCATIONS_DISABLED','Områder er ikke aktivert.',404);const chosen=String(areas).split(',').filter(Boolean);if(chosen.length){const placeholders=chosen.map(()=>'?').join(',');if(db.prepare(`SELECT count(*) n FROM areas WHERE active=1 AND id IN (${placeholders})`).get(...chosen).n!==chosen.length)fail('INVALID_AREAS','Ugyldig områdeutvalg.');where.push(`(pa.area_id IN (${placeholders}) OR pa.area_id IS NULL)`);params.push(...chosen);}}
    if(q){const terms=q.match(/[\p{L}\p{N}]+/gu)?.slice(0,8)||[];if(!terms.length)return {posts:[],next_cursor:null,has_more:false};where.push('p.id IN (SELECT rowid FROM post_search WHERE post_search MATCH ?)');params.push(terms.map(term=>`"${term.replaceAll('"','""')}"*`).join(' AND '));}
    const score='p.base_score+COALESCE((SELECT sum(v.value) FROM votes v WHERE v.post_id=p.id),0)';
    const key=sort==='new'?'julianday(p.created_at)':sort==='top'?score:`(max(${score},0)+1.0)/(2.0+max((julianday('now')-julianday(p.created_at))*24.0,0))`;
    if(cursor){const point=decode(cursor);if(point.sort!==sort)fail('INVALID_CURSOR','Sidepekeren tilhører en annen sortering.');where.push(`(${key}<? OR (${key}=? AND (p.created_at<? OR (p.created_at=? AND abs(p.id)<?))))`);params.push(point.key,point.key,point.time,point.time,point.id);}
    const rows=db.prepare(`${projection},${key} page_key ${joins} WHERE ${where.join(' AND ')}
      ORDER BY page_key DESC,p.created_at DESC,abs(p.id) DESC LIMIT ?`).all(...params,limit+1);
    const hasMore=rows.length>limit;if(hasMore)rows.pop();
    const votes=userId&&rows.length?new Map(db.prepare(`SELECT post_id,value FROM votes WHERE user_id=? AND post_id IN (${rows.map(()=>'?').join(',')})`).all(userId,...rows.map(r=>r.id)).map(r=>[r.post_id,r.value])):new Map();
    const posts=rows.map(row=>publicPost(row,votes.get(row.id)||0)),last=rows.at(-1);
    return {posts,has_more:hasMore,next_cursor:hasMore?encode({sort,key:last.page_key,time:last.created_at,id:Math.abs(last.id)}):null};
  }
  async function create(input,user,file){
    const modern=input.format==='poster',body=modern?V.text(input.body,{name:'Plakattekst',min:3,max:3000}):V.optionalText(input.body,{name:'Innlegg',max:3000});
    const title=modern?body.slice(0,160):V.text(input.title,{name:'Overskrift',min:3,max:160});
    const type=V.enumValue(input.type,['text','link','image'],'Innleggstype');
    const design=parseDesign(input,legacyCategory(null,type));let link=null;
    if(type==='link'||input.link_url)link=V.httpUrl(input.link_url);
    if(type==='image'&&!file)fail('MEDIA_REQUIRED','Velg et bilde først.');
    if(type!=='image'&&file)fail('MEDIA_NOT_ALLOWED','Denne innleggstypen kan ikke ha bilde.');
    let stored=null;
    try{
      if(file)stored=await media.storeImage(file,user.id);
      db.exec('BEGIN IMMEDIATE');
      const row=db.prepare(`INSERT INTO posts(id,room_id,author_id,title,body,type,link_url,image_url,base_score)
        VALUES(?,?,?,?,?,?,?,?,0)`).run(require('../migrations').nextId(db,'posts'),null,user.id,title,body,type,link,stored?.url||null);
      const id=Number(row.lastInsertRowid);
      if(modern)db.prepare('INSERT INTO poster_content(post_id,text) VALUES(?,?)').run(id,body);
      db.prepare('INSERT INTO votes(post_id,user_id,value) VALUES(?,?,1)').run(id,user.id);
      insertDesign(db,id,design);
      if(stored)db.prepare('INSERT INTO post_media(post_id,media_id) VALUES(?,?)').run(id,stored.id);
      if(input.area_id){if(!config.enableLocations)fail('LOCATIONS_DISABLED','Områder er ikke aktivert.',404);if(!db.prepare('SELECT id FROM areas WHERE id=? AND active=1').get(input.area_id))fail('INVALID_AREAS','Ugyldig område.');db.prepare('INSERT INTO post_areas(post_id,area_id) VALUES(?,?)').run(id,input.area_id);}
      audit?.record({actorId:user.id,action:'post.created',subjectType:'post',subjectId:id,next:{status:'published',type,category:design.category}});db.exec('COMMIT');
      return {id};
    }catch(error){if(db.isTransaction)db.exec('ROLLBACK');stored?.cleanup();throw error;}
  }
  return {list,visible,create,publicPost,projection,joins};
}
module.exports={createPostService};
