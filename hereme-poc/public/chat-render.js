'use strict';
(function(root){
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const ready=(file,now)=>file.status==='ready'&&file.expires_at>now;
  const preview=file=>`/api/chat/files/${encodeURIComponent(file.id)}/preview`;
  const timestamp=value=>Date.parse(String(value).replace(' ','T')+(/[zZ]$|[+-]\d\d:\d\d$/.test(String(value))?'':'Z'));
  function singleAttachment(file,message,t,now){
    const name=escape(file.name),label=escape(t('attachment.view',{name:file.name}));
    if(!ready(file,now))return `<span class="expired-file">${name} — ${escape(t('attachment.expired'))}</span>`;
    if(file.media_kind==='image')return `<button class="attachment-preview" type="button" data-view-message="${message.id}" aria-label="${label}"><img src="${preview(file)}" alt="${name}" loading="lazy"><span class="attachment-broken" hidden>${escape(t('attachment.preview_unavailable'))}</span></button>`;
    if(file.media_kind==='video')return `<button class="attachment-card video-card" type="button" data-view-message="${message.id}" aria-label="${escape(t('attachment.play',{name:file.name}))}"><video src="${preview(file)}#t=0.1" preload="metadata" muted playsinline></video><span class="video-play" aria-hidden="true"></span><span class="video-duration" data-video-duration hidden></span><span class="file-name">${name}</span><span class="attachment-broken" hidden>${escape(t('attachment.preview_unavailable'))}</span></button>`;
    return `<button class="attachment-card file-card" type="button" data-view-message="${message.id}" aria-label="${label}"><img src="/assets/icons/chat-attach-file.svg" alt=""><span>${name}</span></button>`;
  }
  function bundle(files,message,t,now){
    const layers=files.slice(0,3).map((file,index)=>{
      let content;
      if(ready(file,now)&&file.media_kind==='image')content=`<img src="${preview(file)}" alt="" loading="lazy">`;
      else if(ready(file,now)&&file.media_kind==='video')content=`<video src="${preview(file)}#t=0.1" preload="metadata" muted playsinline></video>`;
      else content=`<img src="/assets/icons/chat-file-stack.svg" alt="">`;
      return `<span class="stack-layer stack-layer-${index}">${content}</span>`;
    }).join('');
    const counts={image:0,video:0,file:0};for(const file of files)counts[file.media_kind]++;
    const summary=Object.entries(counts).filter(([,count])=>count).map(([kind,count])=>t(`attachment.${kind}_count`,{count})).join(' · ');
    const bundleId=`bundle-${message.id}`;
    const visible=files.length>4?files.slice(0,3):files;
    const items=visible.map(file=>{
      const active=ready(file,now),name=escape(file.name),label=escape(t('attachment.view',{name:file.name}));
      if(!active)return `<span class="bundle-item expired-file"><img src="/assets/icons/chat-attach-file.svg" alt=""><span>${name}<small>${escape(t('attachment.expired'))}</small></span></span>`;
      const visual=file.media_kind==='image'?`<img src="${preview(file)}" alt="">`:file.media_kind==='video'?`<span class="bundle-video"><video src="${preview(file)}#t=0.1" preload="metadata" muted playsinline></video><span class="video-play" aria-hidden="true"></span></span>`:`<img src="/assets/icons/chat-attach-file.svg" alt="">`;
      return `<button class="bundle-item" type="button" data-view-message="${message.id}" data-file-id="${escape(file.id)}" aria-label="${label}">${visual}<span>${name}</span></button>`;
    }).join('')+(files.length>4?`<button class="bundle-item bundle-overflow" type="button" data-view-message="${message.id}" data-file-id="${escape(files[3].id)}" data-view-all aria-label="${escape(t('attachment.view_all',{count:files.length}))}"><b>+${files.length-3}</b><span>${escape(t('attachment.view_all',{count:files.length}))}</span></button>`:'');
    return `<div class="bundle-attachment"><button class="bundle-card" type="button" data-toggle-bundle aria-expanded="false" aria-controls="${bundleId}" aria-label="${escape(t('attachment.bundle',{count:files.length}))}"><span class="bundle-stack" aria-hidden="true">${layers}</span><span><b class="bundle-count">${escape(t('attachment.count',{count:files.length}))}</b><small>${escape(summary)}</small></span></button><div class="bundle-items" id="${bundleId}" hidden>${items}</div></div>`;
  }
  function descriptors(messages,{me,t,now=new Date().toISOString(),runGapMs=5*60*1000}={}){
    const output=[];let previous=null,day='';
    for(const message of messages){
      const currentDay=String(message.created_at).slice(0,10);
      if(currentDay!==day){day=currentDay;output.push({key:`day:${day}`,html:`<div class="date-separator" data-render-key="day:${escape(day)}">${escape(day)}</div>`});previous=null;}
      const own=message.sender_id===me,system=message.kind==='system';
      const gap=previous?timestamp(message.created_at)-timestamp(previous.created_at):Infinity;
      const runStart=system||!previous||previous.sender_id!==message.sender_id||previous.kind==='system'||!Number.isFinite(gap)||gap<0||gap>runGapMs;
      const files=message.attachments||[],bare=!message.body&&files.length>0;
      const attachment=files.length===1?singleAttachment(files[0],message,t,now):files.length>1?bundle(files,message,t,now):'';
      const fullTime=String(message.created_at),timeLabel=fullTime.slice(11,16)||fullTime;
      const metaLabel=`${message.sender} · ${fullTime}`;
      const meta=`${escape(message.sender)} <span aria-hidden="true">·</span> <time datetime="${escape(fullTime)}" title="${escape(fullTime)}">${escape(timeLabel)}</time>`;
      const html=`<div class="message${own?' own':''}${system?' system':''}${bare?' bare-media':''}${runStart?' run-start':' run-continuation'}" data-message-id="${message.id}" data-render-key="message:${message.id}" tabindex="-1" role="group" aria-label="${escape(metaLabel)}"><small class="message-meta${runStart?'':' sr-only'}">${meta}</small>${message.body?`<div class="message-body">${escape(message.body)}</div>`:''}${attachment}</div>`;
      output.push({key:`message:${message.id}`,html,signature:JSON.stringify([message,files.map(file=>ready(file,now)),t('attachment.count',{count:files.length})]),runStart});
      previous=message;
    }
    return output;
  }
  const api={descriptors};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HeremeChatRender=api;
})(globalThis);
