import assert from 'node:assert/strict';
import {
  OUTCOME_LEARNING_V312,counterfactualOpportunityMapV31751,enforceOutcomeMissRecoveryV31751,
  outcomeLearningStatusV312,recordOutcomeDecisionsV312,updateOutcomeLearningMemoryV312
} from '../src/outcome-learning-core-v312.js';

const now=Date.parse('2026-09-10T10:00:00Z');
const exact={isin:'DE000A1EWWW0',assetClass:'EQUITY',brokerVerified:true,brokerMatchMode:'EXACT_NORMALIZED_NAME',brokerVerificationSource:'Trade Republic official universe'};
const candidate={symbol:'REC.DE',name:'Recovery AG',price:100,decisionScore:72,daytradeLiveScore:72,confidence:.8,liveConfidence:.8,momentum5Pct:.25,momentum20Pct:.7,momentumAcceleration5:.1,volumeRatio:1.8,volumeRatioSource:'PREVIOUS_COMPLETED_1M',newsScore:.3,newsConfidence:.8,newsSources:['OFFICIAL','WIRE'],day_change:1.1,rsi:61,eventRisk:'NONE',momentumSellSignal:'NONE',fresh:true,quoteAgeMinutes:.2,...exact};
const peers=[
  {symbol:'P1.DE',price:20,momentum5Pct:.05,momentum20Pct:.1,fresh:true,quoteAgeMinutes:.2},
  {symbol:'P2.DE',price:30,momentum5Pct:0,momentum20Pct:0,fresh:true,quoteAgeMinutes:.2},
  {symbol:'P3.DE',price:40,momentum5Pct:-.1,momentum20Pct:-.2,fresh:true,quoteAgeMinutes:.2}
];
const state={config:{cash:10000,slippage_percent:.1,market_mode:'OPEN'},positions:[],history:[],candidates:[candidate,...peers]};

const warmup=counterfactualOpportunityMapV31751(state,[candidate],{},now);
assert.equal(warmup['REC.DE'].eligible,false);
assert.equal(warmup['REC.DE'].reason,'EDGE_NOT_MEASURED','eine unbelegte Rohchance darf nicht als echter Fehlpass gelten');
const bucket=warmup['REC.DE'].entryBucket;
const shadowMemory={matured:Array.from({length:25},(_,i)=>({symbol:`M${i}`,entryScoreVersion:31.7,entryScoreV317:bucket,ret:1.1}))};
const contexts=counterfactualOpportunityMapV31751(state,[candidate],shadowMemory,now);
assert.equal(contexts['REC.DE'].eligible,true,'frisch, exakt handelbar, wirtschaftlich und netto positiv muss gegenfaktisch messbar sein');
assert.ok(contexts['REC.DE'].allocationPct>=22);
assert.ok(contexts['REC.DE'].expectedNetEdgePct>=OUTCOME_LEARNING_V312.missRecoveryMinExpectedNetEdgePct);

const prediction={symbol:'REC.DE',score:72,forecast20mScore:73,signalConfidence:.8,velocity5:1,m5:.25,m20:.7,accel:.1,features:{news:.3}};
const heldPlan={actions:[{symbol:'REC.DE',action:'HOLD',allocation_pct:0,reason:'noch unter taktischer Schwelle'}],summary:'hold'};
const first=recordOutcomeDecisionsV312({},state,heldPlan,{'REC.DE':prediction},now,contexts);
assert.equal(first.memory.symbols['REC.DE'].samples.filter(x=>x.counterfactualEligible).length,1);
const second=recordOutcomeDecisionsV312(first.memory,state,heldPlan,{'REC.DE':prediction},now+5*60000,contexts);
assert.equal(second.memory.symbols['REC.DE'].samples.filter(x=>x.counterfactualEligible).length,1,'Vier-Minuten-Snapshots desselben 30-Minuten-Setups duerfen nicht mehrfach zaehlen');
const at20=updateOutcomeLearningMemoryV312(second.memory,{...state,candidates:[{...candidate,price:101},...peers]},now+21*60000);
const at60=updateOutcomeLearningMemoryV312(at20.memory,{...state,candidates:[{...candidate,price:102},...peers]},now+61*60000);
assert.equal(at60.status.missedOpportunities,1);
assert.equal(at60.status.actionableHoldSetups,1);
assert.ok(at60.status.recentMissedOpportunities[0].net20mPct>0);
assert.ok(at60.status.recentMissedOpportunities[0].net60mPct>0,'20m und 60m muessen gemeinsam in denselben Fehlpass einfliessen');

const missRows=[];
for(let setup=0;setup<4;setup++){
  const winner=setup<3,setupId=`SETUP-${setup}`;
  for(let duplicate=0;duplicate<4;duplicate++)missRows.push({ts:now-60000*(100-setup*4-duplicate),sampleTs:now-60000*(130-setup*30),symbol:`S${setup}`,action:'HOLD',returnPct:winner?.9:-.2,counterfactualEligible:true,counterfactualSetupId:setupId,counterfactualHorizonMinutes:20,counterfactualEstimatedCostPct:.3,counterfactualNetReturnPct:winner?.6:-.5});
  missRows.push({ts:now-60000*(40-setup),sampleTs:now-60000*(130-setup*30),symbol:`S${setup}`,action:'HOLD',returnPct:winner?1.2:-.3,counterfactualOnly:true,counterfactualEligible:true,counterfactualSetupId:setupId,counterfactualHorizonMinutes:60,counterfactualEstimatedCostPct:.3,counterfactualNetReturnPct:winner?.9:-.6});
}
const profile=outcomeLearningStatusV312({recent20:missRows},now);
assert.equal(profile.actionableHoldSetups,4);
assert.equal(profile.missedOpportunities,3,'Duplikate derselben Chance duerfen den Lerndruck nicht aufblasen');
assert.equal(profile.actionableMissRate,75);
assert.equal(profile.missRecoveryActive,true);

const recovered=enforceOutcomeMissRecoveryV31751(heldPlan,state,{status:profile,predictions:{'REC.DE':prediction}},[candidate],shadowMemory,now);
const buy=recovered.plan.actions.find(x=>x.symbol==='REC.DE');
assert.equal(buy.action,'BUY','belastbare Fehlpaesse muessen das Verhalten jetzt wirklich aendern');
assert.equal(buy.missRecoveryV31751,true);
assert.ok(buy.allocation_pct>=22,'Recovery darf keine durch Fixkosten unwirtschaftliche Mikroposition erzeugen');

const staleState={...state,candidates:[{...candidate,fresh:false,stale:true,quoteAgeMinutes:12},...peers]};
const stale=enforceOutcomeMissRecoveryV31751({actions:[{symbol:'REC.DE',action:'HOLD',allocation_pct:0,reason:'noch unter taktischer Schwelle'}],summary:'hold'},staleState,{status:profile,predictions:{'REC.DE':prediction}},[candidate],shadowMemory,now);
assert.equal(stale.plan.actions.find(x=>x.symbol==='REC.DE').action,'HOLD','Lernen darf keine stale Quote ueberstimmen');

console.log('V31.7.51 unique tradeable 20m/60m misses now drive guarded recovery buys');
