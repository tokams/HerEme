'use strict';
(function(root){
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const initial=name=>[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(String(name||'?'))][0]?.segment?.toLocaleUpperCase()||'?';
  const tone=id=>[...String(id||'')].reduce((value,char)=>(value*31+char.codePointAt(0))>>>0,7)%5;
  const safeUrl=url=>typeof url==='string'&&/^\/api\/avatars\/[A-Za-z0-9_-]{1,100}\/\d+\/(small|large)$/.test(url)?url:null;
  function html(person={}){
    const name=String(person.name||'?'),url=safeUrl(person.avatar_url);
    return `<span class="chat-avatar tone-${tone(person.id||name)}" aria-hidden="true"><span class="avatar-initial">${escape(initial(name))}</span>${url?`<img src="${escape(url)}" alt="" loading="lazy">`:''}</span>`;
  }
  function group(people=[],{neutral=false}={}){
    if(neutral||!people.length)return '<span class="chat-avatar chat-avatar-neutral" aria-hidden="true"><img src="/assets/icons/chat-group-members.svg" alt=""></span>';
    return `<span class="group-avatar" aria-hidden="true">${people.slice(0,3).map(person=>html(person)).join('')}</span>`;
  }
  const api={html,group,safeUrl};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else{root.HeremeAvatar=api;document.addEventListener('error',event=>{if(event.target.matches('.chat-avatar>img'))event.target.hidden=true;},true);}
})(globalThis);
