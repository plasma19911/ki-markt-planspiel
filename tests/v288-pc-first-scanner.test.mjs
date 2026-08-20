import assert from 'node:assert/strict';
import fs from 'node:fs';

// V28.8 lives in the Cloudflare runtime chain, which imports cloudflare:* bindings.
// Normal Node must therefore validate the pure production contract statically instead
// of importing the runtime wrapper and failing before any assertions can run.
const src=fs.readFileSync(new URL('../src/compact-portfolio-v288-pc-first.js',import.meta.url),'utf8');

const constant=(name)=>{
  const m=src.match(new RegExp(`const\\s+${name}\\s*=\\s*(\\d+)`));
  assert.ok(m,`${name} fehlt in V28.8`);
  return Number(m[1]);
};

assert.equal(constant('PC_POOL_TARGET'),60,'Finalistenpool muss 60 bleiben');
assert.equal(constant('STAGE2_TARGET'),400,'Stufe 2 muss bis 400 Kandidaten abdecken');
assert.equal(constant('DEEP_TARGET'),120,'Deep-Stufe muss bis 120 Kandidaten abdecken');
assert.equal(constant('CF_VALIDATION_TARGET'),18,'Cloudflare soll nur 18 normale Finalisten teuer validieren');
assert.equal(constant('CF_FORWARD_RESERVE'),4,'Forward-Reserve muss 4 bleiben');

for(const fn of ['normalizePcFirstScanV288','pcFirstFromWideSweepV288','buildPcFirstBroadPoolV288','trimPcFirstValidationSliceV288']){
  assert.match(src,new RegExp(`export\\s+function\\s+${fn}\\b`),`${fn} fehlt`);
}
assert.match(src,/CSHARP_PC_FIRST_FULL_MASTER/,'C#-Vollscanmodus fehlt');
assert.match(src,/slice\(0,STAGE2_TARGET\)/,'Top-400-Stufe ist nicht an STAGE2_TARGET gebunden');
assert.match(src,/slice\(0,DEEP_TARGET\)/,'Deep-Stufe ist nicht an DEEP_TARGET gebunden');
assert.match(src,/slice\(0,PC_POOL_TARGET\)/,'Final-60-Stufe ist nicht an PC_POOL_TARGET gebunden');
assert.match(src,/pcFirstCloudflareValidationSlice:true/,'Cloudflare-Finalvalidierung ist nicht markiert');
assert.match(src,/heldAlwaysIncluded:true|heldSet/,'Depotpositionen müssen in der Finalvalidierung berücksichtigt bleiben');
assert.match(src,/cloudflareFallbackActive/,'PC-Ausfall-Fallback fehlt');
assert.match(src,/usesExistingCsharpWideSweep/,'bestehender C#-Wide-Sweep wird nicht ausgewiesen');

console.log(JSON.stringify({
  ok:true,
  mode:'CSHARP_PC_FIRST_FULL_MASTER',
  stage2:400,
  deep:120,
  final:60,
  cloudflareValidation:18,
  forwardReserve:4,
  runtimeImportAvoided:true
},null,2));
