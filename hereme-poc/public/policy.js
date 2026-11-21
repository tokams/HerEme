'use strict';
(()=>{
  const apply=()=>{
    document.querySelectorAll('[data-i18n]').forEach(node=>{node.textContent=HeremeI18n.t(`misc.${node.dataset.i18n}`);});
    document.title=HeremeI18n.t(`misc.${document.body.dataset.titleKey}`);
  };
  HeremeI18n.ready.then(()=>{document.querySelector('body > header > .language-selector')?.remove();window.HeremeLanguage.mount(document.querySelector('body > header'));apply();});
  addEventListener('hereme:language',apply);
})();
