import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v305-profit-opportunity.js';
import {SellRebuyChurnGuardV306} from './sell-rebuy-churn-v306.js';

export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    const getState=()=>{try{return this._actualState?.()||{}}catch{return{}}};
    const ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__sellRebuyChurnV306){const wrapped=new SellRebuyChurnGuardV306(ai,{getState});wrapped.__sellRebuyChurnV306=true;this.sellRebuyChurnV306=wrapped;this.engine.env.AI=wrapped}
  }
  async status(){
    const s=await super.status(),policy=this.sellRebuyChurnV306?.status?.()||{enabled:true,version:30.6,mode:'sell-rebuy-anti-churn'};
    s.runtimeVersion='V30.6';s.liveDecisionVersion='V30.6';s.sellRebuyChurnPolicy=policy;
    s.canonicalScorePolicy={...(s.canonicalScorePolicy||{}),version:30.6,sellRebuyAntiChurn:true,reentryCooldownMinutes:30,exceptionalSignalReentry:true};
    if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:30.6,sellRebuyAntiChurn:true,reentryCooldownMinutes:30,rule:`${String(s.finalDecisionPolicy.rule||'').slice(0,260)} V30.6: Nach einem SELL ist ein erneuter BUY desselben Symbols fuer 30 Minuten blockiert. Unter 10 Minuten gilt eine besonders harte Sperre. Ausnahme nur bei klar neuem Breakout/Reclaim/Catalyst mit deutlich staerkerem Score und Momentum. SELL+BUY desselben Symbols im selben Zyklus ist immer Churn und wird blockiert.`};
    if(s?.executionModel)s.executionModel={...s.executionModel,sellRebuyAntiChurnV306:true,reentryCooldownMinutes:30,hardExitReentryCooldownMinutes:120,higherPriceRapidRebuyBlocked:true};
    return s;
  }
}
