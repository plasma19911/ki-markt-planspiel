import {MarketPortfolio as FinalPortfolio} from './portfolio-final.js';

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
    // Alte Papierpositionen aus frueheren Versionen sauber glattstellen, statt sie unsichtbar zu machen.
    for (const p of this.positions().filter(x=>x.instrument_type==='LEVERAGED_ETF')) {
      this.close(p.symbol,p.last_price,p.last_fx,p.score,'Hebel-/Inverse-Produkte wurden aus dem Planspiel entfernt');
    }
    return super.scan();
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
