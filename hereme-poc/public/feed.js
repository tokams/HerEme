'use strict';
(function(root) {
  const node=typeof module!=='undefined'&&module.exports;
  const Poster=node?require('./poster'):root.HeremePoster;
  const Themes=node?require('./themes'):root.HeremeThemes;
  const {icon}=node?require('./icons'):root.HeremeIcons;
  const E=Poster.escape;
  const fallback={'time.now':'nå','feed.synthetic_demo':'Syntetisk demo','post.vote_up':'Stem opp','post.vote_down':'Stem ned'};
  const t=(key,params)=>root.HeremeI18n?.t(`wall.${key}`,params)||fallback[key]||({'time.minutes':`${params?.count} min`,'time.hours':`${params?.count} t`,'time.days':`${params?.count} d`,'post.net_score':`Nettoscore ${params?.score}`,'post.comment_count':`${params?.count} kommentarer`,'post.open':`Åpne ${params?.title}`}[key])||key;
  function ago(value) {
    const ts=Date.parse(value.replace(' ','T')+(/Z$|[+-]\d\d:\d\d$/.test(value)?'':'Z'));
    const minutes=Math.max(0,(Date.now()-ts)/60000);
    return minutes<1?t('time.now'):minutes<60?t('time.minutes',{count:Math.floor(minutes)}):minutes<1440?t('time.hours',{count:Math.floor(minutes/60)}):t('time.days',{count:Math.floor(minutes/1440)});
  }
  const demo=p=>p.synthetic_demo?`<span class="demo-tag">${E(t('feed.synthetic_demo'))}</span>`:'';
  function controls(p,{detail=false}={}) {
    return `<div class="tile-actions">
      <button class="vote-btn vote-up" data-action="vote" data-id="${p.id}" data-value="1" aria-label="${E(t('post.vote_up'))}" aria-pressed="${p.my_vote===1}">${icon('vote-up')}</button>
      <button class="vote-btn vote-down" data-action="vote" data-id="${p.id}" data-value="-1" aria-label="${E(t('post.vote_down'))}" aria-pressed="${p.my_vote===-1}">${icon('vote-down')}</button>
      <span class="vote-number ${p.score<0?'negative':''}" aria-label="${E(t('post.net_score',{score:p.score}))}">${p.score>0?'+':''}${p.score}</span>
      <button class="comment-count" data-action="${detail?'comments':'detail'}" data-id="${p.id}" aria-label="${E(t('post.comment_count',{count:p.comment_count}))}">${icon('comment')}<span>${p.comment_count}</span></button>
    </div>`;
  }
  function updateVotes(root,id,p) {
    if(!root)return;
    for(const controls of root.querySelectorAll(`[data-action="vote"][data-id="${id}"]`)) {
      controls.setAttribute('aria-pressed',String(p.my_vote===Number(controls.dataset.value)));
    }
    for(const score of root.querySelectorAll(`[data-post-id="${id}"] .vote-number, .detail-modal [data-action="vote"][data-id="${id}"] ~ .vote-number`)) {
      score.textContent=(p.score>0?'+':'')+p.score;
      score.classList.toggle('negative',p.score<0);
      score.setAttribute('aria-label',t('post.net_score',{score:p.score}));
    }
  }
  function header(p) {
    const t=Themes.get(p.category);
    return `<div class="tile-header"><span class="category-name">${icon(t.id)}${E(t.label)}</span><time datetime="${E(p.created_at.replace(' ','T'))}Z">${ago(p.created_at)}</time></div>`;
  }
  function card(p) {
    if(p.content_format==='article')return `<article class="post-card article-card theme-${p.category}" data-post-id="${p.id}" data-category="${p.category}">${header(p)}<button class="tile-open article-open" data-action="detail" data-id="${p.id}" aria-label="${E(t('post.open',{title:p.title}))}"><span class="article-cover">${Poster.image(p.image_url)?`<img src="${E(Poster.image(p.image_url))}" alt="" loading="lazy">`:''}</span><span class="article-summary"><small>${E(t('article.label'))}</small><strong>${E(p.title)}</strong><span>${E(p.article_abstract||p.body)}</span><b>${E(t('article.read'))} ${icon('arrow-right')}</b></span></button>${controls(p)}</article>`;
    return `<article class="post-card theme-${p.category} ${Poster.image(p.image_url)?'is-photo':'is-text'}" data-post-id="${p.id}" data-category="${p.category}">${header(p)}
      <button class="tile-open" data-action="detail" data-id="${p.id}" aria-label="${E(t('post.open',{title:p.title}))}">${Poster.surface(p)}${p.type==='video'?`<span class="video-tile-badge">${icon('video')} ${Math.floor((p.duration_ms||0)/60000)}:${String(Math.floor((p.duration_ms||0)/1000)%60).padStart(2,'0')}</span>`:''}</button>
      ${controls(p)}</article>`;
  }
  function filters(selected) {
    return Themes.themes.map(theme=>{const localized=Themes.get(theme.id);return `<label class="category-filter theme-${theme.id}"><input type="checkbox" name="category" value="${theme.id}" ${selected.includes(theme.id)?'checked':''}>${icon(theme.id)}<span>${E(localized.label)}<small>${E(localized.description)}</small></span></label>`;}).join('');
  }
  function categoryButtons(selected) {
    return Themes.themes.map(theme=>{const localized=Themes.get(theme.id);return `<button class="category-button theme-${theme.id}" data-action="category" data-category="${theme.id}" aria-pressed="${selected.includes(theme.id)}" title="${E(localized.description)}">${icon(theme.id)}<span>${E(localized.label)}</span></button>`;}).join('');
  }
  const api={card,header,controls,updateVotes,filters,categoryButtons,ago,demo,escape:E,image:Poster.image};
  if(node)module.exports=api;else root.HeremeFeed=api;
})(globalThis);
