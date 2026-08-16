import {MarketPortfolio as FinalPortfolio} from './portfolio-final.js';

const EMPTY_RSS='<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>disabled</title></channel></rss>';
const parentScan=Object.getPrototypeOf(FinalPortfolio.prototype).scan;

export class MarketPortfolio extends FinalPortfolio {
  async start(options={}) {
    const r=await super.start({...options,includeEtfs:true,includeLeverage:false});
    this.ctx.storage.sql.exec('UPDATE config SET include_etfs=1,include_leverage=0 WHERE id=1');
    return r;
  }

  async reset() {
    const r=await super.reset();
    this.ctx.storage.sql.exec('UPDATE config SET include_etfs=1,include_leverage=0 WHERE id=1');
    return r;
  }

  async scan() {
    this.ctx.storage.sql.exec('UPDATE config SET include_etfs=1,include_leverage=0 WHERE id=1');
    for (const p of this.positions().filter(x=>x.instrument_type==='LEVERAGED_ETF')) {
      this.close(p.symbol,p.last_price,p.last_fx,p.score,'Hebel-/Inverse-Produkte wurden aus dem Planspiel entfernt');
    }

    // portfolio-final.js stammt aus der frueheren All-Assets-Version und aktiviert in seiner
    // eigenen scan()-Methode Hebel wieder. Deshalb rufen wir gezielt dessen Eltern-Scanner auf.
    // Dynamische Methoden wie aiPlan/open/upsertHealth bleiben trotzdem unsere aktuellen Overrides.
    const nativeFetch=globalThis.fetch;
    globalThis.fetch=async(input,init)=>{
      try{
        const raw=typeof input==='string'||input instanceof URL?String(input):input?.url;
        if(raw&&new URL(raw).hostname==='news.google.com')return new Response(EMPTY_RSS,{status:200,headers:{'content-type':'application/rss+xml;charset=utf-8','cache-control':'public,max-age=900'}});
      }catch{}
      return nativeFetch(input,init);
    };
    try{return await parentScan.call(this)}finally{globalThis.fetch=nativeFetch}
  }

  open(candidate,pct,reason) {
    if (candidate?.type==='LEVERAGED_ETF') return false;
    return super.open(candidate,pct,reason);
  }

  async aiPlan(candidates,positions,cfg) {
    return super.aiPlan(
      (candidates||[]).filter(x=>x.type!=='LEVERAGED_ETF'),
      (positions||[]).filter(x=>x.instrument_type!=='LEVERAGED_ETF'),
      {...cfg,include_leverage:0}
    );
  }

  async status() {
    const s=await super.status();
    if(s?.config){s.config.include_etfs=1;s.config.include_leverage=0}
    s.candidates=(s.candidates||[]).filter(x=>x.instrument_type!=='LEVERAGED_ETF');
    s.newsRadar=(s.newsRadar||[]).filter(x=>x.instrument_type!=='LEVERAGED_ETF');
    if(s?.risk){s.risk.leverPct=0}
    return s;
  }

  async lastWeek() {
    const r=await this.env.ASSETS.fetch(new Request('https://assets.local/analysis-2026.json'));
    if(!r.ok)throw new Error('2026-Auswertung wird gerade vorbereitet. Bitte spaeter erneut versuchen.');
    const a=await r.json();
    return {label:`01.01.2026 – ${a.period?.to||'heute'}`,...a.perfect,walkForward:a.walkForward,universeCounts:a.universe,scannedSymbols:a.scannedSymbols,usableSymbols:a.usableSymbols};
  }
}
