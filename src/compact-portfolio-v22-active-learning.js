import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v21-source-budget.js';
import {FinalDecisionController} from './final-decision-controller.js';
import {clearRunScopedDecisionState} from './run-reset-hygiene.js';
import {getLiveLearningStatus} from './live-signal-learning.js';
import {sanitizeBugContaminatedLearning} from './learning-quarantine.js';
import {V27_RISK_LIMITS} from './portfolio-risk-calibration.js';
import {FAST_CALIBRATION} from './generated-fast-calibration.js';
import {updateForwardCurveLearning,getForwardCurveForecast,getForwardCurveStatus} from './forward-curve-learning.js';

// PAPER-TRADING ONLY. V27.2 keeps V27.1 anti-flip-flop/risk protections and adds
// probabilistic 5/15/30-minute forward curve learning across bought and unbought candidates.
export class MarketPortfolio extends BasePortfolio{
 constructor(ctx,env){
  super(ctx,env);
  this.ctx=ctx;
  this.lastLearningQuarantine=null;
  this.lastForwardLearning=null;
  const ai=this.engine?.env?.AI;
  if(ai?.run&&!ai.__finalDecisionControllerV272){
   const wrapped=new FinalDecisionController(ai,{
    getState:()=>{try{const s=this._actualState?.()||{},market=Array.isArray(s?.candidates)?s.candidates:[];return{...s,candidates:market.map(c=>({...c,forwardForecast:getForwardCurveForecast(this.ctx?.storage,c,market)}))}}catch{return{}}},
    getLearning:()=>{try{return getLiveLearningStatus(this.ctx?.storage)}catch{return null}}
   });
   wrapped.__finalDecisionControllerV272=true;
   this.engine.env.AI=wrapped;
  }
 }
 _clearRunScopedDecisionState(){return clearRunScopedDecisionState({storage:this.ctx?.storage,freeAiGuard:this.freeAiGuard});}
 _sanitizeBugLearning(){try{const state=this._actualState?.()||{};this.lastLearningQuarantine=sanitizeBugContaminatedLearning(this.ctx?.storage,state?.history||[]);return this.lastLearningQuarantine}catch(e){return{changed:false,error:String(e?.message||e)}}}
 _updateForwardLearning(){try{const state=this._actualState?.()||{};this.lastForwardLearning=updateForwardCurveLearning(this.ctx?.storage,state);return this.lastForwardLearning}catch(e){return{error:String(e?.message||e)}}}
 async start(options={}){const runIsolation=this._clearRunScopedDecisionState();const r=await super.start(options);this._sanitizeBugLearning();this._updateForwardLearning();return{...r,runIsolation};}
 async reset(){const runIsolation=this._clearRunScopedDecisionState();const r=await super.reset();this._sanitizeBugLearning();this._updateForwardLearning();return{...r,runIsolation};}
 async scan(...args){this._sanitizeBugLearning();const r=await super.scan(...args);const learningQuarantine=this._sanitizeBugLearning(),forwardLearning=this._updateForwardLearning();return r&&typeof r==='object'?{...r,learningQuarantine,forwardLearning}:r;}
 async status(){
  const s=await super.status(),quarantine=this._sanitizeBugLearning(),learning=getLiveLearningStatus(this.ctx?.storage),forward=getForwardCurveStatus(this.ctx?.storage);
  s.finalDecisionPolicy={
   enabled:true,version:27.2,paperTradingOnly:true,mode:'SINGLE_AUTHORITATIVE_FINAL_CONTROLLER',oneFinalActionPerSymbol:true,
   entryTypes:['EARLY_BREAKOUT','PULLBACK_RECLAIM','BASE_RECLAIM'],dynamicCapitalDeployment:'Qualitäts- und Chancenbreiten-basiert, anschließend durch Depotrisiko und reife Vorwärtsprognose begrenzt',
   peakChaseBlocked:true,hardInnerSafetyHoldPreserved:true,freshExitContextMerged:true,automaticScaleUp:false,automaticRepeatScaleUpBlocked:true,residualCashOrderBlocked:true,falseHardExitTextMatchBlocked:true,timeBasedLossExit:false,correlatedMomentumAloneCannotInvalidate:true,lossExitNeedsIndependentThesisInvalidation:true,genuineHardRiskImmediateExit:true,winnerNoiseSellBlocked:true,restartIsolation:true,portfolioRiskCaps:true,calibratedSetupExpectation:true,bugTradeLearningQuarantine:true,
   explicitExitHoldCannotBecomeMomentumHardExit:true,rapidReentryChurnBlocked:true,reentryNeedsNewThesis:true,reentryRules:{absoluteMinutesAfterAnySell:15,minimumMinutesAfterLossSell:25,newThesisWindowMinutes:45,churnLockMinutes:60,churnLookbackMinutes:90},
   forwardCurveForecasting:true,forwardHorizonsMinutes:[5,15,30],forwardForecastMinSamplesBeforeAdjustment:8,forwardForecastMinSamplesBeforeBlock:18,marketRegimeAware:true,unboughtCandidatesAlsoLearned:true,
   maxCandidatesPerDecision:4,
   regressionTests:'tests/final-decision-controller-v26.test.mjs + tests/run-reset-hygiene-v262.test.mjs + tests/v27-risk-learning.test.mjs + tests/v271-anti-flipflop.test.mjs + tests/v272-forward-curve.test.mjs',
   rule:'Keine sichere Kursvorhersage: V27.2 lernt Wahrscheinlichkeiten aus beobachteten Kurvenlagen und dem Marktmodus. 5/15/30-Minuten-Ergebnisse aller relevanten Kandidaten werden nachträglich aufgelöst. Wenige Samples dürfen nur leicht gewichten; erst reife statistisch schlechte Muster dürfen BUY blockieren. Anti-Flip-Flop, Risk-Caps und echte These-Invaliderung bleiben bindend.'
  };
  s.portfolioRiskPolicy={enabled:true,version:27.2,method:'FACTOR_CONCENTRATION_PROXY',maxSinglePositionPct:V27_RISK_LIMITS.maxSinglePositionPct,maxThemePct:V27_RISK_LIMITS.maxThemePct,maxRegionPct:V27_RISK_LIMITS.maxRegionPct,maxForeignCurrencyPct:V27_RISK_LIMITS.maxForeignCurrencyPct,maxBaseCurrencyPct:V27_RISK_LIMITS.maxBaseCurrencyPct,note:'Proxy-Korrelation über Thema, Region und Währung; keine behauptete exakte Kovarianzmatrix. Gleichzeitige BUYs werden gemeinsam gegen dieselben Limits gerechnet.'};
  s.learningCalibrationPolicy={enabled:true,version:27.2,method:'SHRUNK_EMPIRICAL_SETUP_EXPECTATION_PLUS_FORWARD_CURVE',timingHorizonsMinutes:learning?.horizonsMinutes||[15,30,60],matureTimingBuckets:learning?.matureTimingBuckets||0,activeCleanTimedCheckpoints:learning?.timedCheckpoints||0,priorVersion:FAST_CALIBRATION?.version||null,priorHoldoutBuySamples:FAST_CALIBRATION?.validation?.holdoutBuySamples||0,priorBuyHitRate:FAST_CALIBRATION?.validation?.holdoutBuyHitRate??null,priorBuyMeanPct:FAST_CALIBRATION?.validation?.holdoutBuyMeanPct??null,forwardCurve:forward,confidenceIsCalibratedProbability:false,note:'Historischer Holdout und saubere Live-Buckets bleiben die Basis. Die neue 5/15/30-Minuten-Prognose wird konservativ hinzugemischt und lernt auch aus nicht gekauften Kandidaten. Interne Konfidenz bleibt keine garantierte Erfolgswahrscheinlichkeit.'};
  s.forwardCurveLearningPolicy={...forward,enabled:true,version:27.2,learnsFromUnboughtCandidates:true,usesMarketBreadthRegime:true,probabilisticOnly:true,rule:'Beobachtung -> tatsächlicher Kurs nach 5/15/30 Min. -> empirische Treffer-/Erwartungswerte für ähnliche Kurven und Marktregime. Keine Vorhersage wird als sicher behandelt.'};
  s.learningQuarantinePolicy={enabled:true,version:27.2,...quarantine,keepsOrdinaryLosingTrades:true,legacyAggregatesArchivedNotActive:true,contradictoryExitHoldHardExitQuarantined:true,immediateReentryAfterBugSellQuarantined:true,rule:'Widersprüchliche HARD-EXIT/EXIT-HOLD-Fälle und direkte Reentries danach werden aus aktiven Lernproben entfernt. Normale schlechte Trades bleiben Lernmaterial.'};
  s.runIsolationPolicy={enabled:true,version:27.2,newRunGetsFreshTradingState:true,clearsRunScopedDecisionState:true,longTermLearningPreserved:true,legacyPreV27LearningPreservedAsArchive:true,forwardCurveLearningPreserved:true,dailyAiBudgetPreserved:true,runtimeTradeConfigPreserved:true,automaticScaleUp:false,rule:'Neu starten trennt laufbezogenen Handelszustand. Saubere langfristige Lernmodelle inklusive Vorwärtskurven-Lernen bleiben erhalten.'};
  if(s.executionModel)s.executionModel={...s.executionModel,finalDecisionControllerV272:true,oneFinalActionPerSymbol:true,automaticScaleUp:false,automaticRepeatScaleUpBlocked:true,residualCashOrderBlocked:true,restartIsolation:true,timeBasedLossExit:false,lossExitNeedsIndependentThesisInvalidation:true,portfolioRiskCaps:true,antiFlipFlop:true,forwardCurveForecasting:true};
  if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,finalDecisionControllerV272:true,automaticScaleUp:false,entryTimingFirst:true,hardInnerSafetyHoldPreserved:true,freshExitContextMerged:true,restartIsolation:true,timeBasedLossExit:false,calibratedSetupExpectation:true,antiFlipFlop:true,forwardCurveForecasting:true};
  return s;
 }
}
