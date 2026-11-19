'use strict';
const {moderation,db}=require('../server/services');
const actor={id:'local-operator',capabilities:['moderate']};const [command,id,action,...rest]=process.argv.slice(2);
try{if(command==='list')console.log(JSON.stringify(moderation.queue(),null,2));else if(command==='act'&&id&&action){const reason=rest.join(' ').replace(/^--reason\s*/,'');console.log(JSON.stringify(moderation.act(actor,Number(id),action,reason)));}else throw new Error('Usage: node scripts/moderate.js list | act <post-id> <publish|hide|dismiss> --reason <text>');}catch(error){console.error(error.message);process.exitCode=1;}finally{db.close();}
