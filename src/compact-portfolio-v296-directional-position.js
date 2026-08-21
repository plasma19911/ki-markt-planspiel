import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v296-score-coherence.js';
import {DirectionalPositionScoreGuardV296,DIRECTIONAL_POSITION_SCORE_V296} from './directional-position-score-v296.js';

const arr=v=>Array.isArray(v)?v:[];
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();

// PAPER-TRADING ONLY. Final V29.6 hardening for held positions:
// actual position last_price/entry_price are authoritative for chart anchoring.
// Flat or opposite-direction charts cannot open a large score corridor toward a false exit.
export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    const ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__directionalPositionScoreV296){
      const getState=()=>{try{return this._actualState?.()||{}}catch{return{}}};
      const wrapped=new DirectionalPositionScoreGuardV296(ai,{getState,storage:this.ctx?.storage});
      wrapped.__directionalPositionScoreV296=true;this.directionalPositionScoreV296=wrapped;this.engine.env.AI=wrapped;
    }
  }
  async status(){
    const s=await super.status(),policy=this.directionalPositionScoreV296?.status?.()||{enabled:true,version:'29.6-d1',thresholds:DIRECTIONAL_POSITION_SCORE_V296,positionScores:[],audit:{}};
    const by=new Map(arr(policy.positionScores).map(r=>[key(r),r]));
    s.positions=arr(s.positions).map(p=>{const r=by.get(key(p));if(!r)return p;return{...p,preDirectionalScore:p?.score,score:r.decisionScore,decisionScore:r.decisionScore,entryDecisionScore:r.entryDecisionScore,scoreDeltaFromEntry:r.scoreDeltaFromEntry,rawDecisionScore:r.rawDecisionScore,chartMoveFromEntryPct:r.chartMoveFromEntryPct,chartMoveLastScanPct:r.chartMoveLastScanPct,scoreFloor:r.scoreFloor,scoreCeiling:r.scoreCeiling,chartDirectionMode:r.chartDirectionMode,scorePriorCorrected:r.scorePriorCorrected,scoreSource:'V29.6_DIRECTIONAL_ACTUAL_POSITION'}});
    s.directionalPositionScorePolicy=policy;
    s.researchSignalFusionPolicy={...(s.researchSignalFusionPolicy||{}),positionScores:policy.positionScores||[],positionScoreAudit:policy.audit||{},positionScoreSource:'V29.6_DIRECTIONAL_ACTUAL_POSITION',positionBehaviorNote:'Der echte Depotkurs ist fuer den gehaltenen Score autoritativ. Ein fast flacher oder steigender Chart kann keinen grossen negativen Scorekorridor oeffnen.'};
    s.canonicalScorePolicy={...(s.canonicalScorePolicy||{}),version:29.6,directionalHeldScore:true,actualPositionPriceAuthoritative:true,flatChartScoreDistance:DIRECTIONAL_POSITION_SCORE_V296.flatScoreDistance,negativeExitRequiresNegativeChart:true,positionScoreAudit:true};
    if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,directionalHeldScore:true,actualPositionPriceAuthoritative:true,negativeExitRequiresNegativeChart:true,rule:`${String(s.finalDecisionPolicy.rule||'').slice(0,340)} V29.6-d1: Bei gehaltenen Aktien ist der echte Depotchart richtungsgebend. Bei <=${DIRECTIONAL_POSITION_SCORE_V296.flatChartPct}% Bewegung bleibt der Score maximal +/-${DIRECTIONAL_POSITION_SCORE_V296.flatScoreDistance} Punkte um den Einstieg; ein -15 Exit kann erst bei echter, ausreichend grosser negativer Chartbewegung entstehen.`};
    if(s?.executionModel)s.executionModel={...s.executionModel,directionalHeldScoreV296:true,actualPositionPriceAuthoritative:true,positionScoreAudit:true};
    return s
  }
}
