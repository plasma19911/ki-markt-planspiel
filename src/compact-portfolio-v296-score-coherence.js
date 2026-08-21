import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v295-score-exit-authority.js';
import {DecisionScoreGuardV296,DECISION_SCORE_V296} from './decision-score-v296.js';

const arr=v=>Array.isArray(v)?v:[];
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();

// PAPER-TRADING ONLY. V29.6 keeps the user's fixed strategy rules but repairs the
// mechanics beneath them: BUY immediately at DecisionScore >=56, +10 score exit on a
// positive chart, -15 score exit on weakness, time-aware + chart-responsive smoothing,
// quality damping, and directional rearm after exits to prevent immediate fee churn.
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
    s.candidates=arr(s.candidates).map(c=>{const r=by.get(key(c));if(!r)return c;return{...c,legacy_raw_score:c?.score,score:r.decisionScore,decisionScore:r.decisionScore,rawDecisionScore:r.rawDecisionScore,qualityAdjustedRawScore:r.qualityAdjustedRawScore,scoreDeltaRaw:r.scoreDeltaRaw,scoreDeltaStable:r.scoreDeltaStable,scoreAgeMinutes:r.scoreAgeMinutes,scoreQualityFactor:r.scoreQualityFactor,scoreDrivers:r.scoreDrivers,scoreChartMovePct:r.scoreChartMovePct,scoreChartAccelerated:r.scoreChartAccelerated,quoteAgeMinutes:r.quoteAgeMinutes,quoteStale:r.quoteStale,scoreSource:'V29.6_TIME_QUALITY_CHART_DECISION'}});
    s.decisionScorePolicy=policy;
    s.researchSignalFusionPolicy={...(s.researchSignalFusionPolicy||{}),version:29.6,behaviorVersion:29.6,authoritativeScore:'decisionScore',ranking:policy.ranking||[],positionScores:s.scoreEntryExitPolicy?.positionScores||policy.positionScores||[],scoreLegend:[{min:56,label:'SOFORT KAUFEN'},{min:50,label:'Beobachten'},{min:0,label:'Kein Kauf'}],behaviorNote:'V29.6: Bei flachem Chart sind Scoreänderungen zeit- statt scanabhängig; echte gleichgerichtete Kursbewegungen dürfen schneller durchschlagen. Unvollständige/veraltete Daten werden im Score selbst Richtung neutral gedämpft.'};
    s.canonicalScorePolicy={...(s.canonicalScorePolicy||{}),enabled:true,version:29.6,authoritative:true,immediateBuyMin:56,noSoftBuyBlocks:true,timeAwareSmoothing:true,chartResponsiveSmoothing:true,qualityAwareScore:true,positiveScoreExitDelta:10,positiveExitRequiresPositiveChart:true,negativeScoreExitDelta:-15,profitReentryResetPoints:5,lossReentryRecoveryPoints:5,legacyThresholdsSuperseded:true};
    if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:29.6,authoritativeDecisionScore:true,immediateBuyFrom56:true,timeAwareScore:true,chartResponsiveScore:true,qualityAwareScore:true,positiveExitRequiresPositiveChart:true,directionalReentryAfterScoreExit:true,rule:'V29.6: Neuer Titel ab DecisionScore 56 sofort BUY. +10 seit Kauf nur bei positivem Chart = SELL; -15 = SELL. Nach +10 braucht derselbe Titel 5 Scorepunkte Rücksetzer; nach -15 braucht er 5 Punkte Erholung und mindestens Score 56. So entsteht kein direkter SELL→BUY-Gebührenloop.'};
    if(s?.executionModel)s.executionModel={...s.executionModel,decisionScoreV296:true,timeAwareScore:true,chartResponsiveScore:true,qualityAwareScore:true,directionalReentryAfterScoreExit:true,immediateBuyFrom56:true,positiveScoreExitDelta:10,negativeScoreExitDelta:-15};
    return s
  }
}
