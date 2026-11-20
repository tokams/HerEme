'use strict';
const fs=require('node:fs');
const path=require('node:path');

const output=path.resolve(process.argv[2]||path.join(__dirname,'..','..','secrets','staff-credentials.txt'));
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,'Provisioning staff credentials. Do not use this incomplete file.\n',{flag:'wx',mode:0o600});

const S=require('../server/services');
const created=[];
try{
  const specifications=[
    {name:'HerEmeAdmin',roles:['moderator','admin']},
    {name:'HerEmeModerator',roles:['moderator']}
  ];
  for(const specification of specifications){
    if(S.db.prepare('SELECT id FROM users WHERE normalized_name=?').get(specification.name.toLocaleLowerCase('no')))throw new Error(`Staff user ${specification.name} already exists; refusing to rotate credentials implicitly.`);
  }
  const credentials=[];
  for(const specification of specifications){
    const result=S.identity.createProfile({name:specification.name,userAgent:'staff-provisioning'});created.push(result.user.id);
    for(const role of specification.roles)S.db.prepare('INSERT INTO user_roles(user_id,role,granted_by) VALUES(?,?,?)').run(result.user.id,role,result.user.id);
    S.db.prepare('DELETE FROM sessions WHERE user_id=?').run(result.user.id);
    credentials.push({username:specification.name,recoveryKey:result.recoveryKey,roles:['member',...specification.roles]});
  }
  const body=['HerEme staff credentials','Created: '+new Date().toISOString(),'','Use each recovery key as the password on the normal login form.',''];
  for(const item of credentials)body.push(`Username: ${item.username}`,`Recovery key: ${item.recoveryKey}`,`Roles: ${item.roles.join(', ')}`,'');
  fs.writeFileSync(output,body.join('\n'),{mode:0o600});
  console.log(`Created ${credentials.length} staff users. Credentials: ${output}`);
}catch(error){
  for(const id of created)S.db.prepare('DELETE FROM users WHERE id=?').run(id);
  fs.rmSync(output,{force:true});throw error;
}finally{S.db.close();}
