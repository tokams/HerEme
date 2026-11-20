'use strict';
const S=require('./services');
if(!S.config.enableVideo){console.error('HEREME_ENABLE_VIDEO is not enabled.');S.db.close();process.exitCode=1;}
else {let stopping=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;});(async()=>{while(!stopping){try{const result=S.video.processOne();if(result)console.log(JSON.stringify({level:'info',event:'media.processed',...result}));else await new Promise(resolve=>setTimeout(resolve,2000));}catch(error){console.error(JSON.stringify({level:'error',event:'media.failed',message:error.message}));await new Promise(resolve=>setTimeout(resolve,5000));}}S.db.close();})().catch(error=>{console.error(error);S.db.close();process.exitCode=1;});}
