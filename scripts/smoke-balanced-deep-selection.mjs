import assert from 'node:assert/strict';
import {selectBalancedDeepCandidates,deepSelectionSummary} from '../src/deep-candidate-selection.js';

const movers=[
 {symbol:'MOON1',dayChange:18,coarseMomentum:1.4,momentumAcceleration:.2,preScore:13.5,breakoutPre:true,breakoutPreScore:8},
 {symbol:'MOON2',dayChange:12,coarseMomentum:.9,momentumAcceleration:.15,preScore:9.0,breakoutPre:true,breakoutPreScore:6},
 {symbol:'MOON3',dayChange:8,coarseMomentum:.7,momentumAcceleration:.12,preScore:6.1,breakoutPre:true,breakoutPreScore:5},
 {symbol:'UP4',dayChange:5,coarseMomentum:.3,momentumAcceleration:.02,preScore:3.7},
 {symbol:'UP5',dayChange:4,coarseMomentum:.2,momentumAcceleration:.01,preScore:2.9},
 {symbol:'UP6',dayChange:3,coarseMomentum:.1,momentumAcceleration:.01,preScore:2.1}
];
const dips=[
 {symbol:'DIP1',dayChange:-2.1,coarseMomentum:-.25,momentumAcceleration:.09,preScore:-1.7},
 {symbol:'DIP2',dayChange:-1.2,coarseMomentum:-.10,momentumAcceleration:.05,preScore:-.9},
 {symbol:'KNIFE',dayChange:-5,coarseMomentum:-2.4,momentumAcceleration:-.4,preScore:-6}
];
const out=selectBalancedDeepCandidates([...movers,...dips],6,3),summary=deepSelectionSummary(out);
assert.equal(out.length,6,'Deep request count must stay unchanged');
assert.equal(summary.pullback,2,'Two of six deep slots must be reserved for controlled pullbacks when available');
assert.equal(out.some(x=>x.symbol==='DIP1'),true,'Best controlled dip must reach deep validation');
assert.equal(out.some(x=>x.symbol==='DIP2'),true,'Second controlled dip must reach deep validation');
assert.equal(out.some(x=>x.symbol==='KNIFE'),false,'Unbraked falling knife must not consume pullback reserve');
assert.equal(out.filter(x=>x.deepSelectionTrack==='BREAKOUT').length>=2,true,'Momentum/breakout discovery must remain represented');
assert.equal(out.some(x=>x.symbol==='MOON1'),true,'Strongest mover remains represented; pullback reserve is not a momentum ban');

console.log(JSON.stringify({ok:true,unchangedDeepRequests:out.length,pullbackSlots:summary.pullback,breakoutSlots:summary.breakout,regularSlots:summary.regular,symbols:out.map(x=>`${x.deepSelectionTrack}:${x.symbol}`)},null,2));
