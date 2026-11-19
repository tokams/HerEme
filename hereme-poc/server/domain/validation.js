'use strict';
const {fail}=require('./errors');
const text=(value,{name='Verdi',min=0,max=3000}={})=>{
  if(typeof value!=='string')fail('INVALID_INPUT',`${name} må være tekst.`);
  const result=value.trim();
  if(result.length<min||result.length>max)fail('INVALID_INPUT',`${name} må være ${min}–${max} tegn.`);
  return result;
};
const optionalText=(value,options={})=>value==null||value===''?'':text(value,{...options,min:0});
const enumValue=(value,allowed,name='Verdi')=>allowed.includes(value)?value:fail('INVALID_INPUT',`Ugyldig ${name.toLowerCase()}.`);
const integer=(value,{name='Tall',min=Number.MIN_SAFE_INTEGER,max=Number.MAX_SAFE_INTEGER}={})=>{
  const result=Number(value);if(!Number.isSafeInteger(result)||result<min||result>max)fail('INVALID_INPUT',`Ugyldig ${name.toLowerCase()}.`);return result;
};
const httpUrl=value=>{try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||!url.hostname)throw Error();return url.href;}catch{fail('INVALID_URL','Bruk en gyldig http(s)-lenke.');}};
module.exports={text,optionalText,enumValue,integer,httpUrl};
