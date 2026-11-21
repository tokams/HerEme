'use strict';
(()=>{
  let installPrompt=null,registration=null;
  const ready='serviceWorker' in navigator&&window.isSecureContext?navigator.serviceWorker.register('/service-worker.js',{scope:'/'}).then(value=>registration=value).catch(()=>null):Promise.resolve(null);
  addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;dispatchEvent(new CustomEvent('hereme:installable'));});
  addEventListener('appinstalled',()=>{installPrompt=null;dispatchEvent(new CustomEvent('hereme:installed'));});
  const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const ios=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.MSStream;
  async function install(){if(!installPrompt)return false;await installPrompt.prompt();const choice=await installPrompt.userChoice;installPrompt=null;return choice.outcome==='accepted';}
  async function reconcilePush(){const active=await ready,subscription=await active?.pushManager?.getSubscription();if(!subscription)return null;try{const config=await fetch('/api/push/config').then(response=>response.json());if(!config.enabled)return null;const csrf=decodeURIComponent(document.cookie.match(/(?:^|; )hereme_csrf=([^;]+)/)?.[1]||''),response=await fetch('/api/push/subscriptions',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify({subscription:subscription.toJSON(),device_label:navigator.userAgent.slice(0,80)})});if(!response.ok)throw new Error('Push binding failed');const result=await response.json();localStorage.setItem('hereme_push_subscription_id',result.subscription.id);return result.subscription;}catch{await subscription.unsubscribe();localStorage.removeItem('hereme_push_subscription_id');return null;}}
  window.HeremePwa={ready,install,reconcilePush,standalone,ios,get canInstall(){return Boolean(installPrompt);},get registration(){return registration;}};
})();
