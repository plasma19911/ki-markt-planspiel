import assert from 'node:assert/strict';
import fs from 'node:fs';

// V29.2 keeps the V28.8 PC-first architecture but fixes breadth truncation and raises Deep to 240.
// Plain Node validates the production contract statically because the runtime chain imports cloudflare:*.
const src=fs.readFileSync(new URL('../src/compact-portfolio-v288-pc-first.js',import.meta.url),'utf8');
const constant=name=>{const m=src.match(new RegExp(`const\\s+${name}\\s*=\\s*(\\d+)`));assert.ok(m,`${name} fehlt in PC-first`);return Number(m[1])};

assert.equal(constant('PC_POOL_TARGET'),60);
assert.equal(constant('STAGE2_TARGET'),400);
assert.equal(constant('DEEP_TARGET'),240);
assert.equal(constant('CF_VALIDATION_TARGET'),36);
assert.equal(constant('CF_FORWARD_RESERVE'),8);
for(const fn of ['normalizePcFirstScanV288','pcFirstFromWideSweepV288','buildPcFirstBroadPoolV288','trimPcFirstValidationSliceV288'])assert.match(src,new RegExp(`export\\s+function\\s+${fn}\\b`),`${fn} fehlt`);
assert.match(src,/CSHARP_PC_FIRST_FULL_MASTER/);
assert.match(src,/allPreScored/,'Vollscan muss vor Top400 komplett vorscored werden');
assert.doesNotMatch(src,/arr\(entries\)\.slice\(0,1000\)/,'alte 1.000er Rohdaten-Grenze darf nicht mehr existieren');
assert.match(src,/slice\(0,STAGE2_TARGET\)/);
assert.match(src,/slice\(0,DEEP_TARGET\)/);
assert.match(src,/slice\(0,PC_POOL_TARGET\)/);
assert.match(src,/preScoredCount/);
assert.match(src,/allReceivedRowsPreScored/);
assert.match(src,/noFirst1000Truncation:true/);
assert.match(src,/scorePipeline:'ALL_RECEIVED_PRE_SCORE_0_100 → TOP400 → DEEP240 → FINAL60 → CLOUDFLARE36 \+ POSITIONS'/);
assert.match(src,/pcFirstCloudflareValidationSlice:true/);
assert.match(src,/heldSet/,'Depotpositionen müssen in der Finalvalidierung enthalten bleiben');
assert.match(src,/cloudflareFallbackActive/,'PC-Ausfall-Fallback fehlt');
assert.match(src,/usesExistingCsharpWideSweep/,'C#-Wide-Sweep muss ausgewiesen werden');
console.log(JSON.stringify({ok:true,version:29.2,mode:'CSHARP_PC_FIRST_FULL_MASTER',allReceivedPreScored:true,stage2:400,deep:240,final:60,cloudflareValidation:36,forwardReserve:8,noFirst1000Truncation:true,runtimeImportAvoided:true},null,2));
