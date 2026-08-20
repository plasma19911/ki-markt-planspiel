import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v21-source-budget.js';
import {FinalDecisionController} from './final-decision-controller.js';
import {clearRunScopedDecisionState} from './run-reset-hygiene.js';
import {getLiveLearningStatus} from './live-signal-learning.js';
import {sanitizeBugContaminatedLearning} from './learning-quarantine.js';
import {V27_RISK_LIMITS} from './portfolio-risk-calibration.js';
import {FAST_CALIBRATION} from './generated-fast-calibration.js';

// PAPER-TRADING ONLY. V27.1 keeps V27 risk/calibration and additionally blocks
// contradictory EXIT-HOLD -> HARD-EXIT conversions plus rapid SELL -> BUY churn.
export class MarketPortfolio extends BasePortfolio{
 constructor(ctx,env){
  super(ctx,env);
  this.ctx=ctx;
  this.lastLearningQuarantine=null;
  const ai=this.engine?.env?.AI;
  if(ai?.run&&!ai.__finalDecisionControllerV271){
   const wrapped=new FinalDecisionController(ai,{
    getState:()=>{try{return this._actualState?.()||{}}catch{return{}}},
    getLearning:()=>{try{return getLiveLearningStatus(this.ctx?.storage)}catch{return null}}
   });
   wrapped.__finalDecisionControllerV271=true;
   this.engine.env.AI=wrapped;
  }
 }
 _clearRunScopedDecisionState(){return clearRunScopedDecisionState({storage:this.ctx?.storage,freeAiGuard:this.freeAiGuard});}
 _sanitizeBugLearning(){try{const state=this._actualState?.()||{};this.lastLearningQuarantine=sanitizeBugContaminatedLearning(this.ctx?.storage,state?.history||[]);return this.lastLearningQuarantine}catch(e){return{changed:false,error:String(e?.message||e)}}}
 async start(options={}){const runIsolation=this._clearRunScopedDecisionState();const r=await super.start(options);this._sanitizeBugLearning();return{...r,runIsolation};}
 async reset(){const runIsolation=this._clearRunScopedDecisionState();const r=await super.reset();this._sanitizeBugLearning();return{...r,runIsolation};}
 async scan(...args){this._sanitizeBugLearning();const r=await super.scan(...args);const learningQuarantine=this._sanitizeBugLearning();return r&&typeof r==='object'?{...r,learningQuarantine}:r;}
 async status(){
  const s=await super.status(),quarantine=this._sanitizeBugLearning(),learning=getLiveLearningStatus(this.ctx?.storage);
  s.finalDecisionPolicy={
   enabled:true,version:27.1,paperTradingOnly:true,mode:'SINGLE_AUTHORITATIVE_FINAL_CONTROLLER',oneFinalActionPerSymbol:true,
   entryTypes:['EARLY_BREAKOUT','PULLBACK_RECLAIM','BASE_RECLAIM'],dynamicCapitalDeployment:'Qualitäts- und Chancenbreiten-basiert, anschließend durch Depotrisiko begrenzt',
   peakChaseBlocked:true,hardInnerSafetyHoldPreserved:true,freshExitContextMerged:true,automaticScaleUp:false,automaticRepeatScaleUpBlocked:true,residualCashOrderBlocked:true,falseHardExitTextMatchBlocked:true,timeBasedLossExit:false,correlatedMomentumAloneCannotInvalidate:true,lossExitNeedsIndependentThesisInvalidation:true,genuineHardRiskImmediateExit:true,winnerNoiseSellBlocked:true,restartIsolation:true,portfolioRiskCaps:true,calibratedSetupExpectation:true,bugTradeLearningQuarantine:true,
   explicitExitHoldCannotBecomeMomentumHardExit:true,rapidReentryChurnBlocked:true,reentryNeedsNewThesis:true,reentryRules:{absoluteMinutesAfterAnySell:15,minimumMinutesAfterLossSell:25,newThesisWindowMinutes:45,churnLockMinutes:60,churnLookbackMinutes:90},
   maxCandidatesPerDecision:4,
   regressionTests:'tests/final-decision-controller-v26.test.mjs + tests/run-reset-hygiene-v262.test.mjs + tests/v27-risk-learning.test.mjs + tests/v271-anti-flipflop.test.mjs',
   rule:'Ein explizites EXIT-HOLD wegen unzureichender Verkäuferstruktur darf nicht durch ein bloßes Reversal-Flag zum HARD EXIT werden. Nach einem SELL wird derselbe Titel nicht sofort wieder gekauft; innerhalb des Reentry-Fensters ist eine neue bestätigte Pullback-/Base-Reclaim-These nötig. V27-Risiko-, Kalibrierungs- und These-Exit-Regeln bleiben aktiv.'
  };
  s.portfolioRiskPolicy={enabled:true,version:27.1,method:'FACTOR_CONCENTRATION_PROXY',maxSinglePositionPct:V27_RISK_LIMITS.maxSinglePositionPct,maxThemePct:V27_RISK_LIMITS.maxThemePct,maxRegionPct:V27_RISK_LIMITS.maxRegionPct,maxForeignCurrencyPct:V27_RISK_LIMITS.maxForeignCurrencyPct,maxBaseCurrencyPct:V27_RISK_LIMITS.maxBaseCurrencyPct,note:'Proxy-Korrelation über Thema, Region und Währung; keine behauptete exakte Kovarianzmatrix. Gleichzeitige BUYs werden gemeinsam gegen dieselben Limits gerechnet.'};
  s.learningCalibrationPolicy={enabled:true,version:27.1,method:'SHRUNK_EMPIRICAL_SETUP_EXPECTATION',timingHorizonsMinutes:learning?.horizonsMinutes||[15,30,60],matureTimingBuckets:learning?.matureTimingBuckets||0,activeCleanTimedCheckpoints:learning?.timedCheckpoints||0,priorVersion:FAST_CALIBRATION?.version||null,priorHoldoutBuySamples:FAST_CALIBRATION?.validation?.holdoutBuySamples||0,priorBuyHitRate:FAST_CALIBRATION?.validation?.holdoutBuyHitRate??null,priorBuyMeanPct:FAST_CALIBRATION?.validation?.holdoutBuyMeanPct??null,confidenceIsCalibratedProbability:false,note:'Der BUY-spezifische historische Holdout dient nur als vorsichtiger Prior. Saubere Live-Setup-Buckets werden per Shrinkage hinzugemischt; interne Konfidenz ist keine garantierte Erfolgswahrscheinlichkeit.'};
  s.learningQuarantinePolicy={enabled:true,version:27.1,...quarantine,keepsOrdinaryLosingTrades:true,legacyAggregatesArchivedNotActive:true,contradictoryExitHoldHardExitQuarantined:true,immediateReentryAfterBugSellQuarantined:true,rule:'Widersprüchliche HARD-EXIT/EXIT-HOLD-Fälle und direkte Reentries danach werden aus aktiven Lernproben entfernt. Normale schlechte Trades bleiben Lernmaterial.'};
  s.runIsolationPolicy={enabled:true,version:27.1,newRunGetsFreshTradingState:true,clearsRunScopedDecisionState:true,longTermLearningPreserved:true,legacyPreV27LearningPreservedAsArchive:true,dailyAiBudgetPreserved:true,runtimeTradeConfigPreserved:true,automaticScaleUp:false,rule:'Neu starten bedeutet neues Depot und neue laufbezogene Entscheidungszustände. Der saubere V27-Lernepoch bleibt über Neustarts erhalten; alte Legacy-Aggregate bleiben nur als Archiv.'};
  if(s.executionModel)s.executionModel={...s.executionModel,finalDecisionControllerV271:true,oneFinalActionPerSymbol:true,automaticScaleUp:false,automaticRepeatScaleUpBlocked:true,residualCashOrderBlocked:true,restartIsolation:true,timeBasedLossExit:false,lossExitNeedsIndependentThesisInvalidation:true,portfolioRiskCaps:true,antiFlipFlop:true};
  if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,finalDecisionControllerV271:true,automaticScaleUp:false,entryTimingFirst:true,hardInnerSafetyHoldPreserved:true,freshExitContextMerged:true,restartIsolation:true,timeBasedLossExit:false,calibratedSetupExpectation:true,antiFlipFlop:true};
  return s;
 }
}
