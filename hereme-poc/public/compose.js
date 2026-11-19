'use strict';
window.HeremeCompose={
  preview(state) {
    return {title:state.draft.title,category:state.category,type:state.editorImage?'image':'text',
      image_zoom:state.editorZoom,image_x:state.editorX,image_y:state.editorY,text_position:state.textPosition,synthetic_demo:state.editorSynthetic};
  },
  body(state) {
    const E=HeremePoster.escape;
    const range=(id,label,min,max,step,value)=>`<label class="field" for="${id}"><span>${label}</span><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
    return `<form id="composeForm" class="composer">
      <div class="compose-fields">
        <fieldset class="category-picker"><legend>1. Ka vil du dele?</legend><div class="category-choices">${HeremeThemes.themes.map(t=>`<label class="category-choice theme-${t.id}"><input type="radio" name="postCategory" value="${t.id}" ${state.category===t.id?'checked':''}><span><b aria-hidden="true">${t.symbol}</b> ${E(t.label)}</span></label>`).join('')}</div><p id="categoryHint" class="muted-note">${E(HeremeThemes.get(state.category).description)}</p></fieldset>
        <label class="field" for="postTitle"><span>2. Overskrift</span><input id="postTitle" minlength="3" maxlength="160" required value="${E(state.draft.title)}" placeholder="Ka har du på hjerta?" autocomplete="off"></label>
        <fieldset class="photo-field"><legend>3. Bilde (valgfritt)</legend><div class="photo-pickers"><label class="btn btn-secondary" for="postCameraInput">◉ Ta bilde<input id="postCameraInput" type="file" accept="image/*" capture="environment"></label><label class="btn btn-secondary" for="postFileInput">▧ Velg bilde<input id="postFileInput" type="file" accept="image/*"></label>${state.editorImage?'<button class="text-button" type="button" data-action="remove-photo">Fjern</button>':''}</div><p class="muted-note" id="photoFilename">${state.editorFile?E(state.editorFile.name):'Uten bilde får overskriften hele plakaten.'}</p></fieldset>
        <label class="field" for="postBody"><span>Fortell mer (valgfritt)</span><textarea id="postBody" maxlength="3000" placeholder="Litt mer om det du deler …">${E(state.draft.body)}</textarea></label>
        <details class="link-field" ${state.draft.link?'open':''}><summary>Legg til en lenke</summary><label class="field" for="postLink"><span>Lenke til kilden</span><input id="postLink" type="url" value="${E(state.draft.link)}" placeholder="https://"></label></details>
        <label class="field desktop-placement" for="textPosition"><span>Tekstplassering</span><select id="textPosition">${[['auto','Malens standard'],['top','Øverst'],['center','Midtstilt'],['bottom','Nederst']].map(([value,label])=>`<option value="${value}" ${state.textPosition===value?'selected':''}>${label}</option>`).join('')}</select><small class="muted-note">Samme faste skrift og tema. Bare plasseringen endres.</small></label>
        ${state.editorImage?`<details class="desktop-crop"><summary>Tilpass bildeutsnitt</summary>${range('editorZoom','Zoom',1,3,.05,state.editorZoom)}${range('editorX','Vannrett',0,100,1,state.editorX)}${range('editorY','Loddrett',0,100,1,state.editorY)}<p class="muted-note">Utsnittet lagres. Skrift og farger følger kategorien.</p></details>`:''}
      </div>
      <div class="compose-preview"><p class="eyebrow">Slik blir plakaten</p><div id="posterPreview">${HeremePoster.surface(this.preview(state),{previewUrl:state.tempUrl||''})}</div><p class="muted-note">På den samme veggen, sammen med alle andre.</p></div>
    </form>`;
  }
};
