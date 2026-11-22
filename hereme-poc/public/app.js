'use strict';
(() => {
  const $=selector=>document.querySelector(selector);
  const E=HeremePoster.escape;
  const t=(key,params)=>window.HeremeI18n.t(`wall.${key}`,params);
  const csrfCookie=()=>document.cookie.split(';').map(value=>value.trim()).find(value=>value.startsWith('hereme_csrf='))?.slice(12)?decodeURIComponent(document.cookie.split(';').map(value=>value.trim()).find(value=>value.startsWith('hereme_csrf=')).slice(12)):'';
  let motionRoute=location.pathname;
  const state={
    legacyToken:localStorage.getItem('hereme_token')||'',csrf:'',user:null,posts:[],meta:null,nextCursor:null,
    categories:[...HeremeThemes.ids],sort:'new',query:'',filtersOpen:false,activity:null,textPosition:'auto',modal:null,detailPost:null,comments:[],replyTo:null,
    category:'story',postMode:'poster',composeStep:'edit',draft:{title:'',body:'',link:''},articleDraft:{title:'',abstract:'',cover:null,chapters:[{heading:'',markdown:'',alt:'',media_id:null}]},articleDraftRecord:null,articleDrafts:[],articleDraftCreateId:null,articlePublishKey:null,articlePublishPrepared:false,articleDirty:false,historyData:null,historyComparison:null,historyVersion:null,articleUploading:false,editorImage:null,editorFile:null,
    editorZoom:1,editorX:50,editorY:50,editorSynthetic:false,tempUrl:null,editorVideo:false,videoDuration:0,videoThumbnail:'',videoProgress:0,videoUploading:false,videoPaused:false,videoCancelled:false,videoUpload:null,
    pending:null,recoveryKey:'',areas:[],areaGeometry:null,selectedAreas:[],draftAreas:[],postArea:'',
    loadRequest:0,detailRequest:0,imageRequest:0,voting:new Map(),commentVoting:new Set(),staff:null,staffTab:'posts',staffReason:'',profile:null,profileSort:'new',profileCursor:null,routeReady:false,notificationData:null,notificationSocket:null,notificationReconnect:0,notificationRefresh:null
  };
  async function api(url,{method='GET',body,form}={}) {
    const headers={};
    if(state.legacyToken)headers.authorization='Bearer '+state.legacyToken;
    if(!['GET','HEAD'].includes(method)&&state.csrf)headers['x-csrf-token']=state.csrf;
    if(body!==undefined)headers['content-type']='application/json';
    let response;
    try{response=await fetch(url,{method,headers,body:form||(body===undefined?undefined:JSON.stringify(body))});}
    catch{throw new Error(t('error.offline'));}
    const data=await response.json();
    if(!response.ok){const error=new Error(data.error?.message||data.error||t('error.http',{status:response.status}));error.status=response.status;error.code=data.error?.code;throw error;}
    return data;
  }
  function toast(message) {
    $('#toastRoot').innerHTML=`<div class="toast">${E(message)}</div>`;
    clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>$('#toastRoot').innerHTML='',4000);
  }
  function updateAppViewport(){
    const viewport=window.visualViewport,mobile=window.matchMedia('(max-width:760px)').matches;
    if(mobile&&viewport&&viewport.scale<=1.01){document.documentElement.style.setProperty('--app-viewport-height',`${Math.round(viewport.height)}px`);document.documentElement.style.setProperty('--app-viewport-offset',`${Math.round(viewport.offsetTop)}px`);}
    else{document.documentElement.style.removeProperty('--app-viewport-height');document.documentElement.style.removeProperty('--app-viewport-offset');}
  }
  function renderFilters() {
    $('#categoryFilters').innerHTML=HeremeFeed.filters(state.categories);
    $('#simpleCategories').innerHTML=HeremeFeed.categoryButtons(state.categories);
    $('#filterCount').textContent=state.categories.length===5?'':state.categories.length;
  }
  function renderPreferences() {
    const {layout,theme}=document.documentElement.dataset;
    for(const button of document.querySelectorAll('[data-action=layout]'))button.setAttribute('aria-pressed',button.dataset.layout===layout);
    $('#themeToggle').textContent=theme==='dark'?t('preferences.light'):t('preferences.dark');
    $('#themeToggle').setAttribute('aria-label',$('#themeToggle').textContent);
    $('#themeToggle').setAttribute('aria-pressed',theme==='light');
    document.querySelector('meta[name=theme-color]').content=theme==='light'?'#fafaf6':'#0f1012';
    HeremePoster.fitTitles(document);
  }
  function localizeChrome(){
    const text=(selector,key)=>{const node=$(selector);if(node)node.textContent=t(key);};
    const attr=(selector,name,key)=>{const node=$(selector);if(node)node.setAttribute(name,t(key));};
    text('.skip-link','chrome.skip');text('.sort-control span','chrome.sort');text('#sortSelect option[value=new]','chrome.newest');text('#sortSelect option[value=hot]','chrome.hot');text('#sortSelect option[value=top]','chrome.top');
    text('.utility-line span:first-child','chrome.utility_topic');text('.utility-line span:last-child','chrome.utility_demo');attr('.display-preferences','aria-label','chrome.display_options');attr('.view-switch','aria-label','chrome.desktop_view');attr('#leftPanel','aria-label','chrome.nav_categories');attr('.desktop-navigation','aria-label','chrome.explore');attr('.category-filters','aria-label','chrome.categories');attr('#simpleCategories','aria-label','chrome.categories');attr('#rightPanel','aria-label','chrome.activity');
    document.title=t('chrome.page_title');attr('meta[name=description]','content','chrome.description');text('.header-search .sr-only','chrome.search_label');attr('#searchInput','placeholder','chrome.search_placeholder');attr('.logo','aria-label','chrome.logo_label');attr('#notificationButton','aria-label','account.notifications');attr('#filterToggle','aria-label','chrome.show_filters');text('#areaButton','chrome.areas');text('.create-label','chrome.new_poster');attr('.create-button','aria-label','feed.create');attr('.profile-chip','aria-label','account.your_profile');attr('.menu-button','aria-label','chrome.open_menu');
    text('.view-switch [data-layout=simple]','chrome.simple');text('.view-switch [data-layout=advanced]','chrome.advanced');text('.desktop-navigation .eyebrow','chrome.neighbourhood');
    const nav=document.querySelectorAll('.desktop-navigation .nav-link');if(nav[0])nav[0].lastChild.textContent=' '+t('chrome.whole_wall');if(nav[1])nav[1].lastChild.textContent=' '+t('feed.create');
    text('.category-filters legend','chrome.categories');text('.reset-filters','chrome.all_categories');text('.sidebar-note .eyebrow','chrome.room_for_all');text('.sidebar-note > p:not([class])','chrome.tagline');text('.sidebar-note .muted-note','chrome.demo_notice');text('.sidebar-note button','chrome.about');text('.wall-toolbar h1','chrome.wall');if($('.wall-toolbar > span')?.lastChild)$('.wall-toolbar > span').lastChild.textContent=' '+t('chrome.posts_count_label');attr('#feed','aria-label','chrome.wall_posts');if($('#feed .loading-card'))text('#feed .loading-card','chrome.loading_wall');
  }
  function renderWall() {
    $('#forumShell').hidden=false;$('#profileRoot').hidden=true;
    $('#profileLabel').textContent=state.user?.name||t('profile.join');
    $('#profileMonogram').textContent=state.user?.name[0].toUpperCase()||'○';
    $('#feedCounter').textContent=state.loadError?'':state.posts.length;
    $('#feed').innerHTML=state.loadError?
      `<div class="empty-state"><h2>${E(t('feed.load_error_title'))}</h2><p>${E(state.loadError)}</p><button class="btn btn-secondary" data-action="retry-feed">${E(t('common.retry'))}</button></div>`:
      state.posts.length?state.posts.map(HeremeFeed.card).join('')+(state.nextCursor?`<button class="load-more btn btn-secondary" data-action="load-more">${E(t('feed.load_more'))}</button>`:''):
      `<div class="empty-state"><h2>${E(t(state.categories.length?'feed.empty':'feed.no_categories'))}</h2><p>${E(t(state.categories.length?'feed.empty_help':'feed.no_categories_help'))}</p><button class="btn btn-secondary" data-action="${state.categories.length?'compose':'home'}">${E(t(state.categories.length?'feed.create':'feed.show_all_categories'))}</button></div>`;
    HeremePoster.enhance($('#feed'));
    $('#activityPanel').innerHTML=HeremeShell.activity(state.activity,state.loadError);
  }
  function rememberWall(){history.replaceState({...history.state,wall:{categories:state.categories,sort:state.sort,query:state.query,scrollY:scrollY}},'',location.href);}
  function profileView(){
    const root=$('#profileRoot');$('#forumShell').hidden=true;root.hidden=false;
    if(!state.profile){root.innerHTML=`<p class="loading-card">${E(t('profile.loading'))}</p>`;return;}
    const {profile,metrics,posts,next_cursor}=state.profile,stat=(key,value)=>`<div class="profile-stat"><b>${value}</b><span>${E(t(`profile.${key}`))}</span></div>`;
    root.innerHTML=`<section class="profile-header"><div><p class="eyebrow">${E(t('profile.heading'))}</p><h1>@${E(profile.name)}</h1><p class="muted-note">${E(t('profile.member_since',{date:String(profile.created_at).slice(0,10)}))}</p><div class="profile-stats">${stat('posts',metrics.post_count)}${stat('upvotes',metrics.upvotes_received)}${stat('comments',metrics.comments_received)}${stat('direct_chats',metrics.direct_chat_count)}${stat('group_chats',metrics.group_chat_count)}</div></div><div class="profile-actions"><button class="btn btn-secondary" data-action="menu">${E(t('profile.account_settings'))}</button><button class="btn btn-secondary" data-action="profile-wall">${E(t('route.to_wall'))}</button></div></section><section class="profile-posts"><header><div><p class="eyebrow">${E(t('profile.my_posts'))}</p><b>${E(posts.length?t('profile.shown',{count:posts.length}):t('profile.no_posts'))}</b></div><label>${E(t('profile.sort'))} <select id="profileSort"><option value="new"${state.profileSort==='new'?' selected':''}>${E(t('profile.newest'))}</option><option value="top"${state.profileSort==='top'?' selected':''}>${E(t('profile.top_score'))}</option></select></label></header>${posts.length?`<ol class="profile-post-list">${posts.map(post=>`<li><button class="profile-post-row" data-action="profile-post" data-id="${post.id}"><span class="profile-date">${E(String(post.created_at).slice(0,10))}</span><span class="profile-category">${E(post.category||t('profile.unknown'))}</span><strong>${E(post.title)}</strong><span>${E(post.status)} · ${post.score>=0?'+':''}${post.score}</span><span>${E(t('profile.reply_count',{count:post.comment_count}))}</span></button></li>`).join('')}</ol>${next_cursor?`<button class="btn btn-secondary" data-action="profile-more">${E(t('profile.show_more'))}</button>`:''}`:`<p class="profile-empty">${E(t('profile.empty'))}</p>`}</section>`;
    root.insertAdjacentHTML('beforeend',`<section class="profile-posts"><header><h2>${t('e21.draft_articles')}</h2></header>${state.articleDrafts.length?`<ol class="profile-post-list">${state.articleDrafts.map(d=>`<li><button class="profile-post-row" data-action="draft-open" data-draft-id="${E(d.id)}"><strong>${E(d.content.title||t('e21.untitled'))}</strong><span>${E(d.content.category)}</span><time>${E(d.updated_at)}</time></button><button class="btn btn-secondary" data-action="draft-delete" data-draft-id="${E(d.id)}">${t('e21.delete_draft')}</button></li>`).join('')}</ol>`:`<p class="profile-empty">${t('e21.no_drafts')}</p>`}</section>`);
    const avatar=document.createElement('div');avatar.className='profile-avatar';avatar.innerHTML=HeremeAvatar.html({id:state.user.id,name:profile.name,avatar_url:profile.avatar_url});root.querySelector('.profile-header').prepend(avatar);
    const edit=document.createElement('button');edit.className='btn btn-secondary';edit.dataset.action='profile-avatar-edit';edit.textContent=t('profile.avatar_edit');root.querySelector('.profile-actions').prepend(edit);
    [...root.querySelectorAll('.profile-post-row')].forEach((row,index)=>{const post=posts[index],cell=row.querySelectorAll('span')[2];if(post&&cell)cell.textContent=`${statusLabel(post.status)} · ${post.score>=0?'+':''}${post.score}`;if(post?.content_format==='article'&&post.status==='published'){const button=document.createElement('button');button.type='button';button.className='btn btn-secondary profile-post-edit';button.dataset.action='article-edit';button.dataset.id=post.id;button.textContent=t('e21.edit_article');row.parentElement.append(button);}});
  }
  async function loadProfile({append=false}={}){const params=new URLSearchParams({sort:state.profileSort,limit:'20'});if(append&&state.profileCursor)params.set('cursor',state.profileCursor);const [result,drafts]=await Promise.all([api('/api/me/summary?'+params),api('/api/me/article-drafts')]);if(append&&state.profile)result.posts=[...state.profile.posts,...result.posts];state.profile=result;state.articleDrafts=drafts.drafts;state.profileCursor=result.next_cursor;profileView();}
  function publicProfileView(profile){
    $('#forumShell').hidden=true;const root=$('#profileRoot');root.hidden=false;
    const score=value=>`${value>0?'+':''}${value}`;
    root.innerHTML=`<section class="public-profile"><button class="btn btn-secondary" data-action="public-profile-back">${HeremeIcons.icon('back')} ${E(t('profile.back'))}</button><p class="eyebrow">${E(t('profile.public_heading'))}</p><div class="public-profile-identity">${HeremeAvatar.html({id:profile.public_id,name:profile.username,avatar_url:profile.avatar_url})}<div><h1>@${E(profile.username)}</h1><p>${E(t('profile.member_since',{date:String(profile.joined_at).slice(0,10)}))}</p></div></div><div class="public-reputation"><div><span>${E(t('profile.post_reputation'))}</span><strong>${score(profile.reputation.posts)}</strong></div><div><span>${E(t('profile.comment_reputation'))}</span><strong>${score(profile.reputation.comments)}</strong></div><div class="total"><span>${E(t('profile.total_reputation'))}</span><strong>${score(profile.reputation.total)}</strong></div></div></section>`;
    document.title=`${profile.username} · HerEme`;
  }
  const avatarEditor=HeremeAvatarEditor.setup({api,t,onSaved:result=>{Object.assign(state.profile.profile,result);Object.assign(state.user,result);profileView();toast(t('profile.avatar_saved'));}});
  async function applyRoute({fromPop=false}={}){
    const route=location.pathname,params=new URLSearchParams(location.search);
    window.HeremePwa?.updateInstallUi();
    const publicMatch=/^\/u\/([A-Za-z0-9_-]{1,100})$/.exec(route);
    if(publicMatch){if(state.modal)closeModal({fromRoute:true});try{publicProfileView(await api(`/api/users/${publicMatch[1]}/public`));}catch(error){if(error.status!==404)throw error;$('#forumShell').hidden=true;$('#profileRoot').hidden=false;$('#profileRoot').innerHTML=`<section class="empty-state"><h1>${E(t('profile.not_found'))}</h1><button class="btn btn-secondary" data-action="public-profile-back">${E(t('profile.back'))}</button></section>`;}return;}
    if(route==='/me'){
      if(!state.user){openAuth(t('account.login_for_profile'),async()=>{await refreshIdentity();navigate('/me',{replace:true});});return;}
      await loadProfile();return;
    }
    if(route!=='/'){document.title=t('route.not_found_title');$('#forumShell').hidden=true;$('#profileRoot').hidden=false;$('#profileRoot').innerHTML=`<section class="empty-state"><h1>${E(t('route.not_found'))}</h1><button class="btn btn-primary" data-action="profile-wall">${E(t('route.to_wall'))}</button></section>`;return;}
    if(history.state?.wall){const wall=history.state.wall;state.categories=wall.categories||state.categories;state.sort=wall.sort||state.sort;state.query=wall.query||'';$('#searchInput').value=state.query;$('#sortSelect').value=state.sort;renderFilters();}
    renderWall();const id=Number(params.get('post'));if(id&&params.has('history'))await openHistory(id,{route:false,from:params.get('from'),to:params.get('to'),view:params.get('version')});else if(id)await openDetail(id,{route:false});else if(fromPop&&history.state?.wall?.scrollY!=null)requestAnimationFrame(()=>scrollTo(0,history.state.wall.scrollY));
  }
  async function navigate(url,{replace=false}={}){const previous=location.pathname;rememberWall();history[replace?'replaceState':'pushState']({wall:{categories:state.categories,sort:state.sort,query:state.query,scrollY:scrollY}},'',url);await applyRoute();motionRoute=location.pathname;if(previous!==motionRoute)window.HeremeMotion?.enter(motionRoute==='/'?$('#forumShell'):$('#profileRoot'),'motion-screen-enter');}
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
  addEventListener('hereme:passkey-invite',()=>toast(t('account.passkey_invite')));
  function wrapper(title,body,footer='',kind='') {
    return `<div class="modal-overlay" data-action="dismiss-modal"><section class="modal-panel ${kind}" role="dialog" aria-modal="true" aria-label="${E(title)}">
      <header class="modal-header"><h2>${E(title)}</h2><button type="button" class="action-icon-button modal-close" data-action="close-modal" aria-label="${E(t('common.close'))}" title="${E(t('common.close'))}">${HeremeIcons.icon('close')}</button></header>
      <div class="modal-content">${body}</div>${footer?`<footer class="modal-footer">${footer}</footer>`:''}</section></div>`;
  }
  function resetPhoto() {
    state.imageRequest++;state.photoLoading=false;
    if(state.tempUrl)URL.revokeObjectURL(state.tempUrl);
    state.tempUrl=null;state.editorFile=null;state.editorImage=null;state.editorSynthetic=false;state.editorVideo=false;state.videoDuration=0;state.videoThumbnail='';state.videoProgress=0;state.videoUploading=false;state.videoPaused=false;state.videoCancelled=false;state.videoUpload=null;
    state.editorZoom=1;state.editorX=50;state.editorY=50;
  }
  function openModal(type,{resume=false}={}) {
    if(!state.modal)state.returnFocus=document.activeElement;
    state.modal=type;lockBackground(true);
    if(type==='compose'&&!resume){resetPhoto();state.articleDraftRecord=null;state.articleDraftCreateId=null;state.articlePublishKey=null;state.articlePublishPrepared=false;state.articleDirty=false;state.postMode='poster';state.composeStep='edit';state.category='story';state.textPosition='auto';state.postArea=state.selectedAreas[0]||'';const saved=JSON.parse(localStorage.getItem('hereme_design_draft:'+state.user.id)||'null');state.draft={title:'',body:saved?.body||'',link:''};state.articleDraft=saved?.article||{title:'',abstract:'',cover:null,chapters:[{heading:'',markdown:'',alt:'',media_id:null}]};}
    renderModal();
    if(type==='compose')hydrateArticleMedia().catch(error=>toast(error.message));
  }
  async function hydrateArticleMedia(){
    const article=state.articleDraft,entries=[...article.chapters.filter(chapter=>chapter.media_id&&!chapter.media?.url).map(chapter=>({chapter,id:chapter.media_id}))];
    if(article.cover?.media_id&&!article.cover.url)entries.push({cover:true,id:article.cover.media_id});
    for(const entry of entries){const media=await api('/api/article-assets/'+encodeURIComponent(entry.id));if(state.modal!=='compose'||state.articleDraft!==article)return;if(entry.cover&&article.cover?.media_id===entry.id)article.cover={...article.cover,...media};if(entry.chapter?.media_id===entry.id)entry.chapter.media={...media,name:entry.chapter.media_name||''};}
    if(entries.length&&state.modal==='compose'){saveDraft();updateArticlePreview();}
  }
  function removeModalVisual(){
    const root=$('#modalRoot'),overlay=root.querySelector('.modal-overlay');
    if(!overlay||!window.HeremeMotion||window.HeremeMotion.reduced()){root.replaceChildren();return;}
    const duration=Number.parseFloat(getComputedStyle(root).getPropertyValue('--motion-modal-exit'));
    if(!Number.isFinite(duration)){root.replaceChildren();return;}
    overlay.removeAttribute('data-action');overlay.setAttribute('aria-hidden','true');
    overlay.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex]').forEach(element=>element.tabIndex=-1);
    overlay.addEventListener('click',event=>event.stopPropagation(),{capture:true});
    overlay.classList.add('motion-backdrop-exit');
    setTimeout(()=>{if(root.contains(overlay))overlay.remove();},duration);
  }
  function closeModal({fromRoute=false}={}) {
    if(state.publishing)return;
    if(state.modal==='compose'&&state.articleUploading){toast(t('design.uploading'));return;}
    if(state.modal==='compose'&&state.postMode==='article'&&state.articleDirty&&!confirm(t('e21.unsaved_confirm')))return;
    const closingHistory=state.modal==='history';resetPhoto();state.detailRequest++;state.modal=null;state.replyTo=null;state.pending=null;
    lockBackground(false);
    const returnTarget=state.returnFocus?.isConnected?state.returnFocus:
      document.querySelector(`[data-post-id="${state.detailPost?.id}"] .tile-open`)||$('.logo');
    returnTarget.focus({preventScroll:true});
    removeModalVisual();
    if(closingHistory){history.replaceState(history.state,'','/');renderWall();return;}
    if(location.search.includes('post=')&&!fromRoute){history.back();return;}
  }
  function profileModal() {
    if(state.user)return wrapper(t('account.your_profile'),`<h3>${E(t('account.greeting',{name:state.user.name}))}</h3><p>${E(t('account.pseudonym_help'))}</p><button class="btn btn-secondary" data-action="rotate-recovery">${E(t('account.new_recovery'))}</button><button class="btn btn-secondary" data-action="logout">${E(t('account.logout'))}</button><p><a href="/privacy.html">${E(t('account.privacy'))}</a> · <a href="/rules.html">${E(t('account.rules'))}</a></p>`);
    return wrapper(t('account.join'),`<p>${E(t('account.join_help'))}</p><form id="profileForm" class="form-stack" autocomplete="on"><label class="field" for="nicknameInput"><span>${E(t('account.pseudonym'))}</span><input id="nicknameInput" name="username" minlength="2" maxlength="24" autocomplete="username" required></label><button class="btn btn-primary" type="submit">${E(t('account.create_pseudonym'))} ${HeremeIcons.icon('arrow-right')}</button></form><details><summary>${E(t('account.have_key'))}</summary>${loginForm()}</details>`);
  }
  function loginForm(){return `<form id="recoverForm" class="form-stack account-login" autocomplete="on"><label class="field" for="recoverName"><span>${E(t('account.pseudonym'))}</span><input id="recoverName" name="username" minlength="2" maxlength="24" autocomplete="username" required></label><label class="field" for="recoverKey"><span>${E(t('account.recovery_key'))}</span><input id="recoverKey" name="password" type="password" autocomplete="current-password" required></label><button class="btn btn-primary" type="submit">${E(t('account.login'))} ${HeremeIcons.icon('arrow-right')}</button></form>`;}
  function accountMenu(){
    const links=`<p class="account-links"><a href="/rules.html">${E(t('account.rules'))}</a> · <a href="/privacy.html">${E(t('account.privacy'))}</a></p>`;
    const connection=state.meta?.addresses?`<details class="connection-details"><summary>${t('connection.open_mobile')}</summary><img src="/api/connect-qr.svg" width="180" height="180" alt="${t('connection.qr_alt')}"><p>${E(state.meta?.connect_url)}</p><button class="text-button" data-action="copy-connect">${t('connection.copy')}</button></details>`:'';
    if(state.user){const staff=state.user.capabilities?.includes('staff:read')?`<button class="btn btn-primary" data-action="staff-panel">${E(t('account.staff'))}</button>`:'';return wrapper(t('account.your_profile'),`<section class="account-summary"><span class="account-avatar" aria-hidden="true">${E(state.user.name[0].toUpperCase())}</span><div><p class="eyebrow">${E(t('account.logged_in_as'))}</p><button class="text-button account-profile-link" data-action="my-profile">${E(state.user.name)} ${HeremeIcons.icon('arrow-right')} ${E(t('account.my_profile'))}</button><p class="muted-note">${E(state.user.roles.join(', '))}</p></div></section><div class="account-actions"><button class="btn btn-secondary" data-action="notifications">${E(t('account.notifications'))}</button>${staff}<button class="btn btn-secondary" data-action="rotate-recovery">${E(t('account.new_recovery'))}</button><button class="btn btn-danger" data-action="logout">${E(t('account.logout'))}</button></div>${connection}${links}`);}
    return wrapper(t('account.account'),`<p>${E(t('account.login_or_create'))}</p><button class="btn btn-primary" data-action="auth-login">${E(t('account.login'))}</button><button class="btn btn-secondary" data-action="auth-register">${E(t('account.create'))}</button>${connection}${links}`);
  }
  const staffReason=()=>{const value=($('#staffReason')?.value||state.staffReason).trim();if(value.length<3)throw new Error(t('staff.reason_required'));state.staffReason=value;return value;};
  const reportReasonLabel=value=>{const key={personal:'personal',Personopplysninger:'personal',harassment:'harassment',Trakassering:'harassment',illegal:'illegal','Ulovlig innhold':'illegal',spam:'spam','Spam / svindel':'spam',other:'other',Annet:'other'}[value];return key?t(`report.${key}`):value;};
  const statusLabel=value=>['published','review','hidden','rejected','active','deactivated','deleted'].includes(value)?t(`status.${value}`):value;
  const roleLabel=value=>['member','moderator','admin','operator'].includes(value)?t(`role.${value}`):value;
  const rolesLabel=values=>values.map(roleLabel).join(', ');
  function localizeStaffIdentifiers(){
    document.querySelectorAll('[data-staff-field=status] option').forEach(option=>{option.textContent=statusLabel(option.value);});
    if(state.staffTab==='posts')document.querySelectorAll('.staff-table tbody tr').forEach((row,index)=>{if(!row.querySelector('[data-staff-field=status]')&&state.staff.posts[index])row.cells[3].textContent=statusLabel(state.staff.posts[index].status);});
    if(state.staffTab!=='users')return;
    [...document.querySelectorAll('.staff-table tbody tr')].forEach((row,index)=>{const user=state.staff.users[index],cells=row.cells;if(!user||!cells)return;cells[0].querySelector('small').textContent=statusLabel(user.status);cells[1].textContent=rolesLabel(user.roles);});
  }
  function staffPanel(){
    if(!state.staff)return wrapper(t('staff.title'),`<p class="loading-card">${E(t('staff.loading'))}</p>`,'','staff-modal');
    const admin=state.user.capabilities.includes('content:manage'),tabs=admin?['posts','users','comments','reports']:['posts'];
    const labels={posts:t('staff.posts'),users:t('staff.users'),comments:t('staff.comments'),reports:t('staff.reports')};
    const nav=`<nav class="staff-tabs">${tabs.map(tab=>`<button class="btn btn-secondary" data-action="staff-tab" data-tab="${tab}" aria-pressed="${state.staffTab===tab}">${labels[tab]}</button>`).join('')}</nav>`;
    let rows='';
    if(state.staffTab==='posts')rows=`<table class="staff-table"><thead><tr><th>ID</th><th>${t('staff.content')}</th><th>${t('staff.author')}</th><th>${t('staff.status')}</th><th>${t('staff.score')}</th><th>${t('staff.action')}</th></tr></thead><tbody>${state.staff.posts.map(post=>`<tr><td>${post.id}</td><td>${admin?`<input data-staff-field="title" data-id="${post.id}" value="${E(post.title)}" maxlength="160"><textarea data-staff-field="body" data-id="${post.id}" maxlength="3000">${E(post.body)}</textarea><select data-staff-field="category" data-id="${post.id}">${HeremeThemes.ids.map(id=>`<option value="${id}"${id===post.category?' selected':''}>${E(HeremeThemes.get(id).label)}</option>`).join('')}</select>`:`<b>${E(post.title)}</b>`}</td><td>${E(post.author)}</td><td>${admin?`<select data-staff-field="status" data-id="${post.id}">${['published','review','hidden','rejected'].map(value=>`<option${value===post.status?' selected':''}>${value}</option>`).join('')}</select>`:E(post.status)}</td><td>${admin?`<input type="number" data-staff-field="score" data-id="${post.id}" value="${post.score}" min="-1000000" max="1000000">`:post.score}</td><td class="staff-actions">${admin?`<button class="btn btn-primary" data-action="staff-save-post" data-id="${post.id}">${t('staff.save')}</button><button class="btn btn-danger" data-action="staff-delete-post" data-id="${post.id}">${t('staff.delete')}</button>`:''}<button class="btn btn-secondary" data-action="staff-moderate" data-mode="${post.status==='hidden'?'publish':'hide'}" data-id="${post.id}">${t(post.status==='hidden'?'staff.restore':'staff.hide')}</button></td></tr>`).join('')}</tbody></table>`;
    if(state.staffTab==='users')rows=`<table class="staff-table"><thead><tr><th>${t('staff.pseudonym')}</th><th>${t('staff.roles')}</th><th>${t('staff.content')}</th><th>${t('staff.delete')}</th></tr></thead><tbody>${state.staff.users.map(user=>`<tr><td>${E(user.name)}<br><small>${E(user.status)}</small></td><td>${E(user.roles.join(', '))}</td><td>${t('staff.user_content',{posts:user.post_count,comments:user.comment_count,votes:user.vote_count})}</td><td><label><input type="checkbox" data-delete-posts="${E(user.id)}"> ${t('staff.delete_posts')}</label><button class="btn btn-danger" data-action="staff-delete-user" data-user-id="${E(user.id)}"${user.id===state.user.id?' disabled':''}>${t('staff.delete_user')}</button></td></tr>`).join('')}</tbody></table>`;
    if(state.staffTab==='comments')rows=`<table class="staff-table"><thead><tr><th>ID</th><th>${t('staff.post')}</th><th>${t('staff.author')}</th><th>${t('staff.comment')}</th><th>${t('staff.action')}</th></tr></thead><tbody>${state.staff.comments.map(comment=>`<tr><td>${comment.id}</td><td>${E(comment.post_title)}</td><td>${E(comment.author)}</td><td><textarea data-comment-body="${comment.id}" maxlength="1200">${E(comment.body)}</textarea></td><td class="staff-actions"><button class="btn btn-primary" data-action="staff-save-comment" data-id="${comment.id}">${t('staff.save')}</button><button class="btn btn-danger" data-action="staff-delete-comment" data-id="${comment.id}">${t('staff.delete_thread')}</button></td></tr>`).join('')}</tbody></table>`;
    if(state.staffTab==='reports')rows=`<table class="staff-table"><thead><tr><th>ID</th><th>${t('staff.post')}</th><th>${t('staff.reporter')}</th><th>${t('staff.reason')}</th><th>${t('staff.status')}</th></tr></thead><tbody>${state.staff.reports.map(report=>`<tr><td>${report.id}</td><td>${E(report.post_title)}</td><td>${E(report.reporter||t('staff.deleted'))}</td><td>${E(reportReasonLabel(report.reason))}</td><td>${t(report.resolved?'staff.resolved':'staff.open')}</td></tr>`).join('')}</tbody></table>`;
    const summary=admin?t('staff.summary',state.staff.stats):`${state.staff.stats.posts} ${t('staff.posts').toLowerCase()}`;
    return wrapper(t('staff.title'),`<p class="notice">${summary}. ${t('staff.audit_notice')}</p><label class="field"><span>${t('staff.next_reason')}</span><input id="staffReason" maxlength="300" value="${E(state.staffReason)}" placeholder="${t('staff.reason_placeholder')}"></label>${nav}<div class="staff-table-wrap">${rows}</div>`,'','staff-modal');
  }
  async function loadStaff(){state.staff=await api('/api/admin/overview');if(!state.user.capabilities.includes('content:manage'))state.staffTab='posts';}
  async function openStaffPanel(){state.staff=null;openModal('staff');await loadStaff();renderModal();}
  async function refreshStaff(message){await loadStaff();renderModal({preserve:true});await loadPosts();if(message)toast(message);}
  async function refreshIdentity(){const current=await api('/api/me');state.user=current.user;await window.HeremeI18n.applyAccountLanguage?.(current.user);state.csrf=current.csrf_token||csrfCookie();state.legacyToken='';localStorage.removeItem('hereme_token');}
  async function loadNotificationBadge(){const userId=state.user?.id;if(!userId)return;const result=await api('/api/notifications');if(state.user?.id!==userId)return;$('#notificationButton').hidden=false;$('#notificationBadge').textContent=String(result.unread);$('#notificationBadge').hidden=!result.unread;}
  async function refreshNotificationsLive(){await loadNotificationBadge();if(state.modal==='notifications'){await loadNotifications();renderModal({preserve:true});}}
  function scheduleNotificationRefresh(){clearTimeout(state.notificationRefresh);state.notificationRefresh=setTimeout(()=>refreshNotificationsLive().catch(()=>{}),100);}
  function connectNotificationSocket(){if(!state.user||state.notificationSocket)return;const url=new URL('/api/chat-socket',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';const socket=new WebSocket(url);state.notificationSocket=socket;
    socket.onopen=()=>{state.notificationReconnect=0;};socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.type==='notification.created')scheduleNotificationRefresh();};
    socket.onclose=()=>{if(state.notificationSocket!==socket)return;state.notificationSocket=null;if(!state.user)return;const delay=Math.min(30000,1000*2**Math.min(state.notificationReconnect++,5));setTimeout(connectNotificationSocket,delay);};socket.onerror=()=>socket.close();}
  async function loadNotifications(){const [config,devices,settings,inbox]=await Promise.all([api('/api/push/config'),api('/api/push/subscriptions'),api('/api/notification-settings'),api('/api/notifications')]);state.notificationData={config,devices:devices.subscriptions,settings:settings.settings,inbox:inbox.notifications,unread:inbox.unread};}
  function notificationPanel(){
    if(!state.notificationData)return wrapper(t('notifications.title'),`<p class="loading-card">${t('notifications.loading')}</p>`);
    const {config,devices,settings,inbox}=state.notificationData,deviceId=localStorage.getItem('hereme_push_subscription_id'),device=devices.find(item=>item.id===deviceId),supported='Notification' in window&&'PushManager' in window&&'serviceWorker' in navigator;
    let status=t('notifications.device_off'),action=`<button class="btn btn-primary" data-action="push-enable">${t('notifications.enable')}</button>`;
    if(!config.enabled){status=t('notifications.server_off');action='';}
    else if(!supported){status=t('notifications.unsupported');action='';}
    else if(window.HeremePwa?.ios()&&!window.HeremePwa.standalone()){status=t('notifications.ios_help');action=`<button class="btn btn-secondary" data-action="pwa-install-help">${t('notifications.install_help')}</button>`;}
    else if(Notification.permission==='denied'){status=t('notifications.blocked');action='';}
    else if(device){status=t('notifications.device_on');action=`<button class="btn btn-danger" data-action="push-disable">${t('notifications.disable')}</button>`;}
    else if(window.HeremePwa?.canInstall)action=`<button class="btn btn-secondary" data-action="pwa-install">${t('notifications.install')}</button>`+action;
    const labels={request:'request',invite:'invite',accepted:'accepted',declined:'declined',message:'message',post_reply:'post_reply',comment_reply:'comment_reply'};
    const choices=['chat_messages','chat_requests_and_invitations','forum_replies'].map(name=>`<label class="notification-choice"><input type="checkbox" data-notification-setting="${name}"${settings[name]?' checked':''}> ${t(`notifications.${name}`)}</label>`).join('');
    const rows=inbox.length?inbox.map(item=>`<button class="notification-row${item.read_at?'':' unread'}" data-action="notification-open" data-id="${E(item.notification_id)}" data-route="${E(item.route)}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter"><path d="M6 9a6 6 0 0 1 12 0v4l2 3H4l2-3V9Z"/><path d="M9.5 19h5"/></svg><span><b>${E(t(`notifications.${labels[item.kind]||'generic'}`))}</b><small>${E(String(item.created_at).replace('T',' ').slice(0,16))}</small></span></button>`).join(''):`<p class="profile-empty">${t('notifications.empty')}</p>`;
    return wrapper(t('notifications.title'),`<section class="notification-settings"><p>${E(status)}</p><div class="notification-actions">${action}</div><fieldset><legend>${t('notifications.which')}</legend><p class="muted-note">${t('notifications.filter_help')}</p>${choices}</fieldset></section><section class="notification-inbox"><h3>${t('notifications.inbox')}</h3>${rows}</section>`);
  }
  async function openNotifications(){state.notificationData=null;openModal('notifications');await loadNotifications();renderModal();}
  const pushKey=value=>{const padding='='.repeat((4-value.length%4)%4),raw=atob((value+padding).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,char=>char.charCodeAt(0));};
  async function enablePush(){const config=state.notificationData.config;if(!config.enabled)throw new Error(t('notifications.web_push_off'));const permission=await Notification.requestPermission();if(permission!=='granted'){await loadNotifications();renderModal();if(permission==='default')toast(t('notifications.permission_not_granted'));return;}const registration=await window.HeremePwa.ready;if(!registration)throw new Error(t('notifications.worker_failed'));let subscription=await registration.pushManager.getSubscription();if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:pushKey(config.public_key)});try{const result=await api('/api/push/subscriptions',{method:'POST',body:{subscription:subscription.toJSON(),device_label:navigator.userAgent.slice(0,80)}});localStorage.setItem('hereme_push_subscription_id',result.subscription.id);}catch(error){await subscription.unsubscribe();throw error;}await loadNotifications();renderModal();toast(t('notifications.device_on'));}
  async function disablePush(){const id=localStorage.getItem('hereme_push_subscription_id');if(id)await api('/api/push/subscriptions/'+encodeURIComponent(id),{method:'DELETE'});const registration=await window.HeremePwa.ready,subscription=await registration?.pushManager?.getSubscription();await subscription?.unsubscribe();localStorage.removeItem('hereme_push_subscription_id');await loadNotifications();renderModal();}
  function openAuth(message,onSuccess,mode='login'){window.HeremeAuth.open({mode,message,onSuccess:async(result,{created})=>{await refreshIdentity();if(location.pathname==='/')renderWall();await window.HeremePwa?.reconcilePush?.();await loadNotificationBadge();connectNotificationSocket();if(created&&result.recovery_key){state.recoveryKey=result.recovery_key;toast(t('recovery.store_safely'));}await onSuccess?.(result,{created});},onCancel:()=>{if(location.pathname==='/me')history.back();}});}
  function requireUser(action) {
    if(state.user)return true;
    openAuth('',async()=>action?.());return false;
  }
  function renderModal({preserve=false}={}) {
    const firstOpen=!$('#modalRoot').firstElementChild||!!$('#modalRoot .motion-backdrop-exit');
    const content=$('.modal-content'),scroll=preserve?content?.scrollTop||0:0;
    const focus=preserve?document.activeElement?.id:null;
    const comment=preserve?$('#commentText')?.value:undefined;
    let html='';
    if(state.modal==='profile')html=profileModal();
    if(state.modal==='recovery-key')html=wrapper(t('recovery.title'),`<p>${t('recovery.intro')}</p><form id="recoverySaveForm" class="form-stack recovery-save-form" action="/api/recovery/confirm" method="post" autocomplete="on"><input type="hidden" name="csrf_token" value="${E(state.csrf)}"><label class="field" for="recoveryUsername"><span>${t('account.pseudonym')}</span><input id="recoveryUsername" name="username" value="${E(state.user?.name||'')}" autocomplete="username" required></label><label class="field" for="recoveryPassword"><span>${t('account.recovery_key')}</span><span class="credential-row"><input id="recoveryPassword" class="recovery-key" name="password" type="password" value="${E(state.recoveryKey)}" autocomplete="new-password" required><button class="btn btn-secondary" type="button" data-action="toggle-recovery">${t('recovery.show')}</button></span></label><div class="recovery-actions"><button class="btn btn-secondary" type="button" data-action="copy-recovery">${t('recovery.copy')}</button><button class="btn btn-primary" type="submit">${t('recovery.save_device')} ${HeremeIcons.icon('arrow-right')}</button></div></form><p class="notice">${t('recovery.notice')}</p>`, `<button class="text-button" data-action="recovery-continue">${t('recovery.continue_without')}</button>`);
    if(state.modal==='areas')html=wrapper(t('areas.title'),HeremeLocations.body(state.areas,state.areaGeometry,state.draftAreas),`<button class="btn btn-primary" data-action="save-areas">${t('areas.save')}</button>`,'area-modal');
    if(state.modal==='compose'){
    const footer=`${state.postMode==='article'?`<button type="button" class="btn btn-secondary" data-action="article-save-draft">${t('e21.save_draft')}</button>${state.articleDraftRecord?`<button type="button" class="btn btn-secondary" data-action="article-delete-draft">${t('e21.delete_draft')}</button>`:''}`:''}<button type="submit" form="composeForm" class="btn btn-primary" id="publishButton">${HeremeIcons.icon('publish')} ${state.articleDraftRecord?.post_id?t('e21.publish_changes'):t(`design.publish_${state.postMode}`)}</button>`;
      html=wrapper(t('compose.add_to_wall'),HeremeCompose.body(state),footer,'compose-modal');
    }
    if(state.modal==='detail') {
      const p=state.detailPost;
      html=`<div class="modal-overlay" data-action="dismiss-modal"><section class="modal-panel detail-modal" role="dialog" aria-modal="true" aria-label="${t('detail.post')}">
        <header class="detail-toolbar"><button type="button" class="action-icon-button modal-close" data-action="close-modal" aria-label="${E(t('common.close'))}" title="${E(t('common.close'))}">${HeremeIcons.icon('close')}</button>${p?`<span class="detail-actions"><button type="button" class="action-icon-button" data-action="history" data-id="${p.id}" aria-label="${E(t('e21.history'))}" title="${E(t('e21.history'))}">${HeremeIcons.icon('history')}</button>${p.author_public_id===state.user?.id?`<button type="button" class="action-icon-button" data-action="${p.content_format==='article'?'article-edit':'poster-edit'}" data-id="${p.id}" aria-label="${E(t(p.content_format==='article'?'e21.edit_article':'e21.edit_text'))}" title="${E(t(p.content_format==='article'?'e21.edit_article':'e21.edit_text'))}">${HeremeIcons.icon('edit')}</button>`:''}<button type="button" class="action-icon-button action-report" data-action="report" data-id="${p.id}" aria-label="${E(t('detail.report'))}" title="${E(t('detail.report'))}">${HeremeIcons.icon('report')}</button><button type="button" class="action-icon-button action-share" data-action="share" data-id="${p.id}" aria-label="${E(t('detail.share'))}" title="${E(t('detail.share'))}">${HeremeIcons.icon('share')}</button></span>`:''}</header>
        <div class="modal-content">${p&&(p.content_format!=='article'||p.article)?HeremeDetail.body(p,state.comments,state.replyTo):`<p class="loading-card">${t('detail.loading')}</p>`}</div></section></div>`;
    }
    if(state.modal==='history'){
      const data=state.historyData,comparison=state.historyComparison;
      html=wrapper(t('e21.history'),`${data?`<ol class="revision-list">${data.revisions.map(row=>`<li>${row.visibility==='unavailable'?`v${row.version} · ${t('e21.unavailable')}`:`<strong>v${row.version}</strong> · ${E(row.editor||t('e21.deleted_user'))} · ${E(row.created_at)} ${row.change_summary?`· ${E(row.change_summary)}`:''} <button class="btn btn-secondary" data-action="history-view" data-version="${row.version}">${t('e21.view_version')}</button>${row.version>1&&data.revisions.some(other=>other.version===row.version-1&&other.visibility==='public')?` <button class="btn btn-secondary" data-action="history-compare" data-version="${row.version}">${t('e21.view_changes')}</button>`:''}`}</li>`).join('')}</ol>`:`<p>${t('detail.loading')}</p>`}${comparison?`<section class="revision-diff" aria-label="${t('e21.view_changes')}"><h3>v${comparison.from} → v${comparison.to}</h3>${comparison.lines.map(line=>`<div class="diff-${line.kind}"><span>${line.kind==='added'?'+':line.kind==='removed'?'-':' '}</span> ${E(line.text)}</div>`).join('')}</section>`:''}`);
    }
    if(state.modal==='poster-edit')html=wrapper(t('e21.edit_text'),`<form id="posterEditForm" class="form-stack"><label class="field"><span>${t('e21.poster_text')}</span><textarea id="posterEditText" maxlength="3000" required>${E(state.posterEdit?.text||'')}</textarea></label><label class="field"><span>${t('e21.change_summary')}</span><input id="posterEditSummary" maxlength="300"></label><button class="btn btn-primary" type="submit">${t('e21.save_edit')}</button></form>`);
    if(state.modal==='report')html=wrapper(t('report.title'),`<form id="reportForm" class="form-stack"><label class="field" for="reportReason"><span>${t('report.problem')}</span><select id="reportReason">${['personal','harassment','illegal','spam','other'].map(reason=>`<option value="${reason}">${t(`report.${reason}`)}</option>`).join('')}</select></label><p class="notice">${t('report.notice')}</p><button class="btn btn-primary" type="submit">${t('report.send')}</button></form>`);
    if(state.modal==='menu')html=accountMenu();
    if(state.modal==='staff')html=staffPanel();
    if(state.modal==='notifications')html=notificationPanel();
    $('#modalRoot').innerHTML=html;
    if(firstOpen)window.HeremeMotion?.enter($('#modalRoot .modal-overlay'),'motion-backdrop-enter');
    if(state.modal==='history'&&state.historyVersion)$('.modal-content')?.insertAdjacentHTML('beforeend',HeremeDetail.revision(state.historyVersion));
    if(state.modal==='history')$('.modal-content')?.insertAdjacentHTML('afterbegin',`<button class="btn btn-secondary" data-action="history-current">${t('e21.current_version')}</button>`);
    if(state.modal==='history'&&state.historyComparison?.from===state.historyComparison?.to)$('.revision-diff')?.insertAdjacentHTML('afterbegin',`<p class="notice">${t('e21.older_version')}</p>`);
    if(state.modal==='history'&&state.historyData?.total>state.historyData.revisions.length)$('.modal-content .revision-list')?.insertAdjacentHTML('afterend',`<button class="btn btn-secondary" data-action="history-more">${t('e21.more')}</button>`);
    if(state.modal==='history'&&state.historyData){const available=state.historyData.revisions.filter(row=>row.visibility==='public').map(row=>row.version).sort((a,b)=>a-b);if(available.length>1){const options=available.map(v=>`<option value="${v}">v${v}</option>`).join('');$('.modal-content')?.insertAdjacentHTML('afterbegin',`<div class="history-compare-controls"><label>${t('e21.from')} <select id="historyFrom">${options}</select></label><label>${t('e21.to')} <select id="historyTo">${options}</select></label><button class="btn btn-secondary" data-action="history-custom-compare">${t('e21.compare')}</button></div>`);$('#historyFrom').value=String(state.historyComparison?.from||available.at(-2));$('#historyTo').value=String(state.historyComparison?.to||available.at(-1));}}
    if(state.modal==='detail'&&state.detailPost?.version>1){const label=document.createElement('span');label.className='revision-edited';label.textContent=' · '+t('e21.edited');$('#modalRoot .detail-meta')?.append(label);}
    if(state.modal==='staff')localizeStaffIdentifiers();
    if(state.modal==='menu'&&state.user){const roles=$('.account-summary .muted-note');if(roles)roles.textContent=rolesLabel(state.user.roles);}
    if(state.modal==='menu')window.HeremePwa?.mountMenu($('.modal-content'));
    if(state.modal==='menu')window.HeremeLanguage?.mount($('.modal-content'),{menu:true});
    if(state.modal==='menu'&&state.user){const button=document.createElement('button');button.className='btn btn-secondary';button.textContent=t('account.security_passkeys');button.onclick=()=>window.HeremePasskeys.security();$('.account-actions')?.prepend(button);}
    if(preserve)$('.modal-panel')?.classList.add('modal-refresh');
    HeremePoster.enhance($('#modalRoot'));
    if(state.modal==='compose')updateArticlePreview();
    if(state.modal==='compose'&&state.photoLoading&&$('#publishButton'))$('#publishButton').disabled=true;
    if(comment!==undefined&&$('#commentText'))$('#commentText').value=comment;
    if(preserve&&$('.modal-content'))$('.modal-content').scrollTop=scroll;
    if(focus&&document.getElementById(focus))document.getElementById(focus).focus({preventScroll:true});
    else $('.modal-close')?.focus({preventScroll:true});
  }
  function saveDraft() {
    state.draft={title:$('#postTitle')?.value??state.draft.title,body:$('#postBody')?.value??state.draft.body,link:$('#postLink')?.value??state.draft.link};
    if(state.modal==='compose'&&state.user){const article=state.articleDraft;article.title=$('#articleTitle')?.value??article.title;article.abstract=$('#articleAbstract')?.value??article.abstract;for(const field of document.querySelectorAll('[data-chapter-field]'))article.chapters[Number(field.closest('[data-chapter]').dataset.chapter)][field.dataset.chapterField]=field.value;localStorage.setItem('hereme_design_draft:'+state.user.id,JSON.stringify({body:state.draft.body,article},(key,value)=>['preview_url','pending'].includes(key)?undefined:value));}
  }
  function updateArticlePreview(){
    const root=$('#articlePreview');if(!root)return;
    const article=state.articleDraft,theme=HeremeThemes.get(state.category),cover=article.cover;
    const allowed=new Set([cover,...article.chapters.map(chapter=>chapter.media)].filter(Boolean).flatMap(media=>[media.url,media.thumbnail_url].filter(Boolean)));
    const coverImage=cover?.kind==='image'?HeremeArticleView.safeMediaUrl(cover.preview_url||cover.url,{preview:true}):HeremeArticleView.safeMediaUrl(cover?.thumbnail_url,{preview:true});
    root.innerHTML=`<article class="detail-article article-preview-reader"><header class="article-hero theme-${E(state.category)}">${coverImage?`<img class="article-hero-image" src="${E(coverImage)}" alt="">`:''}<div><p>${E(theme.label)} · ${E(t('article.label'))}</p><h1>${E(article.title||t('design.article_title'))}</h1><p>${E(article.abstract)}</p></div></header><div class="article-reader">${cover?`<section class="article-preview-cover">${HeremeArticleView.mediaButton(cover,article.title,{preview:true})}${cover.pending?`<p role="status">${E(t('design.uploading'))}</p>`:''}</section>`:''}${article.chapters.map((chapter,index)=>`<section class="article-chapter"><h2>${index+1}. ${E(chapter.heading)}</h2><div class="article-markdown">${HeremeArticleMarkdown.render(chapter.markdown,allowed)}</div>${HeremeArticleView.mediaButton(chapter.media,chapter.alt||chapter.heading,{preview:true})}${chapter.media?.pending?`<p role="status">${E(t('design.uploading'))}</p>`:''}</section>`).join('')}</div><dialog class="article-media-viewer" aria-label="${E(t('article.media_viewer'))}"><button type="button" class="action-icon-button" data-action="article-media-close" aria-label="${E(t('common.close'))}" title="${E(t('common.close'))}">${HeremeIcons.icon('close')}</button><div></div></dialog></article>`;
  }
  function updatePreview() {
    saveDraft();
    if($('#posterPreview')){$('#posterPreview').innerHTML=HeremePoster.surface(HeremeCompose.preview(state),{previewUrl:state.videoThumbnail||state.tempUrl||''})+(state.postMode==='video'?'<span class="video-preview-badge">'+HeremeIcons.icon('video')+' Video</span>':'');HeremePoster.enhance($('#posterPreview'));}
    if($('#categoryHint'))$('#categoryHint').textContent=HeremeThemes.get(state.category).description;
  }
  async function openHistory(id,{route=true,from=null,to=null,view=null}={}){
    state.historyData=await api(`/api/posts/${id}/revisions`);state.historyPostId=id;state.historyComparison=null;state.historyVersion=null;
    if(view)state.historyVersion=await api(`/api/posts/${id}/revisions/${view}`);
    else if(from&&to)state.historyComparison=await api(`/api/posts/${id}/revisions/${from}/diff?to=${to}`);
    state.modal='history';lockBackground(true);renderModal();
    if(route)history.pushState({...history.state,history:true},'',`/?post=${id}&history=1`);
  }
  async function openDetail(id,{route=true}={}) {
    const request=++state.detailRequest;
    if(!state.modal)state.returnFocus=document.activeElement;
    state.detailPost=state.posts.find(p=>p.id===id)||null;state.comments=[];state.replyTo=null;
    state.modal='detail';lockBackground(true);renderModal();
    try {
      const [post,comments]=await Promise.all([api('/api/posts/'+id),api(`/api/posts/${id}/comments`)]);
      if(state.modal!=='detail'||request!==state.detailRequest)return;
      state.detailPost=post.post;state.comments=comments.comments;renderModal({preserve:true});
      if(route){rememberWall();history.pushState({...history.state,detail:true},'',`/?post=${id}`);}
    } catch(error) {if(request!==state.detailRequest)return;closeModal({fromRoute:true});if(new URLSearchParams(location.search).has('post'))history.replaceState(history.state,'','/');renderWall();toast('Dette innholdet er ikke lenger tilgjengelig.');}
  }
  async function vote(id,value) {
    if(!requireUser(()=>vote(id,value)))return;
    const post=state.posts.find(item=>item.id===id)||state.detailPost;
    if(!post)return;
    let operation=state.voting.get(id);
    if(!operation){operation={queue:[],confirmed:{score:post.score,my_vote:post.my_vote},running:null};state.voting.set(id,operation);}
    operation.queue.push(value);
    const nextVote=post.my_vote===value?0:value;
    post.score+=nextVote-post.my_vote;post.my_vote=nextVote;
    if(state.detailPost?.id===id&&state.detailPost!==post)Object.assign(state.detailPost,{score:post.score,my_vote:post.my_vote});
    HeremeFeed.updateVotes(document,id,post);
    if(operation.running)return operation.running;
    operation.running=(async()=>{
      try {
        while(operation.queue.length) {
          const requested=operation.queue[0];
          const result=await api(`/api/posts/${id}/vote`,{method:'POST',body:{value:requested}});
          operation.queue.shift();operation.confirmed=result;
          let projected={...result};
          for(const queued of operation.queue){const my_vote=projected.my_vote===queued?0:queued;projected={score:projected.score+my_vote-projected.my_vote,my_vote};}
          const wallPost=state.posts.find(item=>item.id===id);if(wallPost)Object.assign(wallPost,projected);
          if(state.detailPost?.id===id)Object.assign(state.detailPost,projected);
          HeremeFeed.updateVotes(document,id,projected);
        }
      } catch(error) {
        operation.queue.length=0;
        const wallPost=state.posts.find(item=>item.id===id);if(wallPost)Object.assign(wallPost,operation.confirmed);
        if(state.detailPost?.id===id)Object.assign(state.detailPost,operation.confirmed);
        HeremeFeed.updateVotes(document,id,operation.confirmed);
        throw error;
      } finally {state.voting.delete(id);}
    })();
    return operation.running;
  }
  function paintCommentVote(comment){
    const row=document.querySelector(`[data-comment-id="${comment.id}"]`);if(!row)return;
    for(const button of row.querySelectorAll('[data-action="comment-vote"]'))button.setAttribute('aria-pressed',String(Number(button.dataset.value)===comment.my_vote));
    const score=row.querySelector('.comment-score');score.textContent=(comment.score>0?'+':'')+comment.score;score.classList.toggle('negative',comment.score<0);score.setAttribute('aria-label',t('comment.net_score',{score:comment.score}));
  }
  async function voteComment(id,value){
    if(!requireUser(()=>voteComment(id,value)))return;
    if(state.commentVoting.has(id))return;
    const comment=state.comments.find(item=>item.id===id);if(!comment)return;
    const previous={score:comment.score,my_vote:comment.my_vote},next=comment.my_vote===value?0:value;
    comment.score+=next-comment.my_vote;comment.my_vote=next;paintCommentVote(comment);state.commentVoting.add(id);
    try{Object.assign(comment,await api(`/api/comments/${id}/vote`,{method:'POST',body:{value}}));paintCommentVote(comment);}
    catch(error){Object.assign(comment,previous);paintCommentVote(comment);throw error;}
    finally{state.commentVoting.delete(id);}
  }
  function closeAuthorMenu({focus=false}={}){const menu=$('.author-popover');if(!menu)return;const trigger=menu._trigger;menu.remove();if(trigger?.isConnected){trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus({preventScroll:true});}}
  function openAuthorMenu(trigger){
    closeAuthorMenu();const menu=document.createElement('div');menu.className='author-popover';menu.setAttribute('role','menu');menu._trigger=trigger;
    const userId=trigger.dataset.userId;menu.innerHTML=`<button type="button" role="menuitem" data-action="show-public-profile" data-user-id="${E(userId)}">${E(t('profile.show_public'))}</button>${userId!==state.user?.id?`<button type="button" role="menuitem" data-action="start-author-chat" data-user-id="${E(userId)}">${E(t('profile.start_chat'))}</button>`:''}`;
    const bounds=trigger.getBoundingClientRect();menu.style.left=`${Math.max(8,Math.min(bounds.left,innerWidth-190))}px`;menu.style.top=`${Math.min(bounds.bottom+5,innerHeight-104)}px`;
    ($('.detail-modal')||document.body).append(menu);window.HeremeMotion?.enter(menu,'motion-panel-enter');trigger.setAttribute('aria-expanded','true');menu.querySelector('button').focus({preventScroll:true});
  }
  async function share(id) {
    const url=new URL('https://hereme.no/');url.searchParams.set('post',id);
    if(navigator.share) {
      try {await navigator.share({title:t('share.title'),url:url.href});return;}
      catch(error){if(error.name==='AbortError')return;}
    }
    if(navigator.clipboard?.writeText) {
      try {await navigator.clipboard.writeText(url.href);toast('Lenken er kopiert!');return;}
      catch { /* Plain HTTP LAN browsers may deny clipboard; offer a copyable URL. */ }
    }
    window.prompt(t('share.copy_link'),url.href);
  }
  async function loadPhoto(file,synthetic=false) {
    if(!file)return;
    if(!file.type.startsWith('image/'))throw new Error(t('validation.image_file'));
    if(file.size>25*1024*1024)throw new Error(t('validation.image_size'));
    saveDraft();resetPhoto();state.postMode='poster';state.composeStep='edit';const request=state.imageRequest;
    state.photoLoading=true;if($('#publishButton'))$('#publishButton').disabled=true;
    if($('#photoFilename'))$('#photoFilename').textContent=t('validation.opening_image');
    const url=URL.createObjectURL(file),image=new Image();
    try {
      image.src=url;await image.decode();
      if(request!==state.imageRequest||state.modal!=='compose'){URL.revokeObjectURL(url);return;}
      state.tempUrl=url;state.editorFile=file;state.editorImage=image;state.editorSynthetic=synthetic;
      state.photoLoading=false;renderModal({preserve:true});
    } catch(error) {
      URL.revokeObjectURL(url);
      if(request===state.imageRequest){state.photoLoading=false;renderModal({preserve:true});throw new Error(t('validation.image_open_failed'));}
    }
  }
  async function loadVideo(file) {
    if(!file)return;if(!file.type.startsWith('video/'))throw new Error(t('validation.video_file'));
    saveDraft();resetPhoto();state.postMode='poster';state.composeStep='edit';const url=URL.createObjectURL(file),video=document.createElement('video');video.preload='metadata';video.muted=true;video.src=url;
    await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(new Error(t('validation.video_open_failed')));});
    if(!Number.isFinite(video.duration)||video.duration<=0||video.duration>180){URL.revokeObjectURL(url);throw new Error(t('validation.video_duration'));}
    video.currentTime=Math.min(.2,video.duration/2);await new Promise(resolve=>{video.onseeked=resolve;setTimeout(resolve,500);});
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=Math.max(1,Math.round(640*(video.videoHeight||360)/(video.videoWidth||640)));canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
    state.tempUrl=url;state.editorFile=file;state.editorVideo=true;state.videoDuration=video.duration;state.videoThumbnail=canvas.toDataURL('image/jpeg',.8);renderModal({preserve:true});
  }
  async function uploadVideo(file,input) {
    let started=state.videoUpload,offset=0;
    if(started){const existing=await api(started.upload_url);if(existing.status!=='uploading')return started;offset=existing.uploaded_bytes;if(existing.bytes!==file.size)throw new Error(t('validation.upload_wrong_file'));}
    else started=await api('/api/video-uploads',{method:'POST',body:{...input,bytes:file.size,mime_type:String(file.type||'').split(';')[0].trim().toLowerCase()}});
    state.videoUpload=started;state.videoUploading=true;state.videoCancelled=false;state.videoPaused=false;state.videoProgress=1;renderModal({preserve:true});
    const chunkSize=4*1024*1024;
    try{
      for(;offset<file.size;){
        while(state.videoPaused&&!state.videoCancelled)await new Promise(resolve=>state.videoResume=resolve);
        if(state.videoCancelled)throw new Error(t('validation.video_cancelled'));
        const end=Math.min(offset+chunkSize,file.size),blob=file.slice(offset,end);let result,lastError;
        for(let attempt=1;attempt<=3&&!result;attempt++)try{result=await sendVideoChunk(started.upload_url,blob,offset,end,file.size);}catch(error){lastError=error;if(state.videoCancelled)throw error;if(attempt<3)await new Promise(resolve=>setTimeout(resolve,attempt*500));}
        if(!result)throw lastError;offset=end;state.videoProgress=Math.round(offset/file.size*100);const progress=$('.media-workspace progress');if(progress)progress.value=state.videoProgress;const label=$('.upload-progress span');if(label)label.textContent=state.videoProgress+'%';
      }
      state.videoUpload=null;return started;
    } finally {state.videoUploading=false;state.videoXhr=null;}
  }
  async function uploadArticleAsset(file){
    if(!file)throw new Error(t('design.optional_media'));
    state.articleUploading=true;$('#publishButton').disabled=true;
    try{
      if(file.type.startsWith('image/')){const form=new FormData();form.set('image',file);return {...await api('/api/article-assets/images',{method:'POST',form}),name:file.name};}
      if(!file.type.startsWith('video/'))throw new Error(t('validation.video_upload_failed'));
      const started=await api('/api/article-assets/videos',{method:'POST',body:{bytes:file.size,mime_type:file.type}});
      for(let offset=0;offset<file.size;){const end=Math.min(offset+4*1024*1024,file.size);await sendVideoChunk(started.upload_url,file.slice(offset,end),offset,end,file.size);offset=end;}
      for(let attempt=0;attempt<90;attempt++){const result=await api(started.upload_url);if(result.status==='ready')return {media_id:started.media_id,kind:'video',name:file.name,url:result.media_url,thumbnail_url:result.thumbnail_url};if(['failed','rejected'].includes(result.status))throw new Error(t('validation.video_duration'));await new Promise(resolve=>setTimeout(resolve,2000));}
      throw new Error(t('design.processing'));
    }finally{state.articleUploading=false;if($('#publishButton'))$('#publishButton').disabled=false;}
  }
  function sendVideoChunk(url,blob,start,end,total){return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();state.videoXhr=xhr;xhr.open('PATCH',url);xhr.setRequestHeader('x-csrf-token',state.csrf);xhr.setRequestHeader('Content-Range',`bytes ${start}-${end-1}/${total}`);xhr.onload=()=>{let result={};try{result=JSON.parse(xhr.responseText||'{}');}catch{}if(xhr.status>=200&&xhr.status<300)resolve(result);else reject(new Error(result.error?.message||t('validation.video_upload_failed')));};xhr.onerror=()=>reject(new Error(t('validation.video_upload_retry')));xhr.onabort=()=>reject(new Error(t('validation.video_cancelled')));xhr.send(blob);});}
  async function imageToBlob(image) {
    const ratio=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));
    canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Kunne ikke lagre bildet.')),'image/jpeg',.86));
  }
  function articleContent(){saveDraft();const article=state.articleDraft;return {title:article.title,abstract:article.abstract,category:state.category,cover_media_id:article.cover?.media_id||null,chapters:article.chapters.map(({heading,markdown,alt,media_id})=>({heading,markdown,alt,media_id:media_id||null}))};}
  function invalidateArticlePublish(){if(state.postMode==='article'){state.articlePublishPrepared=false;state.articlePublishKey=null;state.articleDirty=true;}}
  async function openArticleDraft(record){
    state.articleDraftRecord=record;state.articleDraftCreateId=record.id;state.articlePublishKey=null;state.articlePublishPrepared=false;state.articleDirty=false;state.postMode='article';state.category=record.content.category;
    const content=record.content;
    state.articleDraft={title:content.title,abstract:content.abstract,chapters:content.chapters.length?content.chapters.map(chapter=>({...chapter,collapsed:false})):[{heading:'',markdown:'',alt:'',media_id:null,collapsed:false}],cover:null};
    const ids=[content.cover_media_id,...state.articleDraft.chapters.map(c=>c.media_id)].filter(Boolean);
    const assets=new Map(await Promise.all(ids.map(async id=>[id,await api('/api/article-assets/'+encodeURIComponent(id))])));
    if(content.cover_media_id)state.articleDraft.cover=assets.get(content.cover_media_id);
    for(const chapter of state.articleDraft.chapters)if(chapter.media_id)chapter.media=assets.get(chapter.media_id);
    openModal('compose',{resume:true});
  }
  async function saveArticleDraft(){
    if(state.articleUploading)throw new Error(t('design.uploading'));
    const content=articleContent();
    if(!state.articleDraftRecord)state.articleDraftCreateId ||= crypto.randomUUID();
    state.articleDraftRecord=state.articleDraftRecord?await api(`/api/articles/drafts/${state.articleDraftRecord.id}`,{method:'PATCH',body:{...content,edit_counter:state.articleDraftRecord.edit_counter}}):await api('/api/articles/drafts',{method:'POST',body:{...content,draft_id:state.articleDraftCreateId}});state.articlePublishKey=null;state.articlePublishPrepared=false;state.articleDirty=false;
    toast(t('e21.saved'));
  }
  async function submitCompose() {
    if(state.publishing||state.photoLoading)return;
    saveDraft();
    if(state.articleUploading)throw new Error(t('design.uploading'));
    if(state.postMode==='poster'&&state.draft.body.trim().length<3)throw new Error(t('validation.body_required'));
    if(state.postMode==='article'&&(!state.articleDraft.title.trim()||!state.articleDraft.abstract.trim()||state.articleDraft.chapters.some(chapter=>!chapter.heading.trim()||!chapter.markdown.trim())))throw new Error(t('design.missing_content'));
    const button=$('#publishButton');button.disabled=true;button.textContent=t('design.publishing');
    $('#composeForm').inert=true;
    state.publishing=true;
    try {
      if(state.postMode==='article'){
        const content=articleContent();let result;
        if(!state.articlePublishPrepared){
          if(!state.articleDraftRecord)state.articleDraftCreateId ||= crypto.randomUUID();
          state.articleDraftRecord=state.articleDraftRecord?await api(`/api/articles/drafts/${state.articleDraftRecord.id}`,{method:'PATCH',body:{...content,edit_counter:state.articleDraftRecord.edit_counter}}):await api('/api/articles/drafts',{method:'POST',body:{...content,draft_id:state.articleDraftCreateId}});
          state.articlePublishKey=crypto.randomUUID();state.articlePublishPrepared=true;
        }
        result=await api(`/api/articles/drafts/${state.articleDraftRecord.id}/publish`,{method:'POST',body:{request_key:state.articlePublishKey,change_summary:$('#changeSummary')?.value||''}});
        localStorage.removeItem('hereme_design_draft:'+state.user.id);state.articleDraftRecord=null;state.articlePublishKey=null;state.articlePublishPrepared=false;state.articleDirty=false;state.publishing=false;closeModal();await loadPosts();document.querySelector(`[data-post-id="${result.post_id}"]`)?.scrollIntoView({block:'center'});toast(t('compose.published'));return;
      }
      const body=state.draft.body.trim();
      if(state.editorVideo){await uploadVideo(state.editorFile,{format:'poster',body,category:state.category,poster_style:state.category,text_position:state.textPosition,area_id:state.postArea||undefined});localStorage.removeItem('hereme_design_draft:'+state.user.id);state.publishing=false;closeModal();toast(t('compose.video_processing'));return;}
      const form=new FormData();
      form.set('format','poster');form.set('body',body);form.set('category',state.category);
      form.set('poster_style',state.category);form.set('text_position',state.textPosition);
      form.set('type',state.editorImage?'image':'text');
      if(state.postArea)form.set('area_id',state.postArea);
      if(state.editorImage) {
        form.set('image',await imageToBlob(state.editorImage),'hereme-bilde.jpg');
        for(const [key,value]of Object.entries({image_zoom:state.editorZoom,image_x:state.editorX,image_y:state.editorY}))form.set(key,value);
        if(state.editorSynthetic)form.set('synthetic_demo','true');
      }
      const result=await api('/api/posts',{method:'POST',form});
      state.publishing=false;
      localStorage.removeItem('hereme_design_draft:'+state.user.id);
      if(!state.categories.includes(state.category))state.categories.push(state.category);
      state.query='';$('#searchInput').value='';state.sort='new';$('#sortSelect').value='new';
      closeModal();renderFilters();await loadPosts();
      document.querySelector(`[data-post-id="${result.id}"]`)?.scrollIntoView({block:'center',behavior:'smooth'});
      toast(t('compose.published'));
    } catch(error) {state.publishing=false;$('#composeForm').inert=false;button.disabled=false;button.innerHTML=HeremeIcons.icon('publish')+' '+t(`design.publish_${state.postMode}`);throw error;}
  }
  async function submitComment() {
    const id=state.detailPost.id;
    if(!requireUser(()=>openDetail(id)))return;
    const body=$('#commentText').value.trim();
    if(!body)throw new Error(t('validation.reply_required'));
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
    if($('.author-popover')&&!event.target.closest('.author-popover,.author-trigger'))closeAuthorMenu();
    const target=event.target.closest('[data-action]');if(!target||(state.publishing&&!['pause-upload','resume-upload','cancel-upload'].includes(target.dataset.action)))return;
    const action=target.dataset.action,id=Number(target.dataset.id);
    if(action==='author-menu'){openAuthorMenu(target);return;}
    if(action==='show-public-profile'){const userId=target.dataset.userId;closeAuthorMenu();await navigate(`/u/${encodeURIComponent(userId)}`);return;}
    if(action==='start-author-chat'){
      const params=new URLSearchParams({user:target.dataset.userId});
      if(/^\/\?post=\d+$/.test(location.pathname+location.search)||/^\/u\/[A-Za-z0-9_-]{1,100}$/.test(location.pathname))params.set('returnTo',location.pathname+location.search);
      location.assign(`/chat?${params}`);return;
    }
    if(action==='public-profile-back'){if(history.state?.wall)history.back();else await navigate('/');return;}
    if(action==='comment-vote'){await voteComment(id,Number(target.dataset.value));return;}
    if(action==='dismiss-modal'){if(event.target===target)closeModal();return;}
    if(action==='close-modal'){closeModal();return;}
    if(action==='layout'){document.documentElement.dataset.layout=target.dataset.layout;localStorage.setItem('hereme_layout',target.dataset.layout);renderPreferences();return;}
    if(action==='theme'){const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;localStorage.setItem('hereme_theme',theme);renderPreferences();return;}
    if(action==='category'){const category=target.dataset.category;state.categories=state.categories.includes(category)?state.categories.filter(value=>value!==category):[...state.categories,category];renderFilters();$('#simpleCategories [data-category="'+category+'"]').focus({preventScroll:true});await loadPosts();return;}
    if(action==='home'||action==='profile-wall'){state.query='';$('#searchInput').value='';state.categories=[...HeremeThemes.ids];renderFilters();if(location.pathname!=='/')await navigate('/');await loadPosts();window.scrollTo({top:0,behavior:'smooth'});return;}
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
    if(action==='staff-delete-comment'){if(!confirm(t('staff.delete_thread_confirm')))return;await api(`/api/admin/comments/${id}`,{method:'DELETE',body:{reason:staffReason()}});await refreshStaff(t('staff.thread_deleted'));return;}
    if(action==='staff-delete-user'){
      const userId=target.dataset.userId,deletePosts=document.querySelector(`[data-delete-posts="${CSS.escape(userId)}"]`).checked;
      if(!confirm(`Slette brukeren permanent${deletePosts?' og alle brukerens innlegg':' mens innleggene anonymiseres'}?`))return;
      await api(`/api/admin/users/${encodeURIComponent(userId)}`,{method:'DELETE',body:{delete_posts:deletePosts,reason:staffReason()}});await refreshStaff('Brukeren er slettet permanent.');return;
    }
    if(action==='menu'){openModal('menu');return;}
    if(action==='notifications'){if(requireUser(openNotifications))await openNotifications();return;}
    if(action==='push-enable'){await enablePush();return;}
    if(action==='push-disable'){await disablePush();return;}
    if(action==='pwa-install'){await window.HeremePwa.install();await loadNotifications();renderModal();return;}
    if(action==='pwa-install-help'){toast(t('notifications.safari_install_help'));return;}
    if(action==='notification-open'){await api('/api/notifications/'+encodeURIComponent(target.dataset.id)+'/read',{method:'POST'});location.assign(target.dataset.route);return;}
    if(action==='areas'){state.draftAreas=[...state.selectedAreas];openModal('areas');return;}
    if(action==='area-toggle'){const area=target.dataset.areaId;state.draftAreas=state.draftAreas.includes(area)?state.draftAreas.filter(id=>id!==area):[...state.draftAreas,area];for(const item of document.querySelectorAll(`[data-area-id="${CSS.escape(area)}"]`))item.setAttribute('aria-pressed',state.draftAreas.includes(area));return;}
    if(action==='save-areas'){const result=await api('/api/me/areas',{method:'PUT',body:{area_ids:state.draftAreas}});state.selectedAreas=result.areas.map(area=>area.id);closeModal();await loadPosts();return;}
    if(action==='profile'){if(state.user)await navigate('/me');else openAuth('',async()=>{});return;}
    if(action==='profile-avatar-edit'){avatarEditor.open(state.profile.profile,target);return;}
    if(action==='my-profile'){closeModal({fromRoute:true});await navigate('/me');return;}
    if(action==='auth-login'){closeModal({fromRoute:true});openAuth('',async()=>{});return;}
    if(action==='auth-register'){closeModal({fromRoute:true});openAuth('',async()=>{},'register');return;}
    if(action==='register'){openAuth('',async()=>{},'register');return;}
    if(action==='profile-post'){await openDetail(id);return;}
    if(action==='draft-open'){await openArticleDraft(await api('/api/articles/drafts/'+encodeURIComponent(target.dataset.draftId)));return;}
    if(action==='draft-delete'){if(!confirm(t('e21.delete_confirm')))return;await api('/api/articles/drafts/'+encodeURIComponent(target.dataset.draftId),{method:'DELETE'});await loadProfile();return;}
    if(action==='profile-more'){await loadProfile({append:true});return;}
    if(action==='logout'){const pushId=localStorage.getItem('hereme_push_subscription_id'),registration=await window.HeremePwa?.ready,subscription=await registration?.pushManager?.getSubscription();await api('/api/session/logout',{method:'POST',body:{push_subscription_id:pushId,push_endpoint:subscription?.endpoint||null}});await subscription?.unsubscribe();localStorage.removeItem('hereme_push_subscription_id');state.user=null;state.csrf='';state.legacyToken='';localStorage.removeItem('hereme_token');state.notificationSocket?.close();state.notificationSocket=null;$('#notificationButton').hidden=true;closeModal();await loadPosts();return;}
    if(action==='rotate-recovery'){const result=await api('/api/recovery/rotate',{method:'POST'});state.recoveryKey=result.recovery_key;openModal('recovery-key');return;}
    if(action==='toggle-recovery'){const input=$('#recoveryPassword'),show=input.type==='password';input.type=show?'text':'password';target.textContent=t(show?'recovery.hide':'recovery.show');input.focus();return;}
    if(action==='copy-recovery'){const input=$('#recoveryPassword');if(navigator.clipboard?.writeText)try{await navigator.clipboard.writeText(state.recoveryKey);toast(t('recovery.copied'));return;}catch{}if(input){input.type='text';input.focus();input.select();if(document.execCommand?.('copy')){toast(t('recovery.copied'));return;}}window.prompt(t('recovery.copy_prompt'),state.recoveryKey);return;}
    if(action==='recovery-continue'){const pending=state.pending;state.pending=null;state.recoveryKey='';closeModal();await loadPosts();if(pending)await pending();return;}
    if(action==='compose'){if(requireUser(()=>openModal('compose')))openModal('compose');return;}
    if(action==='article-save-draft'){await saveArticleDraft();renderModal({preserve:true});return;}
    if(action==='article-delete-draft'){if(!confirm(t('e21.delete_confirm')))return;await api('/api/articles/drafts/'+encodeURIComponent(state.articleDraftRecord.id),{method:'DELETE'});state.articleDraftRecord=null;closeModal();return;}
    if(action==='article-edit'){const record=await api(`/api/articles/${id}/edit`,{method:'POST'});await openArticleDraft(record);return;}
    if(action==='poster-edit'){state.posterEdit={id,text:state.detailPost.poster_text,base_version:state.detailPost.version};openModal('poster-edit');return;}
    if(action==='history'){await openHistory(id);return;}
    if(action==='history-current'){const id=state.historyPostId;history.replaceState({...history.state,detail:true},'',`/?post=${id}`);await openDetail(id,{route:false});return;}
    if(action==='history-more'){const page=await api(`/api/posts/${state.historyPostId}/revisions?offset=${state.historyData.revisions.length}`);state.historyData.revisions.push(...page.revisions);renderModal({preserve:true});return;}
    if(action==='history-compare'){const to=Number(target.dataset.version);await openHistory(state.historyPostId,{route:false,from:to-1,to});history.pushState({...history.state,history:true},'',`/?post=${state.historyPostId}&history=1&from=${to-1}&to=${to}`);return;}
    if(action==='history-custom-compare'){const from=Number($('#historyFrom').value),to=Number($('#historyTo').value);await openHistory(state.historyPostId,{route:false,from,to});history.pushState({...history.state,history:true},'',`/?post=${state.historyPostId}&history=1&from=${from}&to=${to}`);return;}
    if(action==='history-view'){const version=Number(target.dataset.version);await openHistory(state.historyPostId,{route:false,view:version});history.pushState({...history.state,history:true},'',`/?post=${state.historyPostId}&history=1&version=${version}`);return;}
    if(action==='format-poster'||action==='format-article'){saveDraft();state.postMode=action==='format-poster'?'poster':'article';renderModal({preserve:true});return;}
    if(['chapter-add','chapter-up','chapter-down','chapter-remove','article-cover-remove','article-media-remove'].includes(action))invalidateArticlePublish();
    if(action==='chapter-add'){saveDraft();state.articleDraft.chapters.push({heading:'',markdown:'',alt:'',media_id:null,collapsed:false});renderModal({preserve:true});return;}
    if(action==='chapter-collapse'){saveDraft();const chapter=state.articleDraft.chapters[Number(target.dataset.index)];chapter.collapsed=!chapter.collapsed;renderModal({preserve:true});return;}
    if(['chapter-up','chapter-down','chapter-remove'].includes(action)){saveDraft();const chapters=state.articleDraft.chapters,index=Number(target.dataset.index);if(action==='chapter-remove'&&chapters.length>1)chapters.splice(index,1);if(action==='chapter-up'&&index>0)[chapters[index-1],chapters[index]]=[chapters[index],chapters[index-1]];if(action==='chapter-down'&&index<chapters.length-1)[chapters[index+1],chapters[index]]=[chapters[index],chapters[index+1]];renderModal({preserve:true});return;}
    if(action==='article-cover-remove'){saveDraft();if(state.articleDraft.cover?.preview_url)URL.revokeObjectURL(state.articleDraft.cover.preview_url);state.articleDraft.cover=null;renderModal({preserve:true});return;}
    if(action==='article-media-remove'){saveDraft();const chapter=state.articleDraft.chapters[Number(target.dataset.index)];if(chapter.media?.preview_url)URL.revokeObjectURL(chapter.media.preview_url);chapter.media_id=null;chapter.media_name='';chapter.media=null;renderModal({preserve:true});return;}
    if(action==='remove-photo'){saveDraft();resetPhoto();renderModal({preserve:true});return;}
    if(action==='pause-upload'){state.videoPaused=true;target.dataset.action='resume-upload';target.textContent=t('compose.resume');return;}
    if(action==='resume-upload'){state.videoPaused=false;state.videoResume?.();state.videoResume=null;target.dataset.action='pause-upload';target.textContent='Pause';return;}
    if(action==='cancel-upload'){state.videoCancelled=true;state.videoPaused=false;state.videoResume?.();state.videoXhr?.abort();if(state.videoUpload)await api(state.videoUpload.upload_url,{method:'DELETE'}).catch(()=>{});return;}
    if(action==='detail'){await openDetail(id);return;}
    if(action==='article-media'){const dialog=target.closest('.detail-article').querySelector('.article-media-viewer'),body=dialog.querySelector('div'),src=HeremeArticleView.safeMediaUrl(target.dataset.src,{preview:state.modal==='compose'});if(!src)throw new Error('Invalid article media path.');body.replaceChildren();const media=document.createElement(target.dataset.kind==='video'?'video':'img');media.src=src;if(media.tagName==='VIDEO')media.controls=true;else media.alt=target.getAttribute('aria-label')||'';body.append(media);state.articleMediaFocus=target;dialog.showModal();return;}
    if(action==='article-media-close'){const dialog=target.closest('.article-media-viewer');dialog.close();dialog.querySelector('video')?.pause();state.articleMediaFocus?.focus({preventScroll:true});return;}
    if(action==='poster-media'){const dialog=target.closest('.detail-poster').querySelector('.poster-media-viewer'),body=dialog.querySelector('div'),src=HeremePoster.image(target.dataset.src);if(!src)throw new Error('Invalid poster media path.');const image=document.createElement('img');image.src=src;image.alt='';body.replaceChildren(image);state.articleMediaFocus=target;dialog.showModal();return;}
    if(action==='poster-media-close'){const dialog=target.closest('.poster-media-viewer');dialog.close();state.articleMediaFocus?.focus({preventScroll:true});return;}
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
      state.postMode='poster';state.composeStep='edit';state.category=post.category;state.draft.body=post.poster_text||post.title;renderModal();
      await loadPhoto(new File([blob],'plakat-kilde.jpg',{type:blob.type}),Boolean(post.synthetic_demo));return;
    }
    if(action==='copy-connect') {
      if(navigator.clipboard?.writeText) {
        try {await navigator.clipboard.writeText(state.meta.connect_url);toast('Mobiladressen er kopiert.');return;}
        catch { /* Same explicit HTTP clipboard fallback as sharing. */ }
      }
      window.prompt(t('connection.copy_prompt'),state.meta.connect_url);return;
    }
  }
  async function handleSubmit(event) {
    const id=event.target.id;
    if(!['profileForm','recoverForm','composeForm','commentForm','reportForm','posterEditForm'].includes(id))return;
    event.preventDefault();
    if(id==='posterEditForm'){const edit=state.posterEdit;const result=await api(`/api/posts/${edit.id}/text`,{method:'PATCH',body:{text:$('#posterEditText').value,change_summary:$('#posterEditSummary').value,base_version:edit.base_version,request_key:crypto.randomUUID()}});closeModal();await loadPosts();await openDetail(result.post_id);toast(t('e21.saved'));return;}
    if(id==='profileForm') {
      const result=await api('/api/session',{method:'POST',body:{name:$('#nicknameInput').value.trim()}});
      state.user=result.user;state.csrf=result.csrf_token;state.legacyToken='';localStorage.removeItem('hereme_token');if(localStorage.getItem('hereme_language'))await window.HeremeI18n.setLanguage(window.HeremeI18n.getLanguage());state.recoveryKey=result.recovery_key;state.modal='recovery-key';renderModal();
    }
    if(id==='recoverForm') {const result=await api('/api/session/recover',{method:'POST',body:{name:$('#recoverName').value.trim(),recovery_key:$('#recoverKey').value}});state.user=result.user;await window.HeremeI18n.applyAccountLanguage?.(result.user);state.csrf=result.csrf_token;state.legacyToken='';localStorage.removeItem('hereme_token');const pending=state.pending;state.pending=null;closeModal();await loadPosts();if(pending)await pending();}
    if(id==='composeForm')await submitCompose();
    if(id==='commentForm')await submitComment();
    if(id==='reportForm') {
      const result=await api(`/api/posts/${state.reportId}/report`,{method:'POST',body:{reason:$('#reportReason').value}});
      closeModal();await loadPosts();toast(t(result.automatically_held?'report.held':'report.registered'));
    }
  }
  async function handleChange(event) {
    const input=event.target;
    if(input.name==='category'){state.categories=[...document.querySelectorAll('input[name=category]:checked')].map(el=>el.value);$('#simpleCategories').innerHTML=HeremeFeed.categoryButtons(state.categories);$('#filterCount').textContent=state.categories.length===5?'':state.categories.length;await loadPosts();}
    if(input.id==='sortSelect'){state.sort=input.value;await loadPosts();}
    if(input.id==='profileSort'){state.profileSort=input.value;state.profile=null;state.profileCursor=null;await loadProfile();}
    if(input.dataset.notificationSetting){const settings={...state.notificationData.settings,[input.dataset.notificationSetting]:input.checked};state.notificationData.settings=(await api('/api/notification-settings',{method:'PUT',body:settings})).settings;renderModal();}
    if(input.id==='textPosition'){state.textPosition=input.value;updatePreview();}
    if(input.id==='postArea'){state.postArea=input.value;}
    if(input.name==='postCategory'){state.category=input.value;invalidateArticlePublish();updatePreview();}
    if(input.id==='articleCoverInput'||input.dataset.articleFile!==undefined){
      const file=input.files?.[0];if(!file)return;if(state.articleUploading)throw new Error(t('design.uploading'));
      invalidateArticlePublish();saveDraft();const cover=input.id==='articleCoverInput',chapter=cover?null:state.articleDraft.chapters[Number(input.dataset.articleFile)];
      const previous=cover?state.articleDraft.cover:chapter.media,preview_url=URL.createObjectURL(file);
      const pending={kind:file.type.startsWith('video/')?'video':'image',name:file.name,preview_url,pending:true};
      if(cover)state.articleDraft.cover=pending;else chapter.media=pending;
      input.closest('.design-media-actions')?.nextElementSibling?.replaceChildren(document.createTextNode(t('design.uploading')));
      updateArticlePreview();
      try{
        const uploaded=await uploadArticleAsset(file);
        if(cover&&state.articleDraft.cover===pending)state.articleDraft.cover=uploaded;
        if(chapter&&state.articleDraft.chapters.includes(chapter)&&chapter.media===pending){chapter.media=uploaded;chapter.media_id=uploaded.media_id;chapter.media_name=uploaded.name;chapter.media_kind=uploaded.kind;}
        saveDraft();
      }catch(error){if(cover&&state.articleDraft.cover===pending)state.articleDraft.cover=previous;if(chapter&&chapter.media===pending)chapter.media=previous;throw error;}
      finally{URL.revokeObjectURL(preview_url);if(state.modal==='compose')renderModal({preserve:true});}
      return;
    }
    if(['postFileInput','postCameraInput'].includes(input.id))await loadPhoto(input.files?.[0]);
    if(['postVideoInput','postVideoCameraInput'].includes(input.id))await loadVideo(input.files?.[0]);
  }
  async function init() {
    window.addEventListener('beforeunload',event=>{if(state.modal==='compose'&&state.postMode==='article'&&state.articleDirty){event.preventDefault();event.returnValue='';}});
    updateAppViewport();window.visualViewport?.addEventListener('resize',updateAppViewport);window.visualViewport?.addEventListener('scroll',updateAppViewport);window.addEventListener('resize',updateAppViewport);window.addEventListener('orientationchange',updateAppViewport);
    renderPreferences();
    renderFilters();
    for(const el of document.querySelectorAll('[data-icon]'))el.innerHTML=HeremeIcons.icon(el.dataset.icon);
    window.addEventListener('resize',()=>HeremePoster.fitTitles(document));
    window.addEventListener('hereme:language',()=>{
      if(state.modal==='compose')saveDraft();
      const y=scrollY;
      localizeChrome();renderPreferences();renderFilters();
      if(location.pathname==='/me')profileView();else renderWall();
      if(state.modal)renderModal({preserve:true});
      requestAnimationFrame(()=>scrollTo(0,y));
    });
    document.fonts.addEventListener('loadingdone',()=>HeremePoster.fitTitles(document));
    document.addEventListener('click',event=>handleClick(event).catch(error=>toast(error.message)));
    document.addEventListener('submit',event=>handleSubmit(event).catch(error=>toast(error.message)));
    document.addEventListener('change',event=>handleChange(event).catch(error=>toast(error.message)));
    document.addEventListener('input',event=>{
      if(event.target.id==='postBody')updatePreview();
      if(event.target.id==='articleTitle'||event.target.id==='articleAbstract'||event.target.dataset.chapterField){invalidateArticlePublish();saveDraft();updateArticlePreview();}
      if(event.target.id==='searchInput'){clearTimeout(state.searchTimer);state.searchTimer=setTimeout(()=>{state.query=event.target.value.trim();loadPosts();},220);}
      if(['editorZoom','editorX','editorY'].includes(event.target.id)){state[event.target.id]=Number(event.target.value);updatePreview();}
    });
    document.addEventListener('keydown',event=>{
      if((event.key==='Enter'||event.key===' ')&&event.target.dataset.action==='area-toggle'){event.preventDefault();event.target.click();return;}
      if(event.key==='Escape'&&$('.author-popover')){closeAuthorMenu({focus:true});return;}
      if(!state.modal)return;
      if(event.key==='Escape'&&$('.article-media-viewer')?.open){event.preventDefault();$('.article-media-viewer').close();state.articleMediaFocus?.focus({preventScroll:true});return;}
      if(event.key==='Escape')closeModal();
      if(event.key==='Tab') {
        const nodes=[...document.querySelectorAll('.modal-panel button,.modal-panel input,.modal-panel textarea,.modal-panel select,.modal-panel a[href],.modal-panel summary')].filter(el=>!el.disabled&&el.getClientRects().length);
        const first=nodes[0],last=nodes[nodes.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    });
    window.addEventListener('popstate',()=>{const previous=motionRoute;if(state.modal==='detail'){state.modal=null;state.detailPost=null;lockBackground(false);(state.returnFocus?.isConnected?state.returnFocus:$('.logo')).focus({preventScroll:true});removeModalVisual();}applyRoute({fromPop:true}).then(()=>{motionRoute=location.pathname;if(previous!==motionRoute)window.HeremeMotion?.enter(motionRoute==='/'?$('#forumShell'):$('#profileRoot'),'motion-screen-enter');}).catch(error=>toast(error.message));});
    try {
      state.meta=await api('/api/meta');
      state.csrf=csrfCookie();
      if(state.legacyToken||state.csrf)try{const current=await api('/api/me');state.user=current.user;await window.HeremeI18n.applyAccountLanguage?.(current.user);state.csrf=current.csrf_token||csrfCookie();if(current.legacy_migrated){state.legacyToken='';localStorage.removeItem('hereme_token');if(current.recovery_key){state.recoveryKey=current.recovery_key;state.modal='recovery-key';}}}
      catch(error){if(error.status!==401)throw error;state.legacyToken='';state.csrf='';localStorage.removeItem('hereme_token');}
      if(state.meta.features?.locations){$('#areaButton').hidden=false;const [available,geometry,subscribed]=await Promise.all([api('/api/areas'),api('/api/areas/geometry'),state.user?api('/api/me/areas'):Promise.resolve({areas:[]})]);state.areas=available.areas;state.areaGeometry=geometry;state.selectedAreas=subscribed.areas.map(area=>area.id);}
      if(state.user){await window.HeremePwa?.reconcilePush?.();await loadNotificationBadge();connectNotificationSocket();navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='notification.created')scheduleNotificationRefresh();});}
      localizeChrome();await loadPosts();
      if(new URLSearchParams(location.search).get('recovery-saved')==='1'){history.replaceState({},'',location.pathname);toast(t('recovery.confirmed'));}
      state.routeReady=true;await applyRoute({fromPop:true});
    } catch(error) {state.loadError=error.message;renderWall();}
  }
  window.HeremeI18n.ready.then(init).catch(error=>{console.error(error);state.loadError=error.message;renderWall();});
})();
