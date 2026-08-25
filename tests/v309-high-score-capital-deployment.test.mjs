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

console.log('V30.9 high-score capital deployment regression OK');
