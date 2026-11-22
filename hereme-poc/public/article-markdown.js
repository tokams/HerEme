'use strict';
((root)=>{

const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function safeUrl(value,mediaUrls){
  if(mediaUrls.has(value))return value;
  try{const url=new URL(value);if(['https:','http:'].includes(url.protocol))return url.href;}catch{}
  return null;
}
function inline(source,mediaUrls){
  const tokens=[];let text=escape(source).replace(/`([^`\n]+)`/g,(_,code)=>{tokens.push(`<code>${code}</code>`);return `\u0000${tokens.length-1}\u0000`;});
  text=text.replace(/!\[([^\]]*)\]\(([^\s)]+)\)/g,(_,alt,url)=>{const safe=safeUrl(url,mediaUrls);if(!safe||!mediaUrls.has(safe))return escape(`![${alt}](${url})`);tokens.push(`<img src="${escape(safe)}" alt="${alt}" loading="lazy">`);return `\u0000${tokens.length-1}\u0000`;});
  text=text.replace(/\[([^\]]+)\]\(([^\s)]+)\)/g,(_,label,url)=>{const safe=safeUrl(url,mediaUrls);if(!safe)return label;tokens.push(`<a href="${escape(safe)}" rel="noopener noreferrer nofollow" target="_blank">${label}</a>`);return `\u0000${tokens.length-1}\u0000`;});
  text=text.replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*\n]+)\*/g,'<em>$1</em>');
  return text.replace(/\u0000(\d+)\u0000/g,(_,index)=>tokens[Number(index)]);
}
function render(source,mediaUrls=new Set()){
  const blocks=[];let paragraph=[],list=[];
  const flush=()=>{if(paragraph.length){blocks.push(`<p>${inline(paragraph.join(' '),mediaUrls)}</p>`);paragraph=[];}if(list.length){blocks.push(`<ul>${list.map(item=>`<li>${inline(item,mediaUrls)}</li>`).join('')}</ul>`);list=[];}};
  for(const line of String(source).replace(/\r\n?/g,'\n').split('\n')){
    const heading=/^(#{1,6})\s+(.+)$/.exec(line),item=/^\s*[-*]\s+(.+)$/.exec(line);
    if(!line.trim()){flush();continue;}
    if(heading){flush();blocks.push(`<h${heading[1].length}>${inline(heading[2],mediaUrls)}</h${heading[1].length}>`);continue;}
    if(item){if(paragraph.length)flush();list.push(item[1]);continue;}
    if(list.length)flush();paragraph.push(line);
  }
  flush();return blocks.join('');
}
function source({title,abstract,category,chapters}){
  const yaml=value=>JSON.stringify(value);
  return `---\ntitle: ${yaml(title)}\nabstract: ${yaml(abstract)}\ncategory: ${yaml(category)}\nformat: article\n---\n\n${chapters.map(chapter=>`## ${chapter.heading}\n\n${chapter.markdown}`).join('\n\n')}`;
}
const api={render,source,escape};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HeremeArticleMarkdown=api;
})(globalThis);
