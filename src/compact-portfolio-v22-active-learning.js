import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v21-source-budget.js';
import {FinalDecisionController} from './final-decision-controller.js';

// PAPER-TRADING ONLY. V26.1 keeps one authoritative final controller. Automatic
// position scale-ups are completely disabled. Soft loss exits require maturity plus
// confirmed multi-signal invalidation; genuine structured hard risks may still exit now.
export class MarketPortfolio extends BasePortfolio{
 constructor(ctx,env){
  super(ctx,env);
  const ai=this.engine?.env?.AI;
  if(ai?.run&&!ai.__finalDecisionControllerV261){
   const wrapped=new FinalDecisionController(ai,{getState:()=>{try{return this._actualState?.()||{}}catch{return{}}}});
   wrapped.__finalDecisionControllerV261=true;
   this.engine.env.AI=wrapped;
  }
 }
 async status(){
  const s=await super.status();
  s.finalDecisionPolicy={
   enabled:true,
   version:26.1,
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
   maxCandidatesPerDecision:4,
   regressionTests:'tests/final-decision-controller-v26.test.mjs',
   rule:'Pro Symbol genau eine finale Aktion. Bestandspositionen werden niemals automatisch aufgestockt. Ein Text wie Reversal nicht bestätigt ist kein Hard-Exit. Frische kleine Verlustpositionen werden bei normalem Rauschen gehalten; echte strukturierte Event-/REVERSAL-/STRONG-SELL-Risiken dürfen sofort schließen.'
  };
  if(s.executionModel)s.executionModel={...s.executionModel,finalDecisionControllerV261:true,oneFinalActionPerSymbol:true,automaticScaleUp:false,automaticRepeatScaleUpBlocked:true,residualCashOrderBlocked:true};
  if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,finalDecisionControllerV261:true,automaticScaleUp:false,entryTimingFirst:true,hardInnerSafetyHoldPreserved:true,freshExitContextMerged:true};
  return s;
 }
}
