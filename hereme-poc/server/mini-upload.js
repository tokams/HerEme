'use strict';
const {readBody}=require('./mini-web');
class MulterError extends Error {constructor(code){super(code);this.name='MulterError';this.code=code;}}
// Single in-memory multipart upload; deliberately limited to this PoC's form fields.
const createUpload=({limits={}}={})=>({
  single:fieldName=>(req,res,next)=>{
    if(!req.headers['content-type']?.startsWith('multipart/form-data'))return next();
    const boundaryMatch=req.headers['content-type'].match(/boundary=(?:"([^"]+)"|([^;]+))/);
    if(!boundaryMatch)return res.status(400).json({error:'Manglende multipart-grense.'});
    const boundary=boundaryMatch[1]||boundaryMatch[2];
    if(boundary.length>100||boundary.length<4)return res.status(400).json({error:'Ugyldig multipart-grense.'});
    const max=limits.fileSize||8*1024*1024;
    readBody(req,max+128*1024).then(buf=>{
      const boundaryBuf=Buffer.from('--'+boundary), divider=Buffer.from('\r\n\r\n');
      req.body={};req.file=null;
      let pos=buf.indexOf(boundaryBuf);let fileCount=0,partCount=0;
      if(pos!==0)return res.status(400).json({error:'Ugyldig multipart.'});
      while(pos>=0){
        const head=pos+boundaryBuf.length;
        if(buf.toString('ascii',head,head+2)==='--')break;
        if(buf.toString('ascii',head,head+2)!=='\r\n')break;
        const headersEnd=buf.indexOf(divider,head+2);if(headersEnd<0||headersEnd-head>4096)break;
        const nextBoundary=buf.indexOf(boundaryBuf,headersEnd+4);if(nextBoundary<0)break;
        const bytes=buf.subarray(headersEnd+4,nextBoundary-2);
        const partHeaders=buf.toString('utf8',head+2,headersEnd);
        const disp=partHeaders.match(/content-disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i);
        if(disp){
          const name=disp[1];partCount++;
          if(partCount>20)return res.status(400).json({error:'For mange felt.'});
          if(disp[2]!==undefined){
            if(name===fieldName){
              fileCount++;
              if(fileCount>1)return next(new MulterError('LIMIT_FILE_COUNT'));
              if(bytes.length>max)return next(new MulterError('LIMIT_FILE_SIZE'));
              req.file={buffer:bytes,originalname:disp[2],size:bytes.length};
            }
          } else if(bytes.length<=10000&&name!=='__proto__'&&name!=='constructor'&&name!=='prototype')req.body[name]=bytes.toString('utf8');
        }
        pos=nextBoundary;
      }
      next();
    }).catch(err=>next(new MulterError(err.code===413?'LIMIT_FILE_SIZE':'LIMIT_PART_COUNT')));
  }
});
createUpload.MulterError=MulterError;
createUpload.memoryStorage=()=>({});
module.exports=createUpload;
