import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v299-daytrade-largecap.js';
import {DaytradeDipGuardV300,DAYTRADE_DIP_V300} from './daytrade-dip-v300.js';
import {persistExecutedEntryBaselinesV301,EXECUTED_ENTRY_BASELINE_V301} from './executed-entry-baseline-v301.js';

const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();

// PAPER-TRADING ONLY. V30.1 keeps the V30.0 daytrade rules unchanged and fixes
// one accounting/score-continuity bug: the executed final BUY DecisionScore becomes
// the immutable entry baseline for later held-score deltas and exits.
export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;this.executedEntryBaselineV301=null;
    const ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__daytradeDipV300){
      const getState=()=>{try{return this._actualState?.()||{}}catch{return{}}};
      const wrapped=new DaytradeDipGuardV300(ai,{getState,storage:this.ctx?.storage});
      wrapped.__daytradeDipV300=true;this.daytradeDipV300=wrapped;this.engine.env.AI=wrapped;
    }
  }
  async scan(){
    const r=await super.scan();
    try{
      const selected=arr(this.daytradeDipV300?.latest?.selected),state=this._actualState?.()||this.bucketAdapter?.peekState?.()||{};
      this.executedEntryBaselineV301=persistExecutedEntryBaselinesV301(state,selected,this.ctx?.storage,Date.now());
    }catch(e){console.error('V30.1 executed entry baseline persistence failed',e)}
    return r;
  }
  async status(){
    const s=await super.status(),policy=this.daytradeDipV300?.status?.()||{enabled:true,version:30.0,ranking:[],config:DAYTRADE_DIP_V300};
    const by=new Map(arr(policy.ranking).map(r=>[key(r),r]));
    s.candidates=arr(s.candidates).map(c=>{const r=by.get(key(c));if(!r)return c;return{...c,preDipDecisionScore:r.preDipDecisionScore,score:r.daytradeDipScore,decisionScore:r.daytradeDipScore,daytradeDipScore:r.daytradeDipScore,dipScorePoints:r.dipScorePoints,dipLabel:r.dipLabel,dipQuality:r.dipQuality,dipReason:r.dipReason,dipMetrics:r.dipMetrics,scoreSource:'V30.0_DAYTRADE_DIP_DECISION'}}).sort((a,b)=>num(b.daytradeDipScore,b.score)-num(a.daytradeDipScore,a.score)||num(b.dipQuality)-num(a.dipQuality));
    s.daytradeDipPolicy={...policy,maxOpenPositions:DAYTRADE_DIP_V300.maxOpenPositions,targetCashDeploymentPct:DAYTRADE_DIP_V300.targetCashDeploymentPct,reserveCashPct:DAYTRADE_DIP_V300.reserveCashPct};
    s.executedEntryBaselinePolicy={enabled:true,version:30.1,source:EXECUTED_ENTRY_BASELINE_V301.source,executedFinalBuyScoreAuthoritative:true,changesTradingThresholds:false,latest:this.executedEntryBaselineV301?{stored:this.executedEntryBaselineV301.stored,skipped:this.executedEntryBaselineV301.skipped}:null};
    s.canonicalScorePolicy={...(s.canonicalScorePolicy||{}),version:30.1,authoritative:true,immediateBuyMin:56,betterDipScoreInput:true,pcFastMomentumAliases:true,maxOpenPositions:DAYTRADE_DIP_V300.maxOpenPositions,concentratedCashDeployment:true,targetCashDeploymentPct:DAYTRADE_DIP_V300.targetCashDeploymentPct,executedFinalBuyScoreIsEntryBaseline:true};
    if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:30.1,daytradeDipEntry:true,maxOpenPositions:DAYTRADE_DIP_V300.maxOpenPositions,targetCashDeploymentPct:DAYTRADE_DIP_V300.targetCashDeploymentPct,executedFinalBuyScoreIsEntryBaseline:true,rule:'V30.1: V30.0 Daytrade-Regeln unverändert. Der tatsächlich ausgeführte finale BUY-DecisionScore wird jetzt als autoritative Einstiegsscore-Baseline gespeichert; spätere Scoreänderungen und Exits messen damit gegen den echten Kaufentscheid statt gegen einen alten Scanner-/Memory-Score.'};
    if(s?.executionModel)s.executionModel={...s.executionModel,version:30.1,daytradeDipV300:true,maxOpenPositions:DAYTRADE_DIP_V300.maxOpenPositions,targetCashDeploymentPct:DAYTRADE_DIP_V300.targetCashDeploymentPct};
    s.runtimeVersion='V30.1';
    s.liveDecisionVersion='V30.1';
    return s;
  }
}
