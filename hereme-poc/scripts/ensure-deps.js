'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const manifest=fs.readFileSync(path.join(root,'package.json'),'utf8');
const lock=fs.readFileSync(path.join(root,'package-lock.json'),'utf8');
const fingerprint=crypto.createHash('sha256').update(manifest).update(lock).digest('hex');
const marker=path.join(root,'.hereme-deps-ready');
const packages=JSON.parse(manifest);
const dependencies=Object.keys({...packages.dependencies,...packages.devDependencies});
const ready=dependencies.every(name=>{
  try{require.resolve(name,{paths:[root]});return true;}
  catch(error){if(error.code==='MODULE_NOT_FOUND')return false;throw error;}
});
if(!ready||!fs.existsSync(marker)||fs.readFileSync(marker,'utf8').trim()!==fingerprint){
  console.log('Checking locked project dependencies...');
  const result=process.platform==='win32'
    ?spawnSync(process.env.ComSpec,['/d','/c','npm.cmd ci --include=dev --no-audit --no-fund'],{cwd:root,stdio:'inherit',windowsHide:true})
    :spawnSync('npm',['ci','--include=dev','--no-audit','--no-fund'],{cwd:root,stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status||1);
  for(const name of dependencies)require.resolve(name,{paths:[root]});
  fs.writeFileSync(marker,fingerprint+'\n');
}
