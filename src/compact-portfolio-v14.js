import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v13.js';
import {EarlyBreakoutAiGuard} from './early-breakout-ai-guard.js';

// V14: haengt den Early-Breakout-Validierer als aeusserste AI-Schicht an.
// Dadurch kann er spaete/ueberhitzte Discovery-Werte blockieren, aber niemals
// den Profit-Optimizer umgehen oder selbst einen Kauf erzwingen.
export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);
    const ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__earlyBreakoutGuard){
      const wrapped=new EarlyBreakoutAiGuard(ai,this.bucketAdapter);wrapped.__earlyBreakoutGuard=true;this.engine.env.AI=wrapped;
    }
  }
  async status(){
    const s=await super.status();
    if(s.earlyBreakoutScan)s.earlyBreakoutScan={...s.earlyBreakoutScan,guardActive:true,lateChaseBlocked:true,forcedBuys:false};
    if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,earlyBreakoutGuard:true};
    return s;
  }
}
