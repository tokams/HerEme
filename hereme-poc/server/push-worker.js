'use strict';
const S=require('./services');
const {createPushDeliveryService}=require('./domain/push-delivery');
const delivery=createPushDeliveryService(S.db,S.config);
let stopping=false;
async function tick(){try{await delivery.runOnce({limit:20});}catch(error){process.stderr.write(JSON.stringify({level:'error',event:'push.worker.failed',message:error.message})+'\n');}}
async function loop(){while(!stopping){await tick();await new Promise(resolve=>setTimeout(resolve,S.config.pushPollMs));}S.db.close();}
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{stopping=true;});
loop().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
