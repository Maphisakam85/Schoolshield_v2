# Bundled WebP codec

`webp_dec.mjs` and `webp_dec.wasm` are the ESM glue (renamed to .mjs, with
trailing whitespace removed) and unmodified binary from
`wasm-webp@0.1.0/dist/esm/webp-wasm.{js,wasm}`.
Source: https://github.com/nieyuyao/webp-wasm

The actual `decoder_version()` result was checked: **1.3.2**. The application
also rejects initialization of a decoder older than 1.3.2. Both lossy and
lossless decoding are exercised with real fixtures. An earlier jSquash decoder
candidate was discarded after its binary reported 1.1.0; it is not shipped here.

The wrapper is MIT-licensed (LICENSE); libwebp's license is in LICENSE.libwebp.
Preserve both notices when redistributing. No runtime CDN codec fetch is needed:
the WASM is included through the school-branding function's static_files config.
These assets are outside the Vercel browser output directory.
