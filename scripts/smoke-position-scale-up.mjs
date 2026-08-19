import assert from 'node:assert/strict';
import {mergePositionTranche,scaleUpAllocation} from '../src/position-scale-up.js';

const old={
 symbol:'TEST.ST',invested:500,entry_fee:1,entry_price:100,entry_fx:.10,last_price:105,last_fx:.10,
 zero_quantity:50,opened_at:'2026-08-19T10:00:00.000Z',add_count:0,score:4.8,signal_confidence:.7
};
const merged=mergePositionTranche(old,{notional:300,entryPrice:120,fx:.10,fee:1,quantity:25},{lastPrice:121,lastFx:.10,score:5.5,confidence:.78,addedAt:'2026-08-19T11:00:00.000Z'});
assert.equal(merged.invested,800,'Invested basis must accumulate');
assert.equal(merged.entry_fee,2,'Entry fees must accumulate');
assert.equal(merged.zero_quantity,75,'Quantity must accumulate');
assert.equal(merged.add_count,1,'Add count must increment');
assert.equal(merged.last_added_at,'2026-08-19T11:00:00.000Z');
const valueByBasis=merged.invested*(merged.last_price/merged.entry_price)*(merged.last_fx/merged.entry_fx);
const directQuantityValue=merged.zero_quantity*merged.last_price*merged.last_fx;
assert.ok(Math.abs(valueByBasis-directQuantityValue)<1e-8,'Combined entry basis must preserve exact tranche valuation');

const fxOld={symbol:'FX',invested:600,entry_fee:1,entry_price:200,entry_fx:.08,zero_quantity:37.5,last_price:205,last_fx:.082};
const fxMerged=mergePositionTranche(fxOld,{notional:400,entryPrice:220,fx:.09,fee:2,quantity:400/(220*.09)},{lastPrice:225,lastFx:.091,addedAt:'2026-08-19T12:00:00.000Z'});
const fxBasisValue=fxMerged.invested*(fxMerged.last_price/fxMerged.entry_price)*(fxMerged.last_fx/fxMerged.entry_fx);
const fxQuantityValue=fxMerged.zero_quantity*fxMerged.last_price*fxMerged.last_fx;
assert.ok(Math.abs(fxBasisValue-fxQuantityValue)<1e-7,'Mixed FX tranches must preserve valuation');

assert.equal(scaleUpAllocation({cash:8000,capital:10000,invested:500,pnlPct:1,minutesSinceAdd:5,qualified:true}).allowed,false,'No add inside 10-minute hysteresis');
const qualified=scaleUpAllocation({cash:8000,capital:10000,invested:500,pnlPct:1,minutesSinceAdd:15,qualified:true});
assert.equal(qualified.allowed,true,'Confirmed starter may scale after hysteresis');
assert.ok(qualified.allocationPct>=2&&qualified.allocationPct<=6,'Normal scale-up must use only 2-6% of free cash');
assert.equal(qualified.targetPositionPct,14);
const second=scaleUpAllocation({cash:8000,capital:10000,invested:500,pnlPct:-2.5,minutesSinceAdd:15,secondChance:true});
assert.equal(second.allowed,true,'SECOND_CHANCE confirmation may scale a controlled drawdown');
assert.ok(second.allocationPct<=10,'Second-chance scale-up must cap new cash at 10%');
assert.equal(second.targetPositionPct,20);
assert.equal(scaleUpAllocation({cash:8000,capital:10000,invested:500,pnlPct:-2.5,minutesSinceAdd:15,qualified:true}).allowed,false,'Normal confirmation must not average down a >2% loser');
assert.equal(scaleUpAllocation({cash:8000,capital:10000,invested:1380,pnlPct:2,minutesSinceAdd:15,qualified:true}).allowed,false,'Position near 14% target must not be expanded again');
assert.equal(scaleUpAllocation({cash:8000,capital:10000,invested:500,pnlPct:2,minutesSinceAdd:15}).allowed,false,'No add without renewed qualification');

console.log(JSON.stringify({ok:true,valuationPreserved:true,fxValuationPreserved:true,hysteresisMinutes:10,qualifiedMaxCashPct:6,secondChanceMaxCashPct:10,qualifiedTargetPct:14,secondChanceTargetPct:20,noBlindAverageDown:true},null,2));
