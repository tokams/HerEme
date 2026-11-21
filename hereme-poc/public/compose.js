'use strict';
window.HeremeCompose={
  t(key,params){return HeremeI18n.t(`wall.compose.${key}`,params);},
  preview(state) {
    return {title:state.draft.title,category:state.category,type:state.postMode||'text',
      image_zoom:state.editorZoom,image_x:state.editorX,image_y:state.editorY,text_position:state.textPosition,synthetic_demo:state.editorSynthetic};
  },
  modes(state) {
    const icon=HeremeIcons.icon;
    const modes=[
      ['text','type',this.t('mode_text'),this.t('mode_text_help')],
      ['image','image',this.t('mode_image'),this.t('mode_image_help')]
    ];
    if(state.meta?.features?.video)modes.push(['video','video',this.t('mode_video'),this.t('mode_video_help')]);
    return `<section class="post-type-picker" aria-labelledby="postTypeTitle"><p class="eyebrow">${this.t('new_post')}</p><h3 id="postTypeTitle">${this.t('choose_type')}</h3><div class="post-type-choices">${modes.map(([value,iconName,label,help])=>`<label class="post-type-choice mode-${value}"><input type="radio" name="postMode" value="${value}" ${state.postMode===value?'checked':''}><span class="post-type-card"><span class="post-type-icon">${icon(iconName)}</span><strong>${label}</strong><small>${help}</small></span></label>`).join('')}</div></section>`;
  },
  imageWorkspace(state) {
    const E=HeremePoster.escape,icon=HeremeIcons.icon;
    return `<fieldset class="media-workspace image-workspace"><legend><span>${icon('image')}</span>${this.t('choose_image')}</legend><div class="media-actions"><label class="media-action" for="postCameraInput">${icon('camera')}<span><b>${this.t('take_photo')}</b><small>${this.t('open_camera')}</small></span><input id="postCameraInput" type="file" accept="image/*" capture="environment"></label><label class="media-action" for="postFileInput">${icon('image')}<span><b>${this.t('choose_image')}</b><small>${this.t('from_device')}</small></span><input id="postFileInput" type="file" accept="image/*"></label>${state.editorImage?`<button class="text-button" type="button" data-action="remove-photo">${this.t('choose_other_image')}</button>`:''}</div><p class="media-status" id="photoFilename">${state.editorFile?E(state.editorFile.name):this.t('no_image')}</p></fieldset>`;
  },
  videoWorkspace(state) {
    const E=HeremePoster.escape,icon=HeremeIcons.icon;
    return `<fieldset class="media-workspace video-workspace"><legend><span>${icon('video')}</span>${this.t('choose_video')}</legend><div class="media-actions"><label class="media-action" for="postVideoCameraInput">${icon('camera')}<span><b>${this.t('record_video')}</b><small>${this.t('open_camera_mic')}</small></span><input id="postVideoCameraInput" type="file" accept="video/*" capture="environment"></label><label class="media-action" for="postVideoInput">${icon('video')}<span><b>${this.t('choose_video')}</b><small>${this.t('video_limit')}</small></span><input id="postVideoInput" type="file" accept="video/*"></label>${state.editorVideo?`<button class="text-button" type="button" data-action="remove-photo">${this.t('choose_other_video')}</button>`:''}</div><p class="media-status" id="photoFilename">${state.editorFile?E(state.editorFile.name)+` · ${this.t('seconds',{count:Math.ceil(state.videoDuration)})}`:this.t('no_video')}</p>${state.videoProgress?`<div class="upload-progress"><progress max="100" value="${state.videoProgress}"></progress> <span>${state.videoProgress}%</span> ${state.videoUploading?`<button class="text-button" type="button" data-action="${state.videoPaused?'resume-upload':'pause-upload'}">${this.t(state.videoPaused?'resume':'pause')}</button><button class="text-button" type="button" data-action="cancel-upload">${this.t('cancel')}</button>`:''}</div>`:''}</fieldset>`;
  },
  crop(state) {
    if(!state.editorImage)return '';
    const range=(id,label,min,max,step,value)=>`<label class="field" for="${id}"><span>${label}</span><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
    return `<details class="picture-crop" open><summary>${this.t('adjust_crop')}</summary>${range('editorZoom',this.t('zoom'),1,3,.05,state.editorZoom)}${range('editorX',this.t('horizontal'),0,100,1,state.editorX)}${range('editorY',this.t('vertical'),0,100,1,state.editorY)}</details>`;
  },
  editor(state) {
    const back=`<button class="text-button flow-back" type="button" data-action="compose-back">← ${this.t('choose_other_type')}</button>`;
    if(state.postMode==='text')return `${back}<label class="field primary-writing" for="postBody"><span>${this.t('what_say')}</span><textarea id="postBody" maxlength="3000" autofocus placeholder="${this.t('write_placeholder')}">${HeremePoster.escape(state.draft.body)}</textarea></label>`;
    if(state.postMode==='image')return `${back}${this.imageWorkspace(state)}${this.crop(state)}`;
    return `${back}${this.videoWorkspace(state)}`;
  },
  finish(state) {
    const E=HeremePoster.escape;
    const feeling=this.t(state.postMode==='image'?'image_feeling':'video_feeling');
    return `<button class="text-button flow-back" type="button" data-action="compose-back">← ${this.t('back')}</button><p class="eyebrow">${this.t('last_step')}</p><h3>${this.t('ready_post')}</h3><label class="field" for="postTitle"><span>${this.t('give_title')}</span><input id="postTitle" minlength="3" maxlength="160" required autofocus value="${E(state.draft.title)}" placeholder="${this.t('title_placeholder')}" autocomplete="off"></label>${state.postMode==='text'?'':`<label class="field" for="postBody"><span>${this.t('tell_more')}</span><textarea id="postBody" maxlength="3000" placeholder="${feeling}">${E(state.draft.body)}</textarea></label>`}<fieldset class="category-picker"><legend>${this.t('choose_style')}</legend><div class="category-choices">${HeremeThemes.themes.map(theme=>{const localized=HeremeThemes.get(theme.id);return `<label class="category-choice theme-${theme.id}"><input type="radio" name="postCategory" value="${theme.id}" ${state.category===theme.id?'checked':''}><span><b aria-hidden="true">${theme.symbol}</b> ${E(localized.label)}</span></label>`;}).join('')}</div><p id="categoryHint" class="muted-note">${E(HeremeThemes.get(state.category).description)}</p></fieldset>${state.postMode==='text'?`<section class="poster-upgrade"><p><b>${this.t('prefer_photo')}</b></p><p class="muted-note">${this.t('continue_without')}</p><div class="media-actions"><label class="media-action" for="postCameraInput">${HeremeIcons.icon('camera')}<span><b>${this.t('take_photo')}</b></span><input id="postCameraInput" type="file" accept="image/*" capture="environment"></label><label class="media-action" for="postFileInput">${HeremeIcons.icon('image')}<span><b>${this.t('choose_image')}</b></span><input id="postFileInput" type="file" accept="image/*"></label></div></section><details class="link-field" ${state.draft.link?'open':''}><summary>${this.t('add_link')}</summary><label class="field" for="postLink"><span>${this.t('link')}</span><input id="postLink" type="url" value="${E(state.draft.link)}" placeholder="https://"></label></details>`:''}<label class="field desktop-placement" for="textPosition"><span>${this.t('text_position')}</span><select id="textPosition">${['auto','top','center','bottom'].map(value=>`<option value="${value}" ${state.textPosition===value?'selected':''}>${this.t(`position_${value}`)}</option>`).join('')}</select></label>`;
  },
  body(state) {
    if(state.composeStep==='select')return `<form id="composeForm" class="composer flow-select"><div class="compose-fields">${this.modes(state)}</div></form>`;
    const finishing=state.composeStep==='finish';
    return `<form id="composeForm" class="composer flow-${state.composeStep} mode-${state.postMode}"><div class="compose-fields">${finishing?this.finish(state):this.editor(state)}</div>${state.postMode!=='text'||finishing?`<div class="compose-preview"><p class="eyebrow">${this.t(state.postMode==='video'?'video_cover':state.postMode==='image'?'photo_poster':'poster')}</p><div id="posterPreview">${HeremePoster.surface(this.preview(state),{previewUrl:state.videoThumbnail||state.tempUrl||''})}${state.postMode==='video'?'<span class="video-preview-badge">'+HeremeIcons.icon('video')+' '+this.t('video')+'</span>':''}</div></div>`:''}</form>`;
  }
};
