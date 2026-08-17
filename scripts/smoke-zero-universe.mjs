import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GENERATED_ZERO_ETFS} from '../src/generated-zero-etfs.js';

const universe=JSON.parse(fs.readFileSync(new URL('../public/universe.json',import.meta.url),'utf8'));
const equities=Array.isArray(universe.equities)?universe.equities:[];
assert.ok(equities.length>=8500,`ZERO-scale Aktienpool zu klein: ${equities.length}`);
assert.equal(universe.exact_broker_catalog,false,'Masterpool darf nicht faelschlich als exakter ZERO-Katalog markiert sein');
assert.equal(universe.broker_verification_required_before_live_order,true,'Live-Broker-Verifikation muss Pflicht bleiben');
assert.ok(equities.every(x=>x?.brokerVerified===false),'Unverifizierte Masterpool-Aktien duerfen nicht brokerVerified=true sein');

assert.ok(GENERATED_ZERO_ETFS.length>=2000,`ZERO-scale ETF-Pool zu klein: ${GENERATED_ZERO_ETFS.length}`);
const badPattern=/(LEVERAGED|INVERSE|ULTRASHORT|SHORTDAX|SHORT\s|\bBEAR\b|\bBOOST\b|LEVDAX|(?:^|[^A-Z0-9])(?:2X|3X|X2|X3)(?:[^A-Z0-9]|$))/i;
const bad=GENERATED_ZERO_ETFS.filter(x=>badPattern.test(`${x?.name||''} ${x?.theme||''}`));
assert.deepEqual(bad,[],`Short-/Hebel-/Inverse-ETF im normalen Pool: ${bad.slice(0,5).map(x=>x.symbol+': '+x.name).join(' | ')}`);
assert.ok(GENERATED_ZERO_ETFS.every(x=>x?.brokerVerified===false),'ETF-Masterpool darf Broker-Verifikation nicht vortaeuschen');

console.log(JSON.stringify({ok:true,equities:equities.length,etfs:GENERATED_ZERO_ETFS.length,exactBrokerCatalog:universe.exact_broker_catalog,brokerVerificationRequired:universe.broker_verification_required_before_live_order,blockedEtfsFound:bad.length},null,2));
