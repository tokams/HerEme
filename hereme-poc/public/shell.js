'use strict';
window.HeremeShell={
  activity(activity,error=''){
    const E=HeremePoster.escape,icon=HeremeIcons.icon;
    if(error)return '<p class="muted-note">Aktiviteten kunne ikke hentes.</p>';
    if(!activity)return '<p class="muted-note">Henter samtaler …</p>';
    const {stats,discussions,recent_comments}=activity;
    return `<section class="activity-section"><h2>${icon('comment')} Det snakkes om</h2>
      ${discussions.length?discussions.map(p=>`<button class="activity-item theme-${p.category}" data-action="discussion" data-id="${p.id}"><small>${E(HeremeThemes.get(p.category).label)}${p.synthetic_demo?' · DEMO':''}</small><strong>${E(p.title)}</strong><span>${p.comment_count} svar ${HeremeIcons.icon('arrow-right')}</span></button>`).join(''):'<p class="muted-note">Ingen samtaler i dette utvalget ennå.</p>'}</section>
      <section class="activity-section"><h2>${icon('clock')} Siste svar</h2>
      ${recent_comments.length?recent_comments.map(c=>`<article class="activity-comment"><small>${HeremeDetail.author(c)} · ${HeremeFeed.ago(c.created_at)}${c.synthetic_demo?' · DEMO':''}</small><button class="activity-comment-open" data-action="discussion" data-id="${c.post_id}"><span>${E(c.body)}</span><em>${HeremeIcons.icon('reply')}<span>${E(c.post_title)}</span></em></button></article>`).join(''):'<p class="muted-note">Ingen svar i dette utvalget.</p>'}</section>
      <p class="activity-totals">${stats.posts} innlegg / ${stats.comments} svar<br><span>For kategoriene og søket ditt</span></p>`;
  }
};
