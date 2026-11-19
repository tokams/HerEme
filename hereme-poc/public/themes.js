'use strict';
(function(root) {
  // Supplied Square Wall Design Kit v3 palette; exactly five canonical presets.
  const themes=Object.freeze([
    {id:'question',label:'Spørsmål',symbol:'?',description:'Spør folk i nabolaget.',color:'#719ad2',background:'#294267',rgb:'73,114,173'},
    {id:'opinion',label:'Mening',symbol:'“',description:'Tanker, meninger og små utblåsninger.',color:'#bb80ad',background:'#623854',rgb:'154,85,135'},
    {id:'story',label:'Historie',symbol:'✳',description:'Små øyeblikk fra livet her.',color:'#b4a36b',background:'#595039',rgb:'158,139,78'},
    {id:'alert',label:'Varsel',symbol:'!',description:'Viktige beskjeder, mistet eller funnet.',color:'#cb8177',background:'#713d3e',rgb:'175,91,83'},
    {id:'tip',label:'Tips',symbol:'↗',description:'Noe fint å prøve, se eller gjøre.',color:'#6fb4a1',background:'#2e5e54',rgb:'66,143,125'}
  ].map(Object.freeze));
  function get(id){const theme=themes.find(item=>item.id===id);if(!theme)throw new Error('Unknown poster category: '+id);return theme;}
  const api={themes,get,ids:Object.freeze(themes.map(theme=>theme.id))};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HeremeThemes=api;
})(globalThis);
