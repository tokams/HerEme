'use strict';
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const ORIGIN='https://hereme.no';
function render(shell,post,image){
  const title=post?`${post.title} · HerEme`:'HerEme · Plakatveggen';
  const excerpt=post?String(post.body||post.title).replace(/\s+/g,' ').slice(0,180):'HerEme. En lokal plakatvegg for spørsmål, meninger, historier, varsler og tips.';
  const description=post?.synthetic_demo?`Syntetisk demo. ${excerpt}`:excerpt;
  const url=post?`${ORIGIN}/?post=${post.id}`:`${ORIGIN}/`;
  const imageUrl=image?`${ORIGIN}${image}`:`${ORIGIN}/assets/pwa/icon-512.png`;
  const tags=[`<link rel="canonical" href="${escape(url)}">`,`<meta property="og:type" content="${post?'article':'website'}">`,`<meta property="og:site_name" content="HerEme">`,`<meta property="og:title" content="${escape(post?.title||'HerEme')}">`,`<meta property="og:description" content="${escape(description)}">`,`<meta property="og:url" content="${escape(url)}">`,`<meta property="og:image" content="${escape(imageUrl)}">`,`<meta property="og:image:type" content="${image?.endsWith('.jpg')?'image/jpeg':'image/png'}">`,`<meta property="og:image:width" content="${image?.endsWith('.jpg')?1200:512}">`,`<meta property="og:image:height" content="${image?.endsWith('.jpg')?630:512}">`,`<meta property="og:image:alt" content="${escape(post?`HerEme poster: ${post.title}`:'HerEme')}">`,`<meta name="twitter:card" content="summary_large_image">`,...(!post?['<meta name="robots" content="noindex">']:[])].join('\n  ');
  return shell.replace(/<title>[^<]*<\/title>/,`<title>${escape(title)}</title>`).replace(/<meta name="description" content="[^"]*">/,`<meta name="description" content="${escape(description)}">`).replace('</head>',`  ${tags}\n</head>`);
}
module.exports={render,ORIGIN};
