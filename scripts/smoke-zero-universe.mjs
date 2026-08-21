import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CORE_ETFS,LEVERAGED_ETFS,ZERO_ETF_MASTER_COUNT} from '../src/constants.js';

// Compatibility filename retained. Effective target is Trade Republic.
const universe=JSON.parse(fs.readFileSync(new URL('../public/universe.json',import.meta.url),'utf8'));
const equities=Array.isArray(universe.equities)?universe.equities:[];
assert.ok(equities.length>=1500,`Trade-Republic Aktienpool zu klein: ${equities.length}`);
assert.equal(universe.broker_target,'Trade Republic','Brokerziel muss Trade Republic sein');
assert.equal(universe.stocks_only,true,'Universum muss stocks-only sein');
assert.equal(universe.asset_class,'EQUITY_ONLY','Nur normale Aktien sind erlaubt');
assert.equal(universe.exact_broker_catalog,true,'Trade-Republic-Katalog muss aus offizieller Quelle geschnitten sein');
assert.equal(universe.broker_verification_required_before_live_order,true,'Aktuelle Broker-Verifikation muss vor einer spaeteren echten Order Pflicht bleiben');
assert.ok(equities.every(x=>x?.brokerVerified===true&&x?.assetClass==='EQUITY'&&x?.isin),'Jede Scanner-Aktie braucht Brokerbestaetigung, EQUITY-Klasse und ISIN');
assert.equal(CORE_ETFS.length,0,'Live-Planspiel darf keine normalen ETFs enthalten');
assert.equal(LEVERAGED_ETFS.length,0,'Live-Planspiel darf keine Hebel-ETFs enthalten');
assert.equal(ZERO_ETF_MASTER_COUNT,0,'ETF-Masterpool muss im Aktien-only-Planspiel deaktiviert sein');

console.log(JSON.stringify({ok:true,broker:'Trade Republic',equities:equities.length,stocksOnly:true,etfs:CORE_ETFS.length,leveragedEtfs:LEVERAGED_ETFS.length,officialCatalogIntersection:universe.exact_broker_catalog,brokerVerificationRequired:universe.broker_verification_required_before_live_order},null,2));
