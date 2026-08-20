import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v21-source-budget.js';
import {FinalDecisionController} from './final-decision-controller.js';
import {LossSellInvariant} from './loss-sell-invariant.js';
import {AgmPreviewAiGuard} from './agm-preview-ai-guard.js';
import {evaluateAgmCalendar,agmRuntimeHealth} from './agm-runtime.js';
import {AGM_PREVIEW_RULES} from './agm-opportunity-scoring.js';
import {clearRunScopedDecisionState} from './run-reset-hygiene.js';
import {getLiveLearningStatus} from './live-signal-learning.js';
import {sanitizeBugContaminatedLearning} from './learning-quarantine.js';
import {V27_RISK_LIMITS,existingPortfolioRiskAlerts} from './portfolio-risk-calibration.js';
import {FAST_CALIBRATION} from './generated-fast-calibration.js';
import {updateForwardCurveLearning,getForwardCurveForecast,getForwardCurveStatus} from './forward-curve-learning.js';

// PAPER-TRADING ONLY. V27.6 extends the audited V27.5 decision chain with a guarded
// Hauptversammlung preview path. AGM dates never bypass FX, costs, risk, regime or no-scale-up.
export class MarketPortfolio extends BasePortfolio{
 constructor(ctx,env){
  super(ctx,env);
  this.ctx=ctx;
  this.lastLearningQuarantine=null;
  this.lastForwardLearning=null;
  this.runtimeEnv=this.engine?.env||env;
  const ai=this.engine?.env?.AI;
  if(ai?.run&&!ai.__finalDecisionControllerV276){
   const stateWithForecast=()=>{try{const s=this._actualState?.()||{},market=Array.isArray(s?.candidates)?s.candidates:[],marketBreadth=s?.marketBreadth||null;return{...s,candidates:market.map(c=>({...c,forwardForecast:getForwardCurveForecast(this.ctx?.storage,c,market,marketBreadth)}))}}catch{return{}}};
   const finalController=new FinalDecisionController(ai,{
    getState:stateWithForecast,
    getLearning:()=>{try{return getLiveLearningStatus(this.ctx?.storage)}catch{return null}}
   });
   const agmPreview=new AgmPreviewAiGuard(finalController,{env:this.runtimeEnv,getState:stateWithForecast});
   const wrapped=new LossSellInvariant(agmPreview,{getState:stateWithForecast});
   wrapped.__finalDecisionControllerV276=true;
   wrapped.__lossSellInvariantV276=true;
   wrapped.__agmPreviewV276=true;
   this.agmPreview=agmPreview;
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
  const s=await super.status(),quarantine=this._sanitizeBugLearning(),learning=getLiveLearningStatus(this.ctx?.storage),forward=getForwardCurveStatus(this.ctx?.storage),riskAlerts=existingPortfolioRiskAlerts(s);
  const agmCalendar=await evaluateAgmCalendar(this.runtimeEnv,s,null,Date.now());
  s.agmCalendar=agmCalendar;
  s.finalDecisionPolicy={
   enabled:true,version:27.6,paperTradingOnly:true,mode:'SINGLE_AUTHORITATIVE_FINAL_CONTROLLER_PLUS_DETERMINISTIC_TRADE_INVARIANTS_PLUS_AGM_PREVIEW',oneFinalActionPerSymbol:true,
   entryTypes:['EARLY_BREAKOUT','PULLBACK_RECLAIM','BASE_RECLAIM','AGM_PREVIEW'],dynamicCapitalDeployment:'Qualitäts- und Chancenbreiten-basiert; AGM_PREVIEW ist ein kleiner zusätzlicher Vorlaufpfad und bleibt anschließend durch Depotrisiko, FX, Kosten, Vorwärtsprognose und Marktregime begrenzt',
   peakChaseBlocked:true,hardInnerSafetyHoldPreserved:true,freshExitContextMerged:true,automaticScaleUp:false,automaticRepeatScaleUpBlocked:true,executionScaleUpHardBlocked:true,residualCashOrderBlocked:true,falseHardExitTextMatchBlocked:true,timeBasedLossExit:false,correlatedMomentumAloneCannotInvalidate:true,lossExitNeedsIndependentThesisInvalidation:true,genuineHardRiskImmediateExit:true,winnerNoiseSellBlocked:true,restartIsolation:true,portfolioRiskCaps:true,calibratedSetupExpectation:true,bugTradeLearningQuarantine:true,
   explicitExitHoldCannotBecomeMomentumHardExit:true,rapidReentryChurnBlocked:true,reentryNeedsNewThesis:true,reentryRules:{absoluteMinutesAfterAnySell:15,minimumMinutesAfterLossSell:25,newThesisWindowMinutes:45,churnLockMinutes:60,churnLookbackMinutes:90},
   lossSellInvariant:true,netPnlIncludesEstimatedZeroExitFees:true,profitExitCannotCloseNetLoss:true,lossSellAgainstBuyerMajorityBlocked:true,shallowLossNeedsIndependentSellerStructure:true,externalHardRiskMayExitImmediately:true,
   orderEconomicsInvariant:true,maxEstimatedRoundTripCostPct:1.5,uneconomicMiniBuyBlocked:true,zeroFeeModelAware:true,
   netExpectedEdgeGate:true,netEdgeSafetyMarginPct:.05,netEdgeMinSamples:8,netEdgeMinDistinctForwardSymbols:3,expectedMoveMustCoverCostsWhenMature:true,
   marketRegimeEntryGate:true,riskOffNeedsRelativeStrength:true,riskOffSizeMultiplier:.55,reversalDownSizeMultiplier:.70,rangeBreakoutSizeMultiplier:.75,broadMarketRegime:true,broadMarketRegimeSource:s?.marketBreadth?.source||forward?.marketRegime?.source||null,
   minorQuoteUnitNormalization:true,minorQuoteCurrencies:['GBp/GBX→GBP','ZAc→ZAR','ILA→ILS'],minorUnitLegacyPositionRepair:true,unnormalizedMinorUnitTradeFailSafe:true,
   forwardCurveForecasting:true,forwardHorizonsMinutes:[5,15,30],forwardForecastMinSamplesBeforeAdjustment:8,forwardForecastMinSamplesBeforeBlock:18,marketRegimeAware:true,unboughtCandidatesAlsoLearned:true,
   agmPreview:true,agmPreviewVersion:27.6,agmCalendarDailyRefresh:true,agmLiveReevaluationEveryScan:true,agmMinimumScore:AGM_PREVIEW_RULES.minimumScore,agmMinimumConfidence:AGM_PREVIEW_RULES.minimumConfidence,agmMaximumAllocationPct:AGM_PREVIEW_RULES.maximumAllocationPct,agmHorizonDays:AGM_PREVIEW_RULES.horizonDays,agmRequiresPositiveProfitOutlook:true,agmRequiresFreshTechnicalConfirmation:true,agmNeverBypassesNormalSafetyGates:true,
   maxCandidatesPerDecision:4,
   regressionTests:'V26.3 + V26.2 + V27 + V27.1 + V27.2 + V27.3 + V27.4 + V27.5 audit + V27.6 AGM preview invariants',
   rule:'V27.6 ergänzt Hauptversammlungen als vorsichtigen Vorlauf-Katalysator. Nur ein positiver Gewinn-/Ausblick-Score plus frische technische Bestätigung kann AGM_PREVIEW freigeben; HV allein erzwingt keinen Kauf. Maximal 18% Cash und danach weiterhin dieselben FX-, Kosten-, Depotrisiko-, Marktregime-, Anti-Chase- und No-Scale-up-Regeln. Alle V27.5-Audit-Sicherungen bleiben aktiv.'
  };
  s.agmCalendarPolicy={enabled:true,version:27.6,refreshCadence:'daily',liveReevaluation:'every market/news scan',source:agmCalendar?.source||'finanzen.net Hauptversammlung',scoreRange:[0,100],scoreMeaning:'interner Vorab-Chancen-Score, keine Gewinnwahrscheinlichkeit',minimumTradeScore:AGM_PREVIEW_RULES.minimumScore,minimumConfidence:AGM_PREVIEW_RULES.minimumConfidence,maxAllocationPct:AGM_PREVIEW_RULES.maximumAllocationPct,horizonDays:AGM_PREVIEW_RULES.horizonDays,requiresPositiveProfitForecast:true,requiresTechnicalConfirmation:true,neverStandaloneBuyReason:true,runtime:agmRuntimeHealth()};
  s.portfolioRiskPolicy={enabled:true,version:27.6,method:'FACTOR_CONCENTRATION_PROXY',maxSinglePositionPct:V27_RISK_LIMITS.maxSinglePositionPct,maxThemePct:V27_RISK_LIMITS.maxThemePct,maxRegionPct:V27_RISK_LIMITS.maxRegionPct,maxForeignCurrencyPct:V27_RISK_LIMITS.maxForeignCurrencyPct,maxBaseCurrencyPct:V27_RISK_LIMITS.maxBaseCurrencyPct,existingRiskAlerts:riskAlerts,note:'Neue Käufe einschließlich AGM_PREVIEW werden an den aktuellen Caps begrenzt. Alte übergroße Positionen werden sichtbar gemeldet und nicht weiter aufgestockt.'};
  s.learningCalibrationPolicy={enabled:true,version:27.6,method:'SHRUNK_EMPIRICAL_SETUP_EXPECTATION_PLUS_FORWARD_CURVE_PLUS_COST_EDGE_PLUS_EVENT_CONTEXT',timingHorizonsMinutes:learning?.horizonsMinutes||[15,30,60],matureTimingBuckets:learning?.matureTimingBuckets||0,activeCleanTimedCheckpoints:learning?.timedCheckpoints||0,priorVersion:FAST_CALIBRATION?.version||null,priorHoldoutBuySamples:FAST_CALIBRATION?.validation?.holdoutBuySamples||0,priorBuyHitRate:FAST_CALIBRATION?.validation?.holdoutBuyHitRate??null,priorBuyMeanPct:FAST_CALIBRATION?.validation?.holdoutBuyMeanPct??null,forwardCurve:forward,confidenceIsCalibratedProbability:false,note:'HV-Score ist zusätzlicher Ereigniskontext, keine Gewinnwahrscheinlichkeit. Historischer Holdout, Live-Buckets, Forward-Curve und echte Orderkosten bleiben maßgeblich.'};
  s.forwardCurveLearningPolicy={...forward,enabled:true,version:27.6,learnsFromUnboughtCandidates:true,usesMarketBreadthRegime:true,marketBreadth:s?.marketBreadth||null,probabilisticOnly:true,finalBuyUsesMarketRegime:true,rule:'Beobachtung -> tatsächlicher Kurs nach 5/15/30 Min. -> empirische Treffer-/Erwartungswerte. AGM_PREVIEW bleibt zusätzlich marktregime- und kostenabhängig.'};
  s.learningQuarantinePolicy={enabled:true,version:27.6,...quarantine,keepsOrdinaryLosingTrades:true,legacyAggregatesArchivedNotActive:true,contradictoryExitHoldHardExitQuarantined:true,immediateReentryAfterBugSellQuarantined:true,rule:'Nachweislich durch Codefehler erzeugte Trades werden aus aktiven Lernproben entfernt. Normale schlechte Trades bleiben Lernmaterial.'};
  s.runIsolationPolicy={enabled:true,version:27.6,newRunGetsFreshTradingState:true,clearsRunScopedDecisionState:true,longTermLearningPreserved:true,legacyPreV27LearningPreservedAsArchive:true,forwardCurveLearningPreserved:true,dailyAiBudgetPreserved:true,runtimeTradeConfigPreserved:true,automaticScaleUp:false,rule:'Neu starten trennt laufbezogenen Handelszustand. Saubere langfristige Lernmodelle und der externe HV-Kalender bleiben erhalten.'};
  s.risk={...(s.risk||{}),hardLimits:true,budgetOnly:false,positionLimit:V27_RISK_LIMITS.maxSinglePositionPct,holdingLimit:null,automaticScaleUp:false,existingRiskAlerts:riskAlerts,rule:'Finale V27.6-Grenzen gelten nach dem inneren R2-Plan und auch für AGM_PREVIEW.'};
  if(s.executionModel)s.executionModel={...s.executionModel,finalDecisionControllerV276:true,oneFinalActionPerSymbol:true,automaticScaleUp:false,automaticRepeatScaleUpBlocked:true,executionScaleUpHardBlocked:true,residualCashOrderBlocked:true,restartIsolation:true,timeBasedLossExit:false,lossExitNeedsIndependentThesisInvalidation:true,portfolioRiskCaps:true,maxSinglePositionPct:V27_RISK_LIMITS.maxSinglePositionPct,alwaysInvested:false,antiFlipFlop:true,forwardCurveForecasting:true,lossSellInvariant:true,orderEconomicsInvariant:true,netExpectedEdgeGate:true,marketRegimeEntryGate:true,minorQuoteUnitNormalization:true,agmPreview:true,agmMaximumAllocationPct:AGM_PREVIEW_RULES.maximumAllocationPct};
  if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,finalDecisionControllerV276:true,automaticScaleUp:false,maxSinglePositionPct:V27_RISK_LIMITS.maxSinglePositionPct,alwaysInvested:false,entryTimingFirst:true,hardInnerSafetyHoldPreserved:true,freshExitContextMerged:true,restartIsolation:true,timeBasedLossExit:false,calibratedSetupExpectation:true,antiFlipFlop:true,forwardCurveForecasting:true,lossSellInvariant:true,orderEconomicsInvariant:true,netExpectedEdgeGate:true,marketRegimeEntryGate:true,minorQuoteUnitNormalization:true,agmPreview:true};
  return s;
 }
}
