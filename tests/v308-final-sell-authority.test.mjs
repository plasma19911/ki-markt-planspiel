import assert from 'node:assert/strict';
import {enforceFinalSellAuthorityV308,severeWeaknessV308} from '../src/final-sell-authority-v308.js';

const solar={symbol:'SOLARINDS.NS',name:'Solar Industries India',decisionScore:54.4,rawDecisionScore:32.4,entryDecisionScore:57.4,chartDirectionMode:'FLAT',chartMoveFromEntryPct:1.05};
const solarPlan={actions:[{symbol:'SOLARINDS.NS',action:'HOLD',reason:'Gewinn sichern - dynamischer Rücklauf'}],summary:'test'};
const solarOut=enforceFinalSellAuthorityV308(solarPlan,{positions:[solar]});
assert.equal(solarOut.plan.actions[0].action,'SELL','Solar-like severe deterioration must become SELL');
assert.equal(solarOut.plan.actions[0].forcedWeakSellV308,true);
assert.equal(solarOut.counters.forcedWeakSells,1);

const locked=enforceFinalSellAuthorityV308({actions:[{symbol:'ABC.DE',action:'SELL',reason:'final exit'}],summary:'test'},{positions:[{symbol:'ABC.DE',decisionScore:60,rawDecisionScore:60,entryDecisionScore:60}]});
assert.equal(locked.plan.actions[0].action,'SELL','Existing SELL must remain SELL');
assert.equal(locked.plan.actions[0].finalSellLockedV308,true);

const yit={symbol:'YIT.HE',decisionScore:62.8,rawDecisionScore:43,entryDecisionScore:65.8,chartDirectionMode:'UP',chartMoveFromEntryPct:.84};
const yitOut=enforceFinalSellAuthorityV308({actions:[{symbol:'YIT.HE',action:'HOLD'}],summary:'test'},{positions:[yit]});
assert.equal(yitOut.plan.actions[0].action,'HOLD','Moderate raw score must not be force-sold');

const winner={symbol:'WIN.DE',decisionScore:61,rawDecisionScore:34,entryDecisionScore:63,chartDirectionMode:'UP',chartMoveFromEntryPct:2.4};
assert.equal(severeWeaknessV308(winner).severe,false,'Strong uptrend winner is protected unless raw score is critically low');

console.log(JSON.stringify({ok:true,solarForcedSell:true,existingSellLocked:true,yitHeld:true,strongWinnerProtected:true}));
