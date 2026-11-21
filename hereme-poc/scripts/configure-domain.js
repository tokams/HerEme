'use strict';
const fs=require('node:fs');
function configure(source,domain,expected){
  if(domain!=='hereme.no')throw Error('Canonical migration target must be hereme.no.');
  const matches=[...source.matchAll(/^HEREME_DOMAIN=([^\r\n]*)/gm)];
  if(matches.length!==1)throw Error('Expected exactly one HEREME_DOMAIN setting.');
  const current=matches[0][1];
  if(current!==domain&&current!==expected)throw Error('Current domain does not match the explicitly expected previous domain.');
  const settings={HEREME_DOMAIN:domain,HEREME_WWW_DOMAIN:'www.hereme.no',HEREME_LEGACY_DOMAIN:'hereme.46.251.249.110.nip.io'};
  let result=source;
  for(const [key,value] of Object.entries(settings)){
    const pattern=new RegExp('^'+key+'=[^\\r\\n]*','gm'),found=[...result.matchAll(pattern)];
    if(found.length>1)throw Error('Duplicate domain setting: '+key);
    result=found.length?result.replace(pattern,key+'='+value):result+(result.endsWith('\n')?'':'\n')+key+'='+value+'\n';
  }
  return result;
}
if(require.main===module){const [file,domain,expected]=process.argv.slice(2);if(!file)throw Error('Environment file is required.');fs.writeFileSync(file,configure(fs.readFileSync(file,'utf8'),domain,expected),{mode:0o600});fs.chmodSync(file,0o600);}
module.exports={configure};
