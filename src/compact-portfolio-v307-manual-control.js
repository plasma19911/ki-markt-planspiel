import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v306-anti-churn.js';
import {ManualTradeNudgeGuardV307} from './manual-trade-v307.js';

export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    const getState=()=>{try{return this._actualState?.()||{}}catch{return{}}};
    let brokerRowsCache=[],brokerRowsAt=0;
    const getBrokerRows=async()=>{const now=Date.now();if(brokerRowsCache.length&&now-brokerRowsAt<15*60*1000)return brokerRowsCache;try{const data=await this.zeroAssets?._load?.();const rows=Array.isArray(data?.equities)?data.equities:[];if(rows.length){brokerRowsCache=rows;brokerRowsAt=now}}catch{}return brokerRowsCache};
    const ai=this.engine?.env?.AI;if(ai?.run&&!ai.__manualTradeV307){const wrapped=new ManualTradeNudgeGuardV307(ai,{getState,getBrokerRows,storage:this.ctx?.storage});wrapped.__manualTradeV307=true;this.manualTradeV307=wrapped;this.engine.env.AI=wrapped}
  }
  async manualTradeIntent(body={}){if(!this.manualTradeV307)return{ok:false,status:503,error:'V30.7 Manual-Controller ist nicht initialisiert.'};return this.manualTradeV307.request(body)}
  async status(){
    const s=await super.status(),manual=this.manualTradeV307?.status?.()||{enabled:true,version:30.7,mode:'manual-dashboard-nudge',maxAllocationPct:100,noFixedSinglePositionCap:true};
    s.runtimeVersion='V30.7';s.liveDecisionVersion='V30.7';s.manualTradePolicy=manual;
    s.canonicalScorePolicy={...(s.canonicalScorePolicy||{}),version:30.7,manualDashboardNudge:true,noFixedSinglePositionCap:true,maxAllocationPct:100};
    if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:30.7,manualDashboardNudge:true,noFixedSinglePositionCap:true,maxAllocationPct:100,rule:`${String(s.finalDecisionPolicy.rule||'').slice(0,300)} V30.7: Dashboard kann einzelne Paper-Positionen zum SELL und aktuelle Kandidaten zum BUY anstossen. BUY bleibt fail-closed fuer TR/News/Quote/FX/Anti-Churn. Kein fixer 25%-Deckel mehr; ohne Hebel sind bis zu 100% Depotgewicht technisch moeglich.`};
    if(s?.executionModel)s.executionModel={...s.executionModel,manualDashboardNudgeV307:true,noFixedSinglePositionCap:true,maxSinglePositionPctOfEquity:100,maxManualAllocationPct:100,noLeverage:true};
    if(s?.relativeRotationPolicy)s.relativeRotationPolicy={...s.relativeRotationPolicy,maxSinglePositionPct:100};
    if(s?.heldCashDeploymentPolicy)s.heldCashDeploymentPolicy={...s.heldCashDeploymentPolicy,maxSinglePositionPct:100};
    if(s?.profitOpportunityPolicy)s.profitOpportunityPolicy={...s.profitOpportunityPolicy,maxSinglePositionPct:100};
    if(s?.weakestPositionReplacementPolicy)s.weakestPositionReplacementPolicy={...s.weakestPositionReplacementPolicy,maxSinglePositionPct:100};
    return s;
  }
}
