import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v278-trading-behavior.js';
import {OpportunityLearningGuardV279} from './opportunity-learning-v279.js';

// PAPER-TRADING ONLY. V27.9 adds opportunity-memory and missed-opportunity learning
// on top of the audited V27.8 trading discipline. No real broker orders are created.
export class MarketPortfolio extends BasePortfolio{
 constructor(ctx,env){
  super(ctx,env);
  this.ctx=ctx;
  const ai=this.engine?.env?.AI;
  if(ai?.run&&!ai.__opportunityLearningV279){
   const getState=()=>{try{return this._actualState?.()||{}}catch{return{}}};
   const wrapped=new OpportunityLearningGuardV279(ai,{getState,storage:this.ctx?.storage});
   wrapped.__opportunityLearningV279=true;
   this.opportunityLearning=wrapped;
   this.engine.env.AI=wrapped;
  }
 }
 async status(){
  const s=await super.status(),opportunity=this.opportunityLearning?.status?.()||{enabled:true,version:27.9};
  if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:27.9,
   mode:'SINGLE_AUTHORITATIVE_FINAL_CONTROLLER_PLUS_DETERMINISTIC_TRADE_INVARIANTS_PLUS_AGM_PREVIEW_PLUS_ADAPTIVE_TRADING_BEHAVIOR_PLUS_OPPORTUNITY_LEARNING',
   opportunityMemory:true,missedOpportunityLearning:true,readsNewsRadarIntoTradingPrompt:true,freshNewsPriority:true,idleCashTraining:true,lateImpulseRecheckQueue:true,
   paperTrainingUsesCashWhenQualified:true,stocksOnly:true,
   regressionTests:`${String(s.finalDecisionPolicy.regressionTests||'').replace(/\s*$/,'')} + V27.9 fresh-news / catalyst-starter / late-impulse-memory / reclaim / missed-opportunity-learning invariants`,
   rule:'V27.9 nutzt das Planspiel aktiver zum Lernen: frische Nachrichten aus dem vorhandenen News-Radar werden in den Handels-Prompt eingeblendet; starke Katalysator-Setups dürfen als wirtschaftlich sinnvolle Starter handeln; schnelle Impulse werden nicht vergessen, sondern bis Pullback/Reclaim weitergeführt. Verpasste Chancen werden als False-Negative-Lernsignal gespeichert und können nach wiederholter Evidenz die Wartezeit verkürzen. Harte News-/Event-/Venue-/Reversal-Sperren und alle V27.8 Exit-/Kostenregeln bleiben bindend. Nur Aktien.'};
  s.opportunityLearningPolicy={...opportunity,enabled:true,version:27.9,paperTradingOnly:true,stocksOnly:true};
  if(s?.executionModel)s.executionModel={...s.executionModel,opportunityLearningV279:true,readsNewsRadarIntoTradingPrompt:true,freshNewsPriority:true,lateImpulseMemory:true,reclaimQueue:true,missedOpportunityLearning:true,idleCashTraining:true,stocksOnly:true};
  if(s?.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,opportunityLearningV279:true,readsNewsRadarIntoTradingPrompt:true,freshNewsPriority:true,lateImpulseMemory:true,reclaimQueue:true,missedOpportunityLearning:true,idleCashTraining:true,stocksOnly:true};
  return s;
 }
}
