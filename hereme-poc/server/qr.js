'use strict';
// Minimal standalone QR encoder for short UTF-8 LAN URLs; fixed QR version 3-L (29x29).
// QR-code encoding approach based on ISO/IEC 18004's byte mode + Reed-Solomon ECC.
const gfMul=(x,y)=>{let z=0;for(let i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11d);z^=((y>>>i)&1)*x;}return z;};
function eccDivisor(degree){const r=Array(degree).fill(0);r[degree-1]=1;let root=1;
  for(let i=0;i<degree;i++){for(let j=0;j<degree;j++){r[j]=gfMul(r[j],root);if(j+1<degree)r[j]^=r[j+1];}root=gfMul(root,2);}return r;
}
function eccRemainder(bytes,div){const r=Array(div.length).fill(0);
  for(const b of bytes){const factor=b^r.shift();r.push(0);for(let i=0;i<div.length;i++)r[i]^=gfMul(div[i],factor);}return r;
}
function matrix(value){
  const utf8=Array.from(Buffer.from(value,'utf8'));
  if(utf8.length>53)throw new Error('QR URL too long for v3-L');
  const bits=[];const push=(val,count)=>{for(let i=count-1;i>=0;i--)bits.push((val>>>i)&1);};
  push(4,4);push(utf8.length,8);utf8.forEach(b=>push(b,8));push(0,Math.min(4,440-bits.length));
  while(bits.length%8)bits.push(0);
  const data=[];for(let i=0;i<bits.length;i+=8){let val=0;for(let j=0;j<8;j++)val=(val<<1)|bits[i+j];data.push(val);}
  for(let i=0;data.length<55;i++)data.push(i%2===0?0xec:0x11);
  const full=data.concat(eccRemainder(data,eccDivisor(15)));
  const dataBits=[];for(const val of full)for(let j=7;j>=0;j--)dataBits.push((val>>>j)&1);
  const n=29, modules=Array.from({length:n},()=>Array(n).fill(false)),used=Array.from({length:n},()=>Array(n).fill(false));
  const set=(x,y,dark)=>{if(x>=0&&x<n&&y>=0&&y<n){modules[y][x]=!!dark;used[y][x]=true;}};
  for(let i=8;i<n-8;i++){set(6,i,i%2===0);set(i,6,i%2===0);}
  for(const [cx,cy] of [[3,3],[n-4,3],[3,n-4]])for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
    const dist=Math.max(Math.abs(dx),Math.abs(dy));set(cx+dx,cy+dy,dist!==2&&dist!==4);
  }
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(22+dx,22+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);
  for(let i=0;i<8;i++){if(i!==6){set(8,i,false);set(i,8,false);}set(n-1-i,8,false);set(8,n-1-i,false);}
  set(8,8,false);set(8,7,false);set(7,8,false);set(8,n-8,true);
  let index=0,up=true;
  for(let right=n-1;right>=1;right-=2){
    if(right===6)right=5;
    for(let v=0;v<n;v++){
      const y=up?n-1-v:v;
      for(let j=0;j<2;j++){
        const x=right-j;
        if(!used[y][x]){const bit=index<dataBits.length?dataBits[index++]:0;modules[y][x]=Boolean(bit ^ ((x+y)%2===0?1:0));}
      }
    }
    up=!up;
  }
  // Error correction level L = binary 01; mask 0.
  const dataWord=8;let rem=dataWord;
  for(let i=0;i<10;i++)rem=(rem<<1)^((rem>>>9)*0x537);
  const format=((dataWord<<10)|rem)^0x5412;
  const formatBit=i=>((format>>>i)&1)!==0;
  for(let i=0;i<=5;i++)set(8,i,formatBit(i));
  set(8,7,formatBit(6));set(8,8,formatBit(7));set(7,8,formatBit(8));
  for(let i=9;i<15;i++)set(14-i,8,formatBit(i));
  for(let i=0;i<8;i++)set(n-1-i,8,formatBit(i));
  for(let i=8;i<15;i++)set(8,n-15+i,formatBit(i));
  set(8,n-8,true);
  return modules;
}
function toString(value,opts={}){
  const m=matrix(value),margin=opts.margin??1,n=m.length+margin*2;
  const dark=opts.color?.dark||'#184d49',light=opts.color?.light||'#fff';
  let cells='';
  for(let y=0;y<m.length;y++)for(let x=0;x<m.length;x++)if(m[y][x])cells+=`<rect x="${x+margin}" y="${y+margin}" width="1" height="1"/>`;
  return Promise.resolve(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="QR"><rect width="${n}" height="${n}" fill="${light}"/><g fill="${dark}">${cells}</g></svg>`);
}
module.exports={toString,matrix};
