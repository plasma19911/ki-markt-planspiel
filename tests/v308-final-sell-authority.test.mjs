import assert from 'node:assert/strict';
import {enforceFinalSellAuthorityV308,severeWeaknessV308} from '../src/final-sell-authority-v308.js';

const oldOpened=new Date(Date.now()-45*60_000).toISOString();
const freshOpened=new Date(Date.now()-5*60_000).toISOString();

// A low RawScore by itself must no longer override the maturity/structure guards.
const solarFlat={symbol:'SOLARINDS.NS',name:'Solar Industries India',decisionScore:54.4,rawDecisionScore:32.4,entryDecisionScore:57.4,chartDirectionMode:'FLAT',chartMoveFromEntryPct:1.05,chartMoveLastScanPct:-0.05,opened_at:oldOpened};
const solarFlatPlan={actions:[{symbol:'SOLARINDS.NS',action:'HOLD',reason:'Gewinn sichern - dynamischer Rücklauf'}],summary:'test'};
const solarFlatOut=enforceFinalSellAuthorityV308(solarFlatPlan,{positions:[solarFlat]});
assert.equal(solarFlatOut.plan.actions[0].action,'HOLD','Unconfirmed low RawScore must not become SELL');
assert.equal(solarFlatOut.counters.unconfirmedWeakSellsBlocked,1);

// The same deterioration becomes SELL once weakness is confirmed by the chart and the position is mature.
const solarBreak={...solarFlat,chartDirectionMode:'DOWN',chartMoveLastScanPct:-0.45};
const solarBreakOut=enforceFinalSellAuthorityV308({actions:[{symbol:'SOLARINDS.NS',action:'HOLD',reason:'weak'}],summary:'test'},{positions:[solarBreak]});
assert.equal(solarBreakOut.plan.actions[0].action,'SELL','Mature severe deterioration with chart confirmation must become SELL');
assert.equal(solarBreakOut.plan.actions[0].forcedWeakSellV308,true);
assert.equal(solarBreakOut.counters.forcedWeakSells,1);

// Critical regression: a freshly bought position must not be score-only force-sold a few minutes later.
const freshBreak={...solarBreak,symbol:'FRESH.DE',opened_at:freshOpened};
const freshOut=enforceFinalSellAuthorityV308({actions:[{symbol:'FRESH.DE',action:'HOLD',reason:'maturity guard'}],summary:'test'},{positions:[freshBreak]});
assert.equal(freshOut.plan.actions[0].action,'HOLD','Fresh position must survive outer V30.8 score-forced SELL');
assert.equal(freshOut.plan.actions[0].freshPositionSellGuardV3081,true);
assert.equal(freshOut.counters.freshWeakSellsBlocked,1);

// A SELL already confirmed by inner hard-risk/structure guards remains executable immediately.
const locked=enforceFinalSellAuthorityV308({actions:[{symbol:'ABC.DE',action:'SELL',reason:'hard risk final exit'}],summary:'test'},{positions:[{symbol:'ABC.DE',decisionScore:60,rawDecisionScore:60,entryDecisionScore:60,opened_at:freshOpened}]});
assert.equal(locked.plan.actions[0].action,'SELL','Existing confirmed SELL must remain SELL even when fresh');
assert.equal(locked.plan.actions[0].finalSellLockedV308,true);

const yit={symbol:'YIT.HE',decisionScore:62.8,rawDecisionScore:43,entryDecisionScore:65.8,chartDirectionMode:'UP',chartMoveFromEntryPct:.84,opened_at:oldOpened};
const yitOut=enforceFinalSellAuthorityV308({actions:[{symbol:'YIT.HE',action:'HOLD'}],summary:'test'},{positions:[yit]});
assert.equal(yitOut.plan.actions[0].action,'HOLD','Moderate raw score must not be force-sold');

const winner={symbol:'WIN.DE',decisionScore:61,rawDecisionScore:34,entryDecisionScore:63,chartDirectionMode:'UP',chartMoveFromEntryPct:2.4,opened_at:oldOpened};
assert.equal(severeWeaknessV308(winner).severe,false,'Strong uptrend winner is protected unless raw score is critically low');

console.log(JSON.stringify({ok:true,rawOnlyHeld:true,confirmedMatureSell:true,freshSellBlocked:true,existingSellLocked:true,yitHeld:true,strongWinnerProtected:true}));
