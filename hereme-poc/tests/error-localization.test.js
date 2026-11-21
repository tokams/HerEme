'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {english,requestedLocale,localizeError}=require('../server/error-localization');

test('English error dictionary covers every statically emitted domain and HTTP error code',()=>{
  const root=path.join(__dirname,'..','server'),files=[];
  function visit(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const target=path.join(directory,entry.name);if(entry.isDirectory())visit(target);else if(entry.name.endsWith('.js'))files.push(target);}}
  visit(root);const codes=new Set();
  for(const file of files){const source=fs.readFileSync(file,'utf8');for(const match of source.matchAll(/(?:fail\(|errors\(res,[^,]+,)\s*'([A-Z][A-Z0-9_]+)'/g))codes.add(match[1]);}
  assert.deepEqual([...codes].filter(code=>!english[code]).sort(),[]);
});
test('locale selection honors account preference, English headers, Norwegian variants and fallback',()=>{
  assert.equal(requestedLocale({auth:{preferred_language:'nb'},headers:{'accept-language':'en'}}),'nb');
  assert.equal(requestedLocale({auth:{preferred_language:'en'},headers:{'accept-language':'nb'}}),'en');
  assert.equal(requestedLocale({headers:{'accept-language':'en-GB,en;q=0.8'}}),'en');
  assert.equal(requestedLocale({headers:{'accept-language':'nn-NO'}}),'nb');
  assert.equal(requestedLocale({headers:{'accept-language':'de'}}),'nb');
  assert.equal(localizeError({headers:{'accept-language':'en'}},'INVALID_INPUT','Ugyldig.'),'The input is invalid.');
  assert.equal(localizeError({headers:{}},'INVALID_INPUT','Ugyldig.'),'Ugyldig.');
});
