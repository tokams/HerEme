'use strict';
const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),files=[];
for(const directory of ['server','public','scripts','tests'])walk(path.join(root,directory));
function walk(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const item=path.join(directory,entry.name);if(entry.isDirectory())walk(item);else if(entry.isFile()&&/\.(js|cjs)$/.test(entry.name))files.push(item);}}
for(const file of files){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status!==0){process.stderr.write(result.stderr);process.exitCode=1;}}
if(!process.exitCode)console.log(`Syntax checked ${files.length} JavaScript files.`);
