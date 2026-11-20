'use strict';
window.HeremeCompose={
  preview(state) {
    return {title:state.draft.title,category:state.category,type:state.postMode||'text',
      image_zoom:state.editorZoom,image_x:state.editorX,image_y:state.editorY,text_position:state.textPosition,synthetic_demo:state.editorSynthetic};
  },
  modes(state) {
    const icon=HeremeIcons.icon;
    const modes=[
      ['text','type','Bare innlegg','Skriv det du vil dele.'],
      ['image','image','Bildeplakat','Ta eller velg et bilde.']
    ];
    if(state.meta?.features?.video)modes.push(['video','video','Videoplakat','Ta opp eller velg video.']);
    return `<section class="post-type-picker" aria-labelledby="postTypeTitle"><p class="eyebrow">Nytt innlegg</p><h3 id="postTypeTitle">Ka vil du legge ut?</h3><div class="post-type-choices">${modes.map(([value,iconName,label,help])=>`<label class="post-type-choice mode-${value}"><input type="radio" name="postMode" value="${value}" ${state.postMode===value?'checked':''}><span class="post-type-card"><span class="post-type-icon">${icon(iconName)}</span><strong>${label}</strong><small>${help}</small></span></label>`).join('')}</div></section>`;
  },
  imageWorkspace(state) {
    const E=HeremePoster.escape,icon=HeremeIcons.icon;
    return `<fieldset class="media-workspace image-workspace"><legend><span>${icon('image')}</span>Velg bildet</legend><div class="media-actions"><label class="media-action" for="postCameraInput">${icon('camera')}<span><b>Ta bilde</b><small>Åpne kameraet</small></span><input id="postCameraInput" type="file" accept="image/*" capture="environment"></label><label class="media-action" for="postFileInput">${icon('image')}<span><b>Velg bilde</b><small>Fra denne enheten</small></span><input id="postFileInput" type="file" accept="image/*"></label>${state.editorImage?'<button class="text-button" type="button" data-action="remove-photo">Velg et annet bilde</button>':''}</div><p class="media-status" id="photoFilename">${state.editorFile?E(state.editorFile.name):'Ikke valgt bilde ennå.'}</p></fieldset>`;
  },
  videoWorkspace(state) {
    const E=HeremePoster.escape,icon=HeremeIcons.icon;
    return `<fieldset class="media-workspace video-workspace"><legend><span>${icon('video')}</span>Velg videoen</legend><div class="media-actions"><label class="media-action" for="postVideoCameraInput">${icon('camera')}<span><b>Ta opp video</b><small>Åpner kamera og mikrofon</small></span><input id="postVideoCameraInput" type="file" accept="video/*" capture="environment"></label><label class="media-action" for="postVideoInput">${icon('video')}<span><b>Velg video</b><small>Maks 3 minutter</small></span><input id="postVideoInput" type="file" accept="video/*"></label>${state.editorVideo?'<button class="text-button" type="button" data-action="remove-photo">Velg en annen video</button>':''}</div><p class="media-status" id="photoFilename">${state.editorFile?E(state.editorFile.name)+` · ${Math.ceil(state.videoDuration)} sek`:'Ikke valgt video ennå.'}</p>${state.videoProgress?`<div class="upload-progress"><progress max="100" value="${state.videoProgress}"></progress> <span>${state.videoProgress}%</span> ${state.videoUploading?`<button class="text-button" type="button" data-action="${state.videoPaused?'resume-upload':'pause-upload'}">${state.videoPaused?'Fortsett':'Pause'}</button><button class="text-button" type="button" data-action="cancel-upload">Avbryt</button>`:''}</div>`:''}</fieldset>`;
  },
  crop(state) {
    if(!state.editorImage)return '';
    const range=(id,label,min,max,step,value)=>`<label class="field" for="${id}"><span>${label}</span><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
    return `<details class="picture-crop" open><summary>Juster utsnitt</summary>${range('editorZoom','Zoom',1,3,.05,state.editorZoom)}${range('editorX','Vannrett',0,100,1,state.editorX)}${range('editorY','Loddrett',0,100,1,state.editorY)}</details>`;
  },
  editor(state) {
    const back='<button class="text-button flow-back" type="button" data-action="compose-back">← Velg en annen type</button>';
    if(state.postMode==='text')return `${back}<label class="field primary-writing" for="postBody"><span>Ka vil du si?</span><textarea id="postBody" maxlength="3000" autofocus placeholder="Skriv det du vil dele …">${HeremePoster.escape(state.draft.body)}</textarea></label>`;
    if(state.postMode==='image')return `${back}${this.imageWorkspace(state)}${this.crop(state)}`;
    return `${back}${this.videoWorkspace(state)}`;
  },
  finish(state) {
    const E=HeremePoster.escape;
    const feeling=state.postMode==='image'?'Fortell med egne ord hva du tenkte eller følte da du tok bildet …':'Fortell med egne ord hva du tenkte eller følte da du tok opp videoen …';
    return `<button class="text-button flow-back" type="button" data-action="compose-back">← Tilbake</button><p class="eyebrow">Siste steg</p><h3>Gjør innlegget klart</h3><label class="field" for="postTitle"><span>Gi det en tittel</span><input id="postTitle" minlength="3" maxlength="160" required autofocus value="${E(state.draft.title)}" placeholder="En kort, tydelig tittel" autocomplete="off"></label>${state.postMode==='text'?'':`<label class="field" for="postBody"><span>Fortell litt mer (valgfritt)</span><textarea id="postBody" maxlength="3000" placeholder="${feeling}">${E(state.draft.body)}</textarea></label>`}<fieldset class="category-picker"><legend>Velg plakatstil</legend><div class="category-choices">${HeremeThemes.themes.map(t=>`<label class="category-choice theme-${t.id}"><input type="radio" name="postCategory" value="${t.id}" ${state.category===t.id?'checked':''}><span><b aria-hidden="true">${t.symbol}</b> ${E(t.label)}</span></label>`).join('')}</div><p id="categoryHint" class="muted-note">${E(HeremeThemes.get(state.category).description)}</p></fieldset>${state.postMode==='text'?`<section class="poster-upgrade"><p><b>Vil du heller lage en bildeplakat?</b></p><p class="muted-note">Du kan fortsatt fortsette uten bilde.</p><div class="media-actions"><label class="media-action" for="postCameraInput">${HeremeIcons.icon('camera')}<span><b>Ta bilde</b></span><input id="postCameraInput" type="file" accept="image/*" capture="environment"></label><label class="media-action" for="postFileInput">${HeremeIcons.icon('image')}<span><b>Velg bilde</b></span><input id="postFileInput" type="file" accept="image/*"></label></div></section><details class="link-field" ${state.draft.link?'open':''}><summary>Legg til en lenke</summary><label class="field" for="postLink"><span>Lenke</span><input id="postLink" type="url" value="${E(state.draft.link)}" placeholder="https://"></label></details>`:''}<label class="field desktop-placement" for="textPosition"><span>Tekstplassering</span><select id="textPosition">${[['auto','Malens standard'],['top','Øverst'],['center','Midtstilt'],['bottom','Nederst']].map(([value,label])=>`<option value="${value}" ${state.textPosition===value?'selected':''}>${label}</option>`).join('')}</select></label>`;
  },
  body(state) {
    if(state.composeStep==='select')return `<form id="composeForm" class="composer flow-select"><div class="compose-fields">${this.modes(state)}</div></form>`;
    const finishing=state.composeStep==='finish';
    return `<form id="composeForm" class="composer flow-${state.composeStep} mode-${state.postMode}"><div class="compose-fields">${finishing?this.finish(state):this.editor(state)}</div>${state.postMode!=='text'||finishing?`<div class="compose-preview"><p class="eyebrow">${state.postMode==='video'?'Videoforside':state.postMode==='image'?'Bildeplakat':'Plakat'}</p><div id="posterPreview">${HeremePoster.surface(this.preview(state),{previewUrl:state.videoThumbnail||state.tempUrl||''})}${state.postMode==='video'?'<span class="video-preview-badge">'+HeremeIcons.icon('video')+' Video</span>':''}</div></div>`:''}</form>`;
  }
};
