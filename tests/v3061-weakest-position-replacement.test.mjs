import assert from 'node:assert/strict';
import {enforceWeakestPositionReplacementV3061} from '../src/weakest-position-replacement-v3061.js';

const exact={brokerVerified:true,assetClass:'EQUITY',brokerMatchMode:'EXACT_NORMALIZED_NAME',brokerVerificationSource:'Trade Republic official instrument universe',isin:'DE000A1EWWW0'};
const now=Date.parse('2026-08-25T06:00:00Z');
const basePositions=[
 {symbol:'SAAB-B.ST',decisionScore:52.4,rawDecisionScore:30.1,scoreDeltaFromEntry:-12.8,entry_price:659.1585,last_price:642.2,entry_fx:.0899,last_fx:.0897,opened_at:'2026-08-24T07:33:21Z',chartDirectionMode:'DOWN'},
 {symbol:'YIT.HE',decisionScore:62.8,rawDecisionScore:55,scoreDeltaFromEntry:-3,entry_price:3.2032,last_price:3.23,opened_at:'2026-08-24T12:59:17Z',chartDirectionMode:'UP'},
 {symbol:'COCHINSHIP.NS',decisionScore:61.3,rawDecisionScore:61.3,scoreDeltaFromEntry:.6,entry_price:1508,last_price:1514,opened_at:'2026-08-24T08:18:18Z',chartDirectionMode:'UP'},
 {symbol:'SOLARINDS.NS',decisionScore:56.5,rawDecisionScore:56.5,scoreDeltaFromEntry:-.9,entry_price:19759,last_price:19925,opened_at:'2026-08-24T07:25:19Z',chartDirectionMode:'UP'}
];
const replacement={symbol:'BETTER.DE',name:'Better AG',decisionScore:63.5,daytradeLiveScore:63.5,momentum5Pct:.25,momentum20Pct:.40,acceleration5Pct:.10,...exact};
const state={positions:basePositions,candidates:[replacement]};
const input={messages:[{content:`Kandidaten=${JSON.stringify([replacement])} Gehalten=${JSON.stringify(basePositions)}`}]};
const plan={actions:[...basePositions.map(p=>({symbol:p.symbol,action:'HOLD',reason:'hold'})),{symbol:'BETTER.DE',action:'HOLD',reason:'soft confirmation pending'}],summary:'test'};
const out=enforceWeakestPositionReplacementV3061(structuredClone(plan),state,input,[],now);
const saab=out.plan.actions.find(a=>a.symbol==='SAAB-B.ST');
const better=out.plan.actions.find(a=>a.symbol==='BETTER.DE');
assert.equal(saab?.action,'SELL','severely deteriorated Saab-like holding must be sold when a clearly better exact TR candidate exists');
assert.equal(better?.action,'BUY','replacement candidate must be bought as paired rotation');
assert.equal(out.counters.weakReplacements,1);
assert.equal(saab?.pairedReplacementSymbol,'BETTER.DE');
assert.equal(better?.pairedReplacementSymbol,'SAAB-B.ST');

const weakCandidate={...replacement,symbol:'WEAK.DE',decisionScore:60.5,daytradeLiveScore:60.5,isin:'DE000BASF111'};
const out2=enforceWeakestPositionReplacementV3061(structuredClone(plan),{positions:basePositions,candidates:[weakCandidate]},{messages:[{content:`Kandidaten=${JSON.stringify([weakCandidate])} Gehalten=${JSON.stringify(basePositions)}`}]},[],now);
assert.equal(out2.counters.weakReplacements,0,'candidate below 62 must not force a loss rotation');

const healthyPositions=basePositions.map(p=>p.symbol==='SAAB-B.ST'?{...p,decisionScore:59,rawDecisionScore:56,scoreDeltaFromEntry:-3,last_price:665,chartDirectionMode:'UP'}:p);
const out3=enforceWeakestPositionReplacementV3061(structuredClone(plan),{positions:healthyPositions,candidates:[replacement]},input,[],now);
assert.equal(out3.counters.weakReplacements,0,'healthy holding must not be dumped merely because another candidate scores higher');

console.log('V30.6.1 weakest-position replacement regression OK');
