import {MarketPortfolio as ProdPortfolio} from './portfolio-prod.js';
import {runLastWeekHindsight} from './last-week.js';

const REMOVED_SOURCES=new Set(['GDELT','SEC/EDGAR','Google News']);
const EMPTY_RSS='<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>disabled</title></channel></rss>';

export class MarketPortfolio extends ProdPortfolio{
  upsertHealth(h){
    this.ctx.storage.sql.exec("DELETE FROM source_health WHERE source IN ('GDELT','SEC/EDGAR','Google News')");
    const clean={};for(const [source,x] of Object.entries(h||{}))if(!REMOVED_SOURCES.has(source))clean[source]=x;
    return super.upsertHealth(clean);
  }

  async start(o={}){
    // Live-Universum ist immer vollständig: Aktien + ETFs + Hebel-/Inverse-ETFs.
    return super.start({...o,includeEtfs:true,includeLeverage:true});
  }

  async scan(){
    // Auch bestehende Läufe werden automatisch auf das vollständige Universum angehoben.
    this.ctx.storage.sql.exec('UPDATE config SET include_etfs=1,include_leverage=1 WHERE id=1');
    const nativeFetch=globalThis.fetch;
    globalThis.fetch=async(input,init)=>{
      try{const raw=typeof input==='string'||input instanceof URL?String(input):input?.url;if(raw&&new URL(raw).hostname==='news.google.com')return new Response(EMPTY_RSS,{status:200,headers:{'content-type':'application/rss+xml;charset=utf-8','cache-control':'public,max-age=900'}})}catch{}
      return nativeFetch(input,init);
    };
    try{return await super.scan()}finally{globalThis.fetch=nativeFetch}
  }

  async status(){const s=await super.status();s.sourceHealth=(s.sourceHealth||[]).filter(x=>!REMOVED_SOURCES.has(x.source));return s}

  async lastWeek(){
    const c=this.cfg(),m=this.executionModel(c);
    return runLastWeekHindsight(this.env,{feeFixed:m.feeFixed,feePercent:m.feePercent,slippagePercent:m.slippagePercent,leveragedSlippagePercent:m.leveragedSlippagePercent});
  }
}
