import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v300-daytrade-dips.js';
import {DaytradeEntryGuardV301,DAYTRADE_ENTRY_V301,daytradeEntryScoresV301} from './daytrade-entry-v301.js';

const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();

// PAPER-TRADING ONLY. V30.1 is the final new-entry timing layer.
// It keeps V30.0 concentrated dip entries, V29.9 large-cap preference,
// V29.7 profit exits and V29.6 coherent held scores underneath.
export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    const ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__daytradeEntryV301){
      const getState=()=>{try{return this._actualState?.()||{}}catch{return{}}};
      const wrapped=new DaytradeEntryGuardV301(ai,{getState,storage:this.ctx?.storage});
      wrapped.__daytradeEntryV301=true;this.daytradeEntryV301=wrapped;this.engine.env.AI=wrapped;
    }
  }
  async status(){
    const s=await super.status(),policy=this.daytradeEntryV301?.status?.()||{enabled:true,version:30.1,ranking:[],config:DAYTRADE_ENTRY_V301};
    const by=new Map(arr(policy.ranking).map(r=>[key(r),r]));
    s.candidates=arr(s.candidates).map(c=>{const r=by.get(key(c));if(!r)return c;return{...c,preTimingDecisionScore:r.preTimingDecisionScore,score:r.daytradeEntryScore,decisionScore:r.daytradeEntryScore,daytradeEntryScore:r.daytradeEntryScore,timingScorePoints:r.timingScorePoints,timingLabel:r.timingLabel,timingQuality:r.timingQuality,timingReason:r.timingReason,timingMetrics:r.timingMetrics,dipLabel:r.dipLabel,dipQuality:r.dipQuality,scoreSource:'V30.1_FRESH_TAPE_DAYTRADE_DECISION'}}).sort((a,b)=>num(b.daytradeEntryScore,b.score)-num(a.daytradeEntryScore,a.score)||num(b.timingQuality)-num(a.timingQuality)||num(b.dipQuality)-num(a.dipQuality));
    s.daytradeEntryPolicy={...policy,maxOpenPositions:DAYTRADE_ENTRY_V301.maxOpenPositions,targetCashDeploymentPct:DAYTRADE_ENTRY_V301.targetCashDeploymentPct,reserveCashPct:DAYTRADE_ENTRY_V301.reserveCashPct};
    s.canonicalScorePolicy={...(s.canonicalScorePolicy||{}),version:30.1,authoritative:true,immediateBuyMin:56,quoteFreshnessScoreInput:true,fastFieldCoverageScoreInput:true,cleanRetestScoreInput:true,cleanContinuationScoreInput:true,maxOpenPositions:DAYTRADE_ENTRY_V301.maxOpenPositions,targetCashDeploymentPct:DAYTRADE_ENTRY_V301.targetCashDeploymentPct};
    if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:30.1,daytradeFreshTapeEntry:true,quoteFreshnessScoreInput:true,fastFieldCoverageScoreInput:true,cleanRetestAware:true,cleanContinuationAware:true,maxOpenPositions:DAYTRADE_ENTRY_V301.maxOpenPositions,targetCashDeploymentPct:DAYTRADE_ENTRY_V301.targetCashDeploymentPct,rule:'V30.1: BUY bleibt ab DecisionScore 56. Der Score berücksichtigt jetzt ausdrücklich Datenfrische, vollständige PC-1m/5m-Signale, saubere Retests und frühe Fortsetzungen. Alte/fehlende Fast-Daten und neutrales/schwaches Timing senken den Score; max. vier konzentrierte Positionen bleiben bestehen.'};
    if(s?.executionModel)s.executionModel={...s.executionModel,version:30.1,daytradeFreshTapeV301:true,maxOpenPositions:DAYTRADE_ENTRY_V301.maxOpenPositions,targetCashDeploymentPct:DAYTRADE_ENTRY_V301.targetCashDeploymentPct};
    s.runtimeVersion='V30.1';
    s.liveDecisionVersion='V30.1';
    return s;
  }
}
