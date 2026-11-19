'use strict';
(() => {
  const $=selector=>document.querySelector(selector);
  const E=HeremePoster.escape;
  const state={
    token:localStorage.getItem('hereme_token')||'',user:null,posts:[],meta:null,
    categories:[...HeremeThemes.ids],sort:'new',query:'',filtersOpen:false,activity:null,textPosition:'auto',modal:null,detailPost:null,comments:[],replyTo:null,
    category:'story',draft:{title:'',body:'',link:''},editorImage:null,editorFile:null,
    editorZoom:1,editorX:50,editorY:50,editorSynthetic:false,tempUrl:null,
    adminPin:sessionStorage.getItem('hereme_admin_pin')||'',adminQueue:null,pending:null,
    loadRequest:0,detailRequest:0,imageRequest:0,voting:new Set()
  };
  async function api(url,{method='GET',body,form,admin=false}={}) {
    const headers={};
    if(state.token)headers.authorization='Bearer '+state.token;
    if(admin)headers['x-admin-pin']=state.adminPin;
    if(body!==undefined)headers['content-type']='application/json';
    let response;
    try{response=await fetch(url,{method,headers,body:form||(body===undefined?undefined:JSON.stringify(body))});}
    catch{throw new Error('Ingen kontakt med serveren. Sjekk at run.cmd kjører.');}
    const data=await response.json();
    if(!response.ok){const error=new Error(data.error||'Feil '+response.status);error.status=response.status;throw error;}
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
      state.posts.length?state.posts.map(HeremeFeed.card).join(''):
      `<div class="empty-state"><h2>${state.categories.length?'Det e stille her ennå.':'Ingen kategorier valgt'}</h2><p>${state.categories.length?'Del en tanke eller et øyeblikk.':'Kryss av en kategori for å vise innlegg.'}</p><button class="btn btn-secondary" data-action="${state.categories.length?'compose':'home'}">${state.categories.length?'＋ Legg ut':'Vis alle kategorier'}</button></div>`;
    HeremePoster.enhance($('#feed'));
    $('#activityPanel').innerHTML=HeremeShell.activity(state.activity,state.loadError);
  }
  async function loadPosts() {
    const request=++state.loadRequest;state.loadError='';
    $('#feed').setAttribute('aria-busy','true');
    try {
      const params=new URLSearchParams({categories:state.categories.join(','),sort:state.sort,q:state.query});
      const [response,activity]=await Promise.all([api('/api/posts?'+params),api('/api/activity?'+params)]);
      if(request!==state.loadRequest)return;
      state.posts=response.posts;state.activity=activity;
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
    state.tempUrl=null;state.editorFile=null;state.editorImage=null;state.editorSynthetic=false;
    state.editorZoom=1;state.editorX=50;state.editorY=50;
  }
  function openModal(type) {
    if(!state.modal)state.returnFocus=document.activeElement;
    state.modal=type;lockBackground(true);
    if(type==='compose'){resetPhoto();state.category='story';state.textPosition='auto';state.draft={title:'',body:'',link:''};}
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
    if(state.user)return wrapper('Din profil',`<h3>Javel, ${E(state.user.name)}!</h3><p>Du er med i drøsen.</p><div class="notice">Lokal demoprofil uten BankID eller passord.</div>`, '<button class="btn btn-secondary" data-action="switch-account">Bytt profil</button>');
    return wrapper('Bli med i drøsen',`<p>Velg et kallenavn for å stemme, kommentere og legge ut.</p><form id="profileForm" class="form-stack"><label class="field" for="nicknameInput"><span>Kallenavn</span><input id="nicknameInput" minlength="2" maxlength="24" autocomplete="nickname" required></label><p class="muted-note">Demoprofil uten BankID eller passord.</p><button class="btn btn-primary" type="submit">Bli med →</button></form>`);
  }
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
    if(state.modal==='compose')html=wrapper('Legg noe på veggen',HeremeCompose.body(state),
      '<span class="muted-note">Fem stiler. Plass til alle.</span><button type="submit" form="composeForm" class="btn btn-primary" id="publishButton">Publiser ↗</button>','compose-modal');
    if(state.modal==='detail') {
      const p=state.detailPost;
      html=`<div class="modal-overlay" data-action="dismiss-modal"><section class="modal-panel detail-modal" role="dialog" aria-modal="true" aria-label="Innlegg">
        <header class="detail-toolbar"><button class="modal-close" data-action="close-modal">× Lukk</button>${p?`<button class="report-button" data-action="report" data-id="${p.id}">Rapporter</button><button class="btn btn-secondary" data-action="share" data-id="${p.id}">↗ Del</button>`:''}</header>
        <div class="modal-content">${p?HeremeDetail.body(p,state.comments,state.replyTo):'<p class="loading-card">Henter innlegget …</p>'}</div></section></div>`;
    }
    if(state.modal==='report')html=wrapper('Rapporter innlegg',`<form id="reportForm" class="form-stack"><label class="field" for="reportReason"><span>Hva er problemet?</span><select id="reportReason"><option>Personopplysninger</option><option>Trakassering</option><option>Ulovlig innhold</option><option>Spam / svindel</option><option>Annet</option></select></label><p class="notice">Tre forskjellige demokontoers rapporter setter innlegget på vent for vurdering.</p><button class="btn btn-primary" type="submit">Send rapport</button></form>`);
    if(state.modal==='menu')html=wrapper('HerEme lokalt',`<p>Én vegg. Fem kategorier. Små øyeblikk og store samtaler.</p><button class="btn btn-secondary" data-action="profile">Din profil</button><button class="btn btn-secondary" data-action="admin">Moderatorkø ↗</button><details class="connection-details"><summary>Åpne på mobilen</summary><p>Bruk samme Wi-Fi som PC-en.</p><img src="/api/connect-qr.svg" width="180" height="180" alt="QR-kode til denne instansen"><p>${E(state.meta?.connect_url)}</p><button class="text-button" data-action="copy-connect">Kopier adressen</button></details><p class="muted-note">Lokal demo · Pseudonymer · Ingen BankID</p>`);
    if(state.modal==='admin')html=adminModal();
    $('#modalRoot').innerHTML=html;
    if(preserve)$('.modal-panel')?.classList.add('modal-refresh');
    HeremePoster.enhance($('#modalRoot'));
    if(state.modal==='compose'&&state.photoLoading)$('#publishButton').disabled=true;
    if(comment!==undefined&&$('#commentText'))$('#commentText').value=comment;
    if(preserve&&$('.modal-content'))$('.modal-content').scrollTop=scroll;
    if(focus&&document.getElementById(focus))document.getElementById(focus).focus({preventScroll:true});
    else $('.modal-close')?.focus({preventScroll:true});
  }
  function saveDraft() {
    state.draft={title:$('#postTitle').value,body:$('#postBody').value,link:$('#postLink').value};
  }
  function updatePreview() {
    saveDraft();
    $('#posterPreview').innerHTML=HeremePoster.surface(HeremeCompose.preview(state),{previewUrl:state.tempUrl||''});
    $('#categoryHint').textContent=HeremeThemes.get(state.category).description;
    HeremePoster.enhance($('#posterPreview'));
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
    saveDraft();resetPhoto();const request=state.imageRequest;
    state.photoLoading=true;$('#publishButton').disabled=true;
    $('#photoFilename').textContent='Åpner bildet …';
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
    const button=$('#publishButton');button.disabled=true;button.textContent='Publiserer …';
    $('#composeForm').inert=true;
    state.publishing=true;
    try {
      const form=new FormData();
      form.set('title',title);form.set('body',state.draft.body.trim());form.set('category',state.category);
      form.set('poster_style',state.category);form.set('text_position',state.textPosition);
      form.set('type',state.editorImage?'image':state.draft.link.trim()?'link':'text');
      if(state.draft.link.trim())form.set('link_url',state.draft.link.trim());
      if(state.editorImage) {
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
    } catch(error) {state.publishing=false;$('#composeForm').inert=false;button.disabled=false;button.textContent='Publiser ↗';throw error;}
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
  function adminModal() {
    if(!state.adminPin||state.adminQueue===null)return wrapper('Moderatorkø',`<p>Bruk demokoden fra serverterminalen.</p><form id="adminLoginForm" class="form-stack"><label class="field" for="adminPin"><span>Demo-moderatorkode</span><input id="adminPin" type="password" required autocomplete="off"></label><button class="btn btn-primary">Åpne køen</button></form>`);
    return wrapper('Moderatorkø',state.adminQueue.length?state.adminQueue.map(p=>`<article class="admin-row"><h3>${E(p.title)}</h3><p>${E(HeremeThemes.get(p.category).label)} · ${E(p.author)} · ${E(p.status)}</p><p>${p.report_count} rapporter · ${p.reasons.map(r=>E(r.reason)+' ('+r.n+')').join(', ')}</p><div class="admin-actions"><button class="btn btn-secondary" data-action="moderate" data-id="${p.id}" data-moderate="publish">Godkjenn</button><button class="btn btn-danger" data-action="moderate" data-id="${p.id}" data-moderate="hide">Skjul</button><button class="btn btn-quiet" data-action="moderate" data-id="${p.id}" data-moderate="dismiss">Avvis rapport</button></div></article>`).join(''):'<p>Ingen saker i køen.</p>','<button class="btn btn-secondary" data-action="admin-lock">Lås</button>');
  }
  async function openAdmin() {
    if(state.adminPin) {
      try {state.adminQueue=(await api('/api/admin/queue',{admin:true})).posts;}
      catch(error){if(error.status!==403)throw error;state.adminQueue=null;toast(error.message);}
    }
    openModal('admin');
  }
  async function handleClick(event) {
    const target=event.target.closest('[data-action]');if(!target||state.publishing)return;
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
    if(action==='menu'){openModal('menu');return;}
    if(action==='profile'){openModal('profile');return;}
    if(action==='switch-account'){state.token='';state.user=null;localStorage.removeItem('hereme_token');await loadPosts();openModal('profile');return;}
    if(action==='compose'){if(requireUser(()=>openModal('compose')))openModal('compose');return;}
    if(action==='remove-photo'){saveDraft();resetPhoto();renderModal({preserve:true});return;}
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
      state.category=post.category;state.draft.title=post.title;renderModal();
      await loadPhoto(new File([blob],'plakat-kilde.jpg',{type:blob.type}),Boolean(post.synthetic_demo));return;
    }
    if(action==='copy-connect') {
      if(navigator.clipboard?.writeText) {
        try {await navigator.clipboard.writeText(state.meta.connect_url);toast('Mobiladressen er kopiert.');return;}
        catch { /* Same explicit HTTP clipboard fallback as sharing. */ }
      }
      window.prompt('Kopier adressen:',state.meta.connect_url);return;
    }
    if(action==='admin'){await openAdmin();return;}
    if(action==='admin-lock'){state.adminPin='';state.adminQueue=null;sessionStorage.removeItem('hereme_admin_pin');renderModal();return;}
    if(action==='moderate'){await api('/api/admin/posts/'+id,{method:'POST',admin:true,body:{action:target.dataset.moderate}});await openAdmin();await loadPosts();toast('Moderatortiltak lagret.');}
  }
  async function handleSubmit(event) {
    const id=event.target.id;
    if(!['profileForm','composeForm','commentForm','reportForm','adminLoginForm'].includes(id))return;
    event.preventDefault();
    if(id==='profileForm') {
      const result=await api('/api/session',{method:'POST',body:{name:$('#nicknameInput').value.trim()}});
      state.token=result.token;state.user=result.user;localStorage.setItem('hereme_token',state.token);
      const pending=state.pending;state.pending=null;closeModal();await loadPosts();if(pending)await pending();
    }
    if(id==='composeForm')await submitCompose();
    if(id==='commentForm')await submitComment();
    if(id==='reportForm') {
      const result=await api(`/api/posts/${state.reportId}/report`,{method:'POST',body:{reason:$('#reportReason').value}});
      closeModal();await loadPosts();toast(result.automatically_held?'Innlegget er satt på vent.':'Rapporten er registrert.');
    }
    if(id==='adminLoginForm'){state.adminPin=$('#adminPin').value.trim();sessionStorage.setItem('hereme_admin_pin',state.adminPin);await openAdmin();}
  }
  async function handleChange(event) {
    const input=event.target;
    if(input.name==='category'){state.categories=[...document.querySelectorAll('input[name=category]:checked')].map(el=>el.value);$('#simpleCategories').innerHTML=HeremeFeed.categoryButtons(state.categories);$('#filterCount').textContent=state.categories.length===5?'':state.categories.length;await loadPosts();}
    if(input.id==='sortSelect'){state.sort=input.value;await loadPosts();}
    if(input.id==='textPosition'){state.textPosition=input.value;updatePreview();}
    if(input.name==='postCategory'){state.category=input.value;updatePreview();}
    if(['postFileInput','postCameraInput'].includes(input.id))await loadPhoto(input.files?.[0]);
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
      if(state.token) {
        try{state.user=(await api('/api/me')).user;}
        catch(error){if(error.status!==401)throw error;state.token='';localStorage.removeItem('hereme_token');}
      }
      await loadPosts();
      const id=Number(new URLSearchParams(location.search).get('post'));if(id)await openDetail(id);
    } catch(error) {state.loadError=error.message;renderWall();}
  }
  init();
})();
