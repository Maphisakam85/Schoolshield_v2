const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const codecs=import('../supabase/functions/school-branding/image-codec.mjs');
test('branding rejects spoofed, oversized and oversized-dimension content',async()=>{
 const {inspectLogo,MAX_LOGO_BYTES}=await codecs;
 assert.throws(()=>inspectLogo(new Uint8Array(Buffer.from('<svg onload="alert(1)"></svg>')),'image/png'),/contents/);
 assert.throws(()=>inspectLogo(new Uint8Array(MAX_LOGO_BYTES+1),'image/png'),/2 MB/);
 const png=fs.readFileSync('tests/fixtures/branding/logo.png');assert.throws(()=>inspectLogo(png,'image/jpeg'),/contents/);
 const bomb=Buffer.from(png);bomb.writeUInt32BE(50000,16);assert.throws(()=>inspectLogo(bomb,'image/png'),/dimensions/);
});
test('real PNG/JPEG/WebP contents decode, preserve ratio and normalise to PNG',{skip:!process.env.BRANDING_CODECS},async()=>{
 const {createLogoCodec}=await codecs;const {PNG}=require(process.env.BRANDING_CODECS+'/pngjs'),jpeg=require(process.env.BRANDING_CODECS+'/jpeg-js');
 const decode=createLogoCodec({PNG,jpeg,readWasm:()=>fs.readFileSync('supabase/functions/school-branding/vendor/webp_dec.wasm')});
 for(const type of ['png','jpeg','webp']){const bytes=new Uint8Array(fs.readFileSync('tests/fixtures/branding/logo.'+type));const result=await decode(bytes,'image/'+type);assert.equal(result.width/result.height,2);assert.equal(result.bytes[0],137);assert.equal(PNG.sync.read(Buffer.from(result.bytes)).width,48);await assert.rejects(decode(bytes.slice(0,-8),'image/'+type));}
 const lossless=await decode(new Uint8Array(fs.readFileSync('tests/fixtures/branding/logo-lossless.webp')),'image/webp');assert.equal(lossless.width,48);assert.equal(lossless.height,24);
});
