import assert from 'node:assert/strict';
import {SHADOW_LEARNING_V314,calibratedCanonicalBuyScoreV317} from '../src/shadow-learning-v314.js';
import {enforceExpectancyCoreV310,EXPECTANCY_CORE_V310} from '../src/expectancy-core-v310.js';

const mixed=[{bucket:50,samples:60,expectedNetEdgePct:-.26},{bucket:55,samples:60,expectedNetEdgePct:-.15},{bucket:60,samples:40,expectedNetEdgePct:-.49},{bucket:65,samples:30,expectedNetEdgePct:.41}];
assert.equal(calibratedCanonicalBuyScoreV317(mixed).buyScore,65);
assert.equal(calibratedCanonicalBuyScoreV317([]).buyScore,SHADOW_LEARNING_V314.canonicalBuyScore);
const state={config:{cash:672,slippage_percent:.1,fee_fixed:1},positions:[],history:[],candidates:[{symbol:'THIN',price:20,decisionScore:70}]};
const out=enforceExpectancyCoreV310({actions:[{symbol:'THIN',action:'BUY',allocation_pct:30}],summary:'x'},state,Date.now());
assert.equal(out.plan.actions[0].action,'HOLD');
assert.equal(out.plan.actions[0].subEconomicTicketBlockedV310,true);
assert.equal(out.counters.subEconomicBlocks,1);
assert.equal(EXPECTANCY_CORE_V310.minPositionEur,2200);
console.log('calibrated threshold + economic ticket tests passed');
