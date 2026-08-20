import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v280-trade-maturity.js';
import {ResearchSignalFusionGuardV281} from './research-signal-fusion-v281.js';

// PAPER-TRADING ONLY. V28.1 keeps V28.0 trade maturity and replaces additional
// soft entry blockers with a research-backed weighted evidence score.
export class MarketPortfolio extends BasePortfolio{
 constructor(ctx,env){
  super(ctx,env);this.ctx=ctx;
  const ai=this.engine?.env?.AI;
  if(ai?.run&&!ai.__researchSignalFusionV281){
   const getState=()=>{try{return this._actualState?.()||{}}catch{return{}}};
   const wrapped=new ResearchSignalFusionGuardV281(ai,{getState,storage:this.ctx?.storage});
   wrapped.__researchSignalFusionV281=true;this.researchSignalFusion=wrapped;this.engine.env.AI=wrapped;
  }
 }
 async status(){
  const s=await super.status(),fusion=this.researchSignalFusion?.status?.()||{enabled:true,version:28.1};
  if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:28.1,weightedResearchSignalFusion:true,fewerSoftHardBlocks:true,stocksOnly:true,
   researchSignals:['price momentum','volume confirmation','pullback/reclaim','fresh novel quantitative news','52-week-high proximity when available','multi-scan acceleration','market regime','forward learning'],
   researchBasis:['Jegadeesh & Titman 1993','Lee & Swaminathan 2000','George & Hwang 2004','Bernard & Thomas 1989','Didisheim et al. NBER 2026','Daniel & Moskowitz 2016'],
   regressionTests:`${String(s.finalDecisionPolicy.regressionTests||'').replace(/\s*$/,'')} + V28.1 weighted-signal / novel-news / hard-safety / stock-only invariants`,
   rule:'V28.1 bewertet gute Aktien über einen gewichteten Evidenz-Score statt über immer mehr binäre Regeln. Eine weiche Bedingung kann eine starke Gesamtchance nicht mehr allein verwerfen. Harte Sperren bleiben nur für echte Daten-/Venue-/Event-/starke Negativ-/Kostenrisiken bestehen. Frische quantitative News werden stärker gewichtet als alte oder rein narrative Meldungen. Nur Aktien.'};
  s.researchSignalFusionPolicy={...fusion,enabled:true,version:28.1,paperTradingOnly:true,stocksOnly:true};
  if(s?.executionModel)s.executionModel={...s.executionModel,researchSignalFusionV281:true,weightedEvidenceScore:true,fewerSoftHardBlocks:true,novelNewsPriority:true,stocksOnly:true};
  if(s?.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,researchSignalFusionV281:true,weightedEvidenceScore:true,fewerSoftHardBlocks:true,novelNewsPriority:true,stocksOnly:true};
  return s;
 }
}
