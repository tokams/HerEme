'use strict';
const {DomainError}=require('./errors');
function createRateLimiter({windowMs=300000,now=()=>Date.now()}={}){
  const buckets=new Map();
  function check(key,limit){
    const time=now(),start=Math.floor(time/windowMs)*windowMs,id=`${key}:${start}`,count=(buckets.get(id)||0)+1;
    buckets.set(id,count);
    if(buckets.size>10000)for(const [entry] of buckets)if(Number(entry.slice(entry.lastIndexOf(':')+1))<start-windowMs)buckets.delete(entry);
    if(count>limit){const retry=Math.ceil((start+windowMs-time)/1000);const error=new DomainError('RATE_LIMITED','For mange forsøk. Prøv igjen senere.',429,{retryAfter:retry});error.firstTrigger=count===limit+1;throw error;}
    return {remaining:Math.max(0,limit-count),reset:start+windowMs};
  }
  return {check};
}
module.exports={createRateLimiter};
