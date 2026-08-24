import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v304-relative-rotation.js';
import {ProfitOpportunityGuardV305} from './profit-opportunity-v305.js';

export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    const getState=()=>{try{return this._actualState?.()||{}}catch{return{}}};
    const ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__profitOpportunityV305){const wrapped=new ProfitOpportunityGuardV305(ai,{getState});wrapped.__profitOpportunityV305=true;this.profitOpportunityV305=wrapped;this.engine.env.AI=wrapped}
  }
  async status(){
    const s=await super.status(),policy=this.profitOpportunityV305?.status?.()||{enabled:true,version:30.5,mode:'profit-opportunity-controller'};
    s.runtimeVersion='V30.5';s.liveDecisionVersion='V30.5';s.profitOpportunityPolicy=policy;
    s.canonicalScorePolicy={...(s.canonicalScorePolicy||{}),version:30.5,profitOpportunityController:true,starterOpportunityBuy:true,starterMinScore:66,netOpportunityRotation:true,hysteresisDeteriorationAware:true,guardBlockerAudit:true};
    if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:30.5,profitOpportunityController:true,starterOpportunityBuy:true,netOpportunityRotation:true,guardBlockerAudit:true,rule:`${String(s.finalDecisionPolicy.rule||'').slice(0,300)} V30.5: Nach allen Sicherheits-Guards entscheidet eine letzte Profit-Opportunity-Schicht. Harte Broker/News/Quote/FX-Sperren bleiben unangetastet; weiche HOLDs koennen bei exakt TR-verifizierten Kandidaten ab 66/100 einen 6-10%-Starter erhalten. Rotation bewertet relative Netto-Chance und beruecksichtigt starke Rawscore-Verschlechterung trotz Score-Hysterese.`};
    if(s?.executionModel)s.executionModel={...s.executionModel,profitOpportunityV305:true,starterOpportunityBuyV305:true,netOpportunityRotationV305:true,guardBlockerAuditV305:true,maxOpenPositions:4,maxSinglePositionPctOfEquity:25};
    return s;
  }
}
