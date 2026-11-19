'use strict';
const {snapshotData}=require('./snapshot-data');const {verifyBackup}=require('./verify-backup');const {runtimeConfig}=require('../server/config');
const destination=process.argv[2];if(!destination){console.error('Usage: node scripts/backup-data.js <new-backup-directory>');process.exitCode=1;}else snapshotData(runtimeConfig().dataDir,destination).then(()=>console.log(JSON.stringify(verifyBackup(destination),null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
