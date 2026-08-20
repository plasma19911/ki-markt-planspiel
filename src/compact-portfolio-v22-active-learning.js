import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v21-source-budget.js';
import {FinalDecisionController} from './final-decision-controller.js';
import {clearRunScopedDecisionState} from './run-reset-hygiene.js';
import {getLiveLearningStatus} from './live-signal-learning.js';
import {sanitizeBugContaminatedLearning} from './learning-quarantine.js';
import {V27_RISK_LIMITS} from './portfolio-risk-calibration.js';
import {FAST_CALIBRATION} from './generated-fast-calibration.js';

// PAPER-TRADING ONLY. V27 keeps the V26.3 thesis-exit protections and adds
// portfolio concentration limits, empirically shrunk setup expectations and a
// quarantine for trades that are known to have been created by code bugs.
export class MarketPortfolio extends BasePortfolio{
 constructor(ctx,env){
  super(ctx,env);
  this.ctx=ctx;
  this.lastLearningQuarantine=null;
  const ai=this.engine?.env?.AI;
  if(ai?.run&&!ai.__finalDecisionControllerV27){
   const wrapped=new FinalDecisionController(ai,{
    getState:()=>{try{return this._actualState?.()||{}}catch{return{}}},
    getLearning:()=>{try{return getLiveLearningStatus(this.ctx?.storage)}catch{return null}}
   });
   wrapped.__finalDecisionControllerV27=true;
   this.engine.env.AI=wrapped;
  }
 }
 _clearRunScopedDecisionState(){
  return clearRunScopedDecisionState({storage:this.ctx?.storage,freeAiGuard:this.freeAiGuard});
 }
 _sanitizeBugLearning(){
  try{const state=this._actualState?.()||{};this.lastLearningQuarantine=sanitizeBugContaminatedLearning(this.ctx?.storage,state?.history||[]);return this.lastLearningQuarantine}catch(e){return{changed:false,error:String(e?.message||e)}}
 }
 async start(options={}){
  const runIsolation=this._clearRunScopedDecisionState();
  const r=await super.start(options);
  this._sanitizeBugLearning();
  return{...r,runIsolation};
 }
 async reset(){
  const runIsolation=this._clearRunScopedDecisionState();
  const r=await super.reset();
  this._sanitizeBugLearning();
  return{...r,runIsolation};
 }
 async scan(...args){
  this._sanitizeBugLearning();
  const r=await super.scan(...args);
  const learningQuarantine=this._sanitizeBugLearning();
  return r&&typeof r==='object'?{...r,learningQuarantine}:r;
 }
 async status(){
  const s=await super.status(),learning=getLiveLearningStatus(this.ctx?.storage),quarantine=this.lastLearningQuarantine||this._sanitizeBugLearning();
  s.finalDecisionPolicy={
   enabled:true,
   version:27,
   paperTradingOnly:true,
   mode:'SINGLE_AUTHORITATIVE_FINAL_CONTROLLER',
   oneFinalActionPerSymbol:true,
   entryTypes:['EARLY_BREAKOUT','PULLBACK_RECLAIM','BASE_RECLAIM'],
   dynamicCapitalDeployment:'Qualitäts- und Chancenbreiten-basiert, anschließend durch Depotrisiko begrenzt',
   peakChaseBlocked:true,
   hardInnerSafetyHoldPreserved:true,
   freshExitContextMerged:true,
   automaticScaleUp:false,
   automaticRepeatScaleUpBlocked:true,
   residualCashOrderBlocked:true,
   falseHardExitTextMatchBlocked:true,
   timeBasedLossExit:false,
   correlatedMomentumAloneCannotInvalidate:true,
   lossExitNeedsIndependentThesisInvalidation:true,
   genuineHardRiskImmediateExit:true,
   winnerNoiseSellBlocked:true,
   restartIsolation:true,
   portfolioRiskCaps:true,
   calibratedSetupExpectation:true,
   bugTradeLearningQuarantine:true,
   maxCandidatesPerDecision:4,
   regressionTests:'tests/final-decision-controller-v26.test.mjs + tests/run-reset-hygiene-v262.test.mjs + tests/v27-risk-learning.test.mjs',
   rule:'Neue Käufe müssen Timing, Datenqualität und einen vorsichtig kalibrierten Erwartungswert bestehen und werden danach auf Depotkonzentration begrenzt. Bestehende Positionen werden nicht automatisch aufgestockt. Verlust-SELL bleibt an unabhängige These-Invaliderung gebunden.'
  };
  s.portfolioRiskPolicy={
   enabled:true,version:27,method:'FACTOR_CONCENTRATION_PROXY',
   maxSinglePositionPct:V27_RISK_LIMITS.maxSinglePositionPct,maxThemePct:V27_RISK_LIMITS.maxThemePct,maxRegionPct:V27_RISK_LIMITS.maxRegionPct,maxForeignCurrencyPct:V27_RISK_LIMITS.maxForeignCurrencyPct,maxBaseCurrencyPct:V27_RISK_LIMITS.maxBaseCurrencyPct,
   note:'Proxy-Korrelation über Thema, Region und Währung; keine behauptete exakte Kovarianzmatrix. Gleichzeitige BUYs werden gemeinsam gegen dieselben Limits gerechnet.'
  };
  s.learningCalibrationPolicy={
   enabled:true,version:27,method:'SHRUNK_EMPIRICAL_SETUP_EXPECTATION',timingHorizonsMinutes:learning?.horizonsMinutes||[15,30,60],matureTimingBuckets:learning?.matureTimingBuckets||0,
   priorVersion:FAST_CALIBRATION?.version||null,priorHoldoutSamples:FAST_CALIBRATION?.holdoutSampleCount||0,priorBuyHitRate:FAST_CALIBRATION?.validation?.holdoutBuyHitRate??null,priorBuyMeanPct:FAST_CALIBRATION?.validation?.holdoutBuyMeanPct??null,
   confidenceIsCalibratedProbability:false,note:'Historischer Holdout dient nur als vorsichtiger Prior. Live-Setup-Buckets werden per Shrinkage hinzugemischt; interne Konfidenz ist weiterhin keine garantierte Erfolgswahrscheinlichkeit.'
  };
  s.learningQuarantinePolicy={enabled:true,version:27,...quarantine,keepsOrdinaryLosingTrades:true,rule:'Nur nachgewiesene Codefehler wie ACTIVE-LEARNING-CASH, alte zeitbasierte V26.1-Exits und automatische Aufstockungen werden aus Lernproben entfernt. Normale Fehltrades bleiben Lernmaterial.'};
  s.runIsolationPolicy={
   enabled:true,version:27,newRunGetsFreshTradingState:true,clearsRunScopedDecisionState:true,longTermLearningPreserved:true,dailyAiBudgetPreserved:true,runtimeTradeConfigPreserved:true,automaticScaleUp:false,
   rule:'Neu starten bedeutet neues Depot und neue laufbezogene Entscheidungszustände; echtes Lernen bleibt erhalten, bekannte Bug-Samples werden separat quarantänisiert.'
  };
  if(s.executionModel)s.executionModel={...s.executionModel,finalDecisionControllerV27:true,oneFinalActionPerSymbol:true,automaticScaleUp:false,automaticRepeatScaleUpBlocked:true,residualCashOrderBlocked:true,restartIsolation:true,timeBasedLossExit:false,lossExitNeedsIndependentThesisInvalidation:true,portfolioRiskCaps:true};
  if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,finalDecisionControllerV27:true,automaticScaleUp:false,entryTimingFirst:true,hardInnerSafetyHoldPreserved:true,freshExitContextMerged:true,restartIsolation:true,timeBasedLossExit:false,calibratedSetupExpectation:true};
  return s;
 }
}
