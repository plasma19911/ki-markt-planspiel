import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v301-daytrade-entry.js';
import {DaytradeLiveFeedbackGuardV302,DAYTRADE_LIVE_FEEDBACK_V302,daytradeLiveScoresV302,repairExecutedEntryBaselinesV302} from './daytrade-live-feedback-v302.js';

const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();

// PAPER-TRADING ONLY. V30.2 is the outer live-feedback layer.
// It keeps V30.1 fresh-tape timing, V30.0 dips, V29.9 large-cap preference,
// V29.7 adaptive profit exits and V29.6 held-score coherence underneath.
export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    const ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__daytradeLiveFeedbackV302){
      const getState=()=>{try{return this._actualState?.()||{}}catch{return{}}};
      const wrapped=new DaytradeLiveFeedbackGuardV302(ai,{getState,storage:this.ctx?.storage});
      wrapped.__daytradeLiveFeedbackV302=true;this.daytradeLiveFeedbackV302=wrapped;this.engine.env.AI=wrapped;
    }
  }
  async status(){
    const s=await super.status(),policy=this.daytradeLiveFeedbackV302?.status?.()||{enabled:true,version:30.2,ranking:[],config:DAYTRADE_LIVE_FEEDBACK_V302};
    const by=new Map(arr(policy.ranking).map(r=>[key(r),r]));
    s.candidates=arr(s.candidates).map(c=>{const r=by.get(key(c));if(!r)return c;return{...c,preLiveFeedbackScore:r.preLiveFeedbackScore,score:r.daytradeLiveScore,decisionScore:r.daytradeLiveScore,daytradeLiveScore:r.daytradeLiveScore,liveFeedbackScorePoints:r.liveFeedbackScorePoints,liveFeedbackLabel:r.liveFeedbackLabel,dipLabel:r.dipLabel,dipQuality:r.dipQuality,timingLabel:r.timingLabel,timingQuality:r.timingQuality,timingReason:r.timingReason,timingMetrics:r.timingMetrics,scoreSource:'V30.2_LIVE_FEEDBACK_DAYTRADE_DECISION'}}).sort((a,b)=>num(b.daytradeLiveScore,b.score)-num(a.daytradeLiveScore,a.score)||num(b.timingQuality)-num(a.timingQuality)||num(b.dipQuality)-num(a.dipQuality));
    const repair=repairExecutedEntryBaselinesV302(this._actualState?.()||{},this.ctx?.storage,Date.now());
    s.daytradeLiveFeedbackPolicy={...policy,maxOpenPositions:4,maxSinglePositionPctOfEquity:25,maxTargetCashDeploymentPct:90,highChaseExtraPenalty:-10,executedEntryBaselineRepair:true,correctedBaselinesNow:repair.corrected};
    s.canonicalScorePolicy={...(s.canonicalScorePolicy||{}),version:30.2,authoritative:true,immediateBuyMin:56,highChaseExtraScorePenalty:true,maxOpenPositions:4,maxSinglePositionPctOfEquity:25,maxTargetCashDeploymentPct:90,executedEntryBaselineRepair:true};
    if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:30.2,daytradeLiveFeedback:true,highChaseExtraScorePenalty:true,pcFastDataMergedFromPcFirst:true,maxOpenPositions:4,maxSinglePositionPctOfEquity:25,targetCashDeploymentPct:90,executedEntryBaselineRepair:true,rule:'V30.2: BUY bleibt ab DecisionScore 56. Live-Feedback aus echten Paper-Trades verschärft HIGH_CHASE per Score-Malus, hält neue Einzelpositionen bei max. 25% des Scan-Startcashs und repariert die Einstiegsscore-Basis auf den wirklich ausgeführten finalen DecisionScore.'};
    if(s?.executionModel)s.executionModel={...s.executionModel,version:30.2,daytradeLiveFeedbackV302:true,maxOpenPositions:4,maxSinglePositionPctOfEquity:25,maxTargetCashDeploymentPct:90,executedEntryBaselineRepair:true};
    s.runtimeVersion='V30.2';s.liveDecisionVersion='V30.2';
    return s;
  }
}
