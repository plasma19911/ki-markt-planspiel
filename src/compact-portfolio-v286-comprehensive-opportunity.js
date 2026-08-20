import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v282-relative-opportunity.js';
import {ComprehensiveOpportunityGuardV286,scoreAllOpportunitiesV286} from './comprehensive-opportunity-v286.js';
const arr=v=>Array.isArray(v)?v:[];

// PAPER-TRADING ONLY. V28.6 keeps the complete V28.2 stack and adds one
// normalized score for every current decision candidate and every open position.
// It may rotate at most one clearly weak meaningful position into a much stronger,
// repeatedly confirmed opportunity; small score gaps never trigger churn.
export class MarketPortfolio extends BasePortfolio{
 constructor(ctx,env){
  super(ctx,env);this.ctx=ctx;
  const ai=this.engine?.env?.AI;
  if(ai?.run&&!ai.__comprehensiveOpportunityV286){
   const getState=()=>{try{return this._actualState?.()||{}}catch{return{}}};
   const wrapped=new ComprehensiveOpportunityGuardV286(ai,{getState,storage:this.ctx?.storage});
   wrapped.__comprehensiveOpportunityV286=true;this.comprehensiveOpportunityV286=wrapped;this.engine.env.AI=wrapped;
  }
 }
 async status(){
  const s=await super.status(),state=(()=>{try{return this._actualState?.()||{}}catch{return{}}})(),displayState={...state,candidates:Array.isArray(s?.candidates)?s.candidates:arr(state?.candidates),positions:Array.isArray(s?.positions)?s.positions:arr(state?.positions)},x=scoreAllOpportunitiesV286(displayState,this.ctx?.storage,Date.now(),false),c={...(this.comprehensiveOpportunityV286?.status?.()||{}),enabled:true,version:28.6,allDecisionCandidatesScored:x.allDecisionCandidatesScored,candidateCount:x.candidateCount,positionCount:x.positionCount,ranking:x.ranking,positionScores:x.positionScores};
  s.comprehensiveOpportunityPolicy=c;
  s.researchSignalFusionPolicy={...(s.researchSignalFusionPolicy||{}),version:28.6,ranking:c.ranking||[],positionScores:c.positionScores||[],allDecisionCandidatesScored:Boolean(c.allDecisionCandidatesScored),candidateCount:c.candidateCount||0,positionCount:c.positionCount||0,scoreModel:'V28.6 neutral-normalized comprehensive opportunity score',scoreLegend:[{min:72,label:'Kaufbereit'},{min:64,label:'Bestätigen'},{min:58,label:'Beobachten'},{min:40,label:'Aufbau'},{min:0,label:'Schwach'}],positionScoreMeaning:'Jede offene Position wird auf derselben 0–100-Skala wie die Kaufkandidaten bewertet. Der Score ist ein relatives Chancen-/Qualitätssignal; V28.6 darf bei großem, bestätigtem Abstand kontrolliert zu einer besseren Chance rotieren.'};
  if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:28.6,allDecisionCandidatesScored:true,relativeRotationForBetterOpportunity:true,maxBetterOpportunityRotationsPerDecision:1,rule:'V28.6 bewertet alle vom Scanner an die Entscheidung übergebenen Aktien und alle offenen Positionen auf derselben 0–100-Skala. Eine schwache Position darf nur bei großem Score-Abstand, bestätigter besserer Alternative, Mindesthaltezeit und Cooldown ersetzt werden.'};
  if(s?.executionModel)s.executionModel={...s.executionModel,comprehensiveOpportunityV286:true,allDecisionCandidatesScored:true,controlledBetterOpportunityRotation:true};
  return s;
 }
}
