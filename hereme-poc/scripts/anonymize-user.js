'use strict';
const {accounts,db}=require('../server/services');const actor={id:'local-operator',capabilities:['users:anonymize']};const [userId,...reason]=process.argv.slice(2);
try{if(!userId||!reason.length)throw new Error('Usage: node scripts/anonymize-user.js <user-id> <verified request reason>');accounts.anonymize(actor,userId,reason.join(' '));console.log(JSON.stringify({ok:true,userId}));}catch(error){console.error(error.message);process.exitCode=1;}finally{db.close();}
