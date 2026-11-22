'use strict';
(()=>{
  const $=selector=>document.querySelector(selector);
  const i18n=()=>window.HeremeI18n;
  const t=(key,params)=>i18n().t(`chat.${key}`,params);
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const segmenter=()=>new Intl.Segmenter(i18n().getLanguage()==='en'?'en-GB':'nb-NO',{granularity:'grapheme'});
  const state={me:null,csrf:'',chats:[],notifications:[],selection:null,mode:'inbox',selected:new Map(),suggestions:[],activeSuggestion:-1,searchTimer:null,searchController:null,searchSequence:0,historyLimit:50,pauseUpload:false,detailsOpen:false,visible:false,drafts:new Map(),sending:false,socket:null,reconnect:0};
  state.messageRequest=0;
  function translateStatic(){
    const text={'.skip-link':'skip','#chatShell aside':'inbox_label','#groupBuilder':'create_group','#groupBuilder h2':'new_group','#cancelGroup':'action.cancel','#groupBuilder label[for=groupName]':'group_name','#groupBuilder p':'group_help','#groupBuilder h3':'selected_people','#confirmGroup':'create_group','#conversationList':'conversations_label','#inboxEmpty':'inbox_empty','#conversation':'conversation_label','#conversationEmpty':'conversation_empty','#declineInvite':'action.decline','.presence-control':'presence','#conversationDetails h3':'people','#inviteForm label':'invite_username','#inviteForm button':'action.invite','#leaveChat':'action.leave','#olderMessages':'older','#messageForm label[for=messageInput]':'message_label','#sendMessage':'action.send','#attachmentRetention':'attachment.retention','#pauseUpload':'action.pause','#connectionStatus':'connection.connecting','#attachmentViewer':'attachment.label','#closeViewer':'action.close'};
    for(const [selector,key] of Object.entries(text)){const element=$(selector);if(!element)continue;if(['ASIDE','SECTION','NAV','DIALOG'].includes(element.tagName))element.setAttribute('aria-label',t(key));else if(element.matches('.presence-control'))element.lastChild.textContent=' '+t(key);else element.textContent=t(key);}
    const fields={usernameSearch:['search_users','placeholder'],groupName:['group_name_placeholder','placeholder'],messageInput:['write_message','placeholder']};
    for(const [id,[key,attribute]] of Object.entries(fields))$('#'+id).setAttribute(attribute,t(key));
    for(const [id,key] of Object.entries({createGroup:'create_group',backToInbox:'back',toggleDetails:'details',toggleAttachments:'attachment.add',attachmentPopover:'attachment.options',pickImage:'attachment.pick_image',pickVideo:'attachment.pick_video',pickFile:'attachment.pick_file'})){const element=$('#'+id);element.setAttribute('aria-label',t(key));element.title=t(key);if(element.matches('.attachment-choice'))element.querySelector('span').textContent=t(key);}
    $('.wall-link').setAttribute('aria-label',t('wall'));$('.wall-link').title=t('wall');
    $('#newMessages').textContent=t('conversation.new_messages');
    document.title=t('title');
  }
  async function languageChanged(){
    saveDraft();translateStatic();renderInbox();renderSelected();renderStage();
    if(state.selection?.type==='draft')renderDraft(state.selection.target,state.selection.declined);
    else if(state.selection?.type==='chat'){const row=selectedRow();if(row)await updateConversation(row);}
  }
  async function api(url,{method='GET',body,signal}={}){
    const headers={};if(method!=='GET')headers['x-csrf-token']=state.csrf;if(body!==undefined)headers['content-type']='application/json';
    const response=await fetch(url,{method,headers,signal,body:body===undefined?undefined:JSON.stringify(body)});
    const value=await response.json();if(!response.ok){const error=Error(value.error?.message||t('error.request_failed'));error.status=response.status;throw error;}return value;
  }
  function fail(error){$('#chatError').textContent=error.message||String(error);$('#chatError').hidden=false;}
  function run(action){return async event=>{try{$('#chatError').hidden=true;await action(event);}catch(error){fail(error);}};}
  function preview(row){
    if(row.state==='incoming')return t('preview.request');
    if(row.state==='invited')return t('preview.invitation');
    if(row.state==='pending')return t('preview.pending');
    if(row.state==='declined')return t('preview.declined');
    if(row.last_kind==='file'||row.last_attachment&&!row.last_body)return t('preview.attachment');
    if(row.last_kind==='system')return t('preview.group_activity');
    if(!row.last_kind)return row.kind==='group'?t('preview.waiting_invitees'):t('preview.no_messages');
    const clean=String(row.last_body||'').replace(/\s+/gu,' ').trim();
    const units=[...segmenter().segment(clean)].map(part=>part.segment);
    return units.length>15?units.slice(0,15).join('')+'…':clean;
  }
  function renderInbox(){
    const list=$('#conversationList'),scroll=list.scrollTop;
    list.innerHTML=state.chats.map(row=>`<button class="conversation-row${row.unread?' has-unread':''}" type="button" data-chat="${escapeHtml(row.id)}" aria-current="${state.selection?.id===row.id}">${row.kind==='group'?HeremeAvatar.group(row.participants,{neutral:row.state==='invited'}):HeremeAvatar.html(row.participants?.[0]||{name:row.name})}<span class="row-copy"><span class="row-title">${escapeHtml(row.name)}</span><span class="row-preview">${escapeHtml(preview(row))}</span></span><time class="row-time" datetime="${escapeHtml(row.updated_at)}">${escapeHtml(String(row.updated_at||'').slice(11,16))}</time></button>`).join('');
    list.scrollTop=scroll;$('#inboxEmpty').hidden=state.chats.length>0||state.mode==='group';
    const unread=state.notifications.filter(item=>!item.read_at).length;$('#unreadCount').textContent=String(unread);$('#unreadCount').hidden=!unread;
  }
  function selectedRow(){return state.chats.find(row=>row.id===state.selection?.id);}
  function draftKey(){return state.selection?.type==='draft'?`user:${state.selection.target.id}`:state.selection?.id||'';}
  function returnRoute(){const value=new URLSearchParams(location.search).get('returnTo');return value&&(/^\/\?post=[1-9]\d*$/.test(value)||/^\/u\/[A-Za-z0-9_-]{1,100}$/.test(value))?value:null;}
  function canonicalChatRoute(id){const params=new URLSearchParams();const source=returnRoute();if(source)params.set('returnTo',source);return `/chat/${encodeURIComponent(id)}${params.size?'?'+params:''}`;}
  function draft(){const key=draftKey();if(!state.drafts.has(key))state.drafts.set(key,{text:'',files:[]});return state.drafts.get(key);}
  function mediaKind(file){return file.type.startsWith('image/')?'image':file.type.startsWith('video/')?'video':'file';}
  function renderStage(){const current=draft(),tray=$('#stagedFiles');tray.hidden=!current.files.length;tray.innerHTML=current.files.map((item,index)=>`<div class="staged-item">${item.kind==='image'?`<img src="${item.url}" alt="">`:`<img src="/assets/icons/chat-attach-${item.kind}.svg" alt="">`}<span>${escapeHtml(item.file.name)}</span><small>${escapeHtml(item.status||t('upload.ready'))}</small><button type="button" data-remove-file="${index}" aria-label="${escapeHtml(t('action.remove_file',{name:item.file.name}))}">${HeremeIcons.icon('close')}</button></div>`).join('');
    const locked=state.sending||['incoming','invited','declined'].includes(selectedRow()?.state)||state.selection?.declined;
    $('#sendMessage').disabled=locked||!($('#messageInput').value.trim()||current.files.length);
    for(const id of ['pickImage','pickVideo','pickFile'])$('#'+id).disabled=locked;
    $('#toggleAttachments').disabled=locked;
  }
  function attachmentPopover(open,{restoreFocus=false}={}){
    const popover=$('#attachmentPopover');
    popover.hidden=!open;
    if(open){popover.classList.remove('below');const viewportBottom=window.visualViewport?window.visualViewport.offsetTop+window.visualViewport.height:window.innerHeight;if(popover.getBoundingClientRect().top<0&&popover.getBoundingClientRect().bottom+popover.offsetHeight<viewportBottom)popover.classList.add('below');}
    $('#toggleAttachments').setAttribute('aria-expanded',String(open));
    if(!open&&restoreFocus)$('#toggleAttachments').focus({preventScroll:true});
  }
  function updateViewport(){
    const viewport=window.visualViewport;
    if(window.matchMedia('(max-width:760px)').matches&&viewport&&viewport.scale<=1.01)document.documentElement.style.setProperty('--chat-viewport-height',`${Math.round(viewport.height)}px`);
    else if(!viewport||!window.matchMedia('(max-width:760px)').matches)document.documentElement.style.removeProperty('--chat-viewport-height');
  }
  updateViewport();
  window.visualViewport?.addEventListener('resize',updateViewport);
  window.visualViewport?.addEventListener('scroll',updateViewport);
  window.addEventListener('resize',updateViewport);
  window.addEventListener('orientationchange',updateViewport);
  function saveDraft(){if(!state.selection)return;draft().text=$('#messageInput').value;}
  function restoreDraft(){const current=draft();$('#messageInput').value=current.text;renderStage();}
  function showConversation(){
    attachmentPopover(false);
    state.messageRequest++;
    state.renderedMessages=[];$('#messages').replaceChildren();$('#newMessages').hidden=true;
    $('#chatShell').classList.add('show-conversation');$('#conversationEmpty').hidden=true;$('#conversationContent').hidden=false;
    $('#conversationDetails').hidden=true;$('#toggleDetails').setAttribute('aria-expanded','false');state.detailsOpen=false;
    $('#conversationTitle').focus?.();
  }
  function resetConversation(){if(state.selection)saveDraft();attachmentPopover(false);state.selection=null;$('#chatShell').classList.remove('show-conversation');$('#conversationContent').hidden=true;$('#conversationEmpty').hidden=false;renderInbox();}
  function setNotice(message){$('#conversationNotice').textContent=message;$('#conversationNotice').hidden=!message;}
  function setDecision(row){
    const pending=row?.state==='incoming'||row?.state==='invited';$('#decisionActions').hidden=!pending;
    $('#messageInput').disabled=pending||row?.state==='declined';renderStage();
    $('#acceptInvite').textContent=row?.state==='invited'?t('action.accept_invitation'):t('action.accept_request');
  }
  function renderDraft(target,declined=false){
    state.selection={type:'draft',target,declined};$('#uploadStatus').textContent='';$('#uploadProgress').hidden=true;showConversation();
    $('#conversationAvatar').innerHTML=HeremeAvatar.html(target);$('#conversationTitle').textContent=target.name;$('#conversationSubtitle').textContent=t('conversation.new');
    setNotice(declined?t('notice.declined'):t('notice.pending'));setDecision({state:declined?'declined':'new',kind:'direct'});
    $('#messages').replaceChildren();$('#olderMessages').hidden=true;$('#toggleDetails').hidden=true;restoreDraft();$('#messageInput').focus();
  }
  async function loadMessages(chatId,targetMessage=null){
    const request=++state.messageRequest;
    const messages=[];let before=null,hasMore=false;
    while(messages.length<state.historyLimit){
      const page=(await api(`/api/chats/${encodeURIComponent(chatId)}/messages${before?`?before=${before}`:''}`)).messages;
      messages.unshift(...page);hasMore=page.length===50;if(!hasMore)break;before=page[0].id;
    }
    if(Number.isSafeInteger(targetMessage)&&!messages.some(message=>message.id===targetMessage)){
      const context=(await api(`/api/chats/${encodeURIComponent(chatId)}/messages?before=${targetMessage+1}`)).messages;
      const merged=new Map([...messages,...context].map(message=>[message.id,message]));messages.splice(0,messages.length,...[...merged.values()].sort((a,b)=>a.id-b.id));
    }
    if(request!==state.messageRequest||state.selection?.id!==chatId)return;
    $('#olderMessages').hidden=!hasMore;
    const list=$('#messages'),beforeIds=state.renderedMessages?.map(item=>item.id)||[];
    const nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<72,oldTop=list.scrollTop,listTop=list.getBoundingClientRect().top;
    const anchor=!nearBottom?[...list.querySelectorAll('.message[data-message-id]')].find(node=>node.getBoundingClientRect().bottom>listTop):null,anchorOffset=anchor?anchor.getBoundingClientRect().top-listTop:null;
    const descriptors=HeremeChatRender.descriptors(messages,{me:state.me,t});
    const existing=new Map([...list.children].map(node=>[node.dataset.renderKey,node]));
    let position=list.firstChild;
    for(const descriptor of descriptors){
      let node=existing.get(descriptor.key);
      if(!node||node.dataset.signature!==descriptor.signature){
        const template=document.createElement('template');template.innerHTML=descriptor.html;
        const replacement=template.content.firstElementChild;
        if(descriptor.signature)replacement.dataset.signature=descriptor.signature;
        if(node){if(node===position)position=replacement;node.replaceWith(replacement);existing.delete(descriptor.key);}node=replacement;
      }else existing.delete(descriptor.key);
      if(descriptor.runStart!==undefined){node.classList.toggle('run-start',descriptor.runStart);node.classList.toggle('run-continuation',!descriptor.runStart);node.querySelector('.message-meta')?.classList.toggle('sr-only',!descriptor.runStart);}
      if(node!==position)list.insertBefore(node,position);
      position=node.nextSibling;
    }
    for(const node of existing.values())node.remove();
    const appended=beforeIds.length&&messages.length&&messages.at(-1).id>beforeIds.at(-1);
    if(nearBottom||!beforeIds.length)list.scrollTop=list.scrollHeight;
    else if(anchor?.isConnected)list.scrollTop=oldTop+(anchor.getBoundingClientRect().top-list.getBoundingClientRect().top-anchorOffset);
    else list.scrollTop=oldTop;
    $('#newMessages').hidden=!(appended&&!nearBottom);
    state.renderedMessages=messages;
    if(Number.isSafeInteger(targetMessage)){const target=$(`[data-message-id="${targetMessage}"]`);if(target){target.classList.add('notification-target');target.scrollIntoView({block:'center'});target.focus({preventScroll:true});}}
  }
  async function renderDetails(row){
    if(!state.detailsOpen||!row||row.state==='incoming'||row.state==='invited'||row.id.startsWith('legacy:'))return;
    const people=(await api(`/api/chats/${encodeURIComponent(row.id)}/people`)).people;
    $('#people').innerHTML=people.map(person=>`<div class="person-line"><span>${escapeHtml(person.name)}${person.online?` <span class="person-online">● ${escapeHtml(t('status.online'))}</span>`:''}</span>${person.id===state.me?'':`<button type="button" data-block="${escapeHtml(person.id)}">${escapeHtml(t('action.block'))}</button>`}</div>`).join('');
    $('#inviteForm').hidden=row.kind!=='group';$('#leaveChat').hidden=false;
    $('#pendingInvites').innerHTML=row.creator_id===state.me?(await api(`/api/chats/${encodeURIComponent(row.id)}/invites`)).invites.map(invite=>`<div class="person-line"><span>${escapeHtml(invite.recipient)} · ${escapeHtml(t('status.invited'))}</span><button type="button" data-cancel-invite="${escapeHtml(invite.id)}">${escapeHtml(t('action.cancel'))}</button></div>`).join(''):'';
  }
  async function openChat(row,{route=true,targetMessage=null}={}){
    if(!row)return;saveDraft();state.selection={type:'chat',id:row.id};state.historyLimit=50;$('#uploadStatus').textContent='';$('#uploadProgress').hidden=true;showConversation();restoreDraft();
    await updateConversation(row,targetMessage);if(!targetMessage)$('#messageInput').focus();renderInbox();
    if(route&&location.pathname!==`/chat/${row.id}`)history.pushState({chat:row.id,fromInbox:true},'',canonicalChatRoute(row.id));
  }
  async function updateConversation(row,targetMessage=null){
    if(state.selection?.id!==row.id)return;
    $('#conversationAvatar').innerHTML=row.kind==='group'?HeremeAvatar.group(row.participants,{neutral:row.state==='invited'}):HeremeAvatar.html(row.participants?.[0]||{name:row.name});$('#conversationTitle').textContent=row.name;
    $('#conversationSubtitle').textContent=row.kind==='group'?t('conversation.group'):row.state==='incoming'?t('conversation.awaiting_you'):row.state==='pending'?t('conversation.awaiting_reply'):row.state==='declined'?t('conversation.declined'):t('conversation.direct');
    $('#toggleDetails').hidden=row.state==='incoming'||row.state==='invited'||row.id.startsWith('legacy:');setDecision(row);
    if(row.state==='pending')setNotice(t('notice.pending'));
    else if(row.state==='incoming')setNotice(t('notice.incoming'));
    else if(row.state==='invited')setNotice(t('notice.invited'));
    else if(row.state==='declined')setNotice(t('notice.declined'));
    else if(row.kind==='group'&&row.creator_id===state.me&&(await api(`/api/chats/${encodeURIComponent(row.id)}/invites`)).invites.length)setNotice(t('notice.group_pending'));
    else setNotice('');
    if(row.unread&&!row.id.startsWith('legacy:')){
      await api(`/api/chats/${encodeURIComponent(row.id)}/read`,{method:'POST'});
      row.unread=0;for(const item of state.notifications)if(item.chat_id===row.id)item.read_at='seen';renderInbox();
    }
    if(row.state==='incoming'||row.state==='invited'){$('#messages').replaceChildren();$('#olderMessages').hidden=true;return;}
    await loadMessages(row.id,targetMessage);await renderDetails(row);
  }
  async function refresh(){
    const [chats,notifications]=await Promise.all([api('/api/chats'),api('/api/chat/notifications')]);
    state.chats=chats.chats;state.notifications=notifications.notifications;renderInbox();
    if(state.selection?.type==='chat'){
      const row=selectedRow();if(row)await updateConversation(row);else resetConversation();
    }
  }
  function renderSelected(){
    $('#selectedPeople').innerHTML=[...state.selected.values()].map(user=>`<span class="person-chip">${escapeHtml(user.name)}<button type="button" data-remove="${escapeHtml(user.id)}" aria-label="${escapeHtml(t('action.remove_person',{name:user.name}))}">${HeremeIcons.icon('close')}</button></span>`).join('');
    $('#confirmGroup').disabled=state.selected.size===0;
  }
  function renderSuggestions(users){
    state.suggestions=users;state.activeSuggestion=-1;const results=$('#searchResults');
    results.innerHTML=users.map((user,index)=>`<button class="search-result" id="suggestion-${index}" type="button" role="option" aria-selected="false" data-user="${escapeHtml(user.id)}">${HeremeAvatar.html(user)}<span>${escapeHtml(user.name)}</span></button>`).join('');
    results.hidden=!users.length;$('#usernameSearch').setAttribute('aria-expanded',String(users.length>0));
    $('#searchStatus').textContent=users.length?t('search.suggestions',{count:users.length}):t('search.none');
  }
  async function lookup(query,sequence){
    state.searchController?.abort();const controller=new AbortController();state.searchController=controller;
    try{const result=await api('/api/chat/users?q='+encodeURIComponent(query),{signal:controller.signal});if(sequence!==state.searchSequence)return;renderSuggestions(result.users.filter(user=>!state.selected.has(user.id)));}
    catch(error){if(error.name==='AbortError'||sequence!==state.searchSequence)return;$('#searchResults').hidden=true;$('#searchStatus').textContent=t('search.failed');}
  }
  function searchChanged(){
    clearTimeout(state.searchTimer);state.searchController?.abort();const query=$('#usernameSearch').value.trim(),sequence=++state.searchSequence;
    if([...query].length<2){state.suggestions=[];$('#searchResults').hidden=true;$('#usernameSearch').setAttribute('aria-expanded','false');$('#searchStatus').textContent=query?t('search.minimum'):'';return;}
    $('#searchStatus').textContent=t('search.searching');state.searchTimer=setTimeout(()=>lookup(query,sequence),250);
  }
  async function chooseUser(user,{fromRoute=false}={}){
    $('#searchResults').hidden=true;$('#usernameSearch').setAttribute('aria-expanded','false');
    if(state.mode==='group'){state.selected.set(user.id,user);renderSelected();$('#usernameSearch').value='';searchChanged();$('#usernameSearch').focus();return;}
    saveDraft();const result=await api(`/api/chat/direct/${encodeURIComponent(user.id)}`);
    if(result.chat_id){await refresh();const row=state.chats.find(item=>item.id===result.chat_id);if(row){await openChat(row,{route:!fromRoute});if(fromRoute)history.replaceState({chat:row.id},'',canonicalChatRoute(row.id));}else throw Error(t('error.unavailable'));}
    else if(result.state==='incoming'){await refresh();const row=state.chats.find(item=>item.state==='incoming'&&item.name===user.name);if(row){await openChat(row,{route:!fromRoute});if(fromRoute)history.replaceState({chat:row.id},'',canonicalChatRoute(row.id));}else throw Error(t('error.open_request'));}
    else renderDraft(user,result.state==='declined');
  }
  async function sendMessage(event){
    event.preventDefault();if(state.sending||!state.selection)return;const selected=state.selection,draftId=draftKey(),current=draft(),body=$('#messageInput').value.trim(),files=[...current.files];if(!body&&!files.length)return;
    const signature=JSON.stringify([draftId,body,files.map(item=>[item.file.name,item.file.size,item.file.lastModified])]);
    const key=current.pendingSend?.signature===signature?current.pendingSend.key:crypto.randomUUID();current.pendingSend={signature,key};state.sending=true;$('#uploadStatus').textContent=t('status.sending');renderStage();
    try{
      for(let index=0;index<files.length;index++)await uploadStaged(files[index],selected,index+1,files.length);
      const payload={body,client_key:key,attachment_ids:files.map(item=>item.id)};
      if(selected.type==='draft'){
        const result=await api('/api/chats/direct',{method:'POST',body:{...payload,target_user_id:selected.target.id}});
        state.drafts.delete(draftId);if(draftKey()===draftId)$('#messageInput').value='';releaseFiles(files);await refresh();const row=state.chats.find(item=>item.id===result.chat_id);if(row&&state.selection===selected){await openChat(row,{route:false});history.replaceState({chat:row.id},'',canonicalChatRoute(row.id));}
      }else{
        await api(`/api/chats/${encodeURIComponent(selected.id)}/messages`,{method:'POST',body:payload});
        state.drafts.delete(draftId);if(draftKey()===draftId)$('#messageInput').value='';releaseFiles(files);await refresh();
      }
      $('#uploadStatus').textContent=t('status.sent');
    }finally{state.sending=false;renderStage();$('#pauseUpload').hidden=true;$('#uploadProgress').hidden=true;}
  }
  function releaseFiles(files){for(const item of files)URL.revokeObjectURL(item.url);}
  async function uploadStaged(item,selected,index,total){
    if(item.status==='staged')return;
    if(!item.file.size)throw Error(t('error.empty_file'));
    if(!item.id){const input={name:item.file.name,bytes:item.file.size,media_kind:item.kind};if(selected.type==='draft')input.target_user_id=selected.target.id;else input.chat_id=selected.id;const started=await api('/api/chat-uploads/stage',{method:'POST',body:input});item.id=started.id;}
    const saved=await api('/api/chat-uploads/'+encodeURIComponent(item.id));let offset=saved.received;if(saved.status==='staged'){item.status='staged';renderStage();return;}
    $('#uploadProgress').hidden=false;$('#pauseUpload').hidden=false;state.pauseUpload=false;
    while(offset<item.file.size){if(state.pauseUpload){item.status=t('upload.paused_short');renderStage();throw Error(t('upload.paused'));}
      const response=await fetch('/api/chat-uploads/'+encodeURIComponent(item.id),{method:'PATCH',headers:{'x-csrf-token':state.csrf,'x-upload-offset':String(offset)},body:item.file.slice(offset,offset+4*1024*1024)});
      const result=await response.json();if(!response.ok)throw Error(result.error?.message||t('error.upload_failed'));offset=result.received;
      $('#uploadProgress').value=Math.round(((index-1)+offset/item.file.size)/total*100);$('#uploadStatus').textContent=t('upload.progress',{index,total,offset,size:item.file.size});
    }
    item.status='staged';renderStage();
  }
  async function decideSelected(accept){
    const row=selectedRow();if(!row)return;
    const url=row.state==='invited'?`/api/chat/invites/${encodeURIComponent(row.invite_id)}`:`/api/chat/requests/${encodeURIComponent(row.request_id)}`;
    const result=await api(url,{method:'POST',body:{accept}});resetConversation();await refresh();
    if(accept&&result.chat_id){const joined=state.chats.find(item=>item.id===result.chat_id);if(joined)await openChat(joined);}
  }
  function openViewer(message,fileId=null){const all=message.attachments||[],files=fileId?all.filter(file=>file.id===fileId):all,dialog=$('#attachmentViewer'),body=$('#viewerBody');if(!files.length)return;$('#viewerTitle').textContent=files.length===1?files[0].name:t('attachment.count',{count:files.length});body.replaceChildren();
    for(const file of files){const active=file.status==='ready'&&file.expires_at>new Date().toISOString(),row=document.createElement('div');row.className='viewer-file'+(active&&['image','video'].includes(file.media_kind)?' media':'');const title=document.createElement('strong');title.textContent=file.name;row.append(title);
      if(active&&file.media_kind==='image'){const image=document.createElement('img');image.src=`/api/chat/files/${encodeURIComponent(file.id)}/preview`;image.alt=file.name;row.append(image);}
      if(active&&file.media_kind==='video'){const video=document.createElement('video');video.src=`/api/chat/files/${encodeURIComponent(file.id)}/preview`;video.controls=true;video.preload='metadata';row.append(video);}
      if(active){const link=document.createElement('a');link.href=`/api/chat/files/${encodeURIComponent(file.id)}/download`;link.textContent=t('action.download');row.append(link);}else{const expired=document.createElement('span');expired.textContent=t('attachment.expired_sentence');row.append(expired);}body.append(row);
    }dialog.showModal();
  }
  $('#usernameSearch').addEventListener('input',searchChanged);
  $('#usernameSearch').addEventListener('keydown',run(async event=>{
    if(event.key==='Escape'){$('#searchResults').hidden=true;$('#usernameSearch').setAttribute('aria-expanded','false');return;}
    if(!state.suggestions.length||$('#searchResults').hidden)return;
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();state.activeSuggestion=(state.activeSuggestion+(event.key==='ArrowDown'?1:-1)+state.suggestions.length)%state.suggestions.length;$('#searchResults').querySelectorAll('[role=option]').forEach((option,index)=>{option.classList.toggle('is-active',index===state.activeSuggestion);option.setAttribute('aria-selected',String(index===state.activeSuggestion));});$('#usernameSearch').setAttribute('aria-activedescendant',`suggestion-${state.activeSuggestion}`);}
    if(event.key==='Enter'){event.preventDefault();await chooseUser(state.suggestions[Math.max(0,state.activeSuggestion)]);}
  }));
  $('#searchResults').addEventListener('click',run(async event=>{const button=event.target.closest('[data-user]');if(!button)return;const user=state.suggestions.find(item=>item.id===button.dataset.user);if(user)await chooseUser(user);}));
  $('#conversationList').addEventListener('click',run(async event=>{const button=event.target.closest('[data-chat]');if(!button)return;await openChat(state.chats.find(item=>item.id===button.dataset.chat));}));
  $('#createGroup').addEventListener('click',()=>{state.mode='group';state.selected.clear();renderSelected();$('#groupBuilder').hidden=false;$('#inboxEmpty').hidden=true;$('#usernameSearch').focus();$('#searchStatus').textContent=t('search.group_people');});
  $('#cancelGroup').addEventListener('click',()=>{state.mode='inbox';state.selected.clear();$('#groupBuilder').hidden=true;searchChanged();renderInbox();});
  $('#selectedPeople').addEventListener('click',event=>{const button=event.target.closest('[data-remove]');if(!button)return;state.selected.delete(button.dataset.remove);renderSelected();searchChanged();});
  $('#confirmGroup').addEventListener('click',run(async()=>{if(!state.selected.size)return;const result=await api('/api/chats',{method:'POST',body:{name:$('#groupName').value,recipients:[...state.selected.keys()]}});state.mode='inbox';state.selected.clear();$('#groupBuilder').hidden=true;$('#groupName').value='';await refresh();const row=state.chats.find(item=>item.id===result.id);if(row)await openChat(row);}));
  $('#backToInbox').addEventListener('click',()=>{const source=returnRoute();if(source){location.replace(source);return;}if(location.pathname.startsWith('/chat/')&&history.state?.fromInbox){history.back();return;}if(location.pathname!=='/chat'||location.search)history.replaceState({},'', '/chat');resetConversation();$('#usernameSearch').focus();});
  $('#messageForm').addEventListener('submit',run(sendMessage));
  $('#messageInput').addEventListener('input',()=>{saveDraft();renderStage();});
  $('#messageInput').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();$('#messageForm').requestSubmit();}});
  $('#toggleAttachments').addEventListener('click',()=>{const open=$('#attachmentPopover').hidden;attachmentPopover(open);if(open)$('#pickImage').focus({preventScroll:true});});
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.attachment-controls'))attachmentPopover(false);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('#attachmentPopover').hidden){event.preventDefault();attachmentPopover(false,{restoreFocus:true});}});
  $('#acceptInvite').addEventListener('click',run(()=>decideSelected(true)));$('#declineInvite').addEventListener('click',run(()=>decideSelected(false)));
  $('#olderMessages').addEventListener('click',run(async()=>{state.historyLimit+=50;const row=selectedRow();if(row)await updateConversation(row);}));
  $('#newMessages').addEventListener('click',()=>{$('#messages').scrollTo({top:$('#messages').scrollHeight});$('#newMessages').hidden=true;});
  $('#messages').addEventListener('scroll',()=>{const list=$('#messages');if(list.scrollHeight-list.scrollTop-list.clientHeight<72)$('#newMessages').hidden=true;});
  $('#toggleDetails').addEventListener('click',run(async()=>{state.detailsOpen=!state.detailsOpen;$('#conversationDetails').hidden=!state.detailsOpen;$('#toggleDetails').setAttribute('aria-expanded',String(state.detailsOpen));await renderDetails(selectedRow());}));
  $('#conversationDetails').addEventListener('click',run(async event=>{const block=event.target.closest('[data-block]'),cancel=event.target.closest('[data-cancel-invite]'),row=selectedRow();if(block&&confirm(t('confirm.block'))){await api('/api/chat/blocks',{method:'POST',body:{user_id:block.dataset.block}});await refresh();}if(cancel&&row){await api(`/api/chats/${row.id}/invites/${cancel.dataset.cancelInvite}`,{method:'DELETE'});await updateConversation(row);}}));
  $('#inviteForm').addEventListener('submit',run(async event=>{event.preventDefault();const row=selectedRow(),name=$('#inviteName').value.trim();const result=await api('/api/chat/users?q='+encodeURIComponent(name));const person=result.users.find(item=>item.name.toLocaleLowerCase()===name.toLocaleLowerCase());if(!person)throw Error(t('error.user_not_found'));await api(`/api/chats/${row.id}/invites`,{method:'POST',body:{recipient_id:person.id}});$('#inviteName').value='';await updateConversation(row);}));
  $('#leaveChat').addEventListener('click',run(async()=>{const row=selectedRow();if(!row)return;await api(`/api/chats/${row.id}/membership`,{method:'DELETE'});resetConversation();await refresh();}));
  for(const [button,input] of [['pickImage','imageInput'],['pickVideo','videoInput'],['pickFile','fileInput']])$('#'+button).addEventListener('click',()=>{attachmentPopover(false,{restoreFocus:true});$('#'+input).click();});
  for(const id of ['imageInput','videoInput','fileInput'])$('#'+id).addEventListener('change',event=>{const current=draft();for(const file of event.target.files){if(current.files.length>=12){fail(Error(t('error.max_attachments')));break;}current.files.push({file,kind:mediaKind(file),url:URL.createObjectURL(file),id:null,status:''});}event.target.value='';renderStage();$('#uploadStatus').textContent=t('upload.selected');});
  $('#stagedFiles').addEventListener('click',run(async event=>{const button=event.target.closest('[data-remove-file]');if(!button)return;const current=draft(),[item]=current.files.splice(Number(button.dataset.removeFile),1);if(item?.id)await api('/api/chat-uploads/'+encodeURIComponent(item.id),{method:'DELETE'});if(item)URL.revokeObjectURL(item.url);current.pendingSend=null;renderStage();}));
  $('#messages').addEventListener('click',event=>{const toggle=event.target.closest('[data-toggle-bundle]');if(toggle){const items=document.getElementById(toggle.getAttribute('aria-controls')),expanded=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(expanded));items.hidden=!expanded;return;}const button=event.target.closest('[data-view-message]');if(!button)return;const message=state.renderedMessages?.find(item=>item.id===Number(button.dataset.viewMessage));if(message)openViewer(message,button.dataset.fileId||null);});
  $('#messages').addEventListener('error',event=>{const media=event.target;if(!media.matches('img,video'))return;const fallback=media.closest('.attachment-preview,.video-card')?.querySelector('.attachment-broken');if(fallback){media.hidden=true;fallback.hidden=false;}else if(media.closest('.stack-layer')){const icon=document.createElement('img');icon.src='/assets/icons/chat-file-stack.svg';icon.alt='';media.replaceWith(icon);}},true);
  $('#messages').addEventListener('loadedmetadata',event=>{const video=event.target;if(!video.matches('.video-card>video')||!Number.isFinite(video.duration)||video.duration<=0)return;const minutes=Math.floor(video.duration/60),seconds=String(Math.floor(video.duration%60)).padStart(2,'0'),label=video.parentElement.querySelector('[data-video-duration]');if(label){label.textContent=`${minutes}:${seconds}`;label.hidden=false;}},true);
  $('#closeViewer').addEventListener('click',()=>$('#attachmentViewer').close());
  $('#attachmentViewer').addEventListener('close',()=>{for(const video of $('#viewerBody').querySelectorAll('video'))video.pause();});
  $('#pauseUpload').addEventListener('click',()=>{state.pauseUpload=true;});
  $('#visible').addEventListener('change',run(async()=>{state.visible=$('#visible').checked;await api('/api/chat/presence',{method:'PUT',body:{visible:state.visible}});await renderDetails(selectedRow());}));
  function connectSocket(){const url=new URL('/api/chat-socket',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';const socket=new WebSocket(url);state.socket=socket;const status=$('#connectionStatus');status.hidden=false;status.textContent=t('connection.connecting');
    socket.onopen=()=>{state.reconnect=0;status.hidden=true;run(refresh)();};
    socket.onmessage=run(async event=>{const message=JSON.parse(event.data);if(message.type==='connected')return;await refresh();});
    socket.onclose=()=>{if(state.socket!==socket)return;status.hidden=false;status.textContent=t('connection.reconnecting');const delay=Math.min(30000,1000*2**Math.min(state.reconnect++,5));setTimeout(connectSocket,delay);};
    socket.onerror=()=>socket.close();
  }
  async function resolveRoute(){const match=/^\/chat\/([0-9a-f-]{36})$/i.exec(location.pathname);if(!match){resetConversation();const userId=location.pathname==='/chat'?new URLSearchParams(location.search).get('user'):null;if(userId){if(!/^[A-Za-z0-9_-]{1,100}$/.test(userId)){history.replaceState({},'', '/chat');return;}try{const person=await api(`/api/users/${encodeURIComponent(userId)}/public`);await chooseUser({id:person.public_id,name:person.username,avatar_url:person.avatar_url},{fromRoute:true});}catch(error){if(error.status!==404)throw error;history.replaceState({},'', '/chat');setNotice(t('error.user_not_found'));}}return;}const value=new URLSearchParams(location.search).get('message'),targetMessage=value&&/^\d+$/.test(value)?Number(value):null,row=state.chats.find(item=>item.id===match[1]);if(row)await openChat(row,{route:false,targetMessage:Number.isSafeInteger(targetMessage)?targetMessage:null});else{resetConversation();setNotice(t('error.no_access'));}}
  async function init(){try{translateStatic();window.addEventListener('hereme:language',()=>run(languageChanged)());const me=await api('/api/me');state.me=me.user.id;state.csrf=me.csrf_token||decodeURIComponent(document.cookie.match(/(?:^|; )hereme_csrf=([^;]+)/)?.[1]||'');await api('/api/chat/presence',{method:'PUT',body:{visible:state.visible}});await refresh();await resolveRoute();connectSocket();window.addEventListener('popstate',()=>run(resolveRoute)());setInterval(()=>run(async()=>{await api('/api/chat/presence',{method:'PUT',body:{visible:state.visible}});if(state.socket?.readyState!==WebSocket.OPEN)await refresh();})(),30000);}catch(error){if(error.status===401||/aktiv sesjon/i.test(error.message)){window.HeremeAuth.open({message:t('auth.required'),onSuccess:()=>location.reload(),onCancel:()=>location.assign('/')});return;}throw error;}}
  i18n().ready.then(()=>run(init)());
})();
