import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v21-source-budget.js';
import {FinalDecisionController} from './final-decision-controller.js';
import {clearRunScopedDecisionState} from './run-reset-hygiene.js';

// PAPER-TRADING ONLY. V26.2 keeps one authoritative final controller, disables
// automatic scale-ups and makes every explicit new run independent from stale
// run-specific AI state while preserving long-term learning and daily quota data.
export class MarketPortfolio extends BasePortfolio{
 constructor(ctx,env){
  super(ctx,env);
  this.ctx=ctx;
  const ai=this.engine?.env?.AI;
  if(ai?.run&&!ai.__finalDecisionControllerV262){
   const wrapped=new FinalDecisionController(ai,{getState:()=>{try{return this._actualState?.()||{}}catch{return{}}}});
   wrapped.__finalDecisionControllerV262=true;
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
   version:26.2,
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
   freshLossSoftExitProtectionMinutes:12,
   lossExitNeedsConfirmedInvalidation:true,
   genuineHardRiskImmediateExit:true,
   winnerNoiseSellBlocked:true,
   restartIsolation:true,
   restartClears:['alte AI-Plan/News-Cooldowns','alte Positions-Peaks','Second-Chance-Runtime','alte Ordervorschläge'],
   restartPreserves:['langfristiges Replay-/Signal-Lernen','Cloudflare-AI-Tagesbudget','Runtime-Trade-Konfiguration','frische PC-Agent-Marktvoranalyse'],
   maxCandidatesPerDecision:4,
   regressionTests:'tests/final-decision-controller-v26.test.mjs + tests/run-reset-hygiene-v262.test.mjs',
   rule:'Pro Symbol genau eine finale Aktion. Bestandspositionen werden niemals automatisch aufgestockt. Ein Text wie Reversal nicht bestätigt ist kein Hard-Exit. Frische kleine Verlustpositionen werden bei normalem Rauschen gehalten. Ein expliziter Neustart erzeugt außerdem einen sauberen neuen Handelslauf: altes Lernen bleibt, aber alte Positions-/Cooldown-Zustände dürfen nicht hineinwirken.'
  };
  s.runIsolationPolicy={
   enabled:true,
   version:26.2,
   newRunGetsFreshTradingState:true,
   clearsRunScopedDecisionState:true,
   longTermLearningPreserved:true,
   dailyAiBudgetPreserved:true,
   runtimeTradeConfigPreserved:true,
   automaticScaleUp:false,
   rule:'Neu starten bedeutet neues Depot und neue laufbezogene Entscheidungszustände; nur echtes Lernen und Konfiguration werden bewusst übernommen.'
  };
  if(s.executionModel)s.executionModel={...s.executionModel,finalDecisionControllerV262:true,oneFinalActionPerSymbol:true,automaticScaleUp:false,automaticRepeatScaleUpBlocked:true,residualCashOrderBlocked:true,restartIsolation:true};
  if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,finalDecisionControllerV262:true,automaticScaleUp:false,entryTimingFirst:true,hardInnerSafetyHoldPreserved:true,freshExitContextMerged:true,restartIsolation:true};
  return s;
 }
}
