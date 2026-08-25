import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v308-sell-authority.js';
import {HighScoreCapitalDeploymentV309} from './high-score-capital-deployment-v309.js';

export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    const getState=()=>{try{return this._actualState?.()||this.bucketAdapter?.peekState?.()||{}}catch{return{}}};
    let brokerRowsCache=[],brokerRowsAt=0;
    const getBrokerRows=async()=>{const now=Date.now();if(brokerRowsCache.length&&now-brokerRowsAt<15*60*1000)return brokerRowsCache;try{const data=await this.zeroAssets?._load?.();const rows=Array.isArray(data?.equities)?data.equities:[];if(rows.length){brokerRowsCache=rows;brokerRowsAt=now}}catch{}return brokerRowsCache};
    const ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__highScoreCapitalDeploymentV309){const wrapped=new HighScoreCapitalDeploymentV309(ai,{getState,getBrokerRows});wrapped.__highScoreCapitalDeploymentV309=true;this.highScoreCapitalDeploymentV309=wrapped;this.engine.env.AI=wrapped}
  }
  async status(){
    const s=await super.status(),policy=this.highScoreCapitalDeploymentV309?.status?.()||{enabled:true,version:30.9,mode:'high-score-capital-deployment'};
    s.runtimeVersion='V30.9';s.liveDecisionVersion='V30.9';s.highScoreCapitalDeploymentPolicy=policy;
    s.canonicalScorePolicy={...(s.canonicalScorePolicy||{}),version:30.9,highScoreCapitalDeploymentV309:true,mildPullbackCanBuy:true,noMiniStarterFor70Plus:true,winnerTopupWhenFourPositions:true};
    if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:30.9,highScoreCapitalDeploymentV309:true,rule:`${String(s.finalDecisionPolicy.rule||'').slice(0,250)} V30.9: 70+ Chancen duerfen bei mildem Pullback aktiv gekauft und sinnvoll groesser gewichtet werden. Bei vier belegten Plaetzen kann bestaetigte Staerke mit freiem Cash aufgestockt werden. Harte Broker-, News-, Quote-, FX-, Markt- und Re-Entry-Sperren bleiben absolut.`};
    s.executionModel={...(s.executionModel||{}),highScoreCapitalDeploymentV309:true,mildPullbackCanBuy:true,dynamicConvictionAllocation:true,noMiniStarterFor70Plus:true,winnerTopupWhenFourPositions:true,noFixedAutoSinglePositionCap:true,maxAutoHighScoreAllocationPct:100};
    return s;
  }
}
