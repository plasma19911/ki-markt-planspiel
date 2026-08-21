import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v299-daytrade-largecap.js';
import {DaytradeDipGuardV300,DAYTRADE_DIP_V300,daytradeDipScoresV300} from './daytrade-dip-v300.js';

const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();

// PAPER-TRADING ONLY. V30.0 is the final daytrade entry layer.
// It preserves V29.9 large-cap preference, V29.7 profit exits and V29.6 coherent
// held-position scores, while concentrating new entries on better dip/reclaim setups.
export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    const ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__daytradeDipV300){
      const getState=()=>{try{return this._actualState?.()||{}}catch{return{}}};
      const wrapped=new DaytradeDipGuardV300(ai,{getState,storage:this.ctx?.storage});
      wrapped.__daytradeDipV300=true;this.daytradeDipV300=wrapped;this.engine.env.AI=wrapped;
    }
  }
  async status(){
    const s=await super.status(),policy=this.daytradeDipV300?.status?.()||{enabled:true,version:30.0,ranking:[],config:DAYTRADE_DIP_V300};
    const by=new Map(arr(policy.ranking).map(r=>[key(r),r]));
    s.candidates=arr(s.candidates).map(c=>{const r=by.get(key(c));if(!r)return c;return{...c,preDipDecisionScore:r.preDipDecisionScore,score:r.daytradeDipScore,decisionScore:r.daytradeDipScore,daytradeDipScore:r.daytradeDipScore,dipScorePoints:r.dipScorePoints,dipLabel:r.dipLabel,dipQuality:r.dipQuality,dipReason:r.dipReason,dipMetrics:r.dipMetrics,scoreSource:'V30.0_DAYTRADE_DIP_DECISION'}}).sort((a,b)=>num(b.daytradeDipScore,b.score)-num(a.daytradeDipScore,a.score)||num(b.dipQuality)-num(a.dipQuality));
    s.daytradeDipPolicy={...policy,maxOpenPositions:DAYTRADE_DIP_V300.maxOpenPositions,targetCashDeploymentPct:DAYTRADE_DIP_V300.targetCashDeploymentPct,reserveCashPct:DAYTRADE_DIP_V300.reserveCashPct};
    s.canonicalScorePolicy={...(s.canonicalScorePolicy||{}),version:30.0,authoritative:true,immediateBuyMin:56,betterDipScoreInput:true,pcFastMomentumAliases:true,maxOpenPositions:DAYTRADE_DIP_V300.maxOpenPositions,concentratedCashDeployment:true,targetCashDeploymentPct:DAYTRADE_DIP_V300.targetCashDeploymentPct};
    if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:30.0,daytradeDipEntry:true,maxOpenPositions:DAYTRADE_DIP_V300.maxOpenPositions,targetCashDeploymentPct:DAYTRADE_DIP_V300.targetCashDeploymentPct,rule:'V30.0: größere/liquidere Aktien bleiben bevorzugt. Neue Käufe priorisieren Pullback-Reclaims statt High-Chases. PC-1m/5m-Felder werden direkt ausgewertet. BUY-Schwelle bleibt 56; gleichzeitig werden maximal vier konzentrierte Positionen eröffnet und der freie Cash deutlich stärker eingesetzt.'};
    if(s?.executionModel)s.executionModel={...s.executionModel,version:30.0,daytradeDipV300:true,maxOpenPositions:DAYTRADE_DIP_V300.maxOpenPositions,targetCashDeploymentPct:DAYTRADE_DIP_V300.targetCashDeploymentPct};
    s.runtimeVersion='V30.0';
    s.liveDecisionVersion='V30.0';
    return s;
  }
}
