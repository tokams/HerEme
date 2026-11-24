'use strict';
(()=>{
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const csrf=()=>decodeURIComponent(document.cookie.match(/(?:^|; )hereme_csrf=([^;]+)/)?.[1]||'');
  const t=(key,params)=>window.HeremeI18n.t(key,params);
  let active=null;
  async function request(url,body){const response=await fetch(url,{method:'POST',headers:{'accept-language':window.HeremeI18n.getLanguage(),'content-type':'application/json','x-csrf-token':csrf()},body:JSON.stringify(body)}),data=await response.json();if(!response.ok)throw Error(data.error?.message||'Noe gikk galt.');window.HeremeI18n.applyAccountLanguage(data.user);if(url==='/api/session'&&localStorage.getItem('hereme_language'))await window.HeremeI18n.setLanguage(window.HeremeI18n.getLanguage());if(url==='/api/session/recover'&&!sessionStorage.getItem('passkey-invite:'+data.user.id)){window.HeremePasskeys?.config().then(config=>{if(config.enabled){sessionStorage.setItem('passkey-invite:'+data.user.id,'1');dispatchEvent(new CustomEvent('hereme:passkey-invite'));}}).catch(()=>{});}return data;}
  function close({cancel=true}={}){if(!active)return;const {root,returnFocus,onCancel,onKey}=active;document.removeEventListener('keydown',onKey);root.remove();active=null;returnFocus?.focus?.({preventScroll:true});if(cancel)onCancel?.();}
  function localize(root,register){
    root.querySelector('#authTitle').textContent=t(register?'auth.register':'auth.login');
    root.querySelector('[data-auth-mode="login"]').textContent=t('auth.login');
    root.querySelector('[data-auth-mode="register"]').textContent=t('auth.register');
    root.querySelector('.auth-context').textContent=t(active.messageKey||(register?'auth.register_intro':'auth.login_intro'));
    root.querySelector('input[name="name"]').parentElement.querySelector('span').textContent=t('auth.username');
    if(!register)root.querySelector('input[name="recovery_key"]').parentElement.querySelector('span').textContent=t('auth.code');
    root.querySelector('[data-auth-form] button').textContent=t(register?'auth.register':'auth.login');
    const passkey=root.querySelector('[data-passkey-login]');if(passkey)passkey.textContent=t('auth.login_device');
  }
  function localizeRecovery(root){
    root.querySelector('#recoveryTitle').textContent=t('auth.save_title');
    root.querySelector('.auth-context').textContent=t('auth.save_intro');
    root.querySelector('input[name="username"]').parentElement.querySelector('span').textContent=t('auth.username');
    root.querySelector('input[name="password"]').closest('label').querySelector('span').textContent=t('auth.code');
    root.querySelector('form button[type="submit"]').textContent=t('auth.saved');
    root.querySelector('[data-save-passkey]').textContent=t('auth.add_device');
    root.querySelector('[data-passkey-hint]').textContent=t('auth.passkey_hint');
    root.querySelector('[data-copy-recovery]').setAttribute('aria-label',t('auth.copy'));
    root.querySelector('[data-auth-close]').setAttribute('aria-label',t('auth.close'));
  }
  function render(mode){
    const register=mode==='register',root=active.root;
    root.innerHTML=`<div class="auth-overlay" data-auth-close><section class="auth-dialog ${register?'auth-register':''}" role="dialog" aria-modal="true" aria-labelledby="authTitle"><header><div><hereme-wordmark>hereme<em>.</em></hereme-wordmark><h2 id="authTitle">${register?'Opprett konto':'Logg inn'}</h2></div><button type="button" data-auth-close aria-label="Lukk">&times;</button></header><nav role="tablist" aria-label="Kontohandling"><button type="button" role="tab" aria-selected="${register}" data-auth-mode="register">Opprett konto</button><button type="button" role="tab" aria-selected="${!register}" data-auth-mode="login">Logg inn</button></nav><div class="auth-panel"><p class="auth-context"></p>${register?`<form data-auth-form="register" class="form-stack" autocomplete="on"><label class="field"><span>Pseudonym</span><input name="name" minlength="2" maxlength="24" autocomplete="username" required autofocus></label><button class="btn btn-primary">Opprett konto</button></form>`:`<form data-auth-form="login" class="form-stack" autocomplete="on"><label class="field"><span>Pseudonym</span><input name="name" minlength="2" maxlength="24" autocomplete="username" required autofocus></label><label class="field"><span>Innloggingskode</span><input name="recovery_key" type="password" autocomplete="current-password" required></label><button class="btn btn-primary">Logg inn</button></form>`}<p class="auth-error" role="alert" hidden></p></div></section></div>`;
    root.querySelector('[autofocus]')?.focus();
    window.HeremeLanguage.mount(root.querySelector('.auth-dialog header'));
    localize(root,register);
    if(!register)window.HeremePasskeys?.config().then(config=>{if(!config.enabled||!root.querySelector('[data-auth-form=login]')?.isConnected||root.querySelector('[data-passkey-login]'))return;const button=document.createElement('button');button.type='button';button.className='btn btn-primary';button.dataset.passkeyLogin='';button.textContent=t('auth.login_device');button.onclick=async()=>{button.disabled=true;try{const result=await window.HeremePasskeys.login();window.HeremeI18n.applyAccountLanguage(result.user);const callback=active?.onSuccess;await window.HeremePwa?.reconcilePush?.();await callback?.(result,{created:false});close({cancel:false});}catch(error){const message=root.querySelector('.auth-error');message.textContent=error.message;message.hidden=false;button.disabled=false;}};root.querySelector('.auth-panel').prepend(button);}).catch(()=>{});
  }
  function showRecovery(result,callback){
    const root=active.root;
    active.registrationResult=result;
    active.backupPending=true;
    root.innerHTML=`<div class="auth-overlay"><section class="auth-dialog auth-register auth-recovery" role="dialog" aria-modal="true" aria-labelledby="recoveryTitle"><header><div><hereme-wordmark>hereme<em>.</em></hereme-wordmark><h2 id="recoveryTitle"></h2></div><button type="button" data-auth-close aria-label="Lukk">&times;</button></header><div class="auth-panel"><p class="auth-context"></p><button type="button" class="btn btn-primary" data-save-passkey></button><p data-passkey-hint></p><p role="status" aria-live="polite"></p><form action="/api/recovery/confirm" method="post" autocomplete="on"><input type="hidden" name="csrf_token" value="${escape(result.csrf_token)}"><label class="field"><span></span><input name="username" autocomplete="username" value="${escape(result.user.name)}" readonly></label><label class="field"><span></span><span class="recovery-input-row"><input name="password" type="password" autocomplete="new-password" value="${escape(result.recovery_key)}" readonly><button type="button" data-copy-recovery aria-label=""><img src="/assets/icons/auth-copy.svg" alt=""></button></span></label><button class="btn btn-secondary" type="submit"></button></form></div></section></div>`;
    localizeRecovery(root);
    const passkey=root.querySelector('[data-save-passkey]'),status=root.querySelector('[role=status]');
    window.HeremePasskeys?.config().then(config=>{if(root.isConnected&&!config.enabled){passkey.disabled=true;status.textContent=t('auth.device_unavailable');}}).catch(error=>{if(root.isConnected){passkey.disabled=true;status.textContent=error.message;}});
    passkey.onclick=async()=>{passkey.disabled=true;try{await window.HeremePasskeys.register();active.backupPending=false;status.textContent=t('auth.device_saved');passkey.hidden=true;}catch(error){status.textContent=error.message;passkey.disabled=false;}};
    root.querySelector('[data-copy-recovery]').onclick=async()=>{try{await navigator.clipboard.writeText(result.recovery_key);status.textContent=t('auth.copied');}catch{status.textContent=t('auth.copy_failed');}};
    root.querySelector('form').addEventListener('submit',()=>{active.backupPending=false;});
  }
  async function submit(form){const error=active.root.querySelector('.auth-error');error.hidden=true;const button=form.querySelector('button[type="submit"],button:not([type])');if(button)button.disabled=true;try{const fields=new FormData(form),created=form.dataset.authForm==='register',result=await request(created?'/api/session':'/api/session/recover',created?{name:fields.get('name')}:{name:fields.get('name'),recovery_key:fields.get('recovery_key')});const callback=active?.onSuccess;if(created&&result.recovery_key)return showRecovery(result,callback);await window.HeremePwa?.reconcilePush?.();await callback?.(result,{created:false});close({cancel:false});}catch(problem){if(error.isConnected){error.textContent=problem.message;error.hidden=false;if(button)button.disabled=false;}}}
  function open({mode='register',messageKey='',onSuccess,onCancel}={}){
    close({cancel:false});const root=document.createElement('div');root.className='auth-root';document.body.append(root);const dismiss=async()=>{if(active?.backupPending&&!confirm(t('auth.leave_warning')))return;if(active?.registrationResult){const result=active.registrationResult,callback=active.onSuccess;await window.HeremePwa?.reconcilePush?.();close({cancel:false});await callback?.(result,{created:true});}else close();};const onKey=event=>{if(event.key==='Escape'&&active?.root===root)dismiss();};active={root,returnFocus:document.activeElement,onSuccess,onCancel,messageKey,onKey};render(mode);
    root.addEventListener('click',event=>{if(event.target.matches('[data-auth-close]'))return dismiss();const tab=event.target.closest('[data-auth-mode]');if(tab)render(tab.dataset.authMode);});
    root.addEventListener('submit',event=>{const form=event.target.closest('[data-auth-form]');if(!form)return;event.preventDefault();submit(form);});document.addEventListener('keydown',onKey);
    root.addEventListener('keydown',event=>{if(event.key!=='Tab')return;const elements=[...root.querySelectorAll('button:not([disabled]),input:not([disabled]),a[href]')].filter(item=>!item.hidden&&item.getClientRects().length);if(!elements.length)return;const first=elements[0],last=elements.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}});
  }
  addEventListener('hereme:language',()=>{if(!active)return;const form=active.root.querySelector('[data-auth-form]');if(form)localize(active.root,form.dataset.authForm==='register');else if(active.root.querySelector('#recoveryTitle'))localizeRecovery(active.root);});
  window.HeremeAuth={open,close};
})();
