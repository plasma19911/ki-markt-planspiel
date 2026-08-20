import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v21-source-budget.js';
import {FinalDecisionController} from './final-decision-controller.js';
import {clearRunScopedDecisionState} from './run-reset-hygiene.js';

// PAPER-TRADING ONLY. V26.3 keeps one authoritative final controller, disables
// automatic scale-ups, isolates explicit restarts from stale run state and removes
// time-based loss-exit permission. Soft loss exits require independent thesis invalidation.
export class MarketPortfolio extends BasePortfolio{
 constructor(ctx,env){
  super(ctx,env);
  this.ctx=ctx;
  const ai=this.engine?.env?.AI;
  if(ai?.run&&!ai.__finalDecisionControllerV263){
   const wrapped=new FinalDecisionController(ai,{getState:()=>{try{return this._actualState?.()||{}}catch{return{}}}});
   wrapped.__finalDecisionControllerV263=true;
   this.engine.env.AI=wrapped;
  }
 }
 _clearRunScopedDecisionState(){
  return clearRunScopedDecisionState({storage:this.ctx?.storage,freeAiGuard:this.freeAiGuard});
 }
 async start(options={}){
  const runIsolation=this._clearRunScopedDecisionState();
  const r=await super.start(options);
  return{...r,runIsolation};
 }
 async reset(){
  const runIsolation=this._clearRunScopedDecisionState();
  const r=await super.reset();
  return{...r,runIsolation};
 }
 async status(){
  const s=await super.status();
  s.finalDecisionPolicy={
   enabled:true,
   version:26.3,
   paperTradingOnly:true,
   mode:'SINGLE_AUTHORITATIVE_FINAL_CONTROLLER',
   oneFinalActionPerSymbol:true,
   entryTypes:['EARLY_BREAKOUT','PULLBACK_RECLAIM','BASE_RECLAIM'],
   dynamicCapitalDeployment:'22–100% des freien Cashs je nach Qualität und Chancenbreite',
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
   lossExitIndependentEvidence:['Strukturbruch + Verkäuferkontrolle','Strukturbruch + separat bestätigter Exit-Grund','deutlicher Preis-/Strukturschaden'],
   genuineHardRiskImmediateExit:true,
   winnerNoiseSellBlocked:true,
   restartIsolation:true,
   restartClears:['alte AI-Plan/News-Cooldowns','alte Positions-Peaks','Second-Chance-Runtime','alte Ordervorschläge'],
   restartPreserves:['langfristiges Replay-/Signal-Lernen','Cloudflare-AI-Tagesbudget','Runtime-Trade-Konfiguration','frische PC-Agent-Marktvoranalyse'],
   maxCandidatesPerDecision:4,
   regressionTests:'tests/final-decision-controller-v26.test.mjs + tests/run-reset-hygiene-v262.test.mjs',
   rule:'Pro Symbol genau eine finale Aktion. Bestandspositionen werden niemals automatisch aufgestockt. Verlustpositionen werden nicht wegen Zeitablauf oder nur gemeinsam negativer 5m/20m/Beschleunigungswerte verkauft. Ein Soft-SELL braucht unabhängig bestätigten Bruch der ursprünglichen These; echte harte Event-/REVERSAL-/STRONG-SELL-Risiken bleiben sofort handlungsfähig. Neustarts übernehmen Lernen, aber keinen alten laufbezogenen Entscheidungszustand.'
  };
  s.runIsolationPolicy={
   enabled:true,
   version:26.3,
   newRunGetsFreshTradingState:true,
   clearsRunScopedDecisionState:true,
   longTermLearningPreserved:true,
   dailyAiBudgetPreserved:true,
   runtimeTradeConfigPreserved:true,
   automaticScaleUp:false,
   rule:'Neu starten bedeutet neues Depot und neue laufbezogene Entscheidungszustände; nur echtes Lernen und Konfiguration werden bewusst übernommen.'
  };
  if(s.executionModel)s.executionModel={...s.executionModel,finalDecisionControllerV263:true,oneFinalActionPerSymbol:true,automaticScaleUp:false,automaticRepeatScaleUpBlocked:true,residualCashOrderBlocked:true,restartIsolation:true,timeBasedLossExit:false,lossExitNeedsIndependentThesisInvalidation:true};
  if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,finalDecisionControllerV263:true,automaticScaleUp:false,entryTimingFirst:true,hardInnerSafetyHoldPreserved:true,freshExitContextMerged:true,restartIsolation:true,timeBasedLossExit:false};
  return s;
 }
}
