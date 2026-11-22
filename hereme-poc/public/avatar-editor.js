'use strict';
(function(root){
  function setup({api,t,onSaved}){
    const $=selector=>document.querySelector(selector),dialog=$('#avatarDialog');
    let file=null,image=null,url=null,origin=null,busy=false;
    const fail=message=>{$('#avatarError').textContent=message;$('#avatarError').hidden=false;};
    const clearError=()=>{$('#avatarError').textContent='';$('#avatarError').hidden=true;};
    const release=(clearInput=true)=>{if(url)URL.revokeObjectURL(url);url=null;file=null;image=null;if(clearInput)$('#avatarFile').value='';$('#avatarPreview').hidden=true;$('#avatarCrop').hidden=true;$('#avatarSave').disabled=true;};
    function draw(){
      if(!image)return;
      const zoom=Number($('#avatarZoom').value),x=Number($('#avatarX').value),y=Number($('#avatarY').value);
      const side=Math.max(1,Math.floor(Math.min(image.naturalWidth,image.naturalHeight)/zoom));
      const left=Math.round((image.naturalWidth-side)*x/100),top=Math.round((image.naturalHeight-side)*y/100);
      const canvas=$('#avatarPreview'),context=canvas.getContext('2d');context.clearRect(0,0,256,256);context.drawImage(image,left,top,side,side,0,0,256,256);
    }
    function restoreFocus(){const target=origin?.isConnected?origin:document.querySelector('[data-action="profile-avatar-edit"]');target?.focus({preventScroll:true});}
    function close(){if(busy)return;dialog.close();release();clearError();restoreFocus();}
    function open(current,trigger){
      origin=trigger;release();clearError();
      for(const [id,key] of Object.entries({avatarDialogTitle:'profile.avatar_title',avatarPrivacy:'profile.avatar_public',avatarZoomLabel:'profile.avatar_zoom',avatarXLabel:'profile.avatar_horizontal',avatarYLabel:'profile.avatar_vertical',avatarSave:'profile.avatar_save',avatarRemove:'profile.avatar_remove',avatarCancel:'profile.avatar_cancel'}))$('#'+id).textContent=t(key);
      $('#avatarClose').setAttribute('aria-label',t('profile.avatar_cancel'));
      $('#avatarRemove').hidden=!current.avatar_url;
      $('#avatarRemove').disabled=false;
      dialog.showModal();$('#avatarFile').focus();
    }
    $('#avatarFile').addEventListener('change',()=>{
      const selected=$('#avatarFile').files?.[0]||null;release(false);clearError();file=selected;
      if(!file)return;
      if(file.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type)){fail(t('profile.avatar_file_error'));release();return;}
      url=URL.createObjectURL(file);image=new Image();image.onload=()=>{$('#avatarPreview').hidden=false;$('#avatarCrop').hidden=false;$('#avatarSave').disabled=false;for(const id of ['avatarZoom','avatarX','avatarY'])$('#'+id).value=id==='avatarZoom'?'1':'50';draw();};image.onerror=()=>{fail(t('profile.avatar_file_error'));release();};image.src=url;
    });
    for(const id of ['avatarZoom','avatarX','avatarY'])$('#'+id).addEventListener('input',draw);
    $('#avatarSave').addEventListener('click',async()=>{
      if(!file||busy)return;busy=true;clearError();$('#avatarSave').disabled=true;
      try{const form=new FormData();form.append('image',file);for(const [name,id] of [['x','avatarX'],['y','avatarY'],['zoom','avatarZoom']])form.append(name,$('#'+id).value);const result=await api('/api/me/avatar',{method:'POST',form});onSaved(result);busy=false;close();}
      catch(error){busy=false;$('#avatarSave').disabled=false;fail(error.message);}
    });
    $('#avatarRemove').addEventListener('click',async()=>{
      if(busy)return;busy=true;clearError();$('#avatarRemove').disabled=true;
      try{const result=await api('/api/me/avatar',{method:'DELETE'});onSaved(result);busy=false;close();}
      catch(error){busy=false;$('#avatarRemove').disabled=false;fail(error.message);}
    });
    for(const id of ['avatarClose','avatarCancel'])$('#'+id).addEventListener('click',close);
    dialog.addEventListener('cancel',event=>{if(busy){event.preventDefault();return;}release();clearError();restoreFocus();});
    return {open};
  }
  root.HeremeAvatarEditor={setup};
})(globalThis);
