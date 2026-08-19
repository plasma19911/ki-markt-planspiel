import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v20-paper.js';
import {TradeDayLessonsAiGuard} from './trade-day-lessons-guard.js';

const arr=v=>Array.isArray(v)?v:[];
const key=v=>String(v||'').toUpperCase().trim();
const LIVE_EARLY_WAVE=3;

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
    if(eligible.length<=LIVE_EARLY_WAVE)return Response.json(data,{headers:{'cache-control':'no-store'}});
    const minute=Math.floor(Date.now()/60000),start=(minute*LIVE_EARLY_WAVE)%eligible.length,active=new Set();
    for(let i=0;i<LIVE_EARLY_WAVE;i++)active.add(key(eligible[(start+i)%eligible.length]?.symbol));
    const equities=rows.map(x=>{
      if(!(x?.pcWideSweep||x?.reboundWatch))return x;
      if(active.has(key(x?.symbol)))return{...x,earlyDipLiveWave:true};
      return{...x,pcWideDiscovery:Boolean(x?.pcWideSweep||x?.pcWideDiscovery),reboundDiscovery:Boolean(x?.reboundWatch||x?.reboundDiscovery),pcWideSweep:false,reboundWatch:false,earlyDipLiveWave:false};
    });
    return Response.json({...data,equities,early_dip_live_wave:LIVE_EARLY_WAVE,early_dip_rotating_pool:eligible.length,scanner_slice_equity_count:equities.length},{headers:{'cache-control':'no-store'}});
   };
   if(this.engine?.env)this.engine.env.ASSETS=assets;
  }
 }
 async status(){
  const s=await super.status();
  s.sourceBudgetPolicy={enabled:true,version:21.2,pcWideCoveragePreserved:true,earlyDipLiveWave:LIVE_EARLY_WAVE,secondChanceLiveWave:3,slowIntelligenceCached:true,oneMinuteCacheSeconds:45,yahooChartPacingMs:450,catalystGapRequestReserve:1,rule:'PC scannt weiterhin das Volluniversum. Cloudflare verteilt teure 1m-Zusatzchecks rotierend ueber Minuten; die Early-Dip-Live-Welle bleibt auf drei Werte begrenzt, damit gezielte Catalyst-Gap-Pruefungen ins Requestbudget passen.'};
  s.todayTradeCorrectionPolicy={enabled:true,version:2,mode:'REAL_DIP_CONTEXT_RECLAIM_V2',paperTradingOnly:true,microDipThresholdPct:.70,microDipNear20mHighBlocked:true,redDayShallowRetestBlocked:true,redDayRetestThresholdsPct:{dayMinus2:1.05,dayMinus4:1.35},highDayChaseBlocked:true,extremeDayMoveNeedsVerification:true,missingMtfShallowBuyBlocked:true,missingMtfFallbackRequires:{minDipPct:1.35,min5mPct:.10,minScore:4.8,minAccelerationPct:.03},continuationCannotBypassMtf:true,autoDipRequiresRealDepthAndReclaim:true,reentryNeedsNewStructure:true,buyerMajoritySellBlocked:true,mixedBaseTopSellBlocked:true,momentumExitNeedsTwoWeakSignals:true,hardEventExitUnaffected:true,starterCapsPct:{shallow:4,medium:7,deeper:11,deep:15,continuation:4,missingMtfStrongFallback:5},rule:'Trade-Review V2: Ruecksetzer unter 0,70% vom lokalen 20m-Hoch sind kein echter Dip. An deutlich roten Tagen muss der Retest tiefer sein. Fehlt Tages-/Wochenkontext, wird nicht mehr nur auf 3% verkleinert: der Kauf wird gestoppt, ausser mindestens 1,35% echter Dip, positive 5m-Erholung und hohe Setup-Qualitaet bestaetigen den Einstieg. So werden die heute beobachteten kleinen Auto-Dip-Kaeufe nahe dem lokalen Hoch gezielt verhindert, ohne tiefe qualitativ bestaetigte Ruecksetzer abzuschalten.'};
  s.missedOpportunityReviewV2={enabled:true,version:2.1,mode:'TARGETED_CATALYST_GAP_AND_RELATIVE_MISS_LEARNING',paperTradingOnly:true,existingMultiSourceNewsRadar:true,broadExtraCatalystRequest:false,targetedNewsGapCheckPerDecision:1,targetedGapCacheSeconds:120,emptyGapResponsesCached:true,additionalNetworkRequestsPerDecisionMax:1,requestBudgetCompensatedByEarlyDipWave:true,crossCandidateCatalystMatching:false,clinicalLongTermBenefitDetection:true,strategicStakeAndWarrantDetection:true,guidanceCatalysts:true,positiveShockPeakChaseBlocked:true,positiveShockRetestRequired:true,missedShockLearningRelativeToTradingDay:true,fixedMissedShockDayPct:null,rule:'Zweite Auswertung des Handelstags: starke Kursbewegung ohne passende News-Erklaerung gilt als Datenluecke. Die vorhandenen Multi-Source-News bleiben Basis; zusaetzlich wird pro Entscheidung hoechstens genau ein auffaelliger Kandidat gezielt nachrecherchiert und das Ergebnis 120 Sekunden gecacht. Positive Schocks werden nicht am Hoch gekauft, sondern als Retest-Watch gehalten. Verpasste Schocks werden relativ zur Bewegung des jeweiligen Handelstags gelernt statt ueber eine feste Tages-Prozentgrenze.'};
  if(s.entryResearchPolicy)s.entryResearchPolicy={...s.entryResearchPolicy,todayTradeReviewV2:true,microDipNear20mHighBlocked:true,redDayShallowRetestBlocked:true,missingMtfShallowBuyBlocked:true,reentryNeedsNewStructure:true,catalystGapDiscoveryV2:true};
  if(s.candleFlowPolicy)s.candleFlowPolicy={...s.candleFlowPolicy,todayTradeReviewV2:true,buyerMajoritySellBlocked:true,mixedBaseTopSellBlocked:true,momentumExitNeedsTwoWeakSignals:true};
  if(s.newsShockPolicy)s.newsShockPolicy={...s.newsShockPolicy,version:2.1,catalystGapDiscoveryV2:true,broadCatalystRadar:false,targetedGapCheckPerDecision:1,targetedGapCacheSeconds:120,additionalGapRequestsMax:1,strategicStakeCatalyst:true,missedShockLearningRelativeToTradingDay:true,highImpactTypes:[...new Set([...(s.newsShockPolicy.highImpactTypes||[]),'STRATEGIC_STAKE'])]};
  if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,todayTradeReviewV2:true,deeperDipPreferred:true,realDipThresholdPct:.70,redDayShallowRetestBlocked:true,missingMtfShallowBuyBlocked:true,noiseSellBlocked:true,reentryNeedsNewStructure:true,continuationCannotBypassMtf:true,catalystGapDiscoveryV2:true};
  if(s.executionModel)s.executionModel={...s.executionModel,todayTradeReviewV2:true,microDipBuyBlocked:true,microDipThresholdPct:.70,redDayShallowRetestBlocked:true,missingMtfShallowBuyBlocked:true,highChaseBlocked:true,noiseSellBlocked:true,catalystGapDiscoveryV2:true};
  return s;
 }
}
