'use strict';
(()=>{
  const i18n=window.HeremeI18n;
  function mount(container,{menu=false}={}){
    if(!container||container.querySelector('.language-selector'))return;
    const row=document.createElement('div');row.className='language-selector'+(menu?' language-menu':'');
    const label=document.createElement('span');label.className='language-label';row.append(label);
    for(const [locale,flag] of [['nb','no'],['en','en']]){
      const button=document.createElement('button');button.type='button';button.dataset.language=locale;
      const image=document.createElement('img');image.src=`/assets/flag-${flag}.svg`;image.alt='';image.width=24;image.height=16;button.append(image);
      button.onclick=async()=>{try{await i18n.setLanguage(locale);row.nextElementSibling?.matches('.language-error')&&row.nextElementSibling.remove();}catch(error){let status=row.nextElementSibling;if(!status?.matches('.language-error')){status=document.createElement('p');status.className='language-error';status.role='status';row.after(status);}status.textContent=error.message;}};
      row.append(button);
    }
    container.prepend(row);update(row);
  }
  function update(row){
    row.querySelector('.language-label').textContent=i18n.t('language.label');
    for(const button of row.querySelectorAll('[data-language]')){
      const name=i18n.t(button.dataset.language==='nb'?'language.norwegian':'language.english');
      button.title=name;button.setAttribute('aria-label',name);button.setAttribute('aria-pressed',String(button.dataset.language===i18n.getLanguage()));
    }
  }
  addEventListener('hereme:language',()=>document.querySelectorAll('.language-selector').forEach(update));
  i18n.ready.then(()=>{const header=document.querySelector('.header-actions');if(header)mount(header);for(const chatHeader of document.querySelectorAll('.inbox-header,.conversation-header'))mount(chatHeader);});
  window.HeremeLanguage={mount};
})();
