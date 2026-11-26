'use strict';
const crypto=require('node:crypto');
const net=require('node:net');
const {securityUrls}=require('./security-url');
const {fail,DomainError}=require('./errors');

const TYPES=new Set(['page_visit','registration_attempt','registration_success','registration_failure','login_attempt','login_success','login_failure','logout','session_expired','session_revoked','rate_limit_triggered','account_suspended','account_banned']);
const REASONS=new Set(['REGISTRATION_CLOSED','NAME_TAKEN','INVALID_INPUT','RECOVERY_FAILED','PASSKEY_LOGIN_FAILED','PASSKEY_DISABLED','ORIGIN_INVALID','RATE_LIMITED','AUTH_REQUIRED','SUSPENDED','BANNED','USER_REVOKED']);
// Version 1. Approved security fields: peer/client IP, method and bounded User-Agent.
// Purpose: account/service security. Proposed basis: GDPR 6(1)(f), subject to controller review.
// URL policy is shared between the structured record and its raw snapshot.
const SCHEMA_VERSION=2;
const bounded=(value,max)=>typeof value==='string'&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value)?value:null;
const normalizedIp=value=>net.isIP(value)?value:null;
function requestMetadata(req,config){
  if(!req)return {fields:{},raw:null};
  const peer=normalizedIp(req.socket.remoteAddress?.replace(/^::ffff:/,''));
  const forwarded=bounded(req.headers['x-forwarded-for'],80);
  const forwardedIp=config.trustProxy&&['127.0.0.1','::1'].includes(peer)&&forwarded&&!forwarded.includes(',')?normalizedIp(forwarded):null;
  const clientIp=forwardedIp||peer;
  const userAgent=bounded(req.headers['user-agent'],512);
  const browser=/\bEdg\/([\d.]+)/.exec(userAgent||'')||/\bFirefox\/([\d.]+)/.exec(userAgent||'')||/\bChrome\/([\d.]+)/.exec(userAgent||'')||/\bVersion\/([\d.]+).*\bSafari\//.exec(userAgent||'');
  const browserFamily=browser?(browser[0].startsWith('Edg/')?'Edge':browser[0].startsWith('Firefox/')?'Firefox':browser[0].startsWith('Chrome/')?'Chrome':'Safari'):null;
  const os=/Windows NT ([\d.]+)/.exec(userAgent||'')||/Android ([\d.]+)/.exec(userAgent||'')||/(?:iPhone|iPad).*OS ([\d_]+)/.exec(userAgent||'')||/Mac OS X ([\d_.]+)/.exec(userAgent||'')||/Linux/.exec(userAgent||'');
  const osFamily=os?os[0].startsWith('Windows')?'Windows':os[0].startsWith('Android')?'Android':os[0].startsWith('Linux')?'Linux':os[0].startsWith('Mac')?'macOS':'iOS':null;
  const deviceType=/iPad|Tablet/.test(userAgent||'')?'tablet':/Mobile|iPhone|Android/.test(userAgent||'')?'mobile':userAgent?'desktop':null;
  const host=bounded(req.headers.host,255);
  const expected=config.production?new URL(config.publicOrigin).host:null;
  const hostname=host&&(!expected||host===expected)&&/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host)?host.split(':')[0].toLowerCase():null;
  const raw={client_ip:clientIp,ip_source:forwardedIp?'trusted_proxy':'peer',headers:userAgent?{'user-agent':userAgent}:{},http_method:req.method};
  return {fields:{hostname,client_ip:clientIp,browser_family:browserFamily,browser_version:browser?.[1]||null,os_family:osFamily,os_version:os?.[1]?.replaceAll('_','.')||null,device_type:deviceType,http_method:req.method,request_id:req.id||null},raw};
}
function createSecurityEvents(db,config,{audit}={}){
  const instanceId=config.instanceId||'development';
  const insert=db.prepare(`INSERT INTO security_events(event_id,timestamp_utc,event_type,instance_id,hostname,source,user_id,username,subject_user_id,subject_username,client_ip,browser_family,browser_version,os_family,os_version,device_type,device_model,http_method,status_code,route_class,request_id,operation_id,auth_method,reason_code,parser_version,request_url,request_path,referrer_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const pending=new WeakMap();
  const setStatus=db.prepare('UPDATE security_events SET status_code=? WHERE event_id=?');
  const setRawStatus=db.prepare("UPDATE security_event_raw SET raw_metadata_json=json_set(raw_metadata_json,'$.status_code',?) WHERE event_id=?");
  function finish(req,status){
    const ids=pending.get(req);
    if(!ids)return;
    db.exec('SAVEPOINT response_status');
    try {
      for(const id of ids){setStatus.run(status,id);setRawStatus.run(status,id);}
      db.exec('RELEASE response_status');
    }catch(error){db.exec('ROLLBACK TO response_status; RELEASE response_status');throw error;}
    pending.delete(req);
  }
  const rawInsert=db.prepare('INSERT INTO security_event_raw(event_id,captured_at_utc,schema_version,raw_metadata_json) VALUES(?,?,?,?)');
  const account=db.prepare('SELECT id,name FROM users WHERE id=?');
  const operation=()=>crypto.randomUUID();
  function record(type,{req=null,actor=null,subject=null,operationId=null,authMethod=null,reasonCode=null,routeClass=null,statusCode=null,source=req?'http':'system'}={}){
    if(!TYPES.has(type))throw Error('Unknown security event type');
    if(reasonCode&&!REASONS.has(reasonCode))reasonCode='INVALID_INPUT';
    const timestamp=new Date().toISOString(),id=crypto.randomUUID(),metadata=requestMetadata(req,config);
    const urls=req?securityUrls(req,config):{};
    if(metadata.raw)Object.assign(metadata.raw,urls,{status_code:null});
    let savepoint=false;
    try{
      const actorRow=actor?.id?account.get(actor.id):null,subjectRow=subject?.id?account.get(subject.id):null;
      db.exec('SAVEPOINT security_event');savepoint=true;
      insert.run(id,timestamp,type,instanceId,metadata.fields.hostname||null,source,actorRow?.id||null,actorRow?.name||null,subjectRow?.id||null,subjectRow?.name||null,
        metadata.fields.client_ip||null,metadata.fields.browser_family||null,metadata.fields.browser_version||null,metadata.fields.os_family||null,metadata.fields.os_version||null,metadata.fields.device_type||null,null,
        metadata.fields.http_method||null,req?null:statusCode,routeClass,metadata.fields.request_id||null,operationId,authMethod,reasonCode,1,
        urls.request_url??null,urls.request_path??null,urls.referrer_url??null);
      rawInsert.run(id,timestamp,SCHEMA_VERSION,metadata.raw?JSON.stringify(metadata.raw):null);
      db.exec('RELEASE security_event');
    }catch(error){if(savepoint){db.exec('ROLLBACK TO security_event');db.exec('RELEASE security_event');}console.error(JSON.stringify({level:'error',component:'security_events',event_type:type,code:'PERSISTENCE_FAILED'}));throw new DomainError('SECURITY_LOG_UNAVAILABLE','Sikkerhetsloggen er utilgjengelig.',503);}
    if(req){if(!pending.has(req))pending.set(req,[]);pending.get(req).push(id);}
    return id;
  }
  function list(actor,filters={}){
    if(!actor?.roles?.includes('operator'))fail('FORBIDDEN','Sikkerhetsadministrator kreves.',403);
    const allowed={event_type:'event_type',user_id:'user_id',username:'username',ip:'client_ip',browser:'browser_family',browser_version:'browser_version',os:'os_family',os_version:'os_version',device:'device_type',event_id:'event_id',operation_id:'operation_id'};
    const where=[],values=[];
    for(const column of ['request_url','request_path','referrer_url','http_method','status_code']){
      const value=filters[column];
      if(!value)continue;
      if(typeof value!=='string'||value.length>8704)fail('INVALID_FILTER','Ugyldig filter.',400);
      if(column==='http_method'||column==='status_code'){where.push(column+'=?');values.push(value.toUpperCase());}
      else{where.push('instr('+column+',?)>0');values.push(value);}
    }
    for(const [key,column] of Object.entries(allowed))if(filters[key]){
      const value=String(filters[key]);if(value.length>255)fail('INVALID_FILTER','Ugyldig filter.',400);
      if(key==='user_id'){where.push('(user_id=? OR subject_user_id=?)');values.push(value,value);}
      else if(key==='username'){where.push('(username=? OR subject_username=?)');values.push(value,value);}
      else{where.push(`${column}=?`);values.push(value);}
    }
    for(const [key,op] of [['from','>='],['to','<=']])if(filters[key]){
      const value=String(filters[key]);if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d)?/.test(value))fail('INVALID_FILTER','Ugyldig dato.',400);
      where.push(`timestamp_utc${op}?`);values.push(value);
    }
    const page=Math.max(0,Math.min(10000,Number(filters.page)||0)),limit=Math.max(1,Math.min(50,Number(filters.limit)||25));
    const events=db.prepare(`SELECT * FROM security_events ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY timestamp_utc DESC,event_id DESC LIMIT ? OFFSET ?`).all(...values,limit+1,page*limit);
    audit.record({actorId:actor.id,action:'security.events.read',subjectType:'security_event',reason:'Bounded security event query'});
    return {events:events.slice(0,limit),has_more:events.length>limit,page};
  }
  function detail(actor,id){
    if(!actor?.roles?.includes('operator'))fail('FORBIDDEN','Sikkerhetsadministrator kreves.',403);
    if(!/^[0-9a-f-]{36}$/i.test(id))fail('INVALID_FILTER','Ugyldig hendelses-ID.',400);
    const event=db.prepare('SELECT e.*,r.captured_at_utc,r.schema_version,r.raw_metadata_json FROM security_events e JOIN security_event_raw r ON r.event_id=e.event_id WHERE e.event_id=?').get(id);
    if(!event)fail('NOT_FOUND','Hendelsen finnes ikke.',404);
    audit.record({actorId:actor.id,action:'security.event.inspect',subjectType:'security_event',subjectId:id,reason:'Security event detail'});
    return {...event,raw_metadata:event.raw_metadata_json?JSON.parse(event.raw_metadata_json):null,raw_metadata_json:undefined};
  }
  return {record,finish,operation,list,detail};
}
module.exports={createSecurityEvents,requestMetadata};
