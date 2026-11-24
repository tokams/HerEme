'use strict';
(()=>{
  let installPrompt=null,registration=null;
  const dismissalKey='hereme_install_dismissed_until';
  const installedKey='hereme_install_confirmed';
  const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const ios=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.MSStream;
  const eligible=()=>window.isSecureContext&&'serviceWorker' in navigator&&!standalone()&&!localStorage.getItem(installedKey)&&(ios()||Boolean(installPrompt));
  const bannerVisible=()=>eligible()&&Number(localStorage.getItem(dismissalKey)||0)<Date.now();
  const installMarkup='<span>INSTALL HEREME</span><span class="install-endcap"><img src="/assets/install-arrow-down.svg" alt=""></span>';
  const installReason='Legg til appen for å kunne få varsler om meldinger og aktivitet på innlegg. Du velger selv hvilke varsler du vil tillate etterpå.';
  let translationsReady=false;
  const translate=key=>window.HeremeI18n.t(key);
  function localizeInstallUi(){
    if(!translationsReady)return;
    for(const button of document.querySelectorAll('.install-button'))button.firstElementChild.textContent=translate('install.button');
    for(const reason of document.querySelectorAll('#installReason,#installMenuReason'))reason.textContent=translate('install.reason');
    const sheet=document.getElementById('installHelp');if(!sheet)return;
    sheet.querySelector('h2').textContent=translate('install.help_title');
    sheet.querySelector('p').textContent=translate('install.reason');
    ['one','two','three'].forEach((number,index)=>sheet.querySelectorAll('li')[index].textContent=translate('install.step_'+number));
    for(const [selector,key] of [['[data-install-close]','install.close'],['[data-install-later]','install.later'],['[data-install-already]','install.already']])sheet.querySelector(selector).textContent=translate(key);
  }
  function updateInstallUi(){
    const banner=document.getElementById('installBanner');
    if(banner){banner.hidden=!bannerVisible()||location.pathname!=='/';document.getElementById('installReason').hidden=banner.hidden;}
    const menu=document.getElementById('installMenuButton');
    if(menu){menu.hidden=!eligible();document.getElementById('installMenuReason').hidden=menu.hidden;}
    if(standalone())document.getElementById('installHelp')?.close();
    localizeInstallUi();
  }
  function dismiss(){localStorage.setItem(dismissalKey,String(Date.now()+30*24*60*60*1000));document.getElementById('installHelp')?.close();updateInstallUi();}
  function help(){
    let sheet=document.getElementById('installHelp');
    if(!sheet){sheet=document.createElement('dialog');sheet.id='installHelp';sheet.className='install-help';sheet.innerHTML='<header><hereme-wordmark>hereme<em>.</em></hereme-wordmark><h2>Legg HerEme til på Hjem-skjermen</h2></header><p>'+installReason+'</p><ol><li>Åpne Del-menyen i nettleseren.</li><li>Velg «Legg til på Hjem-skjermen».</li><li>Åpne HerEme fra ikonet på Hjem-skjermen.</li></ol><div><button type="button" class="btn btn-secondary" data-install-close>Lukk</button><button type="button" class="btn btn-secondary" data-install-later>Ikke nå</button><button type="button" class="btn btn-secondary" data-install-already>Allerede installert</button></div>';document.body.append(sheet);sheet.querySelector('[data-install-close]').onclick=()=>sheet.close();sheet.querySelector('[data-install-later]').onclick=dismiss;sheet.querySelector('[data-install-already]').onclick=dismiss;}
    localizeInstallUi();sheet.showModal();
  }
  function mountInstallUi(){
    if(!document.querySelector('.masthead')||document.getElementById('installBanner'))return;
    const button=document.createElement('button');button.id='installBanner';button.type='button';button.className='install-button install-banner';button.innerHTML=installMarkup;button.onclick=installAction;const reason=document.createElement('p');reason.id='installReason';reason.className='install-reason';reason.textContent=installReason;document.querySelector('.masthead').after(button,reason);updateInstallUi();
  }
  function mountMenu(container){
    if(!container||container.querySelector('#installMenuButton'))return;
    const button=document.createElement('button');button.id='installMenuButton';button.type='button';button.className='install-button install-menu-button';button.innerHTML=installMarkup;button.onclick=installAction;const reason=document.createElement('p');reason.id='installMenuReason';reason.className='install-menu-reason';reason.textContent=installReason;container.prepend(button,reason);updateInstallUi();
  }
  function installAction(){if(ios())help();else if(installPrompt)void install();}
  const ready='serviceWorker' in navigator&&window.isSecureContext?navigator.serviceWorker.register('/service-worker.js',{scope:'/'}).then(value=>registration=value).catch(()=>null):Promise.resolve(null);
  addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;updateInstallUi();dispatchEvent(new CustomEvent('hereme:installable'));});
  addEventListener('appinstalled',()=>{installPrompt=null;localStorage.setItem(installedKey,'1');updateInstallUi();dispatchEvent(new CustomEvent('hereme:installed'));});
  matchMedia('(display-mode: standalone)').addEventListener('change',updateInstallUi);
  addEventListener('hereme:language',localizeInstallUi);
  window.HeremeI18n.ready.then(()=>{translationsReady=true;localizeInstallUi();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountInstallUi,{once:true});else mountInstallUi();
  async function install(){if(!installPrompt)return false;const prompt=installPrompt;installPrompt=null;updateInstallUi();await prompt.prompt();const choice=await prompt.userChoice;if(choice.outcome==='dismissed')dismiss();return choice.outcome==='accepted';}
  async function reconcilePush(){const active=await ready,subscription=await active?.pushManager?.getSubscription();if(!subscription)return null;try{const config=await fetch('/api/push/config').then(response=>response.json());if(!config.enabled)return null;const csrf=decodeURIComponent(document.cookie.match(/(?:^|; )hereme_csrf=([^;]+)/)?.[1]||''),response=await fetch('/api/push/subscriptions',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify({subscription:subscription.toJSON(),device_label:navigator.userAgent.slice(0,80)})});if(!response.ok)throw new Error('Push binding failed');const result=await response.json();localStorage.setItem('hereme_push_subscription_id',result.subscription.id);return result.subscription;}catch{await subscription.unsubscribe();localStorage.removeItem('hereme_push_subscription_id');return null;}}
  window.HeremePwa={ready,install,installAction,mountMenu,updateInstallUi,reconcilePush,standalone,ios,get canInstall(){return Boolean(installPrompt);},get registration(){return registration;}};
})();
