'use strict';
const {fail}=require('./errors');
const V=require('./validation');
const {nextId}=require('../migrations');
function createInteractionService(db,{audit,notifications}={}){
  function published(id){const row=db.prepare("SELECT id FROM posts WHERE id=? AND status='published'").get(id);if(!row)fail('POST_NOT_FOUND','Innlegget finnes ikke.',404);return row;}
  function vote(postId,user,value){
    postId=V.integer(postId,{name:'Innleggs-ID'});value=Number(value);if(![-1,1].includes(value))fail('INVALID_VOTE','Stem opp eller ned.');
    published(postId);const old=db.prepare('SELECT value FROM votes WHERE post_id=? AND user_id=?').get(postId,user.id)?.value;
    db.exec('BEGIN IMMEDIATE');
    try{
      if(old===value)db.prepare('DELETE FROM votes WHERE post_id=? AND user_id=?').run(postId,user.id);
      else db.prepare('INSERT INTO votes(post_id,user_id,value) VALUES(?,?,?) ON CONFLICT(post_id,user_id) DO UPDATE SET value=excluded.value').run(postId,user.id,value);
      const score=db.prepare('SELECT base_score+COALESCE((SELECT sum(value) FROM votes WHERE post_id=?),0) score FROM posts WHERE id=?').get(postId,postId).score;
      db.exec('COMMIT');return {score,my_vote:old===value?0:value};
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  function comments(postId,{cursor=null,limit=100}={}){
    postId=V.integer(postId,{name:'Innleggs-ID'});published(postId);limit=Number(limit);if(!Number.isInteger(limit)||limit<1||limit>200)fail('INVALID_LIMIT','Grense må være 1–200.');
    const after=cursor==null?Number.MIN_SAFE_INTEGER:V.integer(cursor,{name:'Sidepeker'});
    const rows=db.prepare(`SELECT c.id,c.post_id,c.parent_id,c.body,c.depth,c.created_at,COALESCE(u.name,c.demo_author,'anonym') author
      FROM comments c LEFT JOIN users u ON u.id=c.author_id WHERE c.post_id=? AND c.id>? ORDER BY c.created_at,abs(c.id) LIMIT ?`).all(postId,after,limit+1);
    const more=rows.length>limit;if(more)rows.pop();return {comments:rows,next_cursor:more?rows.at(-1).id:null,has_more:more};
  }
  function comment(postId,user,{body,parent_id=null}){
    postId=V.integer(postId,{name:'Innleggs-ID'});published(postId);body=V.text(body,{name:'Kommentar',min:1,max:1200});
    let depth=0,parent=null;if(parent_id!=null){parent_id=V.integer(parent_id,{name:'Svar-ID'});parent=db.prepare('SELECT id,depth,author_id FROM comments WHERE id=? AND post_id=?').get(parent_id,postId);if(!parent)fail('INVALID_PARENT','Ugyldig svar.');if(parent.depth>=3)fail('MAX_DEPTH','Maks fire nivåer med svar.');depth=parent.depth+1;}
    db.exec('BEGIN IMMEDIATE');try{const row=db.prepare('INSERT INTO comments(id,post_id,parent_id,author_id,body,depth) VALUES(?,?,?,?,?,?)').run(nextId(db,'comments'),postId,parent?.id||null,user.id,body,depth),commentId=Number(row.lastInsertRowid),postAuthor=db.prepare('SELECT author_id FROM posts WHERE id=?').get(postId)?.author_id;
      if(postAuthor&&postAuthor!==user.id)notifications.forum({recipientId:postAuthor,actorId:user.id,postId,commentId,kind:'post_reply'});
      if(parent?.author_id&&parent.author_id!==user.id&&parent.author_id!==postAuthor)notifications.forum({recipientId:parent.author_id,actorId:user.id,postId,commentId,kind:'comment_reply'});
      db.exec('COMMIT');return {id:commentId};
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  function report(postId,user,reason){
    postId=V.integer(postId,{name:'Innleggs-ID'});published(postId);
    reason=V.enumValue(reason,['Personopplysninger','Trakassering','Ulovlig innhold','Spam / svindel','Annet'],'Rapportgrunn');
    db.exec('BEGIN IMMEDIATE');
    try{
      const result=db.prepare('INSERT INTO reports(id,post_id,user_id,reason) VALUES(?,?,?,?) ON CONFLICT(post_id,user_id) DO NOTHING').run(nextId(db,'reports'),postId,user.id,reason);
      if(!result.changes)fail('ALREADY_REPORTED','Du har allerede rapportert innlegget.',409);
      const count=db.prepare('SELECT count(*) n FROM reports WHERE post_id=? AND resolved=0').get(postId).n;
      const held=count>=3;if(held)db.prepare("UPDATE posts SET status='review' WHERE id=? AND status='published'").run(postId);
      if(held)audit?.record({action:'post.auto_review',subjectType:'post',subjectId:postId,previous:{status:'published'},next:{status:'review'},reason:'three distinct unresolved reports'});db.exec('COMMIT');
      return {reported:true,automatically_held:held};
    }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
  }
  return {vote,comments,comment,report};
}
module.exports={createInteractionService};
