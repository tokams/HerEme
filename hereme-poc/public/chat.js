'use strict';
(()=>{
  const $=selector=>document.querySelector(selector);
  const icon=kind=>`/assets/icons/chat-${kind==='group'?'group':'single'}.svg`;
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const segmenter=new Intl.Segmenter('no',{granularity:'grapheme'});
  const state={me:null,csrf:'',chats:[],notifications:[],selection:null,mode:'inbox',selected:new Map(),suggestions:[],activeSuggestion:-1,searchTimer:null,searchController:null,searchSequence:0,historyLimit:50,pauseUpload:false,detailsOpen:false,visible:false,drafts:new Map(),sending:false,socket:null,reconnect:0};
  async function api(url,{method='GET',body,signal}={}){
    const headers={};if(method!=='GET')headers['x-csrf-token']=state.csrf;if(body!==undefined)headers['content-type']='application/json';
    const response=await fetch(url,{method,headers,signal,body:body===undefined?undefined:JSON.stringify(body)});
    const value=await response.json();if(!response.ok){const error=Error(value.error?.message||'Forespørselen feilet.');error.status=response.status;throw error;}return value;
  }
  function fail(error){$('#chatError').textContent=error.message||String(error);$('#chatError').hidden=false;}
  function run(action){return async event=>{try{$('#chatError').hidden=true;await action(event);}catch(error){fail(error);}};}
  function preview(row){
    if(row.state==='incoming')return 'Meldingsforespørsel';
    if(row.state==='invited')return 'Gruppeinvitasjon';
    if(row.state==='pending')return 'Venter på svar';
    if(row.state==='declined')return 'Forespørsel avslått';
    if(row.last_kind==='file'||row.last_attachment&&!row.last_body)return '(attachment)';
    if(row.last_kind==='system')return 'Aktivitet i gruppen';
    if(!row.last_kind)return row.kind==='group'?'Venter på inviterte':'Ingen meldinger ennå';
    const clean=String(row.last_body||'').replace(/\s+/gu,' ').trim();
    const units=[...segmenter.segment(clean)].map(part=>part.segment);
    return units.length>15?units.slice(0,15).join('')+'…':clean;
  }
  function renderInbox(){
    const list=$('#conversationList'),scroll=list.scrollTop;
    list.innerHTML=state.chats.map(row=>`<button class="conversation-row${row.unread?' has-unread':''}" type="button" data-chat="${escapeHtml(row.id)}" aria-current="${state.selection?.id===row.id}"><img src="${icon(row.kind)}" alt=""><span class="row-copy"><span class="row-title">${escapeHtml(row.name)}</span><span class="row-preview">${escapeHtml(preview(row))}</span></span></button>`).join('');
    list.scrollTop=scroll;$('#inboxEmpty').hidden=state.chats.length>0||state.mode==='group';
    const unread=state.notifications.filter(item=>!item.read_at).length;$('#unreadCount').textContent=String(unread);$('#unreadCount').hidden=!unread;
  }
  function selectedRow(){return state.chats.find(row=>row.id===state.selection?.id);}
  function draftKey(){return state.selection?.type==='draft'?`user:${state.selection.target.id}`:state.selection?.id||'';}
  function draft(){const key=draftKey();if(!state.drafts.has(key))state.drafts.set(key,{text:'',files:[]});return state.drafts.get(key);}
  function mediaKind(file){return file.type.startsWith('image/')?'image':file.type.startsWith('video/')?'video':'file';}
  function renderStage(){const current=draft(),tray=$('#stagedFiles');tray.hidden=!current.files.length;tray.innerHTML=current.files.map((item,index)=>`<div class="staged-item">${item.kind==='image'?`<img src="${item.url}" alt="">`:`<img src="/assets/icons/chat-attach-${item.kind}.svg" alt="">`}<span>${escapeHtml(item.file.name)}</span><small>${escapeHtml(item.status||'Klar til å sendes')}</small><button type="button" data-remove-file="${index}" aria-label="Fjern ${escapeHtml(item.file.name)}">×</button></div>`).join('');
    const locked=state.sending||['incoming','invited','declined'].includes(selectedRow()?.state)||state.selection?.declined;
    $('#sendMessage').disabled=locked||!($('#messageInput').value.trim()||current.files.length);
    for(const id of ['pickImage','pickVideo','pickFile'])$('#'+id).disabled=locked;
  }
  function saveDraft(){if(!state.selection)return;draft().text=$('#messageInput').value;}
  function restoreDraft(){const current=draft();$('#messageInput').value=current.text;renderStage();}
  function showConversation(){
    $('#chatShell').classList.add('show-conversation');$('#conversationEmpty').hidden=true;$('#conversationContent').hidden=false;
    $('#conversationDetails').hidden=true;$('#toggleDetails').setAttribute('aria-expanded','false');state.detailsOpen=false;
    $('#conversationTitle').focus?.();
  }
  function resetConversation(){state.selection=null;$('#chatShell').classList.remove('show-conversation');$('#conversationContent').hidden=true;$('#conversationEmpty').hidden=false;renderInbox();}
  function setNotice(message){$('#conversationNotice').textContent=message;$('#conversationNotice').hidden=!message;}
  function setDecision(row){
    const pending=row?.state==='incoming'||row?.state==='invited';$('#decisionActions').hidden=!pending;
    $('#messageInput').disabled=pending||row?.state==='declined';renderStage();
    $('#acceptInvite').textContent=row?.state==='invited'?'Godta invitasjon':'Godta forespørsel';
  }
  function renderDraft(target,declined=false){
    state.selection={type:'draft',target,declined};$('#uploadStatus').textContent='';$('#uploadProgress').hidden=true;showConversation();
    $('#conversationIcon').src=icon('direct');$('#conversationTitle').textContent=target.name;$('#conversationSubtitle').textContent='Ny samtale';
    setNotice(declined?'Denne meldingsforespørselen ble avslått.': 'Denne brukeren må godta meldingsforespørselen. De blir varslet.');setDecision({state:declined?'declined':'new',kind:'direct'});
    $('#messages').replaceChildren();$('#olderMessages').hidden=true;$('#toggleDetails').hidden=true;restoreDraft();$('#messageInput').focus();
  }
  async function loadMessages(chatId){
    const messages=[];let before=null,hasMore=false;
    while(messages.length<state.historyLimit){
      const page=(await api(`/api/chats/${encodeURIComponent(chatId)}/messages${before?`?before=${before}`:''}`)).messages;
      messages.unshift(...page);hasMore=page.length===50;if(!hasMore)break;before=page[0].id;
    }
    $('#olderMessages').hidden=!hasMore;
    let date='';const html=[];
    for(const message of messages){
      const day=String(message.created_at).slice(0,10);if(day!==date){date=day;html.push(`<div class="date-separator">${escapeHtml(day)}</div>`);}
      const own=message.sender_id===state.me,system=message.kind==='system';
      const files=message.attachments||[],ready=file=>file.status==='ready'&&file.expires_at>new Date().toISOString();
      let attachment='';
      if(files.length===1){const file=files[0],fileId=encodeURIComponent(file.id),name=escapeHtml(file.name);
        if(!ready(file))attachment=`<span class="expired-file">${name} — filen er utløpt og permanent slettet</span>`;
        else if(file.media_kind==='image')attachment=`<button class="attachment-preview" type="button" data-view-message="${message.id}" aria-label="Vis ${name}"><img src="/api/chat/files/${fileId}/preview" alt="${name}" loading="lazy"></button>`;
        else if(file.media_kind==='video')attachment=`<button class="attachment-card video-card" type="button" data-view-message="${message.id}" aria-label="Spill av ${name}"><video src="/api/chat/files/${fileId}/preview#t=0.1" preload="metadata" muted playsinline></video><span>▶ ${name}</span></button>`;
        else attachment=`<button class="attachment-card" type="button" data-view-message="${message.id}"><img src="/assets/icons/chat-attach-file.svg" alt=""><span>${name}</span></button>`;
      }else if(files.length>1)attachment=`<button class="attachment-card bundle-card" type="button" data-view-message="${message.id}"><span class="bundle-collage">${files.slice(0,3).map(file=>file.media_kind==='image'&&ready(file)?`<img src="/api/chat/files/${encodeURIComponent(file.id)}/preview" alt="">`:`<img src="/assets/icons/chat-attach-${file.media_kind}.svg" alt="">`).join('')}</span><span>${files.length} vedlegg · Se alle</span></button>`;
      html.push(`<div class="message${own?' own':''}${system?' system':''}"><small class="message-meta">${escapeHtml(message.sender)} · ${escapeHtml(message.created_at)}</small>${message.body?`<div>${escapeHtml(message.body)}</div>`:''}${attachment}</div>`);
    }
    $('#messages').innerHTML=html.join('');$('#messages').scrollTop=$('#messages').scrollHeight;state.renderedMessages=messages;
  }
  async function renderDetails(row){
    if(!state.detailsOpen||!row||row.state==='incoming'||row.state==='invited'||row.id.startsWith('legacy:'))return;
    const people=(await api(`/api/chats/${encodeURIComponent(row.id)}/people`)).people;
    $('#people').innerHTML=people.map(person=>`<div class="person-line"><span>${escapeHtml(person.name)}${person.online?' <span class="person-online">● online</span>':''}</span>${person.id===state.me?'':`<button type="button" data-block="${escapeHtml(person.id)}">Blokker</button>`}</div>`).join('');
    $('#inviteForm').hidden=row.kind!=='group';$('#leaveChat').hidden=false;
    $('#pendingInvites').innerHTML=row.creator_id===state.me?(await api(`/api/chats/${encodeURIComponent(row.id)}/invites`)).invites.map(invite=>`<div class="person-line"><span>${escapeHtml(invite.recipient)} · invitert</span><button type="button" data-cancel-invite="${escapeHtml(invite.id)}">Avlys</button></div>`).join(''):'';
  }
  async function openChat(row,{route=true}={}){
    if(!row)return;saveDraft();state.selection={type:'chat',id:row.id};state.historyLimit=50;$('#uploadStatus').textContent='';$('#uploadProgress').hidden=true;showConversation();restoreDraft();
    await updateConversation(row);$('#messageInput').focus();renderInbox();
    if(route&&location.pathname!==`/chat/${row.id}`)history.pushState({chat:row.id},'',`/chat/${encodeURIComponent(row.id)}`);
  }
  async function updateConversation(row){
    if(state.selection?.id!==row.id)return;
    $('#conversationIcon').src=icon(row.kind);$('#conversationTitle').textContent=row.name;
    $('#conversationSubtitle').textContent=row.kind==='group'?'Gruppesamtale':row.state==='incoming'?'Venter på ditt svar':row.state==='pending'?'Venter på svar':row.state==='declined'?'Avslått':'Direkte samtale';
    $('#toggleDetails').hidden=row.state==='incoming'||row.state==='invited'||row.id.startsWith('legacy:');setDecision(row);
    if(row.state==='pending')setNotice('Denne brukeren må godta meldingsforespørselen. De blir varslet.');
    else if(row.state==='incoming')setNotice('Denne brukeren vil starte en samtale. Godta for å se meldingene.');
    else if(row.state==='invited')setNotice('Du er invitert til gruppen. Godta for å delta.');
    else if(row.state==='declined')setNotice('Meldingsforespørselen ble avslått.');
    else if(row.kind==='group'&&row.creator_id===state.me&&(await api(`/api/chats/${encodeURIComponent(row.id)}/invites`)).invites.length)setNotice('Inviterte brukere må godta invitasjonen. De blir varslet.');
    else setNotice('');
    if(row.unread&&!row.id.startsWith('legacy:')){
      await api(`/api/chats/${encodeURIComponent(row.id)}/read`,{method:'POST'});
      row.unread=0;for(const item of state.notifications)if(item.chat_id===row.id)item.read_at='seen';renderInbox();
    }
    if(row.state==='incoming'||row.state==='invited'){$('#messages').replaceChildren();$('#olderMessages').hidden=true;return;}
    await loadMessages(row.id);await renderDetails(row);
  }
  async function refresh(){
    const [chats,notifications]=await Promise.all([api('/api/chats'),api('/api/chat/notifications')]);
    state.chats=chats.chats;state.notifications=notifications.notifications;renderInbox();
    if(state.selection?.type==='chat'){
      const row=selectedRow();if(row)await updateConversation(row);else resetConversation();
    }
  }
  function renderSelected(){
    $('#selectedPeople').innerHTML=[...state.selected.values()].map(user=>`<span class="person-chip">${escapeHtml(user.name)}<button type="button" data-remove="${escapeHtml(user.id)}" aria-label="Fjern ${escapeHtml(user.name)}">×</button></span>`).join('');
    $('#confirmGroup').disabled=state.selected.size===0;
  }
  function renderSuggestions(users){
    state.suggestions=users;state.activeSuggestion=-1;const results=$('#searchResults');
    results.innerHTML=users.map((user,index)=>`<button class="search-result" id="suggestion-${index}" type="button" role="option" aria-selected="false" data-user="${escapeHtml(user.id)}"><img src="/assets/icons/chat-single.svg" alt=""><span>${escapeHtml(user.name)}</span></button>`).join('');
    results.hidden=!users.length;$('#usernameSearch').setAttribute('aria-expanded',String(users.length>0));
    $('#searchStatus').textContent=users.length?`${users.length} forslag`:'Ingen brukere funnet.';
  }
  async function lookup(query,sequence){
    state.searchController?.abort();const controller=new AbortController();state.searchController=controller;
    try{const result=await api('/api/chat/users?q='+encodeURIComponent(query),{signal:controller.signal});if(sequence!==state.searchSequence)return;renderSuggestions(result.users.filter(user=>!state.selected.has(user.id)));}
    catch(error){if(error.name==='AbortError'||sequence!==state.searchSequence)return;$('#searchResults').hidden=true;$('#searchStatus').textContent='Søket feilet. Prøv igjen.';}
  }
  function searchChanged(){
    clearTimeout(state.searchTimer);state.searchController?.abort();const query=$('#usernameSearch').value.trim(),sequence=++state.searchSequence;
    if([...query].length<2){state.suggestions=[];$('#searchResults').hidden=true;$('#usernameSearch').setAttribute('aria-expanded','false');$('#searchStatus').textContent=query?'Skriv minst to tegn.':'';return;}
    $('#searchStatus').textContent='Søker…';state.searchTimer=setTimeout(()=>lookup(query,sequence),250);
  }
  async function chooseUser(user){
    $('#searchResults').hidden=true;$('#usernameSearch').setAttribute('aria-expanded','false');
    if(state.mode==='group'){state.selected.set(user.id,user);renderSelected();$('#usernameSearch').value='';searchChanged();$('#usernameSearch').focus();return;}
    saveDraft();const result=await api(`/api/chat/direct/${encodeURIComponent(user.id)}`);
    if(result.chat_id){await refresh();const row=state.chats.find(item=>item.id===result.chat_id);if(row)await openChat(row);else throw Error('Samtalen er ikke tilgjengelig.');}
    else if(result.state==='incoming'){await refresh();const row=state.chats.find(item=>item.state==='incoming'&&item.name===user.name);if(row)await openChat(row);else throw Error('Åpne forespørselen i innboksen.');}
    else renderDraft(user,result.state==='declined');
  }
  async function sendMessage(event){
    event.preventDefault();if(state.sending||!state.selection)return;const selected=state.selection,draftId=draftKey(),current=draft(),body=$('#messageInput').value.trim(),files=[...current.files];if(!body&&!files.length)return;
    const signature=JSON.stringify([draftId,body,files.map(item=>[item.file.name,item.file.size,item.file.lastModified])]);
    const key=current.pendingSend?.signature===signature?current.pendingSend.key:crypto.randomUUID();current.pendingSend={signature,key};state.sending=true;$('#uploadStatus').textContent='Sender meldingen…';renderStage();
    try{
      for(let index=0;index<files.length;index++)await uploadStaged(files[index],selected,index+1,files.length);
      const payload={body,client_key:key,attachment_ids:files.map(item=>item.id)};
      if(selected.type==='draft'){
        const result=await api('/api/chats/direct',{method:'POST',body:{...payload,target_user_id:selected.target.id}});
        state.drafts.delete(draftId);if(draftKey()===draftId)$('#messageInput').value='';releaseFiles(files);await refresh();const row=state.chats.find(item=>item.id===result.chat_id);if(row&&state.selection===selected)await openChat(row);
      }else{
        await api(`/api/chats/${encodeURIComponent(selected.id)}/messages`,{method:'POST',body:payload});
        state.drafts.delete(draftId);if(draftKey()===draftId)$('#messageInput').value='';releaseFiles(files);await refresh();
      }
      $('#uploadStatus').textContent='Meldingen er sendt.';
    }finally{state.sending=false;renderStage();$('#pauseUpload').hidden=true;$('#uploadProgress').hidden=true;}
  }
  function releaseFiles(files){for(const item of files)URL.revokeObjectURL(item.url);}
  async function uploadStaged(item,selected,index,total){
    if(item.status==='staged')return;
    if(!item.file.size)throw Error('Tomme filer kan ikke deles.');
    if(!item.id){const input={name:item.file.name,bytes:item.file.size,media_kind:item.kind};if(selected.type==='draft')input.target_user_id=selected.target.id;else input.chat_id=selected.id;const started=await api('/api/chat-uploads/stage',{method:'POST',body:input});item.id=started.id;}
    const saved=await api('/api/chat-uploads/'+encodeURIComponent(item.id));let offset=saved.received;if(saved.status==='staged'){item.status='staged';renderStage();return;}
    $('#uploadProgress').hidden=false;$('#pauseUpload').hidden=false;state.pauseUpload=false;
    while(offset<item.file.size){if(state.pauseUpload){item.status='Pauset';renderStage();throw Error('Opplastingen er pauset. Trykk Send for å fortsette.');}
      const response=await fetch('/api/chat-uploads/'+encodeURIComponent(item.id),{method:'PATCH',headers:{'x-csrf-token':state.csrf,'x-upload-offset':String(offset)},body:item.file.slice(offset,offset+4*1024*1024)});
      const result=await response.json();if(!response.ok)throw Error(result.error?.message||'Opplasting feilet.');offset=result.received;
      $('#uploadProgress').value=Math.round(((index-1)+offset/item.file.size)/total*100);$('#uploadStatus').textContent=`Laster opp ${index} av ${total}: ${offset} / ${item.file.size} byte`;
    }
    item.status='staged';renderStage();
  }
  async function decideSelected(accept){
    const row=selectedRow();if(!row)return;
    const url=row.state==='invited'?`/api/chat/invites/${encodeURIComponent(row.invite_id)}`:`/api/chat/requests/${encodeURIComponent(row.request_id)}`;
    const result=await api(url,{method:'POST',body:{accept}});resetConversation();await refresh();
    if(accept&&result.chat_id){const joined=state.chats.find(item=>item.id===result.chat_id);if(joined)await openChat(joined);}
  }
  function openViewer(message){const files=message.attachments||[],dialog=$('#attachmentViewer'),body=$('#viewerBody');$('#viewerTitle').textContent=files.length===1?files[0].name:`${files.length} vedlegg`;body.replaceChildren();
    for(const file of files){const active=file.status==='ready'&&file.expires_at>new Date().toISOString(),row=document.createElement('div');row.className='viewer-file';const title=document.createElement('strong');title.textContent=file.name;row.append(title);
      if(active&&file.media_kind==='image'){const image=document.createElement('img');image.src=`/api/chat/files/${encodeURIComponent(file.id)}/preview`;image.alt=file.name;row.append(image);}
      if(active&&file.media_kind==='video'){const video=document.createElement('video');video.src=`/api/chat/files/${encodeURIComponent(file.id)}/preview`;video.controls=true;video.preload='metadata';row.append(video);}
      if(active){const link=document.createElement('a');link.href=`/api/chat/files/${encodeURIComponent(file.id)}/download`;link.textContent='Last ned';row.append(link);}else{const expired=document.createElement('span');expired.textContent='Filen er utløpt og permanent slettet.';row.append(expired);}body.append(row);
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
  $('#createGroup').addEventListener('click',()=>{state.mode='group';state.selected.clear();renderSelected();$('#groupBuilder').hidden=false;$('#inboxEmpty').hidden=true;$('#usernameSearch').focus();$('#searchStatus').textContent='Finn personer til gruppen.';});
  $('#cancelGroup').addEventListener('click',()=>{state.mode='inbox';state.selected.clear();$('#groupBuilder').hidden=true;searchChanged();renderInbox();});
  $('#selectedPeople').addEventListener('click',event=>{const button=event.target.closest('[data-remove]');if(!button)return;state.selected.delete(button.dataset.remove);renderSelected();searchChanged();});
  $('#confirmGroup').addEventListener('click',run(async()=>{if(!state.selected.size)return;const result=await api('/api/chats',{method:'POST',body:{name:$('#groupName').value,recipients:[...state.selected.keys()]}});state.mode='inbox';state.selected.clear();$('#groupBuilder').hidden=true;$('#groupName').value='';await refresh();const row=state.chats.find(item=>item.id===result.id);if(row)await openChat(row);}));
  $('#backToInbox').addEventListener('click',()=>{if(location.pathname.startsWith('/chat/'))history.back();else{resetConversation();$('#usernameSearch').focus();}});
  $('#messageForm').addEventListener('submit',run(sendMessage));
  $('#messageInput').addEventListener('input',()=>{saveDraft();renderStage();});
  $('#messageInput').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();$('#messageForm').requestSubmit();}});
  $('#acceptInvite').addEventListener('click',run(()=>decideSelected(true)));$('#declineInvite').addEventListener('click',run(()=>decideSelected(false)));
  $('#olderMessages').addEventListener('click',run(async()=>{state.historyLimit+=50;const row=selectedRow();if(row)await updateConversation(row);}));
  $('#toggleDetails').addEventListener('click',run(async()=>{state.detailsOpen=!state.detailsOpen;$('#conversationDetails').hidden=!state.detailsOpen;$('#toggleDetails').setAttribute('aria-expanded',String(state.detailsOpen));await renderDetails(selectedRow());}));
  $('#conversationDetails').addEventListener('click',run(async event=>{const block=event.target.closest('[data-block]'),cancel=event.target.closest('[data-cancel-invite]'),row=selectedRow();if(block&&confirm('Blokker denne brukeren fra direkte meldinger?')){await api('/api/chat/blocks',{method:'POST',body:{user_id:block.dataset.block}});await refresh();}if(cancel&&row){await api(`/api/chats/${row.id}/invites/${cancel.dataset.cancelInvite}`,{method:'DELETE'});await updateConversation(row);}}));
  $('#inviteForm').addEventListener('submit',run(async event=>{event.preventDefault();const row=selectedRow(),name=$('#inviteName').value.trim();const result=await api('/api/chat/users?q='+encodeURIComponent(name));const person=result.users.find(item=>item.name.toLocaleLowerCase('no')===name.toLocaleLowerCase('no'));if(!person)throw Error('Fant ikke brukeren.');await api(`/api/chats/${row.id}/invites`,{method:'POST',body:{recipient_id:person.id}});$('#inviteName').value='';await updateConversation(row);}));
  $('#leaveChat').addEventListener('click',run(async()=>{const row=selectedRow();if(!row)return;await api(`/api/chats/${row.id}/membership`,{method:'DELETE'});resetConversation();await refresh();}));
  for(const [button,input] of [['pickImage','imageInput'],['pickVideo','videoInput'],['pickFile','fileInput']])$('#'+button).addEventListener('click',()=>$('#'+input).click());
  for(const id of ['imageInput','videoInput','fileInput'])$('#'+id).addEventListener('change',event=>{const current=draft();for(const file of event.target.files){if(current.files.length>=12){fail(Error('Velg høyst 12 vedlegg.'));break;}current.files.push({file,kind:mediaKind(file),url:URL.createObjectURL(file),id:null,status:''});}event.target.value='';renderStage();$('#uploadStatus').textContent='Vedlegg valgt. Trykk Send for å dele.';});
  $('#stagedFiles').addEventListener('click',run(async event=>{const button=event.target.closest('[data-remove-file]');if(!button)return;const current=draft(),[item]=current.files.splice(Number(button.dataset.removeFile),1);if(item?.id)await api('/api/chat-uploads/'+encodeURIComponent(item.id),{method:'DELETE'});if(item)URL.revokeObjectURL(item.url);current.pendingSend=null;renderStage();}));
  $('#messages').addEventListener('click',event=>{const button=event.target.closest('[data-view-message]');if(!button)return;const message=state.renderedMessages?.find(item=>item.id===Number(button.dataset.viewMessage));if(message)openViewer(message);});
  $('#closeViewer').addEventListener('click',()=>$('#attachmentViewer').close());
  $('#attachmentViewer').addEventListener('close',()=>{for(const video of $('#viewerBody').querySelectorAll('video'))video.pause();});
  $('#pauseUpload').addEventListener('click',()=>{state.pauseUpload=true;});
  $('#visible').addEventListener('change',run(async()=>{state.visible=$('#visible').checked;await api('/api/chat/presence',{method:'PUT',body:{visible:state.visible}});await renderDetails(selectedRow());}));
  function connectSocket(){const url=new URL('/api/chat-socket',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';const socket=new WebSocket(url);state.socket=socket;const status=$('#connectionStatus');status.hidden=false;status.textContent='Kobler til chat…';
    socket.onopen=()=>{state.reconnect=0;status.hidden=true;run(refresh)();};
    socket.onmessage=run(async event=>{const message=JSON.parse(event.data);if(message.type==='connected')return;await refresh();});
    socket.onclose=()=>{if(state.socket!==socket)return;status.hidden=false;status.textContent='Chat er frakoblet. Kobler til igjen…';const delay=Math.min(30000,1000*2**Math.min(state.reconnect++,5));setTimeout(connectSocket,delay);};
    socket.onerror=()=>socket.close();
  }
  async function resolveRoute(){const match=/^\/chat\/([0-9a-f-]{36})$/i.exec(location.pathname);if(!match){resetConversation();return;}const row=state.chats.find(item=>item.id===match[1]);if(row)await openChat(row,{route:false});else{resetConversation();setNotice('Samtalen finnes ikke eller du har ikke tilgang.');}}
  async function init(){try{const me=await api('/api/me');state.me=me.user.id;state.csrf=me.csrf_token||decodeURIComponent(document.cookie.match(/(?:^|; )hereme_csrf=([^;]+)/)?.[1]||'');await api('/api/chat/presence',{method:'PUT',body:{visible:state.visible}});await refresh();await resolveRoute();connectSocket();window.addEventListener('popstate',()=>run(resolveRoute)());setInterval(()=>run(async()=>{await api('/api/chat/presence',{method:'PUT',body:{visible:state.visible}});if(state.socket?.readyState!==WebSocket.OPEN)await refresh();})(),30000);}catch(error){if(error.status===401||/aktiv sesjon/i.test(error.message)){window.HeremeAuth.open({message:'Logg inn eller opprett en konto for å bruke chat.',onSuccess:()=>location.reload(),onCancel:()=>location.assign('/')});return;}throw error;}}
  run(init)();
})();
