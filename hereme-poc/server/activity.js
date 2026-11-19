'use strict';
// Context is projected from the same visible, filtered posts as the wall.
function activityProjection(db,posts) {
  const selected=new Map(posts.map(post=>[post.id,post]));
  const comments=db.prepare(`SELECT c.id,c.post_id,c.body,c.created_at,
    COALESCE(u.name,c.demo_author,'anonym') AS author
    FROM comments c JOIN posts p ON p.id=c.post_id
    LEFT JOIN users u ON u.id=c.author_id
    WHERE p.status='published' ORDER BY c.created_at DESC,ABS(c.id) DESC`).all()
    .filter(comment=>selected.has(comment.post_id));
  const latest=new Map();
  for(const comment of comments)if(!latest.has(comment.post_id))latest.set(comment.post_id,comment.created_at);
  const discussions=posts.filter(post=>post.comment_count>0)
    .sort((a,b)=>String(latest.get(b.id)||'').localeCompare(String(latest.get(a.id)||''))||b.comment_count-a.comment_count)
    .slice(0,4).map(post=>({id:post.id,title:post.title,category:post.category,
      comment_count:post.comment_count,synthetic_demo:post.synthetic_demo}));
  return {
    stats:{posts:posts.length,comments:comments.length},
    discussions,
    recent_comments:comments.slice(0,4).map(comment=>({...comment,
      body:comment.body.slice(0,140),post_title:selected.get(comment.post_id).title,
      category:selected.get(comment.post_id).category,synthetic_demo:selected.get(comment.post_id).synthetic_demo}))
  };
}
module.exports={activityProjection};
