import assert from 'node:assert/strict';
import {blendLeaderCacheV3172} from '../src/compact-portfolio-v10.js';

const now=Date.parse('2026-09-01T12:00:00Z');
const row=n=>({symbol:`S${String(n).padStart(2,'0')}.DE`,name:`Stock ${n}`});

{
  const current={
    leaders:[...Array.from({length:5},(_,i)=>({...row(i+1),externalLeaderSources:['PC']})),...Array.from({length:20},(_,i)=>({...row(i+30),externalLeaderSources:['MASTER-FALLBACK']}))],
    meta:{externalResolved:5,externalHealthy:false,selected:25}
  };
  const previous={at:now-5*60*1000,leaders:Array.from({length:25},(_,i)=>row(i+1)),meta:{externalHealthy:true}};
  const out=blendLeaderCacheV3172(current,previous,now);
  assert.equal(out.meta.usable,true,'5 frische externe Leader plus letzter guter Cache müssen als nutzbare 25er Auswahl gelten');
  assert.equal(out.meta.externalHealthy,false,'externe Qualität wird weiterhin ehrlich als nicht vollständig gesund gemeldet');
  assert.equal(out.meta.previousUsed,true);
  assert.equal(out.meta.mode,'PC_AGENT_PARTIAL_BLEND');
  assert.equal(out.leaders.length,25);
  assert.deepEqual(out.leaders.slice(0,5).map(x=>x.symbol),current.leaders.slice(0,5).map(x=>x.symbol),'frische PC-Leader müssen Priorität behalten');
}

{
  const current={leaders:Array.from({length:25},(_,i)=>({...row(i+1),externalLeaderSources:i<12?['PC']:['MASTER-FALLBACK']})),meta:{externalResolved:12,externalHealthy:true,selected:25}};
  const out=blendLeaderCacheV3172(current,null,now);
  assert.equal(out.meta.usable,true);
  assert.equal(out.meta.mode,'PC_AGENT_TOP_25');
  assert.equal(out.leaders.length,25);
}

{
  const current={leaders:Array.from({length:25},(_,i)=>row(i+40)),meta:{externalResolved:0,externalHealthy:false,selected:25}};
  const previous={at:now-60*60*1000,leaders:Array.from({length:25},(_,i)=>row(i+1))};
  const out=blendLeaderCacheV3172(current,previous,now);
  assert.equal(out.meta.usable,false,'0 echte externe Treffer dürfen nicht durch einen beliebigen Master-Fallback als gesund erscheinen');
  assert.equal(out.meta.mode,'PC_AGENT_INSUFFICIENT');
}

console.log('V31.7.2 partial PC leader blend regression OK');
