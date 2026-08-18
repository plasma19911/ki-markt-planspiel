import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v14.js';
import {TargetVenueAiGuard} from './target-venue-ai-guard.js';

// V15: letzte Zielbroker-Sanity-Schicht. Analyse bleibt breit, aber eindeutige
// Venture-/OTC-Symbole werden ohne explizite gettex-Zuordnung nicht gekauft.
export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);
    const ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__targetVenueGuard){const wrapped=new TargetVenueAiGuard(ai);wrapped.__targetVenueGuard=true;this.engine.env.AI=wrapped}
  }
  async status(){
    const s=await super.status();
    s.targetVenueSanity={enabled:true,targetBroker:'finanzen.net ZERO',venue:'gettex',unverifiedVentureOtcAutoBuyBlocked:true,analysisStillBroad:true};
    if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,targetVenueSanity:true};
    if(s.executionModel)s.executionModel={...s.executionModel,targetVenueSanity:true,unverifiedVentureOtcAutoBuyBlocked:true};
    return s;
  }
}
