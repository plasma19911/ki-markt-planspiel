import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CORE_ETFS,LEVERAGED_ETFS,ZERO_ETF_MASTER_COUNT} from '../src/constants.js';

const universe=JSON.parse(fs.readFileSync(new URL('../public/universe.json',import.meta.url),'utf8'));
const equities=Array.isArray(universe.equities)?universe.equities:[];
assert.ok(equities.length>=8500,`ZERO-scale Aktienpool zu klein: ${equities.length}`);
assert.equal(universe.exact_broker_catalog,false,'Masterpool darf nicht faelschlich als exakter ZERO-Katalog markiert sein');
assert.equal(universe.broker_verification_required_before_live_order,true,'Live-Broker-Verifikation muss Pflicht bleiben');
assert.ok(equities.every(x=>x?.brokerVerified===false),'Unverifizierte Masterpool-Aktien duerfen nicht brokerVerified=true sein');
assert.equal(CORE_ETFS.length,0,'Live-Planspiel darf keine normalen ETFs enthalten');
assert.equal(LEVERAGED_ETFS.length,0,'Live-Planspiel darf keine Hebel-ETFs enthalten');
assert.equal(ZERO_ETF_MASTER_COUNT,0,'ETF-Masterpool muss im Aktien-only-Planspiel deaktiviert sein');

console.log(JSON.stringify({ok:true,equities:equities.length,stocksOnly:true,etfs:CORE_ETFS.length,leveragedEtfs:LEVERAGED_ETFS.length,exactBrokerCatalog:universe.exact_broker_catalog,brokerVerificationRequired:universe.broker_verification_required_before_live_order},null,2));
