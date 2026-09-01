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
 // V31.7 ist die finale Score-Autorität. Ein Kandidat mit Legacy-Score 0 darf
 // nicht schon im alten V30.9-Proposal verloren gehen, wenn sein Canonical-Setup
 // Trend + verlässliches Volumen sauber bestätigt.
 const canonical={symbol:'CANON.DE',name:'Canonical AG',isin:'DE000A1EWWX8',assetClass:'EQUITY',brokerVerified:true,brokerMatchMode:'EXACT_NORMALIZED_NAME',brokerVerificationSource:'Trade Republic official universe',score:0,decisionScore:0,momentum5Pct:.40,momentum20Pct:.70,momentumAcceleration5:.12,volumeRatio:1.40,volumeRatioSource:'PREVIOUS_COMPLETED',newsScore:0,entryQualityScore:70};
 const plan={actions:[{symbol:'CANON.DE',action:'HOLD',allocation_pct:0,reason:'legacy score empty'}],summary:'test'};
 const out=enforceHighScoreCapitalDeploymentV309(plan,{positions:[],candidates:[canonical]},null,[canonical]);
 const a=out.plan.actions.find(x=>x.symbol==='CANON.DE');
 assert.equal(a.action,'BUY','gültiger V31.7 Canonical-Kandidat muss einen BUY-Vorschlag erzeugen können');
 assert.equal(a.canonicalProposalBridgeV317,true);
 assert.equal(out.counters.canonicalInjected,1);
 assert.ok(out.counters.chosen.canonicalScore>=60);
 assert.ok(out.counters.chosen.canonicalDataQuality>=55);
 assert.ok(out.counters.chosen.canonicalOrthogonal>=1);
}

{
 // Fehlende optionale Bestätigung bleibt bewusst kein Freifahrtschein. Genau
 // solche Kandidaten standen live bei 59.9 und sollen ohne positive Edge nicht
 // künstlich gekauft werden.
 const noOrthogonal={symbol:'NOORTH.DE',name:'No Orthogonal AG',isin:'DE000A1EWWY6',assetClass:'EQUITY',brokerVerified:true,brokerMatchMode:'EXACT_NORMALIZED_NAME',brokerVerificationSource:'Trade Republic official universe',score:0,decisionScore:0,momentum5Pct:.45,momentum20Pct:.75,momentumAcceleration5:.15,volumeRatio:1,newsScore:0,entryQualityScore:72};
 const plan={actions:[{symbol:'NOORTH.DE',action:'HOLD',allocation_pct:0,reason:'no independent confirmation'}],summary:'test'};
 const out=enforceHighScoreCapitalDeploymentV309(plan,{positions:[],candidates:[noOrthogonal]},null,[noOrthogonal]);
 const a=out.plan.actions.find(x=>x.symbol==='NOORTH.DE');
 assert.equal(a.action,'HOLD','ohne Volumen-/News-Bestätigung darf die Canonical-Bridge nicht blind kaufen');
 assert.equal(out.counters.canonicalInjected,0);
}

{
 // Ein expliziter Nullwert in einem älteren Score-Feld darf einen vorhandenen
 // PC-Deep-Score nicht mehr verschlucken.
 const pcScored={symbol:'PC.DE',name:'PC Score AG',isin:'DE000A1EWWZ4',assetClass:'EQUITY',brokerVerified:true,brokerMatchMode:'EXACT_NORMALIZED_NAME',brokerVerificationSource:'Trade Republic official universe',daytradeLiveScore:0,decisionScore:0,pcDeepScore:72,score:0,momentum5Pct:.10,momentum20Pct:.20,entryQualityScore:60};
 const plan={actions:[{symbol:'PC.DE',action:'HOLD',allocation_pct:0,reason:'legacy null score'}],summary:'test'};
 const out=enforceHighScoreCapitalDeploymentV309(plan,{positions:[],candidates:[pcScored]},null,[pcScored]);
 const a=out.plan.actions.find(x=>x.symbol==='PC.DE');
 assert.equal(a.action,'BUY','pcDeepScore muss als robuster Score-Fallback nutzbar bleiben');
 assert.equal(out.counters.chosen.legacyScore,72);
}

{
 // Regression: Ein gehaltener Gewinner muss auch dann aufstockbar sein, wenn er
 // nicht erneut in state.candidates auftaucht. Die exakte TR-Verifikation kommt
 // aus dem Broker-Master; Score/Richtung/PnL kommen aus der gehaltenen Position.
 const winnerMaster={symbol:'WIN.DE',name:'Winner AG',isin:'DE000A1EWWX9',assetClass:'EQUITY',brokerVerified:true,brokerMatchMode:'EXACT_NORMALIZED_NAME',brokerVerificationSource:'Trade Republic official universe'};
 const positions=[
  {symbol:'WIN.DE',name:'Winner AG',decisionScore:73,rawDecisionScore:52,entry_price:100,last_price:101,entry_fx:1,last_fx:1,chartDirectionMode:'UP'},
  {symbol:'B.DE',decisionScore:64,rawDecisionScore:48,entry_price:100,last_price:100,chartDirectionMode:'FLAT'},
  {symbol:'C.DE',decisionScore:63,rawDecisionScore:47,entry_price:100,last_price:100,chartDirectionMode:'FLAT'},
  {symbol:'D.DE',decisionScore:61,rawDecisionScore:44,entry_price:100,last_price:99.8,chartDirectionMode:'FLAT'}
 ];
 const plan={actions:positions.map(p=>({symbol:p.symbol,action:'HOLD',allocation_pct:0,reason:'hold'})),summary:'test'};
 const out=enforceHighScoreCapitalDeploymentV309(plan,{positions,candidates:[]},null,[winnerMaster]);
 const a=out.plan.actions.find(x=>x.symbol==='WIN.DE');
 assert.equal(a.action,'BUY','Bei vier Plätzen darf bestätigte Stärke aus Position + Broker-Master aufgestockt werden');
 assert.ok(Number(a.allocation_pct)>=10&&Number(a.allocation_pct)<=100,'Winner-Top-up bleibt dynamisch innerhalb 0-100% ohne Hebel');
 assert.equal(out.counters.winnerTopups,1);
 assert.equal(out.counters.brokerRows,1);
}

console.log('V30.9.4 canonical proposal bridge + capital deployment regression OK');
