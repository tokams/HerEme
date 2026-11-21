'use strict';
(function(root) {
  const themes=typeof module!=='undefined'&&module.exports?require('./themes'):root.HeremeThemes;
  const {icon}=typeof module!=='undefined'&&module.exports?require('./icons'):root.HeremeIcons;
  const t=key=>root.HeremeI18n?.t(`misc.poster.${key}`)||({'title_placeholder':'Din overskrift her','demo':'Syntetisk demo'}[key]);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const image=url=>typeof url==='string'&&(/^\/uploads\/[a-zA-Z0-9_-]+\.(png|jpg|webp)$/.test(url)||/^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/(display|thumbnail)\.(jpg|webp|png)$/.test(url)||/^\/assets\/[a-z0-9_-]+\.svg$/.test(url)||/^\/assets\/demo\/(posts|sources)\/[a-z0-9_-]+\.(jpg|webp|png)$/.test(url))?url:'';
  function cropRect(iw,ih,w,h,zoom=1,x=50,y=50) {
    if(![iw,ih,w,h,zoom,x,y].every(Number.isFinite)||Math.min(iw,ih,w,h)<=0||zoom<1||zoom>3||x<0||x>100||y<0||y>100)throw new Error('Invalid poster crop.');
    const scale=Math.max(w/iw,h/ih)*zoom,width=iw*scale,height=ih*scale;
    return {x:(w-width)*x/100,y:(h-height)*y/100,width,height};
  }
  function surface(post,{previewUrl='',detail=false}={}) {
    const theme=themes.get(post.category);
    // Supplied demo sources allow a new template without rewriting the saved poster.
    // User-created baked posters without a source remain intact.
    const source=post.synthetic_demo?image(post.poster?.source_image_url):'';
    const src=previewUrl||source||image(post.image_url);
    const baked=post.type==='poster'&&Boolean(src)&&!source;
    const title=post.title||t('title_placeholder');
    const density=title.length>90?'dense':title.length>45?'compact':'';
    const position=post.text_position||'auto';
    if(!['auto','top','center','bottom'].includes(position))throw new Error('Unknown text position.');
    return `<div class="poster-surface theme-${theme.id} placement-${position} ${src?'with-image':'without-image'} ${baked?'original-poster':''} ${detail?'detail-surface':''}">
      ${src?`<img class="poster-photo" src="${escape(src)}" alt="${baked?escape(title):''}" loading="${detail||previewUrl?'eager':'lazy'}" decoding="async" data-zoom="${baked?1:post.image_zoom??1}" data-x="${baked?50:post.image_x??50}" data-y="${baked?50:post.image_y??50}">`:`<span class="poster-motif" aria-hidden="true">${theme.symbol}</span>`}
      ${baked?`<span class="sr-only">${escape(title)}</span>`:`<span class="poster-decor">${icon(theme.id)}</span><span class="poster-text"><span class="poster-title ${density}">${escape(title)}</span></span>`}
      ${post.synthetic_demo?`<span class="demo-tag">${t('demo')}</span>`:''}
    </div>`;
  }
  function enhance(container) {
    for(const img of container.querySelectorAll('.poster-photo')) {
      const zoom=Number(img.dataset.zoom),x=Number(img.dataset.x),y=Number(img.dataset.y);
      cropRect(1,1,1,1,zoom,x,y); // Same bounded crop contract as the API.
      img.style.objectPosition=`${x}% ${y}%`;
      img.style.transformOrigin=`${x}% ${y}%`;
      img.style.transform=`scale(${zoom})`;
    }
    fitTitles(container);
  }
  function fitTitles(container) {
    for(const title of container.querySelectorAll('.poster-title')) {
      title.style.removeProperty('font-size');
      const surface=title.closest('.poster-surface'),text=title.parentElement;
      const style=getComputedStyle(text),bar=getComputedStyle(text,'::before');
      const inset=surface.classList.contains('placement-top')?parseFloat(style.top):0;
      const decoration=parseFloat(style.paddingTop)+parseFloat(style.paddingBottom)+parseFloat(style.gap)+parseFloat(bar.height);
      const height=Math.min(surface.clientHeight*.60,surface.clientHeight-inset-decoration);
      let size=parseFloat(getComputedStyle(title).fontSize);
      while(title.offsetHeight>height&&size>10)title.style.fontSize=(--size)+'px';
    }
  }
  const api={escape,image,cropRect,surface,enhance,fitTitles};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HeremePoster=api;
})(globalThis);
