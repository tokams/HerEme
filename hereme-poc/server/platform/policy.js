'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function readPolicy(file) {
  const value=JSON.parse(fs.readFileSync(file,'utf8'));
  if(typeof value.registrationOpen!=='boolean') throw Error('Invalid registration policy at '+file);
  return value;
}
function writePolicy(file,registrationOpen) {
  if(typeof registrationOpen!=='boolean') throw Error('Registration policy must be boolean.');
  const tmp=path.join(path.dirname(file),'.policy-'+crypto.randomUUID());
  fs.writeFileSync(tmp,JSON.stringify({registrationOpen})+'\n',{flag:'wx',mode:0o644});
  fs.renameSync(tmp,file);
}
module.exports={readPolicy,writePolicy};
