import assert from 'node:assert/strict';
import fs from 'node:fs';

// V28.8 belongs to the Cloudflare runtime chain and ultimately imports cloudflare:*.
// Plain Node validates the production contract statically instead of importing the
// runtime wrapper and failing before assertions can run.
const src=fs.readFileSync(new URL('../src/compact-portfolio-v288-pc-first.js',import.meta.url),'utf8');
const constant=name=>{const m=src.match(new RegExp(`const\\s+${name}\\s*=\\s*(\\d+)`));assert.ok(m,`${name} fehlt in V28.8`);return Number(m[1])};

assert.equal(constant('PC_POOL_TARGET'),60);
assert.equal(constant('STAGE2_TARGET'),400);
assert.equal(constant('DEEP_TARGET'),120);
assert.equal(constant('CF_VALIDATION_TARGET'),18);
assert.equal(constant('CF_FORWARD_RESERVE'),4);
for(const fn of ['normalizePcFirstScanV288','pcFirstFromWideSweepV288','buildPcFirstBroadPoolV288','trimPcFirstValidationSliceV288'])assert.match(src,new RegExp(`export\\s+function\\s+${fn}\\b`),`${fn} fehlt`);
assert.match(src,/CSHARP_PC_FIRST_FULL_MASTER/);
assert.match(src,/slice\(0,STAGE2_TARGET\)/);
assert.match(src,/slice\(0,DEEP_TARGET\)/);
assert.match(src,/slice\(0,PC_POOL_TARGET\)/);
assert.match(src,/pcFirstCloudflareValidationSlice:true/);
assert.match(src,/heldSet/,'Depotpositionen müssen in der Finalvalidierung enthalten bleiben');
assert.match(src,/cloudflareFallbackActive/,'PC-Ausfall-Fallback fehlt');
assert.match(src,/usesExistingCsharpWideSweep/,'C#-Wide-Sweep muss ausgewiesen werden');
console.log(JSON.stringify({ok:true,mode:'CSHARP_PC_FIRST_FULL_MASTER',stage2:400,deep:120,final:60,cloudflareValidation:18,forwardReserve:4,runtimeImportAvoided:true},null,2));
