import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v21-source-budget.js';
import {FinalDecisionController} from './final-decision-controller.js';

// PAPER-TRADING ONLY. V26 keeps one authoritative final controller and fixes
// duplicate/conflicting per-symbol actions, lost hard safety HOLDs and stale exit
// context. Automatic repeat scale-ups are disabled until a dedicated validated
// scale-up policy exists.
export class MarketPortfolio extends BasePortfolio{
 constructor(ctx,env){
  super(ctx,env);
  const ai=this.engine?.env?.AI;
  if(ai?.run&&!ai.__finalDecisionControllerV26){
   const wrapped=new FinalDecisionController(ai,{getState:()=>{try{return this._actualState?.()||{}}catch{return{}}}});
   wrapped.__finalDecisionControllerV26=true;
   this.engine.env.AI=wrapped;
  }
 }
 async status(){
  const s=await super.status();
  s.finalDecisionPolicy={
   enabled:true,
   version:26,
   paperTradingOnly:true,
   mode:'SINGLE_AUTHORITATIVE_FINAL_CONTROLLER',
   oneFinalActionPerSymbol:true,
   entryTypes:['EARLY_BREAKOUT','PULLBACK_RECLAIM','BASE_RECLAIM'],
   dynamicCapitalDeployment:'22–100% des freien Cashs je nach Qualität und Chancenbreite',
   peakChaseBlocked:true,
   hardInnerSafetyHoldPreserved:true,
   freshExitContextMerged:true,
   automaticRepeatScaleUpBlocked:true,
   residualCashOrderBlocked:true,
   lossExitNeedsConfirmedInvalidation:true,
   winnerNoiseSellBlocked:true,
   maxCandidatesPerDecision:4,
   regressionTests:'tests/final-decision-controller-v26.test.mjs',
   rule:'Pro Symbol existiert genau eine finale Aktion. Bestandspositionen werden nicht automatisch erneut gekauft. Harte News/Event/Venue/Quote/MTF-Sperren aus tieferen Prüfungen bleiben bindend. Für Exits werden Depotdaten mit frischen Kandidaten-/Momentumdaten zusammengeführt.'
  };
  if(s.executionModel)s.executionModel={...s.executionModel,finalDecisionControllerV26:true,oneFinalActionPerSymbol:true,automaticRepeatScaleUpBlocked:true,residualCashOrderBlocked:true};
  if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,finalDecisionControllerV26:true,entryTimingFirst:true,hardInnerSafetyHoldPreserved:true,freshExitContextMerged:true};
  return s;
 }
}
