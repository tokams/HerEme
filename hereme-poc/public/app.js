'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const state = {
    token: localStorage.getItem('hereme_token') || '', user:null, rooms:[], posts:[], meta:null,
    selected:'all', sort:'hot', query:'', modal:null, detailPost:null, comments:[], replyTo:null,
    postType:'text', editorFile:null, editorImage:null, editorStyle:'contrast', editorPosition:'bottom',
    adminPin:sessionStorage.getItem('hereme_admin_pin') || '', adminQueue:[], pending:null, loading:false
  };
  const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const E = escapeHtml;
  const timeAgo = s => {
    const ts = Date.parse(String(s).replace(' ','T')+'Z');
    if (!Number.isFinite(ts)) return '';
    const mins = Math.max(0, Math.floor((Date.now()-ts)/60000));
    if (mins<1) return 'akkurat nå';
    if (mins<60) return `${mins} min`;
    if (mins<1440) return `${Math.floor(mins/60)} t`;
    return `${Math.floor(mins/1440)} d`;
  };
  const short = (s,n) => String(s||'').length>n ? String(s).slice(0,n-1)+'…' : String(s||'');
  const fileSafeImage = p => p && (/^\/uploads\/[a-f0-9-]+\.(?:png|jpg|webp)$/.test(p) || /^\/assets\/[a-z0-9_-]+\.svg$/.test(p)) ? p : '';
  const icon = (name, size=16) => {
    const symbols = {
      comment:'<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3H13a8.5 8.5 0 0 1 8 8v.5Z"/>',
      share:'<path d="M12 16V3m-5 5 5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
      flag:'<path d="M4 22V4m0 1c4-3 8 3 12 0 2-1 3-1 4-1v12c-5-2-10 2-16 0"/>',
      link:'<path d="M10 13a5 5 0 0 0 7 .3l3-3a5 5 0 1 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7-.3l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
      image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
      check:'<path d="m5 12 4 4L19 6"/>',
      arrow:'<path d="M7 17 17 7M7 7h10v10"/>',
      reply:'<path d="m9 17-5-5 5-5M4 12h10a6 6 0 0 1 6 6v1"/>'
    };
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbols[name]||symbols.comment}</svg>`;
  };
  async function api(url, { method='GET', body, form, admin=false }={}) {
    const headers = {};
    if (state.token) headers.authorization = `Bearer ${state.token}`;
    if(admin) headers['x-admin-pin'] = state.adminPin;
    if (body!==undefined) headers['content-type']='application/json';
    let result;
    try { result=await fetch(url,{method,headers,body:form|| (body===undefined?undefined:JSON.stringify(body))}); }
    catch { throw new Error('Ingen kontakt med serveren. Sjekk at run.cmd kjører.'); }
    const data=await result.json().catch(()=>({}));
    if(!result.ok) throw new Error(data.error || `Feil ${result.status}`);
    return data;
  }
  function toast(message) {
    const root=$('#toastRoot');root.innerHTML=`<div class="toast">${E(message)}</div>`;
    clearTimeout(toast.timeout);toast.timeout=setTimeout(()=>root.innerHTML='',3400);
  }
  async function loadRooms(){state.rooms=(await api('/api/rooms')).rooms;}
  async function loadPosts(){
    state.loading=true;
    try {
      const params=new URLSearchParams({room:state.selected,sort:state.sort,q:state.query});
      state.posts=(await api('/api/posts?'+params)).posts;
    } catch(e) {toast(e.message);state.posts=[];}
    state.loading=false;render();
  }
  function render(){
    const active=state.selected==='all'?null:state.rooms.find(r=>r.slug===state.selected);
    $('#pageEyebrow').textContent=active?'DU ER I ET ROM':'HEI, VESTLANDET 👋';
    $('#pageTitle').textContent=active?`${active.emoji} ${active.name}`:'Her skjer det.';
    $('#pageSubtitle').textContent=active?active.description:'Din plass for små og store saker fra folk rundt deg.';
    $('#feedCounter').textContent=String(state.posts.length);
    const userName=state.user?.name||'Bli med';
    $('#profileLabel').textContent=userName;
    $('#profileMonogram').textContent=userName.charAt(0).toUpperCase();
    $('#quickAvatar').textContent=userName.charAt(0).toUpperCase();
    $('#roomSidebar').innerHTML=state.rooms.map(r=>`<button class="room-link ${r.slug===state.selected?'active':''}" data-action="room" data-room="${E(r.slug)}"><span class="room-em">${E(r.emoji)}</span><span class="room-label">${E(r.name)}</span></button>`).join('');
    $('#mobileRooms').innerHTML=`<button class="room-pill ${state.selected==='all'?'active':''}" data-action="home">✳ Alle</button>`+
      state.rooms.map(r=>`<button class="room-pill ${r.slug===state.selected?'active':''}" data-action="room" data-room="${E(r.slug)}">${E(r.emoji)} ${E(r.name)}</button>`).join('');
    $('#popularRooms').innerHTML=[...state.rooms].sort((a,b)=>b.post_count-a.post_count).slice(0,4).map(r=>
      `<button class="room-trend" data-action="room" data-room="${E(r.slug)}"><span class="trend-icon">${E(r.emoji)}</span><span class="trend-info"><b>${E(r.name)}</b><small>${r.post_count} innlegg</small></span></button>`).join('');
    document.querySelectorAll('[data-action="sort"]').forEach(el=>el.classList.toggle('active',el.dataset.sort===state.sort));
    $('#homeSide').classList.toggle('active',state.selected==='all');
    $('#hotSide').classList.remove('active');
    $('#mobileHome').classList.toggle('active',state.selected==='all');
    $('#mobileHot').classList.toggle('active',state.sort==='hot'&&state.selected==='all');
    $('#feed').innerHTML=state.loading?'<div class="loading-card">Henter lokale innlegg …</div>':state.posts.length?
      state.posts.map(postCard).join(''):
      `<div class="empty-state"><span class="empty-icon">✳</span><b>Det e stille her ennå.</b><p>Start drøsen med det første innlegget!</p><button class="btn btn-primary" data-action="compose" data-type="text">+ Lag innlegg</button></div>`;
  }
  function postCard(p) {
    const isRumor=p.room_slug==='ryktetorget';
    const image=fileSafeImage(p.image_url);
    const imageMarkup=image?`<img class="post-image ${p.type==='poster'?'poster':''}" data-action="detail" data-id="${p.id}" loading="lazy" src="${E(image)}" alt="Bilde til innlegget: ${E(p.title)}">`:'';
    const extLink=p.type==='link'&&p.link_url?`<a class="post-link" href="${E(p.link_url)}" target="_blank" rel="noopener noreferrer nofollow">${icon('link')} <span class="post-link-url">${E(p.link_url)}</span> ${icon('arrow',13)}</a>`:'';
    return `<article class="post-card" data-post-id="${p.id}">
      <div class="post-head"><span class="post-room">${E(p.room_emoji)} r/${E(p.room_slug)}</span><span>·</span><span class="post-author">${E(p.author)}</span><span>·</span><time class="post-time">${E(timeAgo(p.created_at))}</time>${isRumor?`<span class="post-tag">Ubekreftet</span>`:''}<button class="post-kebab" data-action="report" data-id="${p.id}" title="Rapporter innlegget" aria-label="Rapporter innlegget">···</button></div>
      <button class="post-title" data-action="detail" data-id="${p.id}">${E(p.title)}</button>
      ${p.body?`<p class="post-body">${E(p.body)}</p>`:''}${imageMarkup}${extLink}
      <div class="post-foot"><div class="vote-box"><button class="vote-btn ${p.my_vote===1?'up':''}" data-action="vote" data-id="${p.id}" data-value="1" aria-label="Stem opp" aria-pressed="${p.my_vote===1}">▲</button><span class="vote-number" title="Nettoscore: oppstemmer minus nedstemmer">${p.score>0?'+':''}${p.score}</span><button class="vote-btn ${p.my_vote===-1?'down':''}" data-action="vote" data-id="${p.id}" data-value="-1" aria-label="Stem ned" aria-pressed="${p.my_vote===-1}">▼</button></div>
        <button class="post-action" data-action="detail" data-id="${p.id}">${icon('comment')} ${p.comment_count} svar</button>
        <button class="post-action" data-action="share" data-id="${p.id}">${icon('share')} Del</button></div>
    </article>`;
  }
  const modalWrapper=(title,body,footer='',wide=false)=>`<div class="modal-overlay" data-action="dismiss-modal" role="presentation"><section class="modal-panel ${wide?'wide':''}" role="dialog" aria-modal="true" aria-label="${E(title)}"><div class="modal-header"><h2>${E(title)}</h2><button class="modal-close" data-action="close-modal" aria-label="Lukk">×</button></div><div class="modal-content">${body}</div>${footer?`<div class="modal-footer">${footer}</div>`:''}</section></div>`;
  function openModal(type, opts={}) {
    state.modal=type;
    if(type==='compose'){
      state.postType=opts.type||'text';state.editorFile=null;state.editorImage=null;state.editorStyle='contrast';state.editorPosition='bottom';
      if(state.tempUrl){URL.revokeObjectURL(state.tempUrl);state.tempUrl=null;}
    }
    renderModal();
  }
  function closeModal(){
    if(state.tempUrl){URL.revokeObjectURL(state.tempUrl);state.tempUrl=null;}
    state.modal=null;state.replyTo=null;$('#modalRoot').innerHTML='';
    if(location.search.includes('post='))history.replaceState({},'',location.pathname);
  }
  function renderModal(){
    let html='';
    if(state.modal==='profile') html=profileModal();
    if(state.modal==='compose') html=composeModal();
    if(state.modal==='room') html=roomModal();
    if(state.modal==='rooms') html=browseRoomsModal();
    if(state.modal==='detail') html=detailModal();
    if(state.modal==='report') html=reportModal();
    if(state.modal==='admin') html=adminModal();
    $('#modalRoot').innerHTML=html;
    if(state.modal==='compose'&&state.postType==='poster')drawPoster();
    if(state.modal==='compose'&&state.postType==='image'&&state.tempUrl){const preview=$('#imagePreview');if(preview)preview.src=state.tempUrl;}
  }
  function profileModal() {
    if(state.user)return modalWrapper('Din profil',`<div class="profile-hero"><div class="profile-summary"><span class="big-avatar">${E(state.user.name.charAt(0).toUpperCase())}</span><div><h3>Javel, ${E(state.user.name)}!</h3><p>Du er med i den lokale drøsen ✳</p></div></div></div><div class="notice"><b>Dette er en demoprofil.</b><br>Ingen BankID-verifisering. Kontoen er knyttet til denne nettleseren og kan byttes uten passord.</div>`, `<button class="btn btn-quiet" data-action="close-modal">Lukk</button><button class="btn btn-secondary" data-action="switch-account">Bytt profil</button>`);
    return modalWrapper('Bli med i drøsen',`<div class="profile-hero"><h3>Javel! Kjekt at du e her. ✳</h3><p>Velg et kallenavn for å stemme, kommentere og legge ut innlegg.</p></div><form class="form-stack" id="profileForm"><div class="field"><label for="nicknameInput">Kallenavn</label><input id="nicknameInput" maxlength="24" minlength="2" required placeholder="f.eks. siddis123" autocomplete="nickname" autofocus></div><p class="muted-note">Demokonto uten passord eller BankID. Ikke legg inn sensitive opplysninger.</p><button class="btn btn-primary" type="submit">Bli med →</button></form>`);
  }
  function chooseAuth(cb){if(state.user)return true;state.pending=cb;openModal('profile');return false;}
  function composeModal() {
    const type=state.postType;
    const options=[['text','✎','Tekst'],['image','▧','Bilde'],['poster','✳','Plakat'],['link','↗','Lenke']].map(([key,ic,name])=>
      `<button type="button" class="choice-tab ${type===key?'active':''}" data-action="compose-type" data-type="${key}"><span class="tab-pict">${ic}</span>${name}</button>`).join('');
    const roomSelect=state.rooms.map(r=>`<option value="${r.id}" ${r.slug===state.selected?'selected':''}>${E(r.emoji)} ${E(r.name)}</option>`).join('');
    let extra='';
    if(type==='text')extra=`<div class="field"><label for="postBody">Fortell mer (valgfritt)</label><textarea id="postBody" maxlength="3000" placeholder="Det du har på hjerta …"></textarea></div>`;
    if(type==='link')extra=`<div class="field"><label for="postLink">Lenke</label><input id="postLink" type="url" required placeholder="https://eksempel.no/artikkel"><p class="muted-note">Kun http(s)-lenker. Demoversjonen sjekker ikke hva som ligger bak lenken.</p></div><div class="field"><label for="postBody">Din kommentar (valgfritt)</label><textarea id="postBody" maxlength="3000" placeholder="Hvorfor vil du dele denne? …"></textarea></div>`;
    if(type==='image'||type==='poster')extra=`<label class="poster-upload" for="postFileInput">${state.editorFile?`✓ ${E(short(state.editorFile.name,45))}`:'＋ Velg et bilde fra mobilen eller PC-en'}<input id="postFileInput" type="file" accept="image/*"></label>${type==='poster'?`<div class="poster-preview-wrap"><canvas id="posterCanvas" class="poster-canvas" width="800" height="1000" aria-label="Forhåndsvisning av plakat"></canvas></div><div class="field"><span class="field-label">Utseende</span><div class="editor-options">${[['contrast','Mørk gradient'],['soft','Lys tekst'],['band','Tekstfelt']].map(([id,label])=>`<button type="button" class="editor-choice ${state.editorStyle===id?'active':''}" data-action="style" data-style="${id}">${label}</button>`).join('')}</div></div><div class="field"><span class="field-label">Plassering av overskrift</span><div class="editor-options">${[['top','Oppe'],['center','Midten'],['bottom','Nede']].map(([id,label])=>`<button type="button" class="editor-choice ${state.editorPosition===id?'active':''}" data-action="position" data-position="${id}">${label}</button>`).join('')}</div></div><p class="muted-note">Overskriften legges direkte på bildet og lagres som en JPEG-plakat når du publiserer.</p>`:`<img class="photo-preview" id="imagePreview" alt="Valgt bilde" ${!state.tempUrl?'hidden':''}><p class="muted-note">Bildet blir tilpasset for rask opplasting før publisering.</p>`}<div class="field"><label for="postBody">Beskrivelse (valgfritt)</label><textarea id="postBody" maxlength="3000" placeholder="Litt mer om bildet …"></textarea></div>`;
    const body=`<div class="choice-tabs">${options}</div><form class="form-stack" id="composeForm"><div class="field"><label for="postRoom">Velg rom</label><select id="postRoom" required>${roomSelect}</select></div><div class="field"><label for="postTitle">Overskrift ${type==='poster'?'(vises også på plakaten)':''}</label><input id="postTitle" required maxlength="160" minlength="3" placeholder="Ka skjer? Fortell oss …" autocomplete="off"></div>${extra}</form>`;
    return modalWrapper(type==='poster'?'Lag en plakat':'Nytt innlegg',body,`<span class="muted-note">Publiseres lokalt</span><button type="submit" form="composeForm" class="btn btn-primary" id="publishButton">Publiser innlegg ↗</button>`,true);
  }
  function roomModal(){return modalWrapper('Opprett et nytt rom',`<div class="notice">Samle folk rundt en plass, et tema eller en interesse. Rommet blir synlig for alle på ditt lokale nettverk.</div><form id="roomForm" class="form-stack" style="margin-top:15px"><div class="field"><label for="roomName">Navn på rommet</label><input required id="roomName" minlength="3" maxlength="34" placeholder="f.eks. Hundevenner i Rogaland"></div><div class="field"><label for="roomDescription">Kort beskrivelse</label><textarea id="roomDescription" maxlength="280" placeholder="Dette prate me om her …"></textarea></div></form>`, `<button class="btn btn-quiet" data-action="close-modal">Avbryt</button><button type="submit" form="roomForm" class="btn btn-primary">Opprett rom ↗</button>`);}
  function browseRoomsModal(){return modalWrapper('Alle rom',`<div class="room-chooser">${state.rooms.map(r=>`<button class="room-option" data-action="room" data-room="${E(r.slug)}"><span class="trend-icon">${E(r.emoji)}</span><span class="room-desc"><b>${E(r.name)}</b><span>${E(short(r.description,90))} · ${r.post_count} innlegg</span></span></button>`).join('')}</div>`, `<button class="btn btn-secondary" data-action="new-room">+ Lag et rom</button>`);}
  function detailModal(){
    const p=state.detailPost;if(!p)return modalWrapper('Innlegg','<p>Henter innlegg …</p>');
    const image=fileSafeImage(p.image_url);
    const body=`<div class="detail-head"><div class="post-head"><span class="post-room">${E(p.room_emoji)} r/${E(p.room_slug)}</span><span>·</span>${E(p.author)} · ${E(timeAgo(p.created_at))}</div><h3>${E(p.title)}</h3>${p.body?`<p>${E(p.body)}</p>`:''}${image?`<img src="${E(image)}" alt="${E(p.title)}">`:''}${p.link_url?`<p><a href="${E(p.link_url)}" target="_blank" rel="noopener noreferrer">${E(p.link_url)}</a></p>`:''}</div>
      <hr class="detail-divider"><h4 class="section-heading">${state.comments.length} svar i drøsen</h4><div class="comment-tree">${renderCommentTree()}</div>
      ${state.replyTo?`<div class="reply-context">Svar på kommentar #${state.replyTo}<button data-action="reply-cancel">Avbryt ×</button></div>`:''}
      <form class="comment-entry" id="commentForm"><textarea id="commentText" maxlength="1200" placeholder="Skriv et svar …" required></textarea><button type="submit" class="btn btn-primary">Svar ↗</button></form>`;
    return modalWrapper('Drøsen',body,`<button class="btn btn-quiet" data-action="close-modal">Lukk</button><button class="btn btn-secondary" data-action="share" data-id="${p.id}">${icon('share')} Del innlegg</button>`,true);
  }
  function renderCommentTree(){
    const nodes=new Map(state.comments.map(c=>[c.id,{...c,children:[]}]));
    const roots=[];
    for(const node of nodes.values()) {if(node.parent_id&&nodes.has(node.parent_id))nodes.get(node.parent_id).children.push(node);else roots.push(node);}
    const walk = c => `<div class="comment-unit"><div class="comment-meta"><strong>${E(c.author)}</strong> · ${E(timeAgo(c.created_at))}</div><div class="comment-body">${E(c.body)}</div>${c.depth<3?`<button class="reply-button" data-action="reply" data-id="${c.id}">${icon('reply',13)} Svar</button>`:''}${c.children.length?`<div class="comment-replies">${c.children.map(walk).join('')}</div>`:''}</div>`;
    return roots.length?roots.map(walk).join(''):'<div class="notice">Ingen svar ennå. Du kan bli den første!</div>';
  }
  function reportModal(){return modalWrapper('Rapporter innlegg',`<p class="muted-note">Rapporter innhold som ikke passer her. Rapporten er synlig i den lokale moderatorkøen.</p><form id="reportForm" class="form-stack"><div class="field"><label for="reportReason">Hva er problemet?</label><select id="reportReason"><option>Personopplysninger</option><option>Trakassering</option><option>Ulovlig innhold</option><option>Spam / svindel</option><option>Annet</option></select></div><div class="notice">Når tre forskjellige demokontoer rapporterer samme innlegg, skjules det automatisk fram til manuell vurdering.</div></form>`, `<button class="btn btn-quiet" data-action="close-modal">Avbryt</button><button type="submit" form="reportForm" class="btn btn-primary">Send rapport</button>`);}
  function adminModal(){
    if(!state.adminPin || state.adminQueue===null)return modalWrapper('Moderatorkø · lokal demo',`<p class="muted-note">Skriv PIN-koden som vises i serverterminalen når du starter run.cmd. Kun test – dette er ikke ekte administratortilgang.</p><form id="adminLoginForm" class="form-stack"><div class="field"><label for="adminPin">Demo-moderatorkode</label><input id="adminPin" type="password" required autocomplete="off" placeholder="PIN fra terminalen"></div><button class="btn btn-primary" type="submit">Åpne køen →</button></form>`);
    return modalWrapper('Moderatorkø',`<div class="notice">Se rapporterte eller skjulte innlegg. Trykk «Godkjenn» for å publisere igjen, «Skjul» for å skjule, eller «Avvis rapport» for å la synlig innhold stå.</div><div style="margin-top:15px">${state.adminQueue.length?state.adminQueue.map(p=>`<div class="admin-row"><h4>#${p.id} · ${E(p.title)}</h4><p>r/${E(p.room_name)} · av ${E(p.author)} · status: <strong>${E(p.status)}</strong> · ${p.report_count} aktive rapporter</p><p>${p.reasons.map(r=>`${E(r.reason)} (${r.n})`).join(' · ')||'Ingen aktive rapporter'}</p><div class="admin-actions"><button class="btn btn-secondary" data-action="moderate" data-id="${p.id}" data-moderate="publish">✓ Godkjenn</button><button class="btn btn-danger" data-action="moderate" data-id="${p.id}" data-moderate="hide">Skjul</button><button class="btn btn-quiet" data-action="moderate" data-id="${p.id}" data-moderate="dismiss">Avvis rapport</button></div></div>`).join(''):'<div class="empty-queue">✳ Ingen saker i køen akkurat nå.</div>'}</div>`, `<button class="btn btn-quiet" data-action="admin-lock">Lås</button><button class="btn btn-secondary" data-action="admin-refresh">↻ Oppdater</button>`,true);
  }
  async function openDetail(id){
    state.detailPost=state.posts.find(p=>p.id===id)||null;state.comments=[];state.replyTo=null;state.modal='detail';renderModal();
    try {
      const [post,comments]=await Promise.all([api(`/api/posts/${id}`),api(`/api/posts/${id}/comments`)]);
      if(state.modal!=='detail')return;
      state.detailPost=post.post;state.comments=comments.comments;renderModal();
      history.replaceState({},'',`/?post=${id}`);
    } catch(e){closeModal();toast(e.message);}
  }
  async function openAdmin(){
    if(!state.adminPin){state.adminQueue=null;openModal('admin');return;}
    try {state.adminQueue=(await api('/api/admin/queue',{admin:true})).posts;openModal('admin');}
    catch(e){state.adminQueue=null;state.adminPin='';sessionStorage.removeItem('hereme_admin_pin');openModal('admin');toast(e.message);}
  }
  function changeRoom(slug){state.selected=slug;closeModal();loadPosts();window.scrollTo({top:0,behavior:'smooth'});}
  function requireUser(action){return chooseAuth(action);}
  async function vote(id,value){
    if(!requireUser(()=>vote(id,value)))return;
    try{
      const result=await api(`/api/posts/${id}/vote`,{method:'POST',body:{value}});
      const post=state.posts.find(p=>p.id===id);
      if(post){post.score=result.score;post.my_vote=result.my_vote;render();}
      if(state.detailPost?.id===id){state.detailPost.score=result.score;state.detailPost.my_vote=result.my_vote;}
    }catch(e){toast(e.message);}
  }
  async function share(id){
    const url=new URL('/',location.origin);url.searchParams.set('post',id);
    if(navigator.share){try{await navigator.share({title:'HerEme · lokal drøs',url:url.href});return;}catch{return;}}
    if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(url.href);toast('Lenken er kopiert!');return;}catch{}}
    window.prompt('Kopier denne lenken:',url.href);
  }
  function drawPoster(){
    const canvas=$('#posterCanvas');if(!canvas)return;
    const ctx=canvas.getContext('2d');const W=canvas.width,H=canvas.height;
    ctx.clearRect(0,0,W,H);
    if(state.editorImage){
      const img=state.editorImage,scale=Math.max(W/img.width,H/img.height);const w=img.width*scale,h=img.height*scale;
      ctx.drawImage(img,(W-w)/2,(H-h)/2,w,h);
    }else{
      const g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,'#e4b28e');g.addColorStop(.48,'#88afa4');g.addColorStop(1,'#23575b');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#204c45';ctx.beginPath();ctx.ellipse(260,1030,640,290,0,0,Math.PI*2);ctx.fill();
    }
    const pos=state.editorPosition;
    const y=pos==='top'?135:pos==='center'?H/2: H-160;
    const title=($('#postTitle')?.value||'DIN OVERSKRIFT').trim().toLocaleUpperCase('no');
    const maxWidth=W-100;
    function wrap(fontSize){
      ctx.font=`900 ${fontSize}px system-ui, -apple-system, sans-serif`;
      const words=title.split(/\s+/);const lines=[];let line='';
      for(const word of words){const test=line?line+' '+word:word;
        if(ctx.measureText(test).width<=maxWidth||!line){line=test;}
        else{lines.push(line);line=word;}
      }if(line)lines.push(line);
      return lines;
    }
    let fontSize=92,lines=wrap(fontSize);
    while(fontSize>34&&(lines.length>5||lines.some(line=>ctx.measureText(line).width>maxWidth))){fontSize-=4;lines=wrap(fontSize);}
    ctx.save();
    if(state.editorStyle==='contrast'){
      const g=ctx.createLinearGradient(0,pos==='top'?0:H*.28,0,pos==='top'?H*.72:H);
      g.addColorStop(0,pos==='top'?'rgba(0,22,23,.74)':'rgba(0,22,23,0)');g.addColorStop(1,pos==='top'?'rgba(0,22,23,0)':'rgba(0,22,23,.8)');
      ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    }
    const lineHeight=fontSize*1.05, textHeight=lines.length*lineHeight;
    const firstY=pos==='top'?120:pos==='center'?Math.max(80,(H-textHeight)/2+fontSize):H-95-(lines.length-1)*lineHeight;
    if(state.editorStyle==='band'){
      ctx.fillStyle='rgba(15,59,56,.91)';ctx.fillRect(0,Math.max(0,firstY-fontSize-33),W,Math.min(H, textHeight+70));
    }
    ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillStyle='#fff';ctx.font=`900 ${fontSize}px system-ui, -apple-system, sans-serif`;
    if(state.editorStyle==='soft'){ctx.shadowColor='rgba(0,0,0,.85)';ctx.shadowBlur=24;ctx.shadowOffsetY=4;}
    lines.forEach((line,i)=>ctx.fillText(line,W/2,firstY+i*lineHeight,maxWidth));
    ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    ctx.fillStyle='rgba(255,255,255,.86)';ctx.font='800 20px system-ui, sans-serif';ctx.textAlign='right';ctx.fillText('HEREME.',W-42,H-30);
    ctx.restore();
  }
  async function imageToBlob(img, overlay=false){
    const canvas=document.createElement('canvas');
    if(overlay){const current=$('#posterCanvas');if(!current)throw new Error('Plakaten mangler.');canvas.width=current.width;canvas.height=current.height;canvas.getContext('2d').drawImage(current,0,0);}
    else{
      const ratio=Math.min(1,1600/Math.max(img.width,img.height));
      canvas.width=Math.max(1,Math.round(img.width*ratio));canvas.height=Math.max(1,Math.round(img.height*ratio));
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    }
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Kunne ikke lagre bildet.')),'image/jpeg',.84));
  }
  async function loadPhoto(file){
    if(!file)return;
    if(!file.type.startsWith('image/')){toast('Velg et bildefil.');return;}
    if(file.size>25*1024*1024){toast('Velg et bilde under 25 MB.');return;}
    const objectUrl=URL.createObjectURL(file);
    const img=new Image();
    try {await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Nettleseren klarte ikke åpne bildet.'));img.src=objectUrl;});}
    catch(e){URL.revokeObjectURL(objectUrl);toast(e.message);return;}
    if(state.tempUrl)URL.revokeObjectURL(state.tempUrl);
    state.tempUrl=objectUrl;state.editorFile=file;state.editorImage=img;
    const uploadLabel=$('.poster-upload');if(uploadLabel){uploadLabel.firstChild?.remove();uploadLabel.insertAdjacentText('afterbegin',`✓ ${short(file.name,45)}`);}
    if(state.postType==='image'){$('#imagePreview').src=objectUrl;$('#imagePreview').hidden=false;}
    else drawPoster();
  }
  async function submitCompose(){
    if(!requireUser(()=>openModal('compose',{type:state.postType})))return;
    const title=$('#postTitle').value.trim(),room_id=$('#postRoom').value,body=$('#postBody')?.value.trim()||'',link_url=$('#postLink')?.value.trim()||'';
    if(title.length<3||title.length>160){toast('Skriv en overskrift med 3–160 tegn.');return;}
    if(['poster','image'].includes(state.postType)&&!state.editorImage){toast('Velg et bilde først.');return;}
    const button=$('#publishButton');button.disabled=true;button.textContent='Publiserer …';
    try{
      const form=new FormData();
      form.set('title',title);form.set('room_id',room_id);form.set('body',body);form.set('type',state.postType);
      if(state.postType==='link')form.set('link_url',link_url);
      if(['image','poster'].includes(state.postType)){
        const blob=await imageToBlob(state.editorImage,state.postType==='poster');
        form.set('image',blob,'hereme-bilde.jpg');
      }
      const result=await api('/api/posts',{method:'POST',form});
      const slug=state.rooms.find(r=>String(r.id)===String(room_id))?.slug || 'all';
      state.selected=slug;state.sort='new';closeModal();await loadRooms();await loadPosts();toast('Innlegget er publisert lokalt! ✳');
      document.querySelector(`[data-post-id="${result.id}"]`)?.scrollIntoView({block:'center',behavior:'smooth'});
    }catch(e){toast(e.message);button.disabled=false;button.textContent='Publiser innlegg ↗';}
  }
  async function submitComment(){
    if(!requireUser(()=>openDetail(state.detailPost.id)))return;
    const body=$('#commentText')?.value.trim();if(!body){toast('Skriv en kommentar.');return;}
    try{
      const id=state.detailPost.id;
      await api(`/api/posts/${id}/comments`,{method:'POST',body:{body,parent_id:state.replyTo}});
      state.comments=(await api(`/api/posts/${id}/comments`)).comments;
      const p=state.posts.find(p=>p.id===id);if(p)p.comment_count=state.comments.length;
      state.replyTo=null;render();renderModal();toast('Svaret ditt er lagt til!');
    }catch(e){toast(e.message);}
  }
  async function handleClick(e){
    const target=e.target.closest('[data-action]');if(!target)return;
    const a=target.dataset.action,id=Number(target.dataset.id),type=target.dataset.type;
    if(a==='dismiss-modal'){if(e.target===target)closeModal();return;}
    if(a==='close-modal'){closeModal();return;}
    if(a==='home'){changeRoom('all');return;}
    if(a==='room'){changeRoom(target.dataset.room);return;}
    if(a==='sort'){state.sort=target.dataset.sort;await loadPosts();return;}
    if(a==='sort-hot'){state.sort='hot';state.selected='all';closeModal();await loadPosts();window.scrollTo({top:0,behavior:'smooth'});return;}
    if(a==='mobile-search'){$('#headerSearch').classList.toggle('search-visible');$('#searchInput').focus();return;}
    if(a==='compose'){if(!requireUser(()=>openModal('compose',{type:type||'text'})))return;openModal('compose',{type:type||'text'});return;}
    if(a==='compose-type'){
      const title=$('#postTitle')?.value||'',room=$('#postRoom')?.value;
      state.postType=type;state.editorFile=null;state.editorImage=null;
      if(state.tempUrl){URL.revokeObjectURL(state.tempUrl);state.tempUrl=null;}
      renderModal();$('#postTitle').value=title;if(room)$('#postRoom').value=room;if(type==='poster')drawPoster();return;
    }
    if(a==='new-room'){if(!requireUser(()=>openModal('room')))return;openModal('room');return;}
    if(a==='browse-rooms'){openModal('rooms');return;}
    if(a==='profile'){openModal('profile');return;}
    if(a==='switch-account'){
      localStorage.removeItem('hereme_token');state.token='';state.user=null;closeModal();await loadPosts();openModal('profile');return;
    }
    if(a==='vote'){await vote(id,Number(target.dataset.value));return;}
    if(a==='detail'){await openDetail(id);return;}
    if(a==='share'){await share(id);return;}
    if(a==='reply'){state.replyTo=id;renderModal();$('#commentText')?.focus();return;}
    if(a==='reply-cancel'){state.replyTo=null;renderModal();return;}
    if(a==='report'){if(!requireUser(()=>{state.reportId=id;openModal('report');}))return;state.reportId=id;openModal('report');return;}
    if(a==='style'){state.editorStyle=target.dataset.style;document.querySelectorAll('[data-action="style"]').forEach(el=>el.classList.toggle('active',el===target));drawPoster();return;}
    if(a==='position'){state.editorPosition=target.dataset.position;document.querySelectorAll('[data-action="position"]').forEach(el=>el.classList.toggle('active',el===target));drawPoster();return;}
    if(a==='copy-connect'){
      if(!state.meta)return;
      try{await navigator.clipboard.writeText(state.meta.connect_url);toast('Mobiladressen er kopiert!');}
      catch {window.prompt('Kopier adressen:',state.meta.connect_url);}
      return;
    }
    if(a==='admin'){await openAdmin();return;}
    if(a==='admin-lock'){state.adminPin='';state.adminQueue=null;sessionStorage.removeItem('hereme_admin_pin');renderModal();return;}
    if(a==='admin-refresh'){await openAdmin();return;}
    if(a==='moderate'){
      try{await api(`/api/admin/posts/${id}`,{method:'POST',admin:true,body:{action:target.dataset.moderate}});
        toast('Moderatortiltak lagret.');await openAdmin();await loadRooms();await loadPosts();}
      catch(ex){toast(ex.message);}return;
    }
  }
  async function handleSubmit(e){
    if(!e.target?.id)return;
    const id=e.target.id;
    if(!['profileForm','composeForm','roomForm','commentForm','reportForm','adminLoginForm'].includes(id))return;
    e.preventDefault();
    try{
      if(id==='profileForm'){
        const data=await api('/api/session',{method:'POST',body:{name:$('#nicknameInput').value.trim()}});
        state.token=data.token;localStorage.setItem('hereme_token',data.token);state.user=data.user;
        const pending=state.pending;state.pending=null;closeModal();await loadPosts();toast(`Velkommen, ${state.user.name}! ✳`);if(pending)pending();
      }
      if(id==='composeForm')await submitCompose();
      if(id==='roomForm'){
        const name=$('#roomName').value.trim(),description=$('#roomDescription').value.trim();
        const {room}=await api('/api/rooms',{method:'POST',body:{name,description}});
        await loadRooms();changeRoom(room.slug);toast(`Rommet «${room.name}» er opprettet!`);
      }
      if(id==='commentForm')await submitComment();
      if(id==='reportForm'){
        const result=await api(`/api/posts/${state.reportId}/report`,{method:'POST',body:{reason:$('#reportReason').value}});
        closeModal();toast(result.automatically_held?'Innlegget er satt på vent for vurdering.':'Takk! Rapporten er registrert.');
        await loadRooms();await loadPosts();
      }
      if(id==='adminLoginForm'){
        state.adminPin=$('#adminPin').value.trim();sessionStorage.setItem('hereme_admin_pin',state.adminPin);
        await openAdmin();
      }
    }catch(ex){toast(ex.message);}
  }
  async function init(){
    document.addEventListener('click',e=>{handleClick(e).catch(err=>toast(err.message));});
    document.addEventListener('submit',e=>{handleSubmit(e).catch(err=>toast(err.message));});
    document.addEventListener('input',e=>{
      if(e.target.id==='postTitle'&&state.postType==='poster')drawPoster();
      if(e.target.id==='searchInput'){
        clearTimeout(state.searchTimer);state.searchTimer=setTimeout(()=>{state.query=e.target.value.trim();loadPosts();},220);
      }
    });
    document.addEventListener('change',e=>{if(e.target.id==='postFileInput')loadPhoto(e.target.files?.[0]);});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.modal)closeModal();});
    try{
      const [meta]=await Promise.all([api('/api/meta'),loadRooms()]);state.meta=meta;
      $('#connectUrl').textContent=meta.connect_url;
      if(state.token){
        try{state.user=(await api('/api/me')).user;}
        catch{state.token='';localStorage.removeItem('hereme_token');}
      }
      await loadPosts();
      const postId=Number(new URLSearchParams(location.search).get('post'));
      if(postId)openDetail(postId);
    }catch(e){toast(e.message);$('#feed').innerHTML=`<div class="empty-state"><b>Kunne ikke koble til serveren</b><p>${E(e.message)}</p></div>`;}
  }
  init();
})();
