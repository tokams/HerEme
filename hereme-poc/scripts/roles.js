'use strict';
const {moderation,db}=require('../server/services');const actor={id:'local-operator',capabilities:['roles:manage']};
const [operation,userId,role,...words]=process.argv.slice(2);
try{if(!['grant','revoke'].includes(operation)||!userId||!role)throw new Error('Usage: node scripts/roles.js <grant|revoke> <user-id> <moderator|operator> <reason>');moderation.setRole(actor,userId,role,operation==='grant',words.join(' '));console.log(JSON.stringify({ok:true,operation,userId,role}));}catch(error){console.error(error.message);process.exitCode=1;}finally{db.close();}
