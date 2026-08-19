import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v19.js';
import {ContinuationOpportunityAiGuard} from './continuation-opportunity-guard.js';

// PAPER-TRADING ONLY. Diese Schicht fuehrt keine echten Broker-Orders aus.
// Sie verhindert im Planspiel, dass ein fuer Dips optimierter Candle-Score
// starke BUYER-CONFIRMED Breakout/Continuation-Setups pauschal auf HOLD setzt.
export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);
    const ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__continuationOpportunityGuard){
      const wrapped=new ContinuationOpportunityAiGuard(ai);
      wrapped.__continuationOpportunityGuard=true;
      this.engine.env.AI=wrapped;
    }
  }
  async status(){
    const s=await super.status();
    s.paperOpportunityPolicy={
      enabled:true,
      version:20,
      paperTradingOnly:true,
      mode:'RANK_STAGE_AND_CONFIRM',
      dipDoesNotVetoAllOtherBuys:true,
      continuationBreakoutStarter:true,
      newsGlobalVeto:false,
      missingLongChartIsSoftWhen1mBuyerFlowConfirmed:true,
      rule:'Im Planspiel werden gute Dips bevorzugt, aber starke bestaetigte Continuation-/Breakout-Chancen duerfen als kleine Starter weiterlaufen. News sind Kontext; nur harte negative Unternehmensereignisse bleiben ein Veto. Kein Zwang, 100% investiert zu sein.'
    };
    return s;
  }
}
