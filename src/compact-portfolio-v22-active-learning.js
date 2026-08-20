import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v21-source-budget.js';
import {FinalDecisionController} from './final-decision-controller.js';
import {LossSellInvariant} from './loss-sell-invariant.js';
import {clearRunScopedDecisionState} from './run-reset-hygiene.js';
import {getLiveLearningStatus} from './live-signal-learning.js';
import {sanitizeBugContaminatedLearning} from './learning-quarantine.js';
import {V27_RISK_LIMITS,existingPortfolioRiskAlerts} from './portfolio-risk-calibration.js';
import {FAST_CALIBRATION} from './generated-fast-calibration.js';
import {updateForwardCurveLearning,getForwardCurveForecast,getForwardCurveStatus} from './forward-curve-learning.js';

// PAPER-TRADING ONLY. V27.5 is the full-audit release: V27.4 decision quality plus
// canonical minor-currency units, broad-universe market regime and execution-level no-scale-up.
export class MarketPortfolio extends BasePortfolio{
 constructor(ctx,env){
  super(ctx,env);
  this.ctx=ctx;
  this.lastLearningQuarantine=null;
  this.lastForwardLearning=null;
  const ai=this.engine?.env?.AI;
  if(ai?.run&&!ai.__finalDecisionControllerV275){
   const stateWithForecast=()=>{try{const s=this._actualState?.()||{},market=Array.isArray(s?.candidates)?s.candidates:[],marketBreadth=s?.marketBreadth||null;return{...s,candidates:market.map(c=>({...c,forwardForecast:getForwardCurveForecast(this.ctx?.storage,c,market,marketBreadth)}))}}catch{return{}}};
   const finalController=new FinalDecisionController(ai,{
    getState:stateWithForecast,
    getLearning:()=>{try{return getLiveLearningStatus(this.ctx?.storage)}catch{return null}}
   });
   const wrapped=new LossSellInvariant(finalController,{getState:stateWithForecast});
   wrapped.__finalDecisionControllerV275=true;
   wrapped.__lossSellInvariantV275=true;
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
  s.finalDecisionPolicy={
   enabled:true,version:27.5,paperTradingOnly:true,mode:'SINGLE_AUTHORITATIVE_FINAL_CONTROLLER_PLUS_DETERMINISTIC_TRADE_INVARIANTS',oneFinalActionPerSymbol:true,
   entryTypes:['EARLY_BREAKOUT','PULLBACK_RECLAIM','BASE_RECLAIM'],dynamicCapitalDeployment:'Qualitäts- und Chancenbreiten-basiert, anschließend durch Depotrisiko, Vorwärtsprognose, breiten Marktmodus, Netto-Erwartung und Orderökonomie begrenzt',
   peakChaseBlocked:true,hardInnerSafetyHoldPreserved:true,freshExitContextMerged:true,automaticScaleUp:false,automaticRepeatScaleUpBlocked:true,executionScaleUpHardBlocked:true,residualCashOrderBlocked:true,falseHardExitTextMatchBlocked:true,timeBasedLossExit:false,correlatedMomentumAloneCannotInvalidate:true,lossExitNeedsIndependentThesisInvalidation:true,genuineHardRiskImmediateExit:true,winnerNoiseSellBlocked:true,restartIsolation:true,portfolioRiskCaps:true,calibratedSetupExpectation:true,bugTradeLearningQuarantine:true,
   explicitExitHoldCannotBecomeMomentumHardExit:true,rapidReentryChurnBlocked:true,reentryNeedsNewThesis:true,reentryRules:{absoluteMinutesAfterAnySell:15,minimumMinutesAfterLossSell:25,newThesisWindowMinutes:45,churnLockMinutes:60,churnLookbackMinutes:90},
   lossSellInvariant:true,netPnlIncludesEstimatedZeroExitFees:true,profitExitCannotCloseNetLoss:true,lossSellAgainstBuyerMajorityBlocked:true,shallowLossNeedsIndependentSellerStructure:true,externalHardRiskMayExitImmediately:true,
   orderEconomicsInvariant:true,maxEstimatedRoundTripCostPct:1.5,uneconomicMiniBuyBlocked:true,zeroFeeModelAware:true,
   netExpectedEdgeGate:true,netEdgeSafetyMarginPct:.05,netEdgeMinSamples:8,netEdgeMinDistinctForwardSymbols:3,expectedMoveMustCoverCostsWhenMature:true,
   marketRegimeEntryGate:true,riskOffNeedsRelativeStrength:true,riskOffSizeMultiplier:.55,reversalDownSizeMultiplier:.70,rangeBreakoutSizeMultiplier:.75,broadMarketRegime:true,broadMarketRegimeSource:s?.marketBreadth?.source||forward?.marketRegime?.source||null,
   minorQuoteUnitNormalization:true,minorQuoteCurrencies:['GBp/GBX→GBP','ZAc→ZAR','ILA→ILS'],minorUnitLegacyPositionRepair:true,unnormalizedMinorUnitTradeFailSafe:true,
   forwardCurveForecasting:true,forwardHorizonsMinutes:[5,15,30],forwardForecastMinSamplesBeforeAdjustment:8,forwardForecastMinSamplesBeforeBlock:18,marketRegimeAware:true,unboughtCandidatesAlsoLearned:true,
   maxCandidatesPerDecision:4,
   regressionTests:'tests/final-decision-controller-v26.test.mjs + tests/run-reset-hygiene-v262.test.mjs + tests/v27-risk-learning.test.mjs + tests/v271-anti-flipflop.test.mjs + tests/v272-forward-curve.test.mjs + tests/v273-loss-sell-invariant.test.mjs + tests/v274-net-edge-regime.test.mjs + tests/v275-audit-invariants.test.mjs',
   rule:'V27.5 behebt Auditfehler unterhalb der KI: Pence/Cent-Notierungen werden vor Bewertung und Ausführung auf Hauptwährung normiert, Fremdwährungs-Foresight nutzt den echten bereits geladenen FX-Satz, der Marktmodus kommt bevorzugt aus dem breiten offenen Coarse-Universum statt nur aus vorselektierten Kandidaten, und automatische Aufstockung ist zusätzlich direkt im Ausführungspfad gesperrt. V27.4 Netto-Edge, Gebühren-, Verlust-SELL-, Anti-Flip-Flop- und Risiko-Regeln bleiben aktiv.'
  };
  s.portfolioRiskPolicy={enabled:true,version:27.5,method:'FACTOR_CONCENTRATION_PROXY',maxSinglePositionPct:V27_RISK_LIMITS.maxSinglePositionPct,maxThemePct:V27_RISK_LIMITS.maxThemePct,maxRegionPct:V27_RISK_LIMITS.maxRegionPct,maxForeignCurrencyPct:V27_RISK_LIMITS.maxForeignCurrencyPct,maxBaseCurrencyPct:V27_RISK_LIMITS.maxBaseCurrencyPct,existingRiskAlerts:riskAlerts,note:'Neue Käufe werden an den aktuellen Caps begrenzt. Alte übergroße Positionen werden sichtbar gemeldet und nicht weiter aufgestockt; sie werden nicht allein wegen eines nachträglich eingeführten Caps zwangsverkauft.'};
  s.learningCalibrationPolicy={enabled:true,version:27.5,method:'SHRUNK_EMPIRICAL_SETUP_EXPECTATION_PLUS_FORWARD_CURVE_PLUS_COST_EDGE',timingHorizonsMinutes:learning?.horizonsMinutes||[15,30,60],matureTimingBuckets:learning?.matureTimingBuckets||0,activeCleanTimedCheckpoints:learning?.timedCheckpoints||0,priorVersion:FAST_CALIBRATION?.version||null,priorHoldoutBuySamples:FAST_CALIBRATION?.validation?.holdoutBuySamples||0,priorBuyHitRate:FAST_CALIBRATION?.validation?.holdoutBuyHitRate??null,priorBuyMeanPct:FAST_CALIBRATION?.validation?.holdoutBuyMeanPct??null,forwardCurve:forward,confidenceIsCalibratedProbability:false,note:'Historischer Holdout und saubere Live-Buckets bleiben die Basis. Reife Erwartungswerte werden gegen reale Orderkosten geprüft; der Marktregime-Kontext kommt bevorzugt aus dem breiten offenen Universum. Interne Konfidenz bleibt keine garantierte Erfolgswahrscheinlichkeit.'};
  s.forwardCurveLearningPolicy={...forward,enabled:true,version:27.5,learnsFromUnboughtCandidates:true,usesMarketBreadthRegime:true,marketBreadth:s?.marketBreadth||null,probabilisticOnly:true,finalBuyUsesMarketRegime:true,rule:'Beobachtung -> tatsächlicher Kurs nach 5/15/30 Min. -> empirische Treffer-/Erwartungswerte. Der Marktmodus wird bevorzugt aus dem breiten offenen Coarse-Universum gebildet; nur bei fehlender Breite fällt er auf ausgewählte Kandidaten zurück.'};
  s.learningQuarantinePolicy={enabled:true,version:27.5,...quarantine,keepsOrdinaryLosingTrades:true,legacyAggregatesArchivedNotActive:true,contradictoryExitHoldHardExitQuarantined:true,immediateReentryAfterBugSellQuarantined:true,rule:'Nachweislich durch Codefehler erzeugte Trades werden aus aktiven Lernproben entfernt. Normale schlechte Trades bleiben Lernmaterial.'};
  s.runIsolationPolicy={enabled:true,version:27.5,newRunGetsFreshTradingState:true,clearsRunScopedDecisionState:true,longTermLearningPreserved:true,legacyPreV27LearningPreservedAsArchive:true,forwardCurveLearningPreserved:true,dailyAiBudgetPreserved:true,runtimeTradeConfigPreserved:true,automaticScaleUp:false,rule:'Neu starten trennt laufbezogenen Handelszustand. Saubere langfristige Lernmodelle bleiben erhalten.'};
  if(s.executionModel)s.executionModel={...s.executionModel,finalDecisionControllerV275:true,oneFinalActionPerSymbol:true,automaticScaleUp:false,automaticRepeatScaleUpBlocked:true,executionScaleUpHardBlocked:true,residualCashOrderBlocked:true,restartIsolation:true,timeBasedLossExit:false,lossExitNeedsIndependentThesisInvalidation:true,portfolioRiskCaps:true,maxSinglePositionPct:V27_RISK_LIMITS.maxSinglePositionPct,alwaysInvested:false,antiFlipFlop:true,forwardCurveForecasting:true,lossSellInvariant:true,orderEconomicsInvariant:true,netExpectedEdgeGate:true,marketRegimeEntryGate:true,minorQuoteUnitNormalization:true};
  if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,finalDecisionControllerV275:true,automaticScaleUp:false,maxSinglePositionPct:V27_RISK_LIMITS.maxSinglePositionPct,alwaysInvested:false,entryTimingFirst:true,hardInnerSafetyHoldPreserved:true,freshExitContextMerged:true,restartIsolation:true,timeBasedLossExit:false,calibratedSetupExpectation:true,antiFlipFlop:true,forwardCurveForecasting:true,lossSellInvariant:true,orderEconomicsInvariant:true,netExpectedEdgeGate:true,marketRegimeEntryGate:true,minorQuoteUnitNormalization:true};
  return s;
 }
}
