import assert from 'node:assert/strict';
import {TargetVenueAiGuard,targetVenueIssue} from '../src/target-venue-ai-guard.js';
import {hardTargetVenueIssue} from '../src/trade-safety.js';

const inputFor=c=>({messages:[{role:'user',content:`JSON-only. Kandidaten=${JSON.stringify([c])} Gehalten=[]`}]});
const buyBase=symbol=>({run:async()=>({response:JSON.stringify({summary:'AI BUY',actions:[{symbol,action:'BUY',confidence:.76,allocation_pct:40,reason:'stark'}]})})});

const venture={symbol:'BIG.V',name:'Hercules Metals',market:'TSX Venture'};
assert.match(targetVenueIssue(venture)||'',/Venture|nicht explizit/);
assert.match(hardTargetVenueIssue('BIG.V')||'',/Venture\/OTC/,'Ausfuehrungs-Failsafe muss BIG.V ebenfalls erkennen');
const blocked=JSON.parse((await new TargetVenueAiGuard(buyBase('BIG.V')).run('test',inputFor(venture))).response);
assert.equal(blocked.actions[0].action,'HOLD','BIG.V-artige Venture-Symbole muessen ohne Trade-Republic-Zuordnung blockiert werden');
assert.equal(blocked.actions[0].allocation_pct,0);
assert.match(blocked.actions[0].reason,/TRADE-REPUBLIC-BLOCK/,'Smoke muss den aktuellen Trade-Republic-Guard pruefen');

const normal={symbol:'DTE.DE',name:'Deutsche Telekom',market:'DE'};
assert.equal(targetVenueIssue(normal),null);
assert.equal(hardTargetVenueIssue('DTE.DE'),null);
const allowed=JSON.parse((await new TargetVenueAiGuard(buyBase('DTE.DE')).run('test',inputFor(normal))).response);
assert.equal(allowed.actions[0].action,'BUY','Normale Zielmarkt-Symbole duerfen vom Venue-Guard nicht veraendert werden');

console.log(JSON.stringify({ok:true,ventureBlocked:true,executionFailsafe:true,normalPreserved:true,guard:'TRADE-REPUBLIC-BLOCK'},null,2));
