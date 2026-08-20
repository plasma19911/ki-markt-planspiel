import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v21-source-budget.js';
import {ActiveLearningCashAiGuard} from './active-learning-cash-guard.js';

// PAPER-TRADING ONLY. V23 keeps learning active, but capital deployment is no longer
// allowed to overrule structural News/Event/Peak/MTF safety. The guard also reads
// live cash so residual cents never create meaningless follow-up orders.
export class MarketPortfolio extends BasePortfolio{
 constructor(ctx,env){
  super(ctx,env);
  const ai=this.engine?.env?.AI;
  if(ai?.run&&!ai.__activeLearningCashGuard){
   const wrapped=new ActiveLearningCashAiGuard(ai,{getState:()=>{try{return this._actualState?.()||{}}catch{return{}}}});
   wrapped.__activeLearningCashGuard=true;
   this.engine.env.AI=wrapped;
  }
 }
 async status(){
  const s=await super.status();
  s.activeLearningCapitalPolicy={
   enabled:true,
   version:23,
   paperTradingOnly:true,
   mode:'INTELLIGENT_CAPITAL_DEPLOYMENT',
   targetFreeCashDeploymentPct:'28–100 dynamisch',
   maxCandidatesPerDecision:4,
   hardSafetyPreserved:true,
   newsEventWaitPreserved:true,
   peakChaseBlocked:true,
   mtfSafetyPreserved:true,
   residualCashOrderBlocked:true,
   singleMediocreCandidateAllInBlocked:true,
   rule:'Freies Cash wird nur auf bereits sicher freigegebene Chancen verteilt. Eine einzelne mittelmäßige Chance bekommt keine 100%-All-in-Zuweisung. Mit Qualität und Chancenbreite steigt die Zielauslastung bis 100%. News-/Event-/Peak-/MTF-HOLDs werden niemals vom Lernmodus überstimmt. Restcash unter sinnvoller Ordergröße erzeugt keine Mini-/Centorders.'
  };
  if(s.executionModel)s.executionModel={...s.executionModel,activeLearningCashDeployment:true,targetFreeCashDeploymentPct:'dynamic 28-100',residualCashOrderBlocked:true,safetyHoldBinding:true};
  if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,activeLearningCashDeployment:true,learningRequiresExecutedTrades:true,singleMediocreAllInBlocked:true};
  return s;
 }
}
