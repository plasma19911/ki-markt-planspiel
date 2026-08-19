import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v20-paper.js';

const arr=v=>Array.isArray(v)?v:[];
const key=v=>String(v||'').toUpperCase().trim();
const LIVE_EARLY_WAVE=4;

// V21 changes only the expensive Cloudflare confirmation wave. All PC-wide candidates
// stay in the universe/ranking; only four at a time carry the additional Early-Dip 1m
// flag so Yahoo/Cloudflare budgets cannot starve News, Events or the final AI call.
export class MarketPortfolio extends BasePortfolio{
 constructor(ctx,env){
  super(ctx,env);this.ctx=ctx;
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
  return s;
 }
}
