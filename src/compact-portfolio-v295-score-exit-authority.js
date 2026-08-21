import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v294-score-entry-exit.js';
import {ScoreExitAuthorityGuardV295,SCORE_EXIT_AUTHORITY_V295} from './score-exit-authority-v295.js';

// PAPER-TRADING ONLY. V29.5 is the final SELL authority for held positions.
// Normal SELL is permitted only when V29.4 confirms +10 or -15 DecisionScore points
// relative to the score stored at purchase. Older nested SELL guards are overridden.
export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    const ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__scoreExitAuthorityV295){
      const getState=()=>{try{return this._actualState?.()||{}}catch{return{}}};
      const wrapped=new ScoreExitAuthorityGuardV295(ai,{getState});
      wrapped.__scoreExitAuthorityV295=true;this.scoreExitAuthorityV295=wrapped;this.engine.env.AI=wrapped;
    }
  }
  async status(){
    const s=await super.status(),policy=this.scoreExitAuthorityV295?.status?.()||{enabled:true,version:29.5,authoritative:true,...SCORE_EXIT_AUTHORITY_V295};
    s.scoreExitAuthorityPolicy=policy;
    s.canonicalScorePolicy={...(s.canonicalScorePolicy||{}),version:29.5,immediateBuyMin:56,onlyNormalSellRule:'+10/-15 from purchase DecisionScore',legacySellRulesSuperseded:true};
    if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:29.5,scoreExitAuthority:true,legacySellRulesSuperseded:true,rule:'V29.5: Neukauf weiterhin ab DecisionScore 56. Für gehaltene Positionen ist +10 Punkte seit Kauf oder -15 Punkte seit Kauf die einzige normale SELL-Regel. Alte Profit-, Trend-, Rotation- und Positions-SELLs werden final auf HOLD zurückgesetzt.'};
    if(s?.executionModel)s.executionModel={...s.executionModel,scoreExitAuthorityV295:true,onlyNormalSellRule:true,positiveScoreExitDelta:10,negativeScoreExitDelta:-15};
    return s;
  }
}
