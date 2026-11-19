'use strict';
window.HeremeLocations={
  body(areas,geometry,selected){
    const E=HeremePoster.escape,chosen=new Set(selected),features=geometry?.features||[];
    let map='<p class="notice">Kartdata er ikke tilgjengelig. Bruk områdelista.</p>';
    if(features.length){
      const points=[];const collect=value=>{if(Array.isArray(value)&&typeof value[0]==='number')points.push(value);else if(Array.isArray(value))value.forEach(collect);};features.forEach(feature=>collect(feature.geometry.coordinates));
      const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),project=p=>[(p[0]-minX)/(maxX-minX||1)*960+20,980-(p[1]-minY)/(maxY-minY||1)*960];
      const ring=values=>values.map((point,index)=>`${index?'L':'M'}${project(point).map(n=>n.toFixed(1)).join(' ')}`).join(' ')+'Z';
      const paths=features.map(feature=>{const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.type==='MultiPolygon'?feature.geometry.coordinates:[];const d=polygons.flatMap(polygon=>polygon.map(ring)).join(' ');return `<path d="${d}" data-action="area-toggle" data-area-id="${E(feature.id)}" role="button" tabindex="0" aria-label="${E(feature.properties.name)}" aria-pressed="${chosen.has(feature.id)}"></path>`;}).join('');
      map=`<svg class="norway-map" viewBox="0 0 1000 1000" aria-label="Velg områder på kartet">${paths}</svg>`;
    }
    const list=areas.map(area=>`<button class="area-list-item" data-action="area-toggle" data-area-id="${E(area.id)}" aria-pressed="${chosen.has(area.id)}"><span>${E(area.name)}</span><small>${E(area.kind)}</small></button>`).join('');
    return `<p>Velg områdene du vil følge. Innlegg uten sted forblir synlige.</p><div class="area-picker">${map}<div class="area-list" aria-label="Områdeliste">${list}</div></div>`;
  }
};

