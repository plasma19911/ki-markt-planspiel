import assert from 'node:assert/strict';
import {TargetVenueAiGuard,targetVenueIssue} from '../src/target-venue-ai-guard.js';

const inputFor=c=>({messages:[{role:'user',content:`JSON-only. Kandidaten=${JSON.stringify([c])} Gehalten=[]`}]});
const buyBase=symbol=>({run:async()=>({response:JSON.stringify({summary:'AI BUY',actions:[{symbol,action:'BUY',confidence:.76,allocation_pct:40,reason:'stark'}]})})});

const venture={symbol:'BIG.V',name:'Hercules Metals',market:'TSX Venture'};
assert.match(targetVenueIssue(venture)||'',/Venture|nicht explizit/);
const blocked=JSON.parse((await new TargetVenueAiGuard(buyBase('BIG.V')).run('test',inputFor(venture))).response);
assert.equal(blocked.actions[0].action,'HOLD','BIG.V-artige Venture-Symbole muessen ohne gettex-Zuordnung blockiert werden');
assert.equal(blocked.actions[0].allocation_pct,0);
assert.match(blocked.actions[0].reason,/TARGET-VENUE-BLOCK/);

const normal={symbol:'DTE.DE',name:'Deutsche Telekom',market:'DE'};
assert.equal(targetVenueIssue(normal),null);
const allowed=JSON.parse((await new TargetVenueAiGuard(buyBase('DTE.DE')).run('test',inputFor(normal))).response);
assert.equal(allowed.actions[0].action,'BUY','Normale Zielmarkt-Symbole duerfen vom Venue-Guard nicht veraendert werden');

console.log(JSON.stringify({ok:true,ventureBlocked:true,normalPreserved:true},null,2));
