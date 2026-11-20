'use strict';
(() => {
  const $=selector=>document.querySelector(selector);
  const E=HeremePoster.escape;
  const csrfCookie=()=>document.cookie.split(';').map(value=>value.trim()).find(value=>value.startsWith('hereme_csrf='))?.slice(12)?decodeURIComponent(document.cookie.split(';').map(value=>value.trim()).find(value=>value.startsWith('hereme_csrf=')).slice(12)):'';
  const state={
    legacyToken:localStorage.getItem('hereme_token')||'',csrf:'',user:null,posts:[],meta:null,nextCursor:null,
    categories:[...HeremeThemes.ids],sort:'new',query:'',filtersOpen:false,activity:null,textPosition:'auto',modal:null,detailPost:null,comments:[],replyTo:null,
    category:'story',postMode:null,composeStep:'select',draft:{title:'',body:'',link:''},editorImage:null,editorFile:null,
    editorZoom:1,editorX:50,editorY:50,editorSynthetic:false,tempUrl:null,editorVideo:false,videoDuration:0,videoThumbnail:'',videoProgress:0,videoUploading:false,videoPaused:false,videoCancelled:false,videoUpload:null,
    pending:null,recoveryKey:'',areas:[],areaGeometry:null,selectedAreas:[],draftAreas:[],postArea:'',
    loadRequest:0,detailRequest:0,imageRequest:0,voting:new Set(),staff:null,staffTab:'posts',staffReason:''
  };
  async function api(url,{method='GET',body,form}={}) {
    const headers={};
    if(state.legacyToken)headers.authorization='Bearer '+state.legacyToken;
    if(!['GET','HEAD'].includes(method)&&state.csrf)headers['x-csrf-token']=state.csrf;
    if(body!==undefined)headers['content-type']='application/json';
    let response;
    try{response=await fetch(url,{method,headers,body:form||(body===undefined?undefined:JSON.stringify(body))});}
    catch{throw new Error('Ingen kontakt med serveren. Sjekk at run.cmd kjører.');}
    const data=await response.json();
    if(!response.ok){const error=new Error(data.error?.message||data.error||'Feil '+response.status);error.status=response.status;error.code=data.error?.code;throw error;}
    return data;
  }
  function toast(message) {
    $('#toastRoot').innerHTML=`<div class="toast">${E(message)}</div>`;
    clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>$('#toastRoot').innerHTML='',4000);
  }
  function renderFilters() {
    $('#categoryFilters').innerHTML=HeremeFeed.filters(state.categories);
    $('#simpleCategories').innerHTML=HeremeFeed.categoryButtons(state.categories);
    $('#filterCount').textContent=state.categories.length===5?'':state.categories.length;
  }
  function renderPreferences() {
    const {layout,theme}=document.documentElement.dataset;
    for(const button of document.querySelectorAll('[data-action=layout]'))button.setAttribute('aria-pressed',button.dataset.layout===layout);
    $('#themeToggle').textContent=theme==='dark'?'Lys modus':'Mørk modus';
    $('#themeToggle').setAttribute('aria-label',$('#themeToggle').textContent);
    $('#themeToggle').setAttribute('aria-pressed',theme==='light');
    document.querySelector('meta[name=theme-color]').content=theme==='light'?'#f2f1eb':'#0f1113';
    HeremePoster.fitTitles(document);
  }
  function renderWall() {
    $('#profileLabel').textContent=state.user?.name||'Bli med';
    $('#profileMonogram').textContent=state.user?.name[0].toUpperCase()||'○';
    $('#feedCounter').textContent=state.loadError?'':state.posts.length;
    $('#feed').innerHTML=state.loadError?
      `<div class="empty-state"><h2>Kunne ikke hente veggen</h2><p>${E(state.loadError)}</p><button class="btn btn-secondary" data-action="retry-feed">Prøv igjen</button></div>`:
      state.posts.length?state.posts.map(HeremeFeed.card).join('')+(state.nextCursor?'<button class="load-more btn btn-secondary" data-action="load-more">Vis flere innlegg</button>':''):
      `<div class="empty-state"><h2>${state.categories.length?'Det e stille her ennå.':'Ingen kategorier valgt'}</h2><p>${state.categories.length?'Del en tanke eller et øyeblikk.':'Kryss av en kategori for å vise innlegg.'}</p><button class="btn btn-secondary" data-action="${state.categories.length?'compose':'home'}">${state.categories.length?'＋ Legg ut':'Vis alle kategorier'}</button></div>`;
    HeremePoster.enhance($('#feed'));
    $('#activityPanel').innerHTML=HeremeShell.activity(state.activity,state.loadError);
  }
  async function loadPosts({append=false}={}) {
    const request=++state.loadRequest;state.loadError='';
    $('#feed').setAttribute('aria-busy','true');
    try {
      const params=new URLSearchParams({categories:state.categories.join(','),sort:state.sort,q:state.query,limit:'24'});if(state.selectedAreas.length)params.set('areas',state.selectedAreas.join(','));if(append&&state.nextCursor)params.set('cursor',state.nextCursor);
      const activityParams=new URLSearchParams({categories:state.categories.join(','),sort:state.sort,q:state.query,limit:'50'});if(state.selectedAreas.length)activityParams.set('areas',state.selectedAreas.join(','));
      const [response,activity]=await Promise.all([api('/api/posts?'+params),api('/api/activity?'+activityParams)]);
      if(request!==state.loadRequest)return;
      state.posts=append?[...state.posts,...response.posts]:response.posts;state.nextCursor=response.next_cursor;state.activity=activity;
    } catch(error) {if(request!==state.loadRequest)return;state.loadError=error.message;}
    $('#feed').setAttribute('aria-busy','false');renderWall();
  }
  function lockBackground(locked) {
    document.body.classList.toggle('modal-open',locked);
    for(const element of [$('.masthead'),$('.display-preferences'),$('#forumShell')])element.inert=locked;
  }
  function wrapper(title,body,footer='',kind='') {
    return `<div class="modal-overlay" data-action="dismiss-modal"><section class="modal-panel ${kind}" role="dialog" aria-modal="true" aria-label="${E(title)}">
      <header class="modal-header"><h2>${E(title)}</h2><button class="modal-close" data-action="close-modal" aria-label="Lukk">× <span>Lukk</span></button></header>
      <div class="modal-content">${body}</div>${footer?`<footer class="modal-footer">${footer}</footer>`:''}</section></div>`;
  }
  function resetPhoto() {
    state.imageRequest++;state.photoLoading=false;
    if(state.tempUrl)URL.revokeObjectURL(state.tempUrl);
    state.tempUrl=null;state.editorFile=null;state.editorImage=null;state.editorSynthetic=false;state.editorVideo=false;state.videoDuration=0;state.videoThumbnail='';state.videoProgress=0;state.videoUploading=false;state.videoPaused=false;state.videoCancelled=false;state.videoUpload=null;
    state.editorZoom=1;state.editorX=50;state.editorY=50;
  }
  function openModal(type) {
    if(!state.modal)state.returnFocus=document.activeElement;
    state.modal=type;lockBackground(true);
    if(type==='compose'){resetPhoto();state.postMode=null;state.composeStep='select';state.category='story';state.textPosition='auto';state.postArea=state.selectedAreas[0]||'';state.draft={title:'',body:'',link:''};}
    renderModal();
  }
  function closeModal() {
    if(state.publishing)return;
    resetPhoto();state.detailRequest++;state.modal=null;state.replyTo=null;state.pending=null;
    $('#modalRoot').innerHTML='';lockBackground(false);
    const returnTarget=state.returnFocus?.isConnected?state.returnFocus:
      document.querySelector(`[data-post-id="${state.detailPost?.id}"] .tile-open`)||$('.logo');
    returnTarget.focus({preventScroll:true});
    if(location.search.includes('post='))history.replaceState({},'',location.pathname);
  }
  function profileModal() {
    if(state.user)return wrapper('Din profil',`<h3>Javel, ${E(state.user.name)}!</h3><p>Dette er en pseudonym konto. Lagre gjenopprettingsnøkkelen for å bruke kontoen på en annen enhet.</p><button class="btn btn-secondary" data-action="rotate-recovery">Ny gjenopprettingsnøkkel</button><button class="btn btn-secondary" data-action="logout">Logg ut</button><p><a href="/privacy.html">Personvern</a> · <a href="/rules.html">Fellesskapsregler</a></p>`);
    return wrapper('Bli med i drøsen',`<p>Velg et unikt pseudonym. Du får en gjenopprettingsnøkkel som vises én gang.</p><form id="profileForm" class="form-stack" autocomplete="on"><label class="field" for="nicknameInput"><span>Pseudonym</span><input id="nicknameInput" name="username" minlength="2" maxlength="24" autocomplete="username" required></label><button class="btn btn-primary" type="submit">Opprett pseudonym →</button></form><details><summary>Har du allerede en nøkkel?</summary><form id="recoverForm" class="form-stack" autocomplete="on"><label class="field" for="recoverName"><span>Pseudonym</span><input id="recoverName" name="username" minlength="2" maxlength="24" autocomplete="username" required></label><label class="field" for="recoverKey"><span>Gjenopprettingsnøkkel</span><input id="recoverKey" name="password" type="password" autocomplete="current-password" required></label><button class="btn btn-secondary">Logg inn</button></form></details>`);
  }
  function loginForm(){return `<form id="recoverForm" class="form-stack account-login" autocomplete="on"><label class="field" for="recoverName"><span>Pseudonym</span><input id="recoverName" name="username" minlength="2" maxlength="24" autocomplete="username" required></label><label class="field" for="recoverKey"><span>Gjenopprettingsnøkkel</span><input id="recoverKey" name="password" type="password" autocomplete="current-password" required></label><button class="btn btn-primary" type="submit">Logg inn →</button></form>`;}
  function accountMenu(){
    const links=`<p class="account-links"><a href="/rules.html">Fellesskapsregler</a> · <a href="/privacy.html">Personvern</a></p>`;
    const connection=state.meta?.addresses?`<details class="connection-details"><summary>Åpne på mobilen lokalt</summary><img src="/api/connect-qr.svg" width="180" height="180" alt="QR-kode til denne instansen"><p>${E(state.meta?.connect_url)}</p><button class="text-button" data-action="copy-connect">Kopier adressen</button></details>`:'';
    if(state.user){const staff=state.user.capabilities?.includes('staff:read')?'<button class="btn btn-primary" data-action="staff-panel">Administrasjon og moderering</button>':'';return wrapper('Din profil',`<section class="account-summary"><span class="account-avatar" aria-hidden="true">${E(state.user.name[0].toUpperCase())}</span><div><p class="eyebrow">Logget inn som</p><h3>${E(state.user.name)}</h3><p class="muted-note">${E(state.user.roles.join(', '))}</p></div></section><div class="account-actions">${staff}<button class="btn btn-secondary" data-action="rotate-recovery">Ny gjenopprettingsnøkkel</button><button class="btn btn-danger" data-action="logout">Logg ut</button></div>${connection}${links}`);}
    return wrapper('Logg inn',`<p>Bruk pseudonymet og gjenopprettingsnøkkelen din.</p>${loginForm()}<div class="account-register"><p><b>Ny på HerEme?</b></p><button class="btn btn-secondary" data-action="register">Opprett nytt pseudonym →</button></div>${connection}${links}`);
  }
  const staffReason=()=>{const value=($('#staffReason')?.value||state.staffReason).trim();if(value.length<3)throw new Error('Skriv en begrunnelse på minst tre tegn.');state.staffReason=value;return value;};
  function staffPanel(){
    if(!state.staff)return wrapper('Administrasjon og moderering','<p class="loading-card">Henter serverinnhold …</p>','','staff-modal');
    const admin=state.user.capabilities.includes('content:manage'),tabs=admin?['posts','users','comments','reports']:['posts'];
    const labels={posts:'Innlegg',users:'Brukere',comments:'Kommentarer',reports:'Rapporter'};
    const nav=`<nav class="staff-tabs">${tabs.map(tab=>`<button class="btn btn-secondary" data-action="staff-tab" data-tab="${tab}" aria-pressed="${state.staffTab===tab}">${labels[tab]}</button>`).join('')}</nav>`;
    let rows='';
    if(state.staffTab==='posts')rows=`<table class="staff-table"><thead><tr><th>ID</th><th>Innhold</th><th>Forfatter</th><th>Status</th><th>Poeng</th><th>Handling</th></tr></thead><tbody>${state.staff.posts.map(post=>`<tr><td>${post.id}</td><td>${admin?`<input data-staff-field="title" data-id="${post.id}" value="${E(post.title)}" maxlength="160"><textarea data-staff-field="body" data-id="${post.id}" maxlength="3000">${E(post.body)}</textarea><select data-staff-field="category" data-id="${post.id}">${HeremeThemes.ids.map(id=>`<option value="${id}"${id===post.category?' selected':''}>${E(HeremeThemes.get(id).label)}</option>`).join('')}</select>`:`<b>${E(post.title)}</b>`}</td><td>${E(post.author)}</td><td>${admin?`<select data-staff-field="status" data-id="${post.id}">${['published','review','hidden','rejected'].map(value=>`<option${value===post.status?' selected':''}>${value}</option>`).join('')}</select>`:E(post.status)}</td><td>${admin?`<input type="number" data-staff-field="score" data-id="${post.id}" value="${post.score}" min="-1000000" max="1000000">`:post.score}</td><td class="staff-actions">${admin?`<button class="btn btn-primary" data-action="staff-save-post" data-id="${post.id}">Lagre</button><button class="btn btn-danger" data-action="staff-delete-post" data-id="${post.id}">Slett</button>`:''}<button class="btn btn-secondary" data-action="staff-moderate" data-mode="${post.status==='hidden'?'publish':'hide'}" data-id="${post.id}">${post.status==='hidden'?'Gjenopprett':'Sensurer'}</button></td></tr>`).join('')}</tbody></table>`;
    if(state.staffTab==='users')rows=`<table class="staff-table"><thead><tr><th>Pseudonym</th><th>Roller</th><th>Innhold</th><th>Slett</th></tr></thead><tbody>${state.staff.users.map(user=>`<tr><td>${E(user.name)}<br><small>${E(user.status)}</small></td><td>${E(user.roles.join(', '))}</td><td>${user.post_count} innlegg · ${user.comment_count} kommentarer · ${user.vote_count} stemmer</td><td><label><input type="checkbox" data-delete-posts="${E(user.id)}"> Slett også innlegg</label><button class="btn btn-danger" data-action="staff-delete-user" data-user-id="${E(user.id)}"${user.id===state.user.id?' disabled':''}>Slett bruker</button></td></tr>`).join('')}</tbody></table>`;
    if(state.staffTab==='comments')rows=`<table class="staff-table"><thead><tr><th>ID</th><th>Innlegg</th><th>Forfatter</th><th>Kommentar</th><th>Handling</th></tr></thead><tbody>${state.staff.comments.map(comment=>`<tr><td>${comment.id}</td><td>${E(comment.post_title)}</td><td>${E(comment.author)}</td><td><textarea data-comment-body="${comment.id}" maxlength="1200">${E(comment.body)}</textarea></td><td class="staff-actions"><button class="btn btn-primary" data-action="staff-save-comment" data-id="${comment.id}">Lagre</button><button class="btn btn-danger" data-action="staff-delete-comment" data-id="${comment.id}">Slett tråd</button></td></tr>`).join('')}</tbody></table>`;
    if(state.staffTab==='reports')rows=`<table class="staff-table"><thead><tr><th>ID</th><th>Innlegg</th><th>Rapportør</th><th>Grunn</th><th>Status</th></tr></thead><tbody>${state.staff.reports.map(report=>`<tr><td>${report.id}</td><td>${E(report.post_title)}</td><td>${E(report.reporter||'slettet')}</td><td>${E(report.reason)}</td><td>${report.resolved?'løst':'åpen'}</td></tr>`).join('')}</tbody></table>`;
    const summary=admin?`${state.staff.stats.posts} innlegg · ${state.staff.stats.users} brukere · ${state.staff.stats.comments} kommentarer · ${state.staff.stats.reports} rapporter`:`${state.staff.stats.posts} innlegg`;
    return wrapper('Administrasjon og moderering',`<p class="notice">${summary}. Alle endringer loggføres.</p><label class="field"><span>Begrunnelse for neste handling</span><input id="staffReason" maxlength="300" value="${E(state.staffReason)}" placeholder="Hvorfor gjøres endringen?"></label>${nav}<div class="staff-table-wrap">${rows}</div>`,'','staff-modal');
  }
  async function loadStaff(){state.staff=await api('/api/admin/overview');if(!state.user.capabilities.includes('content:manage'))state.staffTab='posts';}
  async function openStaffPanel(){state.staff=null;openModal('staff');await loadStaff();renderModal();}
  async function refreshStaff(message){await loadStaff();renderModal({preserve:true});await loadPosts();if(message)toast(message);}
  function requireUser(action) {
    if(state.user)return true;
    state.pending=action;openModal('profile');return false;
  }
  function renderModal({preserve=false}={}) {
    const content=$('.modal-content'),scroll=preserve?content?.scrollTop||0:0;
    const focus=preserve?document.activeElement?.id:null;
    const comment=preserve?$('#commentText')?.value:undefined;
    let html='';
    if(state.modal==='profile')html=profileModal();
    if(state.modal==='recovery-key')html=wrapper('Lagre innloggingen nå',`<p>Enheten kan lagre pseudonymet og nøkkelen som en vanlig innlogging. Nøkkelen vises bare nå og kan brukes på en annen enhet.</p><form id="recoverySaveForm" class="form-stack recovery-save-form" action="/api/recovery/confirm" method="post" autocomplete="on"><input type="hidden" name="csrf_token" value="${E(state.csrf)}"><label class="field" for="recoveryUsername"><span>Pseudonym</span><input id="recoveryUsername" name="username" value="${E(state.user?.name||'')}" autocomplete="username" required></label><label class="field" for="recoveryPassword"><span>Gjenopprettingsnøkkel</span><span class="credential-row"><input id="recoveryPassword" class="recovery-key" name="password" type="password" value="${E(state.recoveryKey)}" autocomplete="new-password" required><button class="btn btn-secondary" type="button" data-action="toggle-recovery">Vis</button></span></label><div class="recovery-actions"><button class="btn btn-secondary" type="button" data-action="copy-recovery">Kopier nøkkel</button><button class="btn btn-primary" type="submit">Lagre med enheten →</button></div></form><p class="notice">Nettleseren bestemmer om den viser et lagringsspørsmål. Mister du både sesjonen og nøkkelen, kan kontoen ikke gjenopprettes sikkert.</p>`, '<button class="text-button" data-action="recovery-continue">Fortsett uten automatisk lagring</button>');
    if(state.modal==='areas')html=wrapper('Områder',HeremeLocations.body(state.areas,state.areaGeometry,state.draftAreas),'<button class="btn btn-primary" data-action="save-areas">Lagre områder</button>','area-modal');
    if(state.modal==='compose'){
      const footer=state.composeStep==='select'?'':`<span class="muted-note">${state.composeStep==='edit'?'Ett steg til.':'Klar når du er.'}</span><button type="submit" form="composeForm" class="btn btn-primary" id="publishButton">${state.composeStep==='edit'?'Neste →':`Publiser ${state.postMode==='video'?'video':state.postMode==='image'?'bilde':'innlegg'} ↗`}</button>`;
      html=wrapper('Legg noe på veggen',HeremeCompose.body(state),footer,'compose-modal');
    }
    if(state.modal==='detail') {
      const p=state.detailPost;
      html=`<div class="modal-overlay" data-action="dismiss-modal"><section class="modal-panel detail-modal" role="dialog" aria-modal="true" aria-label="Innlegg">
        <header class="detail-toolbar"><button class="modal-close" data-action="close-modal">× Lukk</button>${p?`<button class="report-button" data-action="report" data-id="${p.id}">Rapporter</button><button class="btn btn-secondary" data-action="share" data-id="${p.id}">↗ Del</button>`:''}</header>
        <div class="modal-content">${p?HeremeDetail.body(p,state.comments,state.replyTo):'<p class="loading-card">Henter innlegget …</p>'}</div></section></div>`;
    }
    if(state.modal==='report')html=wrapper('Rapporter innlegg',`<form id="reportForm" class="form-stack"><label class="field" for="reportReason"><span>Hva er problemet?</span><select id="reportReason"><option>Personopplysninger</option><option>Trakassering</option><option>Ulovlig innhold</option><option>Spam / svindel</option><option>Annet</option></select></label><p class="notice">Tre forskjellige demokontoers rapporter setter innlegget på vent for vurdering.</p><button class="btn btn-primary" type="submit">Send rapport</button></form>`);
    if(state.modal==='menu')html=accountMenu();
    if(state.modal==='staff')html=staffPanel();
    $('#modalRoot').innerHTML=html;
    if(preserve)$('.modal-panel')?.classList.add('modal-refresh');
    HeremePoster.enhance($('#modalRoot'));
    if(state.modal==='compose'&&state.photoLoading&&$('#publishButton'))$('#publishButton').disabled=true;
    if(comment!==undefined&&$('#commentText'))$('#commentText').value=comment;
    if(preserve&&$('.modal-content'))$('.modal-content').scrollTop=scroll;
    if(focus&&document.getElementById(focus))document.getElementById(focus).focus({preventScroll:true});
    else $('.modal-close')?.focus({preventScroll:true});
  }
  function saveDraft() {
    state.draft={title:$('#postTitle')?.value??state.draft.title,body:$('#postBody')?.value??state.draft.body,link:$('#postLink')?.value??state.draft.link};
  }
  function updatePreview() {
    saveDraft();
    if($('#posterPreview')){$('#posterPreview').innerHTML=HeremePoster.surface(HeremeCompose.preview(state),{previewUrl:state.videoThumbnail||state.tempUrl||''})+(state.postMode==='video'?'<span class="video-preview-badge">'+HeremeIcons.icon('video')+' Video</span>':'');HeremePoster.enhance($('#posterPreview'));}
    if($('#categoryHint'))$('#categoryHint').textContent=HeremeThemes.get(state.category).description;
  }
  async function openDetail(id) {
    const request=++state.detailRequest;
    if(!state.modal)state.returnFocus=document.activeElement;
    state.detailPost=state.posts.find(p=>p.id===id)||null;state.comments=[];state.replyTo=null;
    state.modal='detail';lockBackground(true);renderModal();
    try {
      const [post,comments]=await Promise.all([api('/api/posts/'+id),api(`/api/posts/${id}/comments`)]);
      if(state.modal!=='detail'||request!==state.detailRequest)return;
      state.detailPost=post.post;state.comments=comments.comments;renderModal({preserve:true});
      history.replaceState({},'',`/?post=${id}`);
    } catch(error) {if(request!==state.detailRequest)return;closeModal();toast(error.message);}
  }
  async function vote(id,value) {
    if(!requireUser(()=>vote(id,value))||state.voting.has(id))return;
    state.voting.add(id);
    try {
      const result=await api(`/api/posts/${id}/vote`,{method:'POST',body:{value}});
      const focused=document.activeElement;
      const restoreFocus=focused?.dataset.action==='vote'&&Number(focused.dataset.id)===id;
      const focusRoot=focused?.closest('.detail-modal')?'.detail-modal':'#feed';
      const p=state.posts.find(post=>post.id===id);if(p)Object.assign(p,result);
      renderWall();
      if(state.detailPost?.id===id) {
        Object.assign(state.detailPost,result);
        if(state.modal==='detail')renderModal({preserve:true});
      }
      if(restoreFocus)document.querySelector(`${focusRoot} [data-action="vote"][data-id="${id}"][data-value="${value}"]`)?.focus({preventScroll:true});
    } finally {state.voting.delete(id);}
  }
  async function share(id) {
    const url=new URL('/',location.origin);url.searchParams.set('post',id);
    if(navigator.share) {
      try {await navigator.share({title:'HerEme · på veggen',url:url.href});return;}
      catch(error){if(error.name==='AbortError')return;}
    }
    if(navigator.clipboard?.writeText) {
      try {await navigator.clipboard.writeText(url.href);toast('Lenken er kopiert!');return;}
      catch { /* Plain HTTP LAN browsers may deny clipboard; offer a copyable URL. */ }
    }
    window.prompt('Kopier denne lenken:',url.href);
  }
  async function loadPhoto(file,synthetic=false) {
    if(!file)return;
    if(!file.type.startsWith('image/'))throw new Error('Velg en bildefil.');
    if(file.size>25*1024*1024)throw new Error('Velg et bilde under 25 MB.');
    saveDraft();resetPhoto();state.postMode='image';state.composeStep='edit';const request=state.imageRequest;
    state.photoLoading=true;if($('#publishButton'))$('#publishButton').disabled=true;
    if($('#photoFilename'))$('#photoFilename').textContent='Åpner bildet …';
    const url=URL.createObjectURL(file),image=new Image();
    try {
      image.src=url;await image.decode();
      if(request!==state.imageRequest||state.modal!=='compose'){URL.revokeObjectURL(url);return;}
      state.tempUrl=url;state.editorFile=file;state.editorImage=image;state.editorSynthetic=synthetic;
      state.photoLoading=false;renderModal({preserve:true});
    } catch(error) {
      URL.revokeObjectURL(url);
      if(request===state.imageRequest){state.photoLoading=false;renderModal({preserve:true});throw new Error('Bildet kunne ikke åpnes. Velg et annet bilde.');}
    }
  }
  async function loadVideo(file) {
    if(!file)return;if(!file.type.startsWith('video/'))throw new Error('Velg en videofil.');
    saveDraft();resetPhoto();state.postMode='video';state.composeStep='edit';const url=URL.createObjectURL(file),video=document.createElement('video');video.preload='metadata';video.muted=true;video.src=url;
    await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(new Error('Videoen kunne ikke åpnes.'));});
    if(!Number.isFinite(video.duration)||video.duration<=0||video.duration>180){URL.revokeObjectURL(url);throw new Error('Videoen må være maks 180 sekunder.');}
    video.currentTime=Math.min(.2,video.duration/2);await new Promise(resolve=>{video.onseeked=resolve;setTimeout(resolve,500);});
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=Math.max(1,Math.round(640*(video.videoHeight||360)/(video.videoWidth||640)));canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
    state.tempUrl=url;state.editorFile=file;state.editorVideo=true;state.videoDuration=video.duration;state.videoThumbnail=canvas.toDataURL('image/jpeg',.8);renderModal({preserve:true});
  }
  async function uploadVideo(file,input) {
    let started=state.videoUpload,offset=0;
    if(started){const existing=await api(started.upload_url);if(existing.status!=='uploading')return started;offset=existing.uploaded_bytes;if(existing.bytes!==file.size)throw new Error('Den lagrede opplastingen tilhører en annen fil. Avbryt og prøv igjen.');}
    else started=await api('/api/video-uploads',{method:'POST',body:{...input,bytes:file.size,mime_type:String(file.type||'').split(';')[0].trim().toLowerCase()}});
    state.videoUpload=started;state.videoUploading=true;state.videoCancelled=false;state.videoPaused=false;state.videoProgress=1;renderModal({preserve:true});
    const chunkSize=4*1024*1024;
    try{
      for(;offset<file.size;){
        while(state.videoPaused&&!state.videoCancelled)await new Promise(resolve=>state.videoResume=resolve);
        if(state.videoCancelled)throw new Error('Videoopplastingen ble avbrutt.');
        const end=Math.min(offset+chunkSize,file.size),blob=file.slice(offset,end);let result,lastError;
        for(let attempt=1;attempt<=3&&!result;attempt++)try{result=await sendVideoChunk(started.upload_url,blob,offset,end,file.size);}catch(error){lastError=error;if(state.videoCancelled)throw error;if(attempt<3)await new Promise(resolve=>setTimeout(resolve,attempt*500));}
        if(!result)throw lastError;offset=end;state.videoProgress=Math.round(offset/file.size*100);const progress=$('.media-workspace progress');if(progress)progress.value=state.videoProgress;const label=$('.upload-progress span');if(label)label.textContent=state.videoProgress+'%';
      }
      state.videoUpload=null;return started;
    } finally {state.videoUploading=false;state.videoXhr=null;}
  }
  function sendVideoChunk(url,blob,start,end,total){return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();state.videoXhr=xhr;xhr.open('PATCH',url);xhr.setRequestHeader('x-csrf-token',state.csrf);xhr.setRequestHeader('Content-Range',`bytes ${start}-${end-1}/${total}`);xhr.onload=()=>{let result={};try{result=JSON.parse(xhr.responseText||'{}');}catch{}if(xhr.status>=200&&xhr.status<300)resolve(result);else reject(new Error(result.error?.message||'Videoopplasting feilet.'));};xhr.onerror=()=>reject(new Error('Videoopplasting feilet. Prøv igjen.'));xhr.onabort=()=>reject(new Error('Videoopplastingen ble avbrutt.'));xhr.send(blob);});}
  async function imageToBlob(image) {
    const ratio=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));
    canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Kunne ikke lagre bildet.')),'image/jpeg',.86));
  }
  async function submitCompose() {
    if(state.publishing||state.photoLoading)return;
    saveDraft();
    const title=state.draft.title.trim();
    if(title.length<3||title.length>160)throw new Error('Skriv en overskrift med 3–160 tegn.');
    if(state.postMode==='image'&&!state.editorImage)throw new Error('Velg et bilde til bildeinnlegget.');
    if(state.postMode==='video'&&!state.editorVideo)throw new Error('Velg eller ta opp en video til videoinnlegget.');
    const button=$('#publishButton');button.disabled=true;button.textContent='Publiserer …';
    if(!state.editorVideo)$('#composeForm').inert=true;
    state.publishing=true;
    try {
      if(state.postMode==='video'){await uploadVideo(state.editorFile,{title,body:state.draft.body.trim(),category:state.category,poster_style:state.category,text_position:state.textPosition,area_id:state.postArea||undefined});state.publishing=false;closeModal();toast('Videoen behandles og vises når den er klar.');return;}
      const form=new FormData();
      form.set('title',title);form.set('body',state.draft.body.trim());form.set('category',state.category);
      form.set('poster_style',state.category);form.set('text_position',state.textPosition);
      form.set('type',state.postMode==='image'?'image':state.draft.link.trim()?'link':'text');
      if(state.postMode==='text'&&state.draft.link.trim())form.set('link_url',state.draft.link.trim());
      if(state.postArea)form.set('area_id',state.postArea);
      if(state.postMode==='image') {
        form.set('image',await imageToBlob(state.editorImage),'hereme-bilde.jpg');
        for(const [key,value]of Object.entries({image_zoom:state.editorZoom,image_x:state.editorX,image_y:state.editorY}))form.set(key,value);
        if(state.editorSynthetic)form.set('synthetic_demo','true');
      }
      const result=await api('/api/posts',{method:'POST',form});
      state.publishing=false;
      if(!state.categories.includes(state.category))state.categories.push(state.category);
      state.query='';$('#searchInput').value='';state.sort='new';$('#sortSelect').value='new';
      closeModal();renderFilters();await loadPosts();
      document.querySelector(`[data-post-id="${result.id}"]`)?.scrollIntoView({block:'center',behavior:'smooth'});
      toast('Innlegget er på veggen!');
    } catch(error) {state.publishing=false;$('#composeForm').inert=false;button.disabled=false;button.textContent=`Publiser ${state.postMode==='video'?'video':state.postMode==='image'?'bilde':'innlegg'} ↗`;throw error;}
  }
  async function submitComment() {
    const id=state.detailPost.id;
    if(!requireUser(()=>openDetail(id)))return;
    const body=$('#commentText').value.trim();
    if(!body)throw new Error('Skriv et svar først.');
    const button=$('#commentForm button');button.disabled=true;
    try {
      await api(`/api/posts/${id}/comments`,{method:'POST',body:{body,parent_id:state.replyTo}});
      state.comments=(await api(`/api/posts/${id}/comments`)).comments;state.replyTo=null;
      const post=state.posts.find(p=>p.id===id);if(post)post.comment_count=state.comments.length;
      state.detailPost.comment_count=state.comments.length;$('#commentText').value='';
      await loadPosts();renderModal({preserve:true});toast('Svaret ditt er lagt til.');
    } finally {if(button.isConnected)button.disabled=false;}
  }
  async function handleClick(event) {
    const target=event.target.closest('[data-action]');if(!target||(state.publishing&&!['pause-upload','resume-upload','cancel-upload'].includes(target.dataset.action)))return;
    const action=target.dataset.action,id=Number(target.dataset.id);
    if(action==='dismiss-modal'){if(event.target===target)closeModal();return;}
    if(action==='close-modal'){closeModal();return;}
    if(action==='layout'){document.documentElement.dataset.layout=target.dataset.layout;localStorage.setItem('hereme_layout',target.dataset.layout);renderPreferences();return;}
    if(action==='theme'){const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;localStorage.setItem('hereme_theme',theme);renderPreferences();return;}
    if(action==='category'){const category=target.dataset.category;state.categories=state.categories.includes(category)?state.categories.filter(value=>value!==category):[...state.categories,category];renderFilters();$('#simpleCategories [data-category="'+category+'"]').focus({preventScroll:true});await loadPosts();return;}
    if(action==='home'){state.query='';$('#searchInput').value='';state.categories=[...HeremeThemes.ids];renderFilters();await loadPosts();window.scrollTo({top:0,behavior:'smooth'});return;}
    if(action==='reset-filters'){state.categories=[...HeremeThemes.ids];renderFilters();await loadPosts();return;}
    if(action==='toggle-filters'){state.filtersOpen=!state.filtersOpen;$('#forumShell').classList.toggle('filters-open',state.filtersOpen);$('#filterToggle').setAttribute('aria-expanded',state.filtersOpen);return;}
    if(action==='discussion'){await openDetail(id);$('#discussion')?.scrollIntoView({block:'start',behavior:'smooth'});return;}
    if(action==='retry-feed'){await loadPosts();return;}
    if(action==='load-more'){await loadPosts({append:true});return;}
    if(action==='staff-panel'){await openStaffPanel();return;}
    if(action==='staff-tab'){state.staffReason=$('#staffReason')?.value||state.staffReason;state.staffTab=target.dataset.tab;renderModal();return;}
    if(action==='staff-moderate'){await api(`/api/admin/posts/${id}/moderation`,{method:'POST',body:{action:target.dataset.mode,reason:staffReason()}});await refreshStaff(target.dataset.mode==='hide'?'Innlegget er sensurert.':'Innlegget er gjenopprettet.');return;}
    if(action==='staff-save-post'){
      const value=name=>document.querySelector(`[data-staff-field="${name}"][data-id="${id}"]`).value;
      await api(`/api/admin/posts/${id}`,{method:'PATCH',body:{title:value('title'),body:value('body'),category:value('category'),status:value('status'),score:Number(value('score')),reason:staffReason()}});await refreshStaff('Innlegget er oppdatert.');return;
    }
    if(action==='staff-delete-post'){if(!confirm('Slette innlegget permanent, inkludert kommentarer, stemmer og media?'))return;await api(`/api/admin/posts/${id}`,{method:'DELETE',body:{reason:staffReason()}});await refreshStaff('Innlegget er slettet permanent.');return;}
    if(action==='staff-save-comment'){const body=document.querySelector(`[data-comment-body="${id}"]`).value;await api(`/api/admin/comments/${id}`,{method:'PATCH',body:{body,reason:staffReason()}});await refreshStaff('Kommentaren er oppdatert.');return;}
    if(action==='staff-delete-comment'){if(!confirm('Slette kommentaren og alle svar under den permanent?'))return;await api(`/api/admin/comments/${id}`,{method:'DELETE',body:{reason:staffReason()}});await refreshStaff('Kommentartråden er slettet.');return;}
    if(action==='staff-delete-user'){
      const userId=target.dataset.userId,deletePosts=document.querySelector(`[data-delete-posts="${CSS.escape(userId)}"]`).checked;
      if(!confirm(`Slette brukeren permanent${deletePosts?' og alle brukerens innlegg':' mens innleggene anonymiseres'}?`))return;
      await api(`/api/admin/users/${encodeURIComponent(userId)}`,{method:'DELETE',body:{delete_posts:deletePosts,reason:staffReason()}});await refreshStaff('Brukeren er slettet permanent.');return;
    }
    if(action==='menu'){openModal('menu');return;}
    if(action==='areas'){state.draftAreas=[...state.selectedAreas];openModal('areas');return;}
    if(action==='area-toggle'){const area=target.dataset.areaId;state.draftAreas=state.draftAreas.includes(area)?state.draftAreas.filter(id=>id!==area):[...state.draftAreas,area];for(const item of document.querySelectorAll(`[data-area-id="${CSS.escape(area)}"]`))item.setAttribute('aria-pressed',state.draftAreas.includes(area));return;}
    if(action==='save-areas'){const result=await api('/api/me/areas',{method:'PUT',body:{area_ids:state.draftAreas}});state.selectedAreas=result.areas.map(area=>area.id);closeModal();await loadPosts();return;}
    if(action==='profile'){openModal('profile');return;}
    if(action==='register'){openModal('profile');return;}
    if(action==='logout'){await api('/api/session/logout',{method:'POST'});state.user=null;state.csrf='';state.legacyToken='';localStorage.removeItem('hereme_token');closeModal();await loadPosts();return;}
    if(action==='rotate-recovery'){const result=await api('/api/recovery/rotate',{method:'POST'});state.recoveryKey=result.recovery_key;openModal('recovery-key');return;}
    if(action==='toggle-recovery'){const input=$('#recoveryPassword'),show=input.type==='password';input.type=show?'text':'password';target.textContent=show?'Skjul':'Vis';input.focus();return;}
    if(action==='copy-recovery'){const input=$('#recoveryPassword');if(navigator.clipboard?.writeText)try{await navigator.clipboard.writeText(state.recoveryKey);toast('Nøkkelen er kopiert.');return;}catch{}if(input){input.type='text';input.focus();input.select();if(document.execCommand?.('copy')){toast('Nøkkelen er kopiert.');return;}}window.prompt('Kopier gjenopprettingsnøkkelen:',state.recoveryKey);return;}
    if(action==='recovery-continue'){const pending=state.pending;state.pending=null;state.recoveryKey='';closeModal();await loadPosts();if(pending)await pending();return;}
    if(action==='compose'){if(requireUser(()=>openModal('compose')))openModal('compose');return;}
    if(action==='compose-back'){saveDraft();if(state.composeStep==='finish')state.composeStep='edit';else{resetPhoto();state.postMode=null;state.composeStep='select';}renderModal();return;}
    if(action==='remove-photo'){saveDraft();resetPhoto();renderModal({preserve:true});return;}
    if(action==='pause-upload'){state.videoPaused=true;target.dataset.action='resume-upload';target.textContent='Fortsett';return;}
    if(action==='resume-upload'){state.videoPaused=false;state.videoResume?.();state.videoResume=null;target.dataset.action='pause-upload';target.textContent='Pause';return;}
    if(action==='cancel-upload'){state.videoCancelled=true;state.videoPaused=false;state.videoResume?.();state.videoXhr?.abort();if(state.videoUpload)await api(state.videoUpload.upload_url,{method:'DELETE'}).catch(()=>{});return;}
    if(action==='detail'){await openDetail(id);return;}
    if(action==='vote'){await vote(id,Number(target.dataset.value));return;}
    if(action==='share'){await share(id);return;}
    if(action==='comments'){$('#discussion').scrollIntoView({behavior:'smooth'});$('#commentText').focus({preventScroll:true});return;}
    if(action==='reply'){state.replyTo=id;renderModal({preserve:true});$('#commentText').focus();return;}
    if(action==='reply-cancel'){state.replyTo=null;renderModal({preserve:true});return;}
    if(action==='report'){const report=()=>{state.reportId=id;openModal('report');};if(requireUser(report))report();return;}
    if(action==='poster-variant') {
      if(!requireUser(()=>openDetail(id)))return;
      const post=state.detailPost,source=HeremePoster.image(post.poster.source_image_url);
      if(!source)throw new Error('Ugyldig kildebilde.');
      const response=await fetch(source);if(!response.ok)throw new Error('Kildebildet kunne ikke lastes.');
      const blob=await response.blob();openModal('compose');
      state.postMode='image';state.composeStep='edit';state.category=post.category;state.draft.title=post.title;renderModal();
      await loadPhoto(new File([blob],'plakat-kilde.jpg',{type:blob.type}),Boolean(post.synthetic_demo));return;
    }
    if(action==='copy-connect') {
      if(navigator.clipboard?.writeText) {
        try {await navigator.clipboard.writeText(state.meta.connect_url);toast('Mobiladressen er kopiert.');return;}
        catch { /* Same explicit HTTP clipboard fallback as sharing. */ }
      }
      window.prompt('Kopier adressen:',state.meta.connect_url);return;
    }
  }
  async function handleSubmit(event) {
    const id=event.target.id;
    if(!['profileForm','recoverForm','composeForm','commentForm','reportForm'].includes(id))return;
    event.preventDefault();
    if(id==='profileForm') {
      const result=await api('/api/session',{method:'POST',body:{name:$('#nicknameInput').value.trim()}});
      state.user=result.user;state.csrf=result.csrf_token;state.legacyToken='';localStorage.removeItem('hereme_token');state.recoveryKey=result.recovery_key;state.modal='recovery-key';renderModal();
    }
    if(id==='recoverForm') {const result=await api('/api/session/recover',{method:'POST',body:{name:$('#recoverName').value.trim(),recovery_key:$('#recoverKey').value}});state.user=result.user;state.csrf=result.csrf_token;state.legacyToken='';localStorage.removeItem('hereme_token');const pending=state.pending;state.pending=null;closeModal();await loadPosts();if(pending)await pending();}
    if(id==='composeForm'){
      if(state.composeStep==='edit'){
        saveDraft();
        if(state.postMode==='text'&&!state.draft.body.trim())throw new Error('Skriv noe du vil dele først.');
        if(state.postMode==='image'&&!state.editorImage)throw new Error('Ta eller velg et bilde først.');
        if(state.postMode==='video'&&!state.editorVideo)throw new Error('Ta opp eller velg en video først.');
        state.composeStep='finish';renderModal();$('#postTitle')?.focus();return;
      }
      await submitCompose();
    }
    if(id==='commentForm')await submitComment();
    if(id==='reportForm') {
      const result=await api(`/api/posts/${state.reportId}/report`,{method:'POST',body:{reason:$('#reportReason').value}});
      closeModal();await loadPosts();toast(result.automatically_held?'Innlegget er satt på vent.':'Rapporten er registrert.');
    }
  }
  async function handleChange(event) {
    const input=event.target;
    if(input.name==='category'){state.categories=[...document.querySelectorAll('input[name=category]:checked')].map(el=>el.value);$('#simpleCategories').innerHTML=HeremeFeed.categoryButtons(state.categories);$('#filterCount').textContent=state.categories.length===5?'':state.categories.length;await loadPosts();}
    if(input.id==='sortSelect'){state.sort=input.value;await loadPosts();}
    if(input.id==='textPosition'){state.textPosition=input.value;updatePreview();}
    if(input.id==='postArea'){state.postArea=input.value;}
    if(input.name==='postCategory'){state.category=input.value;updatePreview();}
    if(input.name==='postMode'){saveDraft();resetPhoto();state.postMode=input.value;state.composeStep='edit';renderModal();(state.postMode==='text'?$('#postBody'):$('.media-action'))?.focus();return;}
    if(['postFileInput','postCameraInput'].includes(input.id))await loadPhoto(input.files?.[0]);
    if(['postVideoInput','postVideoCameraInput'].includes(input.id))await loadVideo(input.files?.[0]);
  }
  async function init() {
    renderPreferences();
    renderFilters();
    for(const el of document.querySelectorAll('[data-icon]'))el.innerHTML=HeremeIcons.icon(el.dataset.icon);
    window.addEventListener('resize',()=>HeremePoster.fitTitles(document));
    document.fonts.addEventListener('loadingdone',()=>HeremePoster.fitTitles(document));
    document.addEventListener('click',event=>handleClick(event).catch(error=>toast(error.message)));
    document.addEventListener('submit',event=>handleSubmit(event).catch(error=>toast(error.message)));
    document.addEventListener('change',event=>handleChange(event).catch(error=>toast(error.message)));
    document.addEventListener('input',event=>{
      if(event.target.id==='postTitle')updatePreview();
      if(event.target.id==='searchInput'){clearTimeout(state.searchTimer);state.searchTimer=setTimeout(()=>{state.query=event.target.value.trim();loadPosts();},220);}
      if(['editorZoom','editorX','editorY'].includes(event.target.id)){state[event.target.id]=Number(event.target.value);updatePreview();}
    });
    document.addEventListener('keydown',event=>{
      if((event.key==='Enter'||event.key===' ')&&event.target.dataset.action==='area-toggle'){event.preventDefault();event.target.click();return;}
      if(!state.modal)return;
      if(event.key==='Escape')closeModal();
      if(event.key==='Tab') {
        const nodes=[...document.querySelectorAll('.modal-panel button,.modal-panel input,.modal-panel textarea,.modal-panel select,.modal-panel a[href],.modal-panel summary')].filter(el=>!el.disabled&&el.getClientRects().length);
        const first=nodes[0],last=nodes[nodes.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    });
    try {
      state.meta=await api('/api/meta');
      state.csrf=csrfCookie();
      if(state.legacyToken||state.csrf)try{const current=await api('/api/me');state.user=current.user;state.csrf=current.csrf_token||csrfCookie();if(current.legacy_migrated){state.legacyToken='';localStorage.removeItem('hereme_token');if(current.recovery_key){state.recoveryKey=current.recovery_key;state.modal='recovery-key';}}}
      catch(error){if(error.status!==401)throw error;state.legacyToken='';state.csrf='';localStorage.removeItem('hereme_token');}
      if(state.meta.features?.locations){$('#areaButton').hidden=false;const [available,geometry,subscribed]=await Promise.all([api('/api/areas'),api('/api/areas/geometry'),state.user?api('/api/me/areas'):Promise.resolve({areas:[]})]);state.areas=available.areas;state.areaGeometry=geometry;state.selectedAreas=subscribed.areas.map(area=>area.id);}
      await loadPosts();
      if(new URLSearchParams(location.search).get('recovery-saved')==='1'){history.replaceState({},'',location.pathname);toast('Innloggingen er bekreftet. Enheten kan nå tilby å lagre den.');}
      const id=Number(new URLSearchParams(location.search).get('post'));if(id)await openDetail(id);
    } catch(error) {state.loadError=error.message;renderWall();}
  }
  init();
})();
