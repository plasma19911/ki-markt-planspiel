import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v309-capital-deployment.js';
import {ExpectancyCoreV310} from './expectancy-core-v310.js';

export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    const getState=()=>{try{return this._actualState?.()||this.bucketAdapter?.peekState?.()||{}}catch{return{}}};
    const ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__expectancyCoreV310){const wrapped=new ExpectancyCoreV310(ai,{getState});wrapped.__expectancyCoreV310=true;this.expectancyCoreV310=wrapped;this.engine.env.AI=wrapped}
  }
  async status(){
    const s=await super.status(),policy=this.expectancyCoreV310?.status?.()||{enabled:true,version:31.0,mode:'expectancy-authority'};
    s.runtimeVersion='V31.0';s.liveDecisionVersion='V31.0';s.expectancyCorePolicy=policy;
    s.canonicalScorePolicy={...(s.canonicalScorePolicy||{}),version:31.0,canonicalScale:'0-100',normalizeLegacyTenPointScores:true};
    s.executionModel={...(s.executionModel||{}),expectancyCoreV310:true,hardPriceStopPct:-1.2,trailArmPct:2.4,runnerTrailArmPct:4.5,minHoldMinutes:12,reentryMinutes:90,minPositionEur:2200};
    return s;
  }
}
