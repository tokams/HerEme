'use strict';
const {db}=require('../server/db');
const {seedDemo}=require('../server/seed');
try{console.log(JSON.stringify(seedDemo(db)));}finally{db.close();}
