'use strict';
const S=require('./services');
function run(){try{const overdue=S.chat.cleanup();if(overdue)throw Error(`${overdue} expired chat files remain`);}catch(error){console.error('Chat expiry cleanup failed:',error);process.exit(1);}}
run();
if(process.env.HEREME_CHAT_WORKER==='1')setInterval(run,60000);
