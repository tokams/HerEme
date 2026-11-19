'use strict';
const { runtimeConfig }=require('../server/config');
try {
  const config=runtimeConfig();
  console.log(JSON.stringify({environment:config.environment,host:config.host,port:config.port,dataDir:config.dataDir,publicOrigin:config.publicOrigin}));
} catch(error) {console.error(error.message);process.exitCode=1;}
