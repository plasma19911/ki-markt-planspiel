import assert from 'node:assert/strict';
import {OUTCOME_LEARNING_V312,outcomeLearningStatusV312} from '../src/outcome-learning-core-v312.js';

const now=Date.now(),hour=3600000;
const row=(action,returnPct,ageMs)=>({ts:now-ageMs,symbol:action==='BUY'?'BUY':'HOLD',action,returnPct,netReturnPct:returnPct-(action==='BUY'?OUTCOME_LEARNING_V312.defaultBuyRoundTripCostPct:0),score:62,forecast20mScore:71,sources:[]});
const buys=Array.from({length:8},(_,i)=>row('BUY',-.9,30*hour+i*1000));
const holds=Array.from({length:600},(_,i)=>row('HOLD',.7,(600-i)*60000));
const status=outcomeLearningStatusV312({recent20:[...buys,...holds]},now);
assert.equal(status.buySamples,8);
assert.equal(status.mode,'DEFENSIVE');
assert.ok(status.thresholdAdjustment>0&&status.allocationAdjustment<0);
const thin=outcomeLearningStatusV312({recent20:[...buys.slice(0,3),...holds]},now);
assert.equal(thin.buySamples,3);
assert.equal(thin.mode,'CAUTIOUS','drei schwache Kaeufe duerfen das ganze System noch nicht statistisch auf DEFENSIVE sperren');
console.log('outcome BUY evidence survives HOLD flood');
