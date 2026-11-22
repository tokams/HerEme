'use strict';
const {fail}=require('./errors');

function createProfileService(db,{posts,avatars}){
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const decode=value=>{try{return JSON.parse(Buffer.from(value,'base64url').toString('utf8'));}catch{fail('INVALID_CURSOR','Ugyldig sidepeker.');}};
  function summary(user,{sort='new',cursor='',limit=20}={}){
    sort=['new','top'].includes(sort)?sort:fail('INVALID_SORT','Ugyldig sortering.');
    limit=Number(limit);if(!Number.isInteger(limit)||limit<1||limit>50)fail('INVALID_LIMIT','Grense må være 1–50.');
    const metrics=db.prepare(`SELECT
      (SELECT count(*) FROM posts WHERE author_id=?) post_count,
      (SELECT count(*) FROM votes v JOIN posts p ON p.id=v.post_id WHERE p.author_id=? AND v.value=1 AND v.user_id<>?) upvotes_received,
      (SELECT count(*) FROM comments c JOIN posts p ON p.id=c.post_id WHERE p.author_id=?) comments_received,
      (SELECT count(*) FROM chats c JOIN chat_members m ON m.chat_id=c.id WHERE m.user_id=? AND c.kind='direct' AND c.direct_state='accepted') direct_chat_count,
      (SELECT count(*) FROM chats c JOIN chat_members m ON m.chat_id=c.id WHERE m.user_id=? AND c.kind='group') group_chat_count`).get(user.id,user.id,user.id,user.id,user.id,user.id);
    const author=db.prepare('SELECT name,created_at FROM users WHERE id=?').get(user.id);
    const score='p.base_score+COALESCE((SELECT sum(v.value) FROM votes v WHERE v.post_id=p.id),0)';
    const order=sort==='new'?'p.created_at DESC,abs(p.id) DESC':`${score} DESC,p.created_at DESC,abs(p.id) DESC`;
    const where=['p.author_id=?'],params=[user.id];
    if(cursor){const point=decode(cursor);if(point.sort!==sort)fail('INVALID_CURSOR','Sidepekeren tilhører en annen sortering.');if(sort==='new'){where.push('(p.created_at<? OR (p.created_at=? AND abs(p.id)<?))');params.push(point.created_at,point.created_at,point.id);}else{where.push(`(${score}<? OR (${score}=? AND (p.created_at<? OR (p.created_at=? AND abs(p.id)<?))))`);params.push(point.score,point.score,point.created_at,point.created_at,point.id);}}
    const rows=db.prepare(`SELECT p.id,p.title,p.status,p.created_at,d.category,CASE WHEN a.post_id IS NULL THEN 'poster' ELSE 'article' END content_format,${score} score,
      (SELECT count(*) FROM votes v WHERE v.post_id=p.id AND v.value=1 AND v.user_id<>p.author_id) upvotes_received,
      (SELECT count(*) FROM comments c WHERE c.post_id=p.id) comment_count
      FROM posts p LEFT JOIN post_design d ON d.post_id=p.id LEFT JOIN articles a ON a.post_id=p.id WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ?`).all(...params,limit+1);
    const hasMore=rows.length>limit;if(hasMore)rows.pop();const last=rows.at(-1);
    const next_cursor=hasMore?encode({sort,created_at:last.created_at,id:Math.abs(last.id),score:last.score}):null;
    return {profile:{name:author.name,created_at:author.created_at,...avatars.urls(user.id)},metrics,posts:rows,next_cursor,has_more:hasMore};
  }
  return {summary};
}
module.exports={createProfileService};
