'use strict';
(function(root) {
  const node=typeof module!=='undefined'&&module.exports;
  const Poster=node?require('./poster'):root.HeremePoster;
  const Themes=node?require('./themes'):root.HeremeThemes;
  const {icon}=node?require('./icons'):root.HeremeIcons;
  const E=Poster.escape;
  function ago(value) {
    const ts=Date.parse(value.replace(' ','T')+(/Z$|[+-]\d\d:\d\d$/.test(value)?'':'Z'));
    const minutes=Math.max(0,(Date.now()-ts)/60000);
    return minutes<1?'nå':minutes<60?`${Math.floor(minutes)} min`:minutes<1440?`${Math.floor(minutes/60)} t`:`${Math.floor(minutes/1440)} d`;
  }
  const demo=p=>p.synthetic_demo?'<span class="demo-tag">Syntetisk demo</span>':'';
  function controls(p,{detail=false}={}) {
    return `<div class="tile-actions">
      <button class="vote-btn vote-up" data-action="vote" data-id="${p.id}" data-value="1" aria-label="Stem opp" aria-pressed="${p.my_vote===1}">${icon('vote-up')}</button>
      <button class="vote-btn vote-down" data-action="vote" data-id="${p.id}" data-value="-1" aria-label="Stem ned" aria-pressed="${p.my_vote===-1}">${icon('vote-down')}</button>
      <span class="vote-number ${p.score<0?'negative':''}" aria-label="Nettoscore ${p.score}">${p.score>0?'+':''}${p.score}</span>
      <button class="comment-count" data-action="${detail?'comments':'detail'}" data-id="${p.id}" aria-label="${p.comment_count} kommentarer">${icon('comment')}<span>${p.comment_count}</span></button>
    </div>`;
  }
  function header(p) {
    const t=Themes.get(p.category);
    return `<div class="tile-header"><span class="category-name">${icon(t.id)}${E(t.label)}</span><time datetime="${E(p.created_at.replace(' ','T'))}Z">${ago(p.created_at)}</time></div>`;
  }
  function card(p) {
    return `<article class="post-card theme-${p.category} ${Poster.image(p.image_url)?'is-photo':'is-text'}" data-post-id="${p.id}" data-category="${p.category}">${header(p)}
      <button class="tile-open" data-action="detail" data-id="${p.id}" aria-label="Åpne ${E(p.title)}">${Poster.surface(p)}${p.type==='video'?`<span class="video-tile-badge">▶ ${Math.floor((p.duration_ms||0)/60000)}:${String(Math.floor((p.duration_ms||0)/1000)%60).padStart(2,'0')}</span>`:''}</button>
      ${controls(p)}</article>`;
  }
  function filters(selected) {
    return Themes.themes.map(t=>`<label class="category-filter theme-${t.id}"><input type="checkbox" name="category" value="${t.id}" ${selected.includes(t.id)?'checked':''}>${icon(t.id)}<span>${t.label}<small>${E(t.description)}</small></span></label>`).join('');
  }
  function categoryButtons(selected) {
    return Themes.themes.map(t=>`<button class="category-button theme-${t.id}" data-action="category" data-category="${t.id}" aria-pressed="${selected.includes(t.id)}" title="${E(t.description)}">${icon(t.id)}<span>${E(t.label)}</span></button>`).join('');
  }
  const api={card,header,controls,filters,categoryButtons,ago,demo,escape:E,image:Poster.image};
  if(node)module.exports=api;else root.HeremeFeed=api;
})(globalThis);
