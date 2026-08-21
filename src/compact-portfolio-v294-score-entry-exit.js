import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v293-immediate-buy.js';
import {ScoreEntryExitGuardV294,SCORE_ENTRY_EXIT_V294} from './score-entry-exit-v294.js';

const arr=v=>Array.isArray(v)?v:[];
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();

// PAPER-TRADING ONLY. V29.4 owns the purchase-score baseline and +10/-15 exits.
// Its score core is upgraded by V29.6 to time-/quality-aware candidate scoring.
export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    const ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__scoreEntryExitV294){
      const getState=()=>{try{return this._actualState?.()||{}}catch{return{}}};
      const wrapped=new ScoreEntryExitGuardV294(ai,{getState,storage:this.ctx?.storage});
      wrapped.__scoreEntryExitV294=true;this.scoreEntryExitV294=wrapped;this.engine.env.AI=wrapped;
    }
  }
  async status(){
    const s=await super.status(),policy=this.scoreEntryExitV294?.status?.()||{enabled:true,version:29.4,scoreCoreVersion:29.6,thresholds:SCORE_ENTRY_EXIT_V294,positionScores:[],entries:{}};
    const by=new Map(arr(policy.positionScores).map(r=>[key(r),r]));
    s.positions=arr(s.positions).map(p=>{const r=by.get(key(p));if(!r)return p;return{...p,legacy_position_score:p?.score,score:r.decisionScore,decisionScore:r.decisionScore,entryDecisionScore:r.entryDecisionScore,scoreDeltaFromEntry:r.scoreDeltaFromEntry,scoreDeltaThisScan:r.scoreDeltaThisScan,rawDecisionScore:r.rawDecisionScore,chartMoveFromEntryPct:r.chartMoveFromEntryPct,chartMoveLastScanPct:r.chartMoveLastScanPct,scoreFrozenPartial:r.scoreFrozenPartial,scoreChartCapped:r.scoreChartCapped,scoreSource:'V29.6_COHERENT_CHART_ANCHORED_DECISION'}});
    s.scoreEntryExitPolicy=policy;
    s.researchSignalFusionPolicy={...(s.researchSignalFusionPolicy||{}),version:29.6,positionScores:policy.positionScores||[],positionScoreSource:'V29.6_COHERENT_CHART_ANCHORED_DECISION',positionBehaviorNote:'Nach Kauf bleibt der Score auf derselben 0-100-Skala. Teilwerte frieren ein. Bei fast flachem Chart ist die Scorebewegung eng begrenzt. +10 verkauft nur bei positivem Chart; -15 verkauft bei Schwäche.'};
    s.canonicalScorePolicy={...(s.canonicalScorePolicy||{}),version:29.6,authoritative:true,immediateBuyMin:56,positionScoreChartAnchored:true,positiveScoreExitDelta:10,positiveExitRequiresPositiveChart:true,negativeScoreExitDelta:-15,partialPositionScoreFreeze:true};
    if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:29.6,immediateBuyFrom56:true,chartAnchoredHeldScore:true,positionScoreContinuity:true,partialScoreCannotCollapsePosition:true,scoreProfitExitPlus10:true,scoreProfitExitRequiresPositiveChart:true,scoreLossExitMinus15:true,rule:'V29.6: Neukauf ab DecisionScore 56. Nach Kauf bleibt dieser Score die Basis. +10 nur bei positivem Chart = SELL; -15 = SELL. Teil-/Legacy-Scores duerfen keinen falschen Sprung ausloesen.'};
    if(s?.executionModel)s.executionModel={...s.executionModel,scoreEntryExitV294:true,scoreCoreV296:true,chartAnchoredPositionScore:true,positiveScoreExitDelta:10,positiveExitRequiresPositiveChart:true,negativeScoreExitDelta:-15};
    return s
  }
}
