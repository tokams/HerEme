'use strict';
(function(root) {
  // Supplied Square Wall Design Kit v3 palette; exactly five canonical presets.
  const fallback={question:{label:'Spørsmål',description:'Spør folk i nabolaget.'},opinion:{label:'Mening',description:'Tanker, meninger og små utblåsninger.'},story:{label:'Historie',description:'Små øyeblikk fra livet her.'},alert:{label:'Varsel',description:'Viktige beskjeder, mistet eller funnet.'},tip:{label:'Tips',description:'Noe fint å prøve, se eller gjøre.'}};
  const t=(key)=>root.HeremeI18n?.t(`wall.theme.${key}`)||key.split('.').reduce((value,part)=>value?.[part],fallback)||key;
  const themes=Object.freeze([
    {id:'question',symbol:'?',color:'#719ad2',background:'#294267',rgb:'73,114,173'},
    {id:'opinion',symbol:'“',color:'#bb80ad',background:'#623854',rgb:'154,85,135'},
    {id:'story',symbol:'✳',color:'#b4a36b',background:'#595039',rgb:'158,139,78'},
    {id:'alert',symbol:'!',color:'#cb8177',background:'#713d3e',rgb:'175,91,83'},
    {id:'tip',symbol:'↗',color:'#6fb4a1',background:'#2e5e54',rgb:'66,143,125'}
  ].map(Object.freeze));
  function get(id){const theme=themes.find(item=>item.id===id);if(!theme)throw new Error('Unknown poster category: '+id);return {...theme,label:t(`${id}.label`),description:t(`${id}.description`)};}
  const api={themes,get,ids:Object.freeze(themes.map(theme=>theme.id))};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HeremeThemes=api;
})(globalThis);
