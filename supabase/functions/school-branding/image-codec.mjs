import {Buffer} from 'node:buffer';
import webpFactory from './vendor/webp_dec.mjs';
export const MAX_LOGO_BYTES=2*1024*1024;
export function inspectLogo(bytes,mime) {
 if(!bytes.length || bytes.length>MAX_LOGO_BYTES)throw Error('Choose an image up to 2 MB.');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let type,width,height;
 const text=(offset,length)=>String.fromCharCode(...bytes.slice(offset,offset+length));
 if(bytes.length>=33 && text(1,3)==='PNG' && bytes[0]===137 && text(12,4)==='IHDR') {type='image/png';width=v.getUint32(16);height=v.getUint32(20);}
 else if(bytes.length>=12 && bytes[0]===255 && bytes[1]===216 && bytes.at(-2)===255 && bytes.at(-1)===217) {
  type='image/jpeg';let p=2;
  while(p+4<bytes.length){if(bytes[p++]!==255)throw Error('Invalid JPEG contents.');while(bytes[p]===255)p++;const marker=bytes[p++];if(marker===218)break;const length=v.getUint16(p);if(length<2||p+length>bytes.length)throw Error('Truncated JPEG.');if([192,193,194].includes(marker)){height=v.getUint16(p+3);width=v.getUint16(p+5);break;}p+=length;}
 } else if(bytes.length>=30 && text(0,4)==='RIFF' && text(8,4)==='WEBP' && v.getUint32(4,true)+8===bytes.length) {
  type='image/webp';const chunk=text(12,4);
  if(chunk==='VP8X'){if(bytes[20]&2)throw Error('Animated logos are not supported.');width=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16);height=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16);}
  else if(chunk==='VP8L'&&bytes[20]===47){const bits=v.getUint32(21,true);width=(bits&16383)+1;height=((bits>>>14)&16383)+1;}
  else if(chunk==='VP8 '&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42){width=v.getUint16(26,true)&16383;height=v.getUint16(28,true)&16383;}
 }
 if(!type || type!==mime || !width || !height)throw Error('File contents must match PNG, JPEG or WebP.');
 if(width>2048||height>2048)throw Error('Logo dimensions must be at most 2048 × 2048.');
 return {type,width,height};
}
export function createLogoCodec({PNG,jpeg,readWasm}) {
 let webp;
 return async (bytes,mime)=>{
  const info=inspectLogo(bytes,mime);let decoded;
  try {
   if(info.type==='image/png')decoded=PNG.sync.read(Buffer.from(bytes),{checkCRC:true});
   else if(info.type==='image/jpeg')decoded=jpeg.decode(bytes,{useTArray:true,formatAsRGBA:true,tolerantDecoding:false,maxResolutionInMP:4.2,maxMemoryUsageInMB:64});
   else {
    if(!webp)webp=(async()=>{
     const compiled=await WebAssembly.compile(await readWasm());
     const module=await webpFactory({noInitialRun:true,instantiateWasm:(imports,callback)=>{const instance=new WebAssembly.Instance(compiled,imports);callback(instance);return instance.exports;}});
     const version=module.decoder_version().split('.').map(Number);
     if(version[0]<1 || (version[0]===1&&(version[1]<3||(version[1]===3&&version[2]<2))))throw Error('Unsupported WebP decoder version');
     return module;
    })();
    decoded=(await webp).decodeRGBA(bytes);
   }
  } catch {throw Error('The image is corrupt or cannot be decoded.');}
  if(!decoded || decoded.width!==info.width || decoded.height!==info.height || decoded.data.length!==info.width*info.height*4)throw Error('The image contents are incomplete.');
  const png=new PNG({width:info.width,height:info.height});png.data=Buffer.from(decoded.data);
  const data=PNG.sync.write(png);
  if(data.length>8*1024*1024)throw Error('Decoded logo is too large.');
  return {bytes:new Uint8Array(data),width:info.width,height:info.height};
 };
}
