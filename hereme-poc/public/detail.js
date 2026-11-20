'use strict';
window.HeremeDetail={
  comments(comments) {
    const E=HeremePoster.escape,nodes=new Map(comments.map(c=>[c.id,{...c,children:[]}]));
    const roots=[];
    for(const node of nodes.values()) {
      if(node.parent_id&&nodes.has(node.parent_id))nodes.get(node.parent_id).children.push(node);
      else roots.push(node);
    }
    const walk=c=>`<article class="comment-unit"><div class="comment-meta"><strong>${E(c.author)}</strong> · ${HeremeFeed.ago(c.created_at)}</div><p class="comment-body">${E(c.body)}</p>
      ${c.depth<3?`<button class="reply-button" data-action="reply" data-id="${c.id}">↳ Svar</button>`:''}
      ${c.children.length?`<div class="comment-replies">${c.children.map(walk).join('')}</div>`:''}</article>`;
    return roots.length?roots.map(walk).join(''):'<p class="notice">Ingen svar ennå. Du kan bli den første.</p>';
  },
  body(post,comments,replyTo) {
    const E=HeremePoster.escape,theme=HeremeThemes.get(post.category);
    return `<div class="detail-poster">${post.type==='video'&&post.media_url?`<video class="detail-video" controls preload="metadata" poster="${E(post.media_thumbnail_url||post.image_url||'')}"><source src="${E(post.media_url)}" type="video/mp4">Videoen kan ikke spilles i denne nettleseren.</video>`:HeremePoster.surface(post,{detail:true})}</div>
      <div class="detail-copy">
        ${HeremeFeed.controls(post,{detail:true})}
        <p class="detail-meta"><b>${E(theme.label)}</b> · ${E(post.author)} · <time>${E(post.created_at)} UTC</time>${post.room_slug==='ryktetorget'?' · Ubekreftet':''}</p>
        <h1 class="detail-title">${E(post.title)}</h1>
        ${post.body?`<p class="detail-body">${E(post.body)}</p>`:''}
        ${post.link_url?`<a class="source-link" href="${E(post.link_url)}" target="_blank" rel="noopener noreferrer nofollow">↗ ${E(post.link_url)}</a>`:''}
        ${post.poster?.source_image_url?`<button class="text-button variant-button" data-action="poster-variant" data-id="${post.id}">Lag din egen variant ↗</button>`:''}
        ${post.synthetic_demo&&post.type==='poster'&&post.poster?.source_image_url?`<a class="text-button" href="${E(HeremePoster.image(post.image_url))}" target="_blank" rel="noopener">Original plakat ↗</a>`:''}
        <section class="discussion" id="discussion"><h2>${comments.length} svar i drøsen</h2>
          <div class="comment-tree">${this.comments(comments)}</div>
          ${replyTo?`<div class="reply-context">Svar på kommentar #${replyTo}<button data-action="reply-cancel">Avbryt ×</button></div>`:''}
          <form class="comment-entry" id="commentForm"><label for="commentText">Ditt svar</label><textarea id="commentText" maxlength="1200" placeholder="Skriv et svar …" required></textarea><button type="submit" class="btn btn-primary">Svar ↗</button></form>
        </section>
      </div>`;
  }
};
