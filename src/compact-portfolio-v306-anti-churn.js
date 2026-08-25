import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v305-profit-opportunity.js';
import {SellRebuyChurnGuardV306} from './sell-rebuy-churn-v306.js';
import {WeakestPositionReplacementGuardV3061} from './weakest-position-replacement-v3061.js';

export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    const getState=()=>{try{return this._actualState?.()||{}}catch{return{}}};
    let brokerRowsCache=[],brokerRowsAt=0;
    const getBrokerRows=async()=>{
      const now=Date.now();if(brokerRowsCache.length&&now-brokerRowsAt<15*60*1000)return brokerRowsCache;
      try{const data=await this.zeroAssets?._load?.();const rows=Array.isArray(data?.equities)?data.equities:[];if(rows.length){brokerRowsCache=rows;brokerRowsAt=now}}catch{}
      return brokerRowsCache;
    };
    const ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__weakestReplacementV3061&&!ai.__sellRebuyChurnV306){
      const replacement=new WeakestPositionReplacementGuardV3061(ai,{getState,getBrokerRows});replacement.__weakestReplacementV3061=true;this.weakestReplacementV3061=replacement;
      const wrapped=new SellRebuyChurnGuardV306(replacement,{getState});wrapped.__sellRebuyChurnV306=true;this.sellRebuyChurnV306=wrapped;this.engine.env.AI=wrapped;
    }
  }
  async status(){
    const s=await super.status(),policy=this.sellRebuyChurnV306?.status?.()||{enabled:true,version:30.6,mode:'sell-rebuy-anti-churn'},replacement=this.weakestReplacementV3061?.status?.()||{enabled:true,version:'30.6.1',mode:'weakest-position-replacement'};
    s.runtimeVersion='V30.6';s.liveDecisionVersion='V30.6';s.sellRebuyChurnPolicy=policy;s.weakestPositionReplacementPolicy=replacement;
    s.canonicalScorePolicy={...(s.canonicalScorePolicy||{}),version:30.6,sellRebuyAntiChurn:true,reentryCooldownMinutes:30,exceptionalSignalReentry:true,weakestPositionReplacement:true,replacementMinCandidateScore:62,severeWeakRawScore:45};
    if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:30.6,sellRebuyAntiChurn:true,reentryCooldownMinutes:30,weakestPositionReplacement:true,rule:`${String(s.finalDecisionPolicy.rule||'').slice(0,220)} V30.6: Nach SELL 30 Min Re-Entry-Sperre. V30.6.1: Eine klar deteriorierte Bestandsposition darf gegen einen exakt Trade-Republic-verifizierten Kandidaten ab 62/100 ersetzt werden, wenn RawScore/Hysterese/Trend und relativer KEEP-Score den Wechsel klar rechtfertigen. SELL+BUY werden als gepaarte Rotation behandelt.`};
    if(s?.executionModel)s.executionModel={...s.executionModel,sellRebuyAntiChurnV306:true,reentryCooldownMinutes:30,hardExitReentryCooldownMinutes:120,higherPriceRapidRebuyBlocked:true,weakestPositionReplacementV3061:true,pairedRotationExecution:true};
    return s;
  }
}
