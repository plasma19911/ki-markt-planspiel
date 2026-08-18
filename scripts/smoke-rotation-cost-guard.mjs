import assert from 'node:assert/strict';
import {rotationCostDecision} from '../src/rotation-cost-guard.js';

const action=gap=>({symbol:'OLD',action:'SELL',reason:`CAPITAL-MOTION-ROTATION: NEW besser · Differenz ${gap.toFixed(2)} · Kapital verschieben`});
const held=(ageMinutes,invested=150,extra={})=>({symbol:'OLD',ageMinutes,invested,momentumState:'NORMAL',momentumSellSignal:'NONE',...extra});

assert.equal(rotationCostDecision({held:held(5,150),action:action(2)}).allow,false,'Keine normale Rotation nach nur 5 Minuten');
assert.equal(rotationCostDecision({held:held(15,150),action:action(.9)}).allow,false,'Kleine 150-EUR-Position braucht groesseren Vorteil wegen Gebuehren');
assert.equal(rotationCostDecision({held:held(15,600),action:action(1.0)}).allow,true,'Groessere Position darf nach Hysterese bei ausreichendem Vorteil rotieren');
assert.equal(rotationCostDecision({held:held(1,150,{momentumState:'REVERSAL',momentumSellSignal:'STRONG'}),action:action(.1)}).allow,true,'Harter Reversal-Exit darf sofort passieren');

const storage={kv:{get(k){if(k==='state/day-replay-report-v1')return{status:'COMPLETE',summary:{churn:{rapidRoundTrips:5,totalRapidTradePnl:-8.4,fees:7}}};return null}}};
const learned=rotationCostDecision({held:held(15,600),action:action(1.0),storage});
assert.equal(learned.allow,false,'Negativer Tages-Replay-Churn muss spaetere Rotation strenger machen');
assert.ok(learned.replay.minAgeBonusMinutes>0&&learned.replay.gapBonus>0,'Replay muss Hysterese und Abstand begrenzt erhoehen');

console.log(JSON.stringify({ok:true,base:{minAge:10,smallOrderPenalty:true},replay:learned.replay,hardReversalImmediate:true},null,2));
