import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
const w=640,h=760, pixels=Buffer.alloc((w*4+1)*h); const body=[[208,130],[270,105],[289,137],[351,137],[370,105],[432,130],[549,231],[503,328],[447,287],[458,655],[182,655],[193,287],[137,328],[91,231]];
function inside(x,y,p){let c=false;for(let i=0,j=p.length-1;i<p.length;j=i++){if(((p[i][1]>y)!=(p[j][1]>y))&&(x<(p[j][0]-p[i][0])*(y-p[i][1])/(p[j][1]-p[i][1])+p[i][0]))c=!c;}return c;}
for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*(w*4+1)+1+x*4;let c=[237,239,241];if(inside(x,y,body)){const texture=Math.sin(x/4)*2+Math.sin(y/3)*1.4;c=[186+texture,159+texture,124+texture];if(y>620)c=c.map(v=>v-8);}pixels[i]=c[0];pixels[i+1]=c[1];pixels[i+2]=c[2];pixels[i+3]=255;}
function crc(buf){let c=0xffffffff;for(const b of buf){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(type,data){const t=Buffer.from(type),size=Buffer.alloc(4),check=Buffer.alloc(4);size.writeUInt32BE(data.length);check.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([size,t,data,check]);}
const header=Buffer.alloc(13);header.writeUInt32BE(w,0);header.writeUInt32BE(h,4);header[8]=8;header[9]=6;
mkdirSync('tests/fixtures',{recursive:true});writeFileSync('tests/fixtures/illustrated-knit.png',Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]));console.log('Created synthetic knit fixture; not a real-photo accuracy benchmark.');
