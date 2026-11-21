'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('Norwegian and English dictionaries have identical keys and parameters',()=>{
  for(const prefix of ['', 'wall-', 'chat-', 'misc-']){
    const read=locale=>JSON.parse(fs.readFileSync(path.join(__dirname,'..','public','i18n',`${prefix}${locale}.json`),'utf8'));
    const nb=read('nb'),en=read('en');
    assert.deepEqual(Object.keys(en).sort(),Object.keys(nb).sort(),`${prefix} dictionary keys`);
    for(const key of Object.keys(nb)){
      assert.equal(typeof nb[key],'string');assert.equal(typeof en[key],'string');
      const parameters=value=>[...value.matchAll(/\{([a-z_]+)\}/g)].map(match=>match[1]).sort();
      assert.deepEqual(parameters(en[key]),parameters(nb[key]),key);
    }
  }
});

test('literal translation keys used by browser scripts exist',()=>{
  const directory=path.join(__dirname,'..','public');
  const keys=new Set(['','wall-','chat-','misc-'].flatMap(prefix=>Object.keys(JSON.parse(fs.readFileSync(path.join(directory,'i18n',`${prefix}nb.json`),'utf8')))));
  for(const file of fs.readdirSync(directory).filter(name=>name.endsWith('.js'))){
    const source=fs.readFileSync(path.join(directory,file),'utf8');
    const namespace=source.match(/const t=\(key,params\)=>window\.HeremeI18n\.t\(`([^$]+)\$\{key\}`/)?.[1]
      ||source.match(/const t=\(key,params\)=>i18n\(\)\.t\(`([^$]+)\$\{key\}`/)?.[1]
      ||source.match(/t\(key,params\)\{return HeremeI18n\.t\(`([^$]+)\$\{key\}`/)?.[1]
      ||source.match(/t=\(key,params\)=>HeremeI18n\.t\(`([^$]+)\$\{key\}`/)?.[1]
      ||source.match(/t=\(key,params\)=>root\.HeremeI18n\?\.t\(`([^$]+)\$\{key\}`/)?.[1]
      ||'';
    if(!namespace)continue;
    for(const match of source.matchAll(/\bt\(['"]([a-z][a-z0-9_.]+)['"]/g)){
      const key=namespace+match[1];
      assert.ok(keys.has(key),`${file}: ${key}`);
    }
  }
});
