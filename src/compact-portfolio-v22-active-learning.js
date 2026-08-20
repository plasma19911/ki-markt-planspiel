import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v21-source-budget.js';
import {FinalDecisionController} from './final-decision-controller.js';

// PAPER-TRADING ONLY. V25 keeps the existing data/news/source stack, but replaces
// the previous final Active-Learning override with one authoritative final decision
// controller for entry, sizing, hold and exit. Inner guards may enrich context, but
// they no longer have the last word on the emitted action list.
export class MarketPortfolio extends BasePortfolio{
 constructor(ctx,env){
  super(ctx,env);
  const ai=this.engine?.env?.AI;
  if(ai?.run&&!ai.__finalDecisionControllerV25){
   const wrapped=new FinalDecisionController(ai,{getState:()=>{try{return this._actualState?.()||{}}catch{return{}}}});
   wrapped.__finalDecisionControllerV25=true;
   this.engine.env.AI=wrapped;
  }
 }
 async status(){
  const s=await super.status();
  s.finalDecisionPolicy={
   enabled:true,
   version:25,
   paperTradingOnly:true,
   mode:'SINGLE_AUTHORITATIVE_FINAL_CONTROLLER',
   oneFinalActionAuthority:true,
   entryTypes:['EARLY_BREAKOUT','PULLBACK_RECLAIM','BASE_RECLAIM'],
   dynamicCapitalDeployment:'22–100% des freien Cashs je nach Qualität und Chancenbreite',
   peakChaseBlocked:true,
   hardNewsEventVenueSafetyPreserved:true,
   residualCashOrderBlocked:true,
   lossExitNeedsConfirmedInvalidation:true,
   winnerNoiseSellBlocked:true,
   maxCandidatesPerDecision:4,
   rule:'Eine einzige finale Instanz baut die endgültige BUY/HOLD/SELL-Liste neu auf. Käufe brauchen ein frühes Breakout-, Pullback-Reclaim- oder Base-Reclaim-Setup und dürfen kein Peak-/News-/Event-/Venue-Hard-Risk enthalten. Kapital wird nach Qualität dynamisch verteilt. Verkäufe erfolgen bei harter Invalidation oder bestätigter Mehrsignal-Schwäche; normales Rauschen wird gehalten.'
  };
  if(s.executionModel)s.executionModel={...s.executionModel,finalDecisionControllerV25:true,oneFinalActionAuthority:true,dynamicCapitalDeployment:'22-100',residualCashOrderBlocked:true};
  if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,finalDecisionControllerV25:true,entryTimingFirst:true,lossExitNeedsConfirmedInvalidation:true};
  return s;
 }
}
