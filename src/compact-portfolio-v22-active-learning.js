import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v21-source-budget.js';
import {ActiveLearningCashAiGuard} from './active-learning-cash-guard.js';

// PAPER-TRADING ONLY. V22 is intentionally the outermost decision layer.
// It converts persistent soft HOLD behaviour into executed learning trades whenever
// at least one candidate survives hard safety and obvious peak-chase checks.
export class MarketPortfolio extends BasePortfolio{
 constructor(ctx,env){
  super(ctx,env);
  const ai=this.engine?.env?.AI;
  if(ai?.run&&!ai.__activeLearningCashGuard){
   const wrapped=new ActiveLearningCashAiGuard(ai);
   wrapped.__activeLearningCashGuard=true;
   this.engine.env.AI=wrapped;
  }
 }
 async status(){
  const s=await super.status();
  s.activeLearningCapitalPolicy={
   enabled:true,
   version:22,
   paperTradingOnly:true,
   mode:'DEPLOY_FREE_CASH_FOR_LEARNING',
   targetFreeCashDeploymentPct:100,
   maxCandidatesPerDecision:4,
   hardSafetyPreserved:true,
   obviousPeakChaseBlocked:true,
   softHoldMayBeOverridden:true,
   rule:'Wenn der Markt offen ist und mindestens ein handelbarer Kandidat harte Safety sowie den offensichtlichen Peak-Chase-Filter besteht, wird das freie Cash auf bis zu vier der besten Kandidaten verteilt. Dadurch entstehen ausgeführte Paper-Trades für Replay/Lernen statt dauerhaftem Cash-HOLD. Harte Event-/Reversal-/STRONG-SELL-/Venue-Sperren bleiben unangetastet.'
  };
  if(s.executionModel)s.executionModel={...s.executionModel,activeLearningCashDeployment:true,targetFreeCashDeploymentPct:100};
  if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,activeLearningCashDeployment:true,learningRequiresExecutedTrades:true};
  return s;
 }
}
