import assert from 'node:assert/strict';
import {TargetVenueAiGuard,targetVenueIssue} from '../src/target-venue-ai-guard.js';
import {hardTargetVenueIssue} from '../src/trade-safety.js';

const inputFor=c=>({messages:[{role:'user',content:`JSON-only. Kandidaten=${JSON.stringify([c])} Gehalten=[]`}]});
const buyBase=symbol=>({run:async()=>({response:JSON.stringify({summary:'AI BUY',actions:[{symbol,action:'BUY',confidence:.76,allocation_pct:40,reason:'stark'}]})})});
const verified={brokerVerified:true,brokerVerificationSource:'official Trade Republic Trading Universe PDF',brokerMatchMode:'EXACT_NORMALIZED_NAME',assetClass:'EQUITY'};

const venture={symbol:'BIG.V',name:'Hercules Metals',market:'TSX Venture'};
assert.match(targetVenueIssue(venture)||'',/Brokerbestaetigung|Trade-Republic/);
assert.match(hardTargetVenueIssue('BIG.V')||'',/Venture\/OTC/,'Ausfuehrungs-Failsafe muss BIG.V ebenfalls erkennen');
const blocked=JSON.parse((await new TargetVenueAiGuard(buyBase('BIG.V')).run('test',inputFor(venture))).response);
assert.equal(blocked.actions[0].action,'HOLD','Unverifizierte Kandidaten muessen fail-closed blockiert werden');
assert.equal(blocked.actions[0].allocation_pct,0);
assert.match(blocked.actions[0].reason,/TRADE-REPUBLIC-BLOCK/,'Smoke muss den aktuellen Trade-Republic-Guard pruefen');

const missingVerification={symbol:'DTE.DE',name:'Deutsche Telekom',market:'DE'};
assert.match(targetVenueIssue(missingVerification)||'',/Brokerbestaetigung/,'Fehlendes brokerVerified darf nicht mehr still durchgehen');
const missingBlocked=JSON.parse((await new TargetVenueAiGuard(buyBase('DTE.DE')).run('test',inputFor(missingVerification))).response);
assert.equal(missingBlocked.actions[0].action,'HOLD','Auch normale Symbole ohne Broker-Metadaten muessen blockiert werden');

const relaxed={symbol:'DTE.DE',name:'Deutsche Telekom',market:'DE',isin:'DE0005557508',...verified,brokerMatchMode:'UNIQUE_LEGAL_SUFFIX_NORMALIZED_NAME'};
assert.match(targetVenueIssue(relaxed)||'',/nicht eindeutig genug/,'Relaxed name matching darf nicht als harte Brokerverifikation gelten');

const normal={symbol:'DTE.DE',name:'Deutsche Telekom',market:'DE',isin:'DE0005557508',...verified};
assert.equal(targetVenueIssue(normal),null);
assert.equal(hardTargetVenueIssue('DTE.DE'),null);
const allowed=JSON.parse((await new TargetVenueAiGuard(buyBase('DTE.DE')).run('test',inputFor(normal))).response);
assert.equal(allowed.actions[0].action,'BUY','Exakt brokerverifizierte normale Aktien duerfen unveraendert bleiben');

console.log(JSON.stringify({ok:true,ventureBlocked:true,missingVerificationBlocked:true,relaxedMatchBlocked:true,exactVerifiedAllowed:true,executionFailsafe:true,guard:'TRADE-REPUBLIC-BLOCK'},null,2));
