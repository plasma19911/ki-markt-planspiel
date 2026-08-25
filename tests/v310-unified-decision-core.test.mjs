import assert from 'node:assert/strict';
import {enforceUnifiedDecisionCoreV310} from '../src/unified-decision-core-v310.js';

const exact={isin:'DE000A1EWWW0',assetClass:'EQUITY',brokerVerified:true,brokerMatchMode:'EXACT_NORMALIZED_NAME',brokerVerificationSource:'Trade Republic official universe'};
const now=Date.parse('2026-08-25T12:00:00Z');

{
  const candidate={symbol:'TEST.DE',name:'Test AG',decisionScore:72,momentum5Pct:-0.15,momentum20Pct:-0.25,entryQualityScore:68,...exact};
  const state={config:{cash:10000,scan_count:1},positions:[],candidates:[candidate],history:[]};
  const plan={actions:[{symbol:'TEST.DE',action:'HOLD',allocation_pct:0,reason:'soft timing hold'}],summary:'test'};
  const out=enforceUnifiedDecisionCoreV310(plan,state,null,[candidate],now);
  const a=out.plan.actions.find(x=>x.symbol==='TEST.DE');
  assert.equal(a.action,'BUY','70+ exact-TR candidate with mild pullback should be buyable');
  assert.ok(Number(a.allocation_pct)>=22,'strong candidate should not remain a mini starter');
  assert.ok(out.audit.changes.length>=1,'decision changes must be audited');
  assert.equal(out.audit.patch,'31.0-unified-decision-authority');
}

{
  const p={symbol:'LOSS.DE',name:'Loss AG',invested:2200,entry_price:100,last_price:98.5,entry_fx:1,last_fx:1,opened_at:'2026-08-25T11:00:00Z',decisionScore:70,rawDecisionScore:60};
  const state={config:{cash:5000,scan_count:2},positions:[p],candidates:[],history:[]};
  const out=enforceUnifiedDecisionCoreV310({actions:[{symbol:'LOSS.DE',action:'HOLD',reason:'score still okay'}],summary:'x'},state,null,[],now);
  const a=out.plan.actions.find(x=>x.symbol==='LOSS.DE');
  assert.equal(a.action,'SELL','-1.5% must trigger hard price stop');
  assert.equal(a.hardStopV310,true);
}

{
  const p={symbol:'NEW.DE',name:'New AG',invested:2200,entry_price:100,last_price:99.8,entry_fx:1,last_fx:1,opened_at:'2026-08-25T11:55:00Z'};
  const state={config:{cash:5000,scan_count:3},positions:[p],candidates:[],history:[]};
  const out=enforceUnifiedDecisionCoreV310({actions:[{symbol:'NEW.DE',action:'SELL',reason:'raw score wobble'}],summary:'x'},state,null,[],now);
  assert.equal(out.plan.actions.find(x=>x.symbol==='NEW.DE').action,'HOLD','fresh normal score sell should be blocked');
}

console.log('V31.0 unified decision authority regression OK');
