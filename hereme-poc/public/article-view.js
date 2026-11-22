'use strict';
((root)=>{
  const E=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function safeMediaUrl(value,{preview=false}={}){
    if(typeof value!=='string')return '';
    if(/^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/(original|display|thumbnail)\.(jpg|webp|png|mp4)$/.test(value))return value;
    if(preview&&value.startsWith('blob:')){try{if(new URL(value).origin===root.location.origin)return value;}catch{return '';}}
    return '';
  }
  function mediaButton(media,alt,{preview=false}={}){
    if(!media)return '';
    const kind=media.kind==='video'?'video':'image';
    const src=safeMediaUrl(media.preview_url||media.original_url||media.url,{preview});
    const thumb=safeMediaUrl(media.thumbnail_url||media.url,{preview});
    if(!src)return `<div class="article-media article-media-pending" role="status">${E(media.name||'')}</div>`;
    const display=kind==='video'?`<video preload="metadata" poster="${E(thumb)}"><source src="${E(src)}" type="video/mp4"></video>`:`<img src="${E(src)}" alt="${E(alt)}" loading="lazy">`;
    return `<button type="button" class="article-media" data-action="article-media" data-src="${E(src)}" data-kind="${kind}" aria-label="${E(alt||media.name||'Media')}">${display}</button>`;
  }
  const api={safeMediaUrl,mediaButton};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HeremeArticleView=api;
})(globalThis);
