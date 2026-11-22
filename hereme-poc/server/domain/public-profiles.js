'use strict';
const {fail}=require('./errors');
function createPublicProfileService(db,{avatars}){
  function read(publicId){
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(String(publicId)))fail('USER_NOT_FOUND','Brukeren finnes ikke.',404);
    const user=db.prepare("SELECT id,name,created_at FROM users WHERE id=? AND status='active'").get(publicId);
    if(!user)fail('USER_NOT_FOUND','Brukeren finnes ikke.',404);
    const posts=db.prepare(`SELECT COALESCE(sum(v.value),0) score FROM votes v JOIN posts p ON p.id=v.post_id
      LEFT JOIN post_presentation pp ON pp.post_id=p.id
      WHERE p.author_id=? AND p.status='published' AND COALESCE(pp.synthetic_demo,0)=0 AND v.user_id<>p.author_id`).get(user.id).score;
    const comments=db.prepare(`SELECT COALESCE(sum(v.value),0) score FROM comment_votes v JOIN comments c ON c.id=v.comment_id
      JOIN posts p ON p.id=c.post_id LEFT JOIN post_presentation pp ON pp.post_id=p.id
      WHERE c.author_id=? AND p.status='published' AND COALESCE(pp.synthetic_demo,0)=0 AND v.user_id<>c.author_id`).get(user.id).score;
    return {public_id:user.id,username:user.name,avatar_url:avatars.publicView(user.id).avatar_url,joined_at:user.created_at,reputation:{posts,comments,total:posts+comments}};
  }
  return {read};
}
module.exports={createPublicProfileService};
