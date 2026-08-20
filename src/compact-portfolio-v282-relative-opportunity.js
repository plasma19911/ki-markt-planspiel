import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v281-research-signal-fusion.js';
import {RelativeOpportunityLearningGuardV282} from './relative-opportunity-learning-v282.js';

// PAPER-TRADING ONLY. V28.2 keeps V28.1 weighted research fusion and adds
// pairwise opportunity-cost learning: chosen trades are compared with the best
// simultaneously skipped alternatives, and profitable strong-score positions
// are protected from soft/noisy exits.
export class MarketPortfolio extends BasePortfolio{
 constructor(ctx,env){
  super(ctx,env);this.ctx=ctx;
  const ai=this.engine?.env?.AI;
  if(ai?.run&&!ai.__relativeOpportunityLearningV282){
   const getState=()=>{try{return this._actualState?.()||{}}catch{return{}}};
   const wrapped=new RelativeOpportunityLearningGuardV282(ai,{getState,storage:this.ctx?.storage});
   wrapped.__relativeOpportunityLearningV282=true;this.relativeOpportunityLearning=wrapped;this.engine.env.AI=wrapped;
  }
 }
 async status(){const s=await super.status(),relative=this.relativeOpportunityLearning?.status?.()||{enabled:true,version:28.2};if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:28.2,pairwiseOpportunityCostLearning:true,bestAlternativeFirst:true,profitWinnerProtection:true,rule:'V28.2 vergleicht jeden Kauf mit der besten gleichzeitig ausgelassenen Alternative. Wiederholt bessere ausgelassene Setups erhalten Muster-Bias; deutlich schwachere geplante Kaeufe werden zugunsten staerkerer Kandidaten ersetzt. Profitable Positionen mit Research >=64 bleiben bei weichem Rauschen im Depot.'};s.relativeOpportunityLearningPolicy=relative;if(s?.executionModel)s.executionModel={...s.executionModel,relativeOpportunityLearningV282:true,bestAlternativeFirst:true};return s}
}
