import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v20-paper.js';
import {TradeDayLessonsAiGuard} from './trade-day-lessons-guard.js';
import {selectWideSweepLiveWave} from './wide-sweep-utils.js';

const arr=v=>Array.isArray(v)?v:[];
const key=v=>String(v||'').toUpperCase().trim();
const LIVE_EARLY_WAVE=2;

// V21 keeps the source-budget protection and adds the final day-review guard.
// The guard is deliberately outermost: it can stop a shallow auto-dip, late
// high-chase BUY or noise SELL even when an older inner layer would allow it.
export class MarketPortfolio extends BasePortfolio{
 constructor(ctx,env){
  super(ctx,env);this.ctx=ctx;
  const ai=this.engine?.env?.AI;
  if(ai?.run&&!ai.__tradeDayLessonsGuard){
   const wrapped=new TradeDayLessonsAiGuard(ai,{getState:()=>{try{return this._actualState?.()||{}}catch{return{}}}});
   wrapped.__tradeDayLessonsGuard=true;
   this.engine.env.AI=wrapped;
  }
  const assets=this.engine?.env?.ASSETS||this.zeroAssets;
  if(assets?.fetch&&!assets.__sourceBudgetV21){
   assets.__sourceBudgetV21=true;
   const baseFetch=assets.fetch.bind(assets);
   assets.fetch=async(request,init)=>{
    const r=await baseFetch(request,init);let u;try{u=new URL(typeof request==='string'?request:request.url)}catch{return r}
    if(!u.pathname.endsWith('/universe.json')||!r.ok)return r;
    let data;try{data=await r.json()}catch{return r}
    const rows=arr(data?.equities),eligible=rows.filter(x=>x?.pcWideSweep||x?.reboundWatch);
    if(eligible.length<=LIVE_EARLY_WAVE)return Response.json({...data,early_dip_live_wave:eligible.length,early_dip_rotating_pool:eligible.length,early_dip_priority_slot:eligible.length?1:0,scanner_slice_equity_count:rows.length},{headers:{'cache-control':'no-store'}});
    const minute=Math.floor(Date.now()/60000),activeRows=selectWideSweepLiveWave(eligible,minute,LIVE_EARLY_WAVE),active=new Set(activeRows.map(x=>key(x?.symbol)));
    const equities=rows.map(x=>{
      if(!(x?.pcWideSweep||x?.reboundWatch))return x;
      if(active.has(key(x?.symbol)))return{...x,earlyDipLiveWave:true};
      return{...x,pcWideDiscovery:Boolean(x?.pcWideSweep||x?.pcWideDiscovery),reboundDiscovery:Boolean(x?.reboundWatch||x?.reboundDiscovery),pcWideSweep:false,reboundWatch:false,earlyDipLiveWave:false};
    });
    return Response.json({...data,equities,early_dip_live_wave:LIVE_EARLY_WAVE,early_dip_rotating_pool:eligible.length,early_dip_priority_slot:1,early_dip_rotating_slots:Math.max(0,LIVE_EARLY_WAVE-1),scanner_slice_equity_count:equities.length},{headers:{'cache-control':'no-store'}});
   };
   if(this.engine?.env)this.engine.env.ASSETS=assets;
  }
 }
 async status(){
  const s=await super.status();
  s.sourceBudgetPolicy={enabled:true,version:21.4,pcWideCoveragePreserved:true,earlyDipLiveWave:LIVE_EARLY_WAVE,earlyDipPrioritySlots:1,earlyDipRotatingSlots:1,secondChanceLiveWave:3,slowIntelligenceCached:true,oneMinuteCacheSeconds:45,yahooChartPacingMs:450,catalystGapRequestReserve:1,rule:'PC scannt weiterhin das Volluniversum. Cloudflare nutzt zwei teure Early-Dip-1m-Slots pro Minute: der aktuell beste gebremste Pullback wird sofort geprueft, der zweite Slot rotiert fuer Vollabdeckung. Das Requestbudget bleibt gleich, aber gute Dips warten nicht mehr zufaellig mehrere Minuten. Weitere Quellen/MTF/News bleiben unveraendert geschuetzt.'};
  s.todayTradeCorrectionPolicy={enabled:true,version:2.1,mode:'REAL_DIP_CONTEXT_RECLAIM_V21_4',paperTradingOnly:true,microDipThresholdPct:.70,microDipNear20mHighBlocked:true,redDayShallowRetestBlocked:true,redDayRetestThresholdsPct:{dayMinus2:1.05,dayMinus4:1.35},highDayChaseBlocked:true,extremeDayMoveNeedsVerification:true,missingMtfShallowBuyBlocked:true,reviewedMtfSoftStarterPreserved:true,missingMtfFallbackRequires:{minDipPct:1.35,min5mPct:.10,minScore:4.8,minAccelerationPct:.03},continuationCannotBypassMtf:true,autoDipRequiresRealDepthAndReclaim:true,reentryNeedsNewStructure:true,buyerMajoritySellBlocked:true,mixedBaseTopSellBlocked:true,momentumExitNeedsTwoWeakSignals:true,hardEventExitUnaffected:true,starterCapsPct:{shallow:4,medium:7,deeper:11,deep:15,continuation:4,missingMtfStrongFallback:5},rule:'Trade-Review V2.1: Mikro-Dips und High-Chases bleiben gesperrt. Ein bereits vom Multi-Timeframe-V1.3-Guard nach bestaetigtem 1m-Kaeuferflow bewusst auf einen kleinen SOFT-DATA/Breakout/Contrarian-Starter reduzierter BUY wird jedoch nicht ein zweites Mal allein wegen fehlender Langfristdaten auf Null gesetzt. Harte Risiken bleiben unveraendert.'};
  s.missedOpportunityReviewV2={enabled:true,version:2.2,mode:'TARGETED_CATALYST_GAP_AND_RELATIVE_MISS_LEARNING',paperTradingOnly:true,existingMultiSourceNewsRadar:true,broadExtraCatalystRequest:false,targetedNewsGapCheckPerDecisionMax:1,targetedGapOnlyOnPriceNewsDislocation:true,targetedGapTriggers:{absoluteDayPct:4,absolute20mPct:2,strongScoreMin:4.8,strongScoreDayPct:2.5,maxNewsConfidenceForStrongScoreTrigger:.65},targetedGapCacheSeconds:120,emptyGapResponsesCached:true,additionalNetworkRequestsPerDecisionMax:1,requestBudgetCompensatedByEarlyDipWave:true,crossCandidateCatalystMatching:false,clinicalLongTermBenefitDetection:true,strategicStakeAndWarrantDetection:true,guidanceCatalysts:true,positiveShockPeakChaseBlocked:true,positiveShockRetestRequired:true,missedShockLearningRelativeToTradingDay:true,fixedMissedShockDayPct:null,rule:'Der vorhandene Multi-Source-Newsradar bleibt die Basis. Ein zusaetzlicher gezielter News-Request wird nur noch bei einer echten Preis/News-Diskrepanz ausgefuehrt: etwa ab 4% Tagesbewegung, 2% auf 20 Minuten oder bei einem sehr starken Setup mit mindestens 2,5% Tagesbewegung und schwacher News-Abdeckung. So bleibt die News-Suche aktuell, verbraucht aber nicht bei jedem normalen Kandidaten einen Extra-Request.'};
  if(s.entryResearchPolicy)s.entryResearchPolicy={...s.entryResearchPolicy,todayTradeReviewV2:true,microDipNear20mHighBlocked:true,redDayShallowRetestBlocked:true,missingMtfShallowBuyBlocked:true,reviewedMtfSoftStarterPreserved:true,reentryNeedsNewStructure:true,catalystGapDiscoveryV2:true};
  if(s.candleFlowPolicy)s.candleFlowPolicy={...s.candleFlowPolicy,todayTradeReviewV2:true,buyerMajoritySellBlocked:true,mixedBaseTopSellBlocked:true,momentumExitNeedsTwoWeakSignals:true};
  if(s.newsShockPolicy)s.newsShockPolicy={...s.newsShockPolicy,version:2.2,catalystGapDiscoveryV2:true,broadCatalystRadar:false,targetedGapCheckPerDecisionMax:1,targetedGapOnlyOnPriceNewsDislocation:true,targetedGapCacheSeconds:120,additionalGapRequestsMax:1,strategicStakeCatalyst:true,missedShockLearningRelativeToTradingDay:true,highImpactTypes:[...new Set([...(s.newsShockPolicy.highImpactTypes||[]),'STRATEGIC_STAKE'])]};
  if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,todayTradeReviewV2:true,deeperDipPreferred:true,realDipThresholdPct:.70,redDayShallowRetestBlocked:true,missingMtfShallowBuyBlocked:true,reviewedMtfSoftStarterPreserved:true,noiseSellBlocked:true,reentryNeedsNewStructure:true,continuationCannotBypassMtf:true,catalystGapDiscoveryV2:true,sourceBudgetVersion:21.4};
  if(s.executionModel)s.executionModel={...s.executionModel,todayTradeReviewV2:true,microDipBuyBlocked:true,microDipThresholdPct:.70,redDayShallowRetestBlocked:true,missingMtfShallowBuyBlocked:true,reviewedMtfSoftStarterPreserved:true,highChaseBlocked:true,noiseSellBlocked:true,catalystGapDiscoveryV2:true,sourceBudgetVersion:21.4};
  return s;
 }
}
