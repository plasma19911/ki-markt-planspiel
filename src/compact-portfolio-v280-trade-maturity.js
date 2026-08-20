import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v279-opportunity-learning.js';
import {TradeMaturityGuardV280} from './trade-maturity-v280.js';

// PAPER-TRADING ONLY. V28.0 keeps V27.9 opportunity learning and adds
// faster multi-scan setup recognition plus thesis maturity / recovery patience.
export class MarketPortfolio extends BasePortfolio{
 constructor(ctx,env){
  super(ctx,env);this.ctx=ctx;
  const ai=this.engine?.env?.AI;
  if(ai?.run&&!ai.__tradeMaturityV280){
   const getState=()=>{try{return this._actualState?.()||{}}catch{return{}}};
   const wrapped=new TradeMaturityGuardV280(ai,{getState,storage:this.ctx?.storage});
   wrapped.__tradeMaturityV280=true;this.tradeMaturity=wrapped;this.engine.env.AI=wrapped;
  }
 }
 async status(){
  const s=await super.status(),maturity=this.tradeMaturity?.status?.()||{enabled:true,version:28.0};
  if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:28.0,acceleratingSetupRecognition:true,learnedMinimumHold:true,earlyLossNoiseProtection:true,recoveryWindow:true,postExitRecoveryLearning:true,stocksOnly:true,
   regressionTests:`${String(s.finalDecisionPolicy.regressionTests||'').replace(/\s*$/,'')} + V28.0 accelerating-setup / thesis-maturity / recovery-window / hard-risk invariants`,
   rule:'V28.0 erkennt gute Aktien früher über die Verbesserung mehrerer aufeinanderfolgender Scans. Nach dem Einstieg wird eine Position nicht wegen eines normalen kurzen Minus verkauft: eine gelernte Reifezeit und ein Recovery-Fenster schützen die These. Nur harte Risiken oder bestätigte schwere Strukturbrüche dürfen sofort schließen. Post-Exit-Rebounds trainieren die Haltedauer weiter.'};
  s.tradeMaturityPolicy={...maturity,enabled:true,version:28.0,paperTradingOnly:true,stocksOnly:true};
  if(s?.executionModel)s.executionModel={...s.executionModel,tradeMaturityV280:true,acceleratingSetupRecognition:true,learnedMinimumHold:true,recoveryWindow:true,postExitRecoveryLearning:true,stocksOnly:true};
  if(s?.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,tradeMaturityV280:true,acceleratingSetupRecognition:true,learnedMinimumHold:true,recoveryWindow:true,postExitRecoveryLearning:true,stocksOnly:true};
  return s;
 }
}
