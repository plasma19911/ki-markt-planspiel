import assert from 'node:assert/strict';
import {enforceHighScoreCapitalDeploymentV309} from '../src/high-score-capital-deployment-v309.js';

const exact={isin:'DE000A1EWWW0',assetClass:'EQUITY',brokerVerified:true,brokerMatchMode:'EXACT_NORMALIZED_NAME',brokerVerificationSource:'Trade Republic official universe'};
const candidate={symbol:'TEST.DE',name:'Test AG',score:72,decisionScore:72,momentum5Pct:-0.15,momentum20Pct:-0.25,entryQualityScore:68,...exact};
const state={positions:[],candidates:[candidate]};

{
 const plan={actions:[{symbol:'TEST.DE',action:'HOLD',allocation_pct:0,reason:'Timing noch nicht perfekt'}],summary:'test'};
 const out=enforceHighScoreCapitalDeploymentV309(plan,state,null,[candidate]);
 const a=out.plan.actions.find(x=>x.symbol==='TEST.DE');
 assert.equal(a.action,'BUY','72er Kandidat mit mildem Pullback muss bei leerem Depot kaufbar sein');
 assert.ok(Number(a.allocation_pct)>10,'70+ darf nicht nur als wirkungsloser 6-10%-Mini-Starter laufen');
 assert.equal(out.counters.injected,1);
}

{
 const plan={actions:[{symbol:'TEST.DE',action:'HOLD',allocation_pct:0,reason:'HARD-EVENT / NEWS-SHOCK'}],summary:'test'};
 const out=enforceHighScoreCapitalDeploymentV309(plan,state,null,[candidate]);
 const a=out.plan.actions.find(x=>x.symbol==='TEST.DE');
 assert.equal(a.action,'HOLD','Harte Event-/News-Sperren dürfen nie überschrieben werden');
 assert.equal(out.counters.blockedHard,1);
}

{
 const falling={...candidate,momentum5Pct:-0.8,momentum20Pct:-1.1};
 const plan={actions:[{symbol:'TEST.DE',action:'HOLD',allocation_pct:0,reason:'soft hold'}],summary:'test'};
 const out=enforceHighScoreCapitalDeploymentV309(plan,{positions:[],candidates:[falling]},null,[falling]);
 const a=out.plan.actions.find(x=>x.symbol==='TEST.DE');
 assert.equal(a.action,'HOLD','Echte Abwärtsdynamik bleibt blockiert');
 assert.equal(out.counters.blockedMomentum,1);
}

{
 const winner={...candidate,symbol:'WIN.DE',name:'Winner AG',score:73,decisionScore:73,momentum5Pct:0.1,momentum20Pct:0.25,isin:'DE000A1EWWX9'};
 const positions=[
  {symbol:'WIN.DE',name:'Winner AG',decisionScore:73,rawDecisionScore:52,entry_price:100,last_price:101,entry_fx:1,last_fx:1,chartDirectionMode:'UP'},
  {symbol:'B.DE',decisionScore:64,rawDecisionScore:48,entry_price:100,last_price:100,chartDirectionMode:'FLAT'},
  {symbol:'C.DE',decisionScore:63,rawDecisionScore:47,entry_price:100,last_price:100,chartDirectionMode:'FLAT'},
  {symbol:'D.DE',decisionScore:61,rawDecisionScore:44,entry_price:100,last_price:99.8,chartDirectionMode:'FLAT'}
 ];
 const plan={actions:positions.map(p=>({symbol:p.symbol,action:'HOLD',allocation_pct:0,reason:'hold'})),summary:'test'};
 const out=enforceHighScoreCapitalDeploymentV309(plan,{positions,candidates:[winner]},null,[winner]);
 const a=out.plan.actions.find(x=>x.symbol==='WIN.DE');
 assert.equal(a.action,'BUY','Bei vier Plätzen darf bestätigte Stärke mit freiem Cash aufgestockt werden');
 assert.ok(Number(a.allocation_pct)>=10&&Number(a.allocation_pct)<=100,'Winner-Top-up bleibt dynamisch innerhalb 0-100% ohne Hebel');
 assert.equal(out.counters.winnerTopups,1);
}

console.log('V30.9 high-score capital deployment regression OK');
