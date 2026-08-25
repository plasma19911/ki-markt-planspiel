import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v307-manual-control.js';
import {FinalSellAuthorityV308} from './final-sell-authority-v308.js';

export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    const getState=()=>{try{return this._actualState?.()||this.bucketAdapter?.peekState?.()||{}}catch{return{}}};
    const ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__finalSellAuthorityV308){const wrapped=new FinalSellAuthorityV308(ai,{getState});wrapped.__finalSellAuthorityV308=true;this.finalSellAuthorityV308=wrapped;this.engine.env.AI=wrapped}
  }
  async status(){
    const s=await super.status(),policy=this.finalSellAuthorityV308?.status?.()||{enabled:true,version:30.8,mode:'outermost-final-sell-authority',sellCannotBeDowngradedToHold:true,finalSellSameScan:true,severeWeaknessOverridesScoreHysteresis:true};
    s.runtimeVersion='V30.8';s.liveDecisionVersion='V30.8';s.finalSellAuthorityPolicy=policy;
    s.canonicalScorePolicy={...(s.canonicalScorePolicy||{}),version:30.8,finalSellAuthorityV308:true,severeWeaknessOverridesScoreHysteresis:true};
    if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:30.8,finalSellAuthorityV308:true,sellCannotBeDowngradedToHold:true,finalSellSameScan:true,rule:`${String(s.finalDecisionPolicy.rule||'').slice(0,260)} V30.8: Ein finales SELL ist ausführbar und darf von keiner späteren HOLD-Schicht zurückgestuft werden. Stark deteriorierte Positionen mit sehr niedrigem RawScore werden sofort im selben Scan verkauft.`};
    s.executionModel={...(s.executionModel||{}),finalSellAuthorityV308:true,finalSellSameScan:true,sellCannotBeDowngradedToHold:true,severeWeaknessOverridesScoreHysteresis:true};
    return s;
  }
}
