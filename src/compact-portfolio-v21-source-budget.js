import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v20-paper.js';
import {TradeDayLessonsAiGuard} from './trade-day-lessons-guard.js';

const arr=v=>Array.isArray(v)?v:[];
const key=v=>String(v||'').toUpperCase().trim();
const LIVE_EARLY_WAVE=4;

// V21 keeps the source-budget protection and adds the final day-review guard.
// The new guard is deliberately outermost: it can stop a late high-chase BUY or
// a noise SELL even when an older inner layer would otherwise let it through.
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
  s.sourceBudgetPolicy={enabled:true,version:21,pcWideCoveragePreserved:true,earlyDipLiveWave:LIVE_EARLY_WAVE,secondChanceLiveWave:3,slowIntelligenceCached:true,oneMinuteCacheSeconds:45,yahooChartPacingMs:450,rule:'PC scannt weiterhin das Volluniversum. Cloudflare verteilt teure 1m-Zusatzchecks rotierend ueber Minuten, damit News, Termine, Charts und finale KI nicht am Subrequest-Limit verhungern.'};
  s.todayTradeCorrectionPolicy={enabled:true,version:1,mode:'DEEPER_DIP_ANTI_CHASE_NOISE_EXIT_REVIEW',paperTradingOnly:true,microDipNear20mHighBlocked:true,highDayChaseBlocked:true,extremeDayMoveNeedsVerification:true,missingMtfHighMomentumBuyBlocked:true,continuationCannotBypassMtf:true,reentryNeedsNewStructure:true,buyerMajoritySellBlocked:true,mixedBaseTopSellBlocked:true,momentumExitNeedsTwoWeakSignals:true,hardEventExitUnaffected:true,starterCapsPct:{shallow:5,medium:8,deeper:12,deep:16,continuation:4,missingMtf:3},rule:'Lehre aus den Trades vom 19.08.: kleine Ruecksetzer nahe dem 20m-Hoch sind kein echter Dip. Hochgelaufene Aktien brauchen einen deutlich tieferen Retest und kompletten Mehr-Zeitebenen-Kontext. Nach einem Verkauf gibt es keinen automatischen Wiedereinstieg ohne neue Bodenstruktur. Normale SELLs gegen Käufermehrheit, bei gemischtem Boden/Top oder wegen kleiner 5m-Zuckungen werden gestoppt; echte Event-/Stop-Risiken bleiben sofort möglich.'};
  if(s.entryResearchPolicy)s.entryResearchPolicy={...s.entryResearchPolicy,todayTradeReviewV1:true,microDipNear20mHighBlocked:true,highDayChaseBlocked:true,reentryNeedsNewStructure:true};
  if(s.candleFlowPolicy)s.candleFlowPolicy={...s.candleFlowPolicy,todayTradeReviewV1:true,buyerMajoritySellBlocked:true,mixedBaseTopSellBlocked:true,momentumExitNeedsTwoWeakSignals:true};
  if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,todayTradeReviewV1:true,deeperDipPreferred:true,noiseSellBlocked:true,reentryNeedsNewStructure:true,continuationCannotBypassMtf:true};
  if(s.executionModel)s.executionModel={...s.executionModel,todayTradeReviewV1:true,microDipBuyBlocked:true,highChaseBlocked:true,noiseSellBlocked:true};
  return s;
 }
}
