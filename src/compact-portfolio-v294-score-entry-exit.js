import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v293-immediate-buy.js';
import {ScoreEntryExitGuardV294,SCORE_ENTRY_EXIT_V294} from './score-entry-exit-v294.js';

const arr=v=>Array.isArray(v)?v:[];
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();

// PAPER-TRADING ONLY. V29.4 keeps the V29.3 immediate BUY >=56 rule and fixes
// held-position score continuity. A position must not jump from the candidate 0-100
// score to an unrelated partial/legacy scale after purchase. Position scores are anchored
// to the purchase score and actual chart movement. +10 points from entry => SELL;
// -15 points from entry => SELL.
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
    const s=await super.status(),policy=this.scoreEntryExitV294?.status?.()||{enabled:true,version:29.4,thresholds:SCORE_ENTRY_EXIT_V294,positionScores:[],entries:{}};
    const by=new Map(arr(policy.positionScores).map(r=>[key(r),r]));
    // The fallback candidate table reads s.positions[].score. Replace the old position
    // scale with the same chart-anchored DecisionScore that V29.4 uses for exits.
    s.positions=arr(s.positions).map(p=>{const r=by.get(key(p));if(!r)return p;return{...p,legacy_position_score:p?.score,score:r.decisionScore,decisionScore:r.decisionScore,entryDecisionScore:r.entryDecisionScore,scoreDeltaFromEntry:r.scoreDeltaFromEntry,scoreDeltaThisScan:r.scoreDeltaThisScan,rawDecisionScore:r.rawDecisionScore,chartMoveFromEntryPct:r.chartMoveFromEntryPct,chartMoveLastScanPct:r.chartMoveLastScanPct,scoreFrozenPartial:r.scoreFrozenPartial,scoreChartCapped:r.scoreChartCapped,scoreSource:'V29.4_CHART_ANCHORED_DECISION'}});
    s.scoreEntryExitPolicy=policy;
    s.researchSignalFusionPolicy={...(s.researchSignalFusionPolicy||{}),version:29.4,positionScores:policy.positionScores||[],positionScoreSource:'V29.4_CHART_ANCHORED_DECISION',positionBehaviorNote:'Nach Kauf bleibt der Score auf derselben 0-100-Skala. Teil-/Legacy-Scores duerfen keinen Sprung erzeugen. Bei fast flachem Chart ist die Scorebewegung eng begrenzt.'};
    s.canonicalScorePolicy={...(s.canonicalScorePolicy||{}),version:29.4,authoritative:true,immediateBuyMin:56,positionScoreChartAnchored:true,positiveScoreExitDelta:10,negativeScoreExitDelta:-15,partialPositionScoreFreeze:true};
    if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:29.4,immediateBuyFrom56:true,chartAnchoredHeldScore:true,positionScoreContinuity:true,partialScoreCannotCollapsePosition:true,scoreProfitExitPlus10:true,scoreLossExitMinus15:true,rule:'V29.4: Neukauf weiterhin sofort ab DecisionScore 56. Nach Kauf wird genau dieser Score als Basis gespeichert. Ein fast unveraenderter Chart darf den Depot-Score nicht auf eine andere Skala kippen. +10 Punkte seit Kauf = SELL; -15 Punkte seit Kauf = SELL.'};
    if(s?.executionModel)s.executionModel={...s.executionModel,scoreEntryExitV294:true,chartAnchoredPositionScore:true,positiveScoreExitDelta:10,negativeScoreExitDelta:-15};
    return s
  }
}
