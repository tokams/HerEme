'use strict';
(()=>{
  const storageKey='hereme_language';
  const dictionaries={nb:{},en:{}};
  const browserLanguage=()=>navigator.languages?.find(value=>/^(nb|nn|no|en)(-|$)/i.test(value))?.toLowerCase().startsWith('en')?'en':'nb';
  let language=localStorage.getItem(storageKey)||browserLanguage();
  if(!['nb','en'].includes(language))language='nb';
  document.documentElement.lang=language;
  const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const t=(key,params={})=>{
    const value=dictionaries[language][key]??dictionaries.nb[key];
    if(value===undefined){console.error('Missing translation',key);return key;}
    return value.replace(/\{([a-z_]+)\}/g,(_,name)=>escape(params[name]??''));
  };
  const emit=()=>{document.documentElement.lang=language;dispatchEvent(new CustomEvent('hereme:language',{detail:{language}}));};
  async function setLanguage(next,{persist=true}={}){
    if(!['nb','en'].includes(next))throw Error('Unsupported language');
    language=next;localStorage.setItem(storageKey,next);emit();
    if(!persist)return;
    const token=decodeURIComponent(document.cookie.match(/(?:^|; )hereme_csrf=([^;]+)/)?.[1]||'');
    if(!token)return;
    const current=await fetch('/api/me');
    if(current.status===401)return;
    if(!current.ok)throw Error(t('language.save_failed'));
    const response=await fetch('/api/me/language',{method:'PUT',headers:{'content-type':'application/json','x-csrf-token':token},body:JSON.stringify({preferred_language:next})});
    if(!response.ok)throw Error(t('language.save_failed'));
  }
  function applyAccountLanguage(user){if(user?.preferred_language&&user.preferred_language!==language)void setLanguage(user.preferred_language,{persist:false});}
  const ready=Promise.all(['nb','en'].flatMap(locale=>['', 'wall-', 'chat-', 'misc-'].map(async prefix=>{
    const response=await fetch(`/i18n/${prefix}${locale}.json`);
    if(!response.ok)throw Error(`Translation resource unavailable: ${prefix}${locale}`);
    Object.assign(dictionaries[locale],await response.json());
  }))).then(async()=>{
    if(document.cookie.match(/(?:^|; )hereme_csrf=/)){
      const response=await fetch('/api/me');
      if(response.ok)applyAccountLanguage((await response.json()).user);
    }
    return language;
  });
  window.HeremeI18n={t,setLanguage,applyAccountLanguage,getLanguage:()=>language,ready};
})();
