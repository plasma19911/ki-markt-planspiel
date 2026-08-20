import assert from 'node:assert/strict';
import {calibratedEntryExpectation,applyPortfolioRiskCaps,V27_RISK_LIMITS} from '../src/portfolio-risk-calibration.js';
import {sanitizeBugContaminatedLearning,isKnownBugHistoryRow} from '../src/learning-quarantine.js';
import {FinalDecisionController} from '../src/final-decision-controller.js';

const positiveLearning={buckets:[{bucket:'PULLBACK_RETEST',samples15:20,qualityPct:.30,winRatePct:60},{bucket:'CHASE_NEAR_HIGH',samples15:20,qualityPct:-.40,winRatePct:30}]};
const pullback={symbol:'DIP.DE',theme:'TECH',currency:'EUR',liveScore:5.2,liveConfidence:.74,day:1.2,intraday5m:.08,intraday20m:.20,momentumAcceleration5:.05,intradayRsi:60,drawdownFrom20mHighPct:-.80,news:.1,eventRisk:'NONE',momentumState:'NORMAL',momentumSellSignal:'NONE',volumeRatio:1.2};

{
 const e=calibratedEntryExpectation(pullback,positiveLearning);
 assert.equal(e.bucket,'PULLBACK_RETEST');
 assert.equal(e.block,false);
 assert.ok(e.posteriorExpectedMovePct>0.1,'gutes gelerntes Pullback-Setup soll positiven geschrumpften Erwartungswert behalten');
 assert.ok(e.sizeMultiplier>1,'reifes positives Setup darf Positionsgroesse leicht anheben');
}

{
 const chase={...pullback,symbol:'CHASE.DE',day:4.0,intradayRsi:75,drawdownFrom20mHighPct:-.05,intraday5m:.08,intraday20m:.3};
 const e=calibratedEntryExpectation(chase,positiveLearning);
 assert.equal(e.bucket,'CHASE_NEAR_HIGH');
 assert.equal(e.block,true,'reifes empirisch schlechtes High-Chase-Setup muss blockiert werden');
}

{
 const capped=applyPortfolioRiskCaps([{c:pullback,allocation:50}],{config:{cash:10000,currency:'EUR'},positions:[]},10000);
 assert.equal(capped.length,1);
 assert.ok(capped[0].allocation<=V27_RISK_LIMITS.maxSinglePositionPct+.01,'neue Einzelposition darf nicht mehr als 25% Depotwert bekommen');
}

{
 const state={config:{cash:7500,currency:'EUR'},positions:[{symbol:'OLD.DE',theme:'TECH',currency:'EUR',invested:2500,entry_price:100,last_price:100,entry_fx:1,last_fx:1}]};
 const capped=applyPortfolioRiskCaps([{c:pullback,allocation:50}],state,7500);
 assert.equal(capped.length,1);
 assert.ok(capped[0].allocation<=20.01,'bestehende 25% TECH plus neuer Kauf darf Themenlimit 40% nicht ueberschreiten');
 assert.ok(capped[0].riskCap.reasons.some(x=>/Themencluster/.test(x)),'Theme-Cap muss im Entscheidungsgrund sichtbar sein');
}

{
 const base={async run(){return{response:JSON.stringify({summary:'inner',actions:[]})}}};
 const controller=new FinalDecisionController(base,{getState:()=>({config:{cash:10000,start_capital:10000,currency:'EUR'},positions:[],candidates:[pullback]}),getLearning:()=>positiveLearning});
 const input={messages:[{role:'user',content:`PAPER-TRADING ONLY. Kandidaten=${JSON.stringify([pullback])} Gehalten=[]`}]};
 const out=JSON.parse((await controller.run('fake',input)).response),buy=out.actions.find(x=>x.action==='BUY');
 assert.ok(buy,'gutes Pullback-Setup soll kaufbar bleiben');
 assert.ok(buy.allocation_pct<=25.01,'V27-Risk-Cap muss auch im finalen Controller greifen');
 assert.match(buy.reason,/Setup-Kalibrierung/);
}

{
 const buyAt='2026-08-20T08:10:21.484Z',sellAt='2026-08-20T08:22:22.291Z';
 const badSell={action:'VERKAUF',symbol:'OTKAR.IS',ts:sellAt,reason:'KI SELL 72%: FINAL-CONTROLLER INVALIDATION EXIT: Verlustposition zeigt bestätigte Mehrsignal-Schwäche · Alter 12.0 Min. · P/L -0.33%.'};
 assert.equal(isKnownBugHistoryRow(badSell),true);
 assert.equal(isKnownBugHistoryRow({action:'VERKAUF',symbol:'CLEAN',reason:'THESIS-INVALIDATION EXIT: Verkäuferdominanz 70%'}),false,'normaler echter Verlusttrade bleibt Lernmaterial');
 const decisionId=`2026-08-20:OTKAR.IS:${buyAt}:${sellAt}`;
 const data=new Map([
  ['state/trade-decision-learning-v1',{seen:{[decisionId]:1,'clean':1},samples:[{id:decisionId,kind:'TRADE',symbol:'OTKAR.IS',buyAt,sellAt,sellTooEarly:true},{id:'clean',kind:'TRADE',symbol:'CLEAN',buyAt:'2026-08-20T08:00:00Z',sellAt:'2026-08-20T09:00:00Z'}]}],
  ['state/zero-live-signal-learning-v1',{timedCompleted:2,recentTiming:[{at:Date.parse(buyAt)+15*60000,symbol:'OTKAR.IS',bucket:'NORMAL_ENTRY',horizonMin:15,pnlPct:-.3,maePct:-.5,mfePct:.1},{at:Date.parse(buyAt),symbol:'CLEAN',bucket:'NORMAL_ENTRY',horizonMin:15,pnlPct:.2,maePct:-.1,mfePct:.3}],timingStats:{NORMAL_ENTRY:{15:{count:2,wins:1,sumPnl:-.1,sumAbsPnl:.5,sumMae:-.6,sumMfe:.4}}},open:{},pending:{}}]
 ]);
 const storage={kv:{get:k=>data.get(k),put:(k,v)=>data.set(k,v)}};
 const history=[{action:'KAUF',symbol:'OTKAR.IS',ts:buyAt,reason:'KI BUY normal'},badSell];
 const q=sanitizeBugContaminatedLearning(storage,history);
 assert.equal(q.knownBugTradeWindows,1);
 assert.equal(q.decisionSamplesRemoved,1);
 assert.equal(q.timingSamplesRemoved,1);
 const d=data.get('state/trade-decision-learning-v1');
 assert.equal(d.samples.some(x=>x.symbol==='OTKAR.IS'),false,'nachweislicher V26.1-Bugtrade darf nicht im Entscheidungslernen bleiben');
 assert.equal(d.samples.some(x=>x.symbol==='CLEAN'),true,'normaler Trade muss Lernmaterial bleiben');
 assert.equal(d.seen[decisionId],'QUARANTINED_CODE_BUG','Bugtrade muss gegen spaeteres Wieder-Einlernen markiert bleiben');
}

console.log('V27 risk/calibration/quarantine regression tests: OK');
