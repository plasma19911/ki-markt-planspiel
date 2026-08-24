import assert from 'node:assert/strict';
import {enforceProfitOpportunityV305} from '../src/profit-opportunity-v305.js';
const tr=(symbol,score,m5=.2,m20=.3)=>({symbol,name:symbol,decisionScore:score,daytradeLiveScore:score,momentum5Pct:m5,momentum20Pct:m20,brokerVerified:true,assetClass:'EQUITY',brokerVerificationSource:'official Trade Republic Trading Universe PDF',brokerMatchMode:'EXACT_NORMALIZED_NAME',isin:'DE0000000001'});
const input={messages:[{content:`Kandidaten=${JSON.stringify([tr('NEW.DE',70)])} Gehalten=[]`}]};
const plan={summary:'soft hold',actions:[{symbol:'NEW.DE',action:'HOLD',reason:'PatienceGuard: noch keine perfekte Bestätigung'}]};
const out=enforceProfitOpportunityV305(structuredClone(plan),{positions:[],candidates:[tr('NEW.DE',70)]},input);
assert.equal(out.counters.starterBuys,1);
assert.equal(out.plan.actions.find(a=>a.symbol==='NEW.DE')?.action,'BUY');
assert.ok(out.blocked.some(x=>x.symbol==='NEW.DE'));
const hardPlan={summary:'hard',actions:[{symbol:'NEW.DE',action:'HOLD',reason:'TRADE-REPUBLIC-BLOCK unsafe'}]};
const hard=enforceProfitOpportunityV305(structuredClone(hardPlan),{positions:[],candidates:[tr('NEW.DE',70)]},input);
assert.equal(hard.counters.starterBuys,0);
const positions=[
 {symbol:'OLD1.DE',decisionScore:61,rawDecisionScore:41,opened_at:'2026-08-24T10:00:00Z'},
 {symbol:'OLD2.DE',decisionScore:65,rawDecisionScore:65,opened_at:'2026-08-24T10:00:00Z'},
 {symbol:'OLD3.DE',decisionScore:66,rawDecisionScore:66,opened_at:'2026-08-24T10:00:00Z'},
 {symbol:'OLD4.DE',decisionScore:67,rawDecisionScore:67,opened_at:'2026-08-24T10:00:00Z'}
];
const cand=[tr('NEW.DE',70),...positions.map((p,i)=>tr(p.symbol,p.decisionScore,0,.05))];cand.find(x=>x.symbol==='OLD1.DE').rawDecisionScore=41;
const rotInput={messages:[{content:`Kandidaten=${JSON.stringify(cand)} Gehalten=${JSON.stringify(positions)}`}]};
const rotPlan={summary:'holds',actions:[...positions.map(p=>({symbol:p.symbol,action:'HOLD',reason:'stable'})),{symbol:'NEW.DE',action:'HOLD',reason:'soft wait'}]};
const rot=enforceProfitOpportunityV305(structuredClone(rotPlan),{positions,candidates:cand},rotInput,Date.parse('2026-08-24T11:00:00Z'));
assert.equal(rot.counters.rotations,1);
assert.equal(rot.plan.actions.find(a=>a.symbol==='OLD1.DE')?.action,'SELL');
assert.equal(rot.plan.actions.find(a=>a.symbol==='NEW.DE')?.action,'BUY');
assert.equal(rot.counters.hysteresisBypasses,1);
console.log(JSON.stringify({ok:true,starterBuy:true,hardSafetyPreserved:true,netRotation:true,hysteresisAware:true,blockerAudit:true},null,2));
