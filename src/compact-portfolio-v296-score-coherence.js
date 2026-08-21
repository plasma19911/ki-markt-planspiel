import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v295-score-exit-authority.js';
import {DecisionScoreGuardV296,DECISION_SCORE_V296} from './decision-score-v296.js';

const arr=v=>Array.isArray(v)?v:[];
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();

// PAPER-TRADING ONLY. V29.6 keeps the user's fixed strategy rules but repairs the
// mechanics beneath them: BUY immediately at DecisionScore >=56, +10 score exit on a
// positive chart, -15 score exit on weakness, time-aware score smoothing, and a
// score-reset requirement after exits to prevent SELL -> immediate re-BUY churn.
export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    const ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__decisionScoreV296){
      const getState=()=>{try{return this._actualState?.()||{}}catch{return{}}};
      const wrapped=new DecisionScoreGuardV296(ai,{getState,storage:this.ctx?.storage});
      wrapped.__decisionScoreV296=true;this.decisionScoreV296=wrapped;this.engine.env.AI=wrapped;
    }
  }
  async status(){
    const s=await super.status(),policy=this.decisionScoreV296?.status?.()||{enabled:true,version:29.6,authoritative:true,immediateBuyMin:56,stability:DECISION_SCORE_V296,ranking:[],positionScores:[],reentryLocks:{}};
    const by=new Map(arr(policy.ranking).map(r=>[key(r),r]));
    s.candidates=arr(s.candidates).map(c=>{const r=by.get(key(c));if(!r)return c;return{...c,legacy_raw_score:c?.score,score:r.decisionScore,decisionScore:r.decisionScore,rawDecisionScore:r.rawDecisionScore,qualityAdjustedRawScore:r.qualityAdjustedRawScore,scoreDeltaRaw:r.scoreDeltaRaw,scoreDeltaStable:r.scoreDeltaStable,scoreAgeMinutes:r.scoreAgeMinutes,scoreQualityFactor:r.scoreQualityFactor,scoreDrivers:r.scoreDrivers,quoteAgeMinutes:r.quoteAgeMinutes,quoteStale:r.quoteStale,scoreSource:'V29.6_TIME_QUALITY_DECISION'}});
    s.decisionScorePolicy=policy;
    s.researchSignalFusionPolicy={...(s.researchSignalFusionPolicy||{}),version:29.6,behaviorVersion:29.6,authoritativeScore:'decisionScore',ranking:policy.ranking||[],positionScores:s.scoreEntryExitPolicy?.positionScores||policy.positionScores||[],scoreLegend:[{min:56,label:'SOFORT KAUFEN'},{min:50,label:'Beobachten'},{min:0,label:'Kein Kauf'}],behaviorNote:'V29.6: Scoreänderungen sind zeit- statt scanabhängig. Unvollständige/veraltete Eingangsdaten werden im Score selbst Richtung neutral gedämpft. Derselbe sichtbare DecisionScore steuert den Kauf.'};
    s.canonicalScorePolicy={...(s.canonicalScorePolicy||{}),enabled:true,version:29.6,authoritative:true,immediateBuyMin:56,noSoftBuyBlocks:true,timeAwareSmoothing:true,qualityAwareScore:true,positiveScoreExitDelta:10,positiveExitRequiresPositiveChart:true,negativeScoreExitDelta:-15,reentryResetBelow56:true,legacyThresholdsSuperseded:true};
    if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:29.6,authoritativeDecisionScore:true,immediateBuyFrom56:true,timeAwareScore:true,qualityAwareScore:true,positiveExitRequiresPositiveChart:true,reentryResetAfterScoreExit:true,rule:'V29.6: Neuer Titel ab DecisionScore 56 sofort BUY. +10 seit Kauf nur bei positivem Chart = SELL; -15 = SELL. Nach Score-SELL muss derselbe Titel einmal unter 56 zuruecksetzen, bevor ein neues >=56 wieder sofort gekauft wird. So entsteht kein Gebühren-Loop.'};
    if(s?.executionModel)s.executionModel={...s.executionModel,decisionScoreV296:true,timeAwareScore:true,qualityAwareScore:true,reentryResetAfterScoreExit:true,immediateBuyFrom56:true,positiveScoreExitDelta:10,negativeScoreExitDelta:-15};
    return s
  }
}
