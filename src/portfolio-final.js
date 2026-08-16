import {MarketPortfolio as ProdPortfolio} from './portfolio-prod.js';
import {runLastWeekHindsight} from './last-week.js';

const REMOVED_SOURCES=new Set(['GDELT','SEC/EDGAR']);

export class MarketPortfolio extends ProdPortfolio{
  upsertHealth(h){
    // Alte, nicht mehr verwendete Quellen sofort aus persistentem Health entfernen.
    this.ctx.storage.sql.exec("DELETE FROM source_health WHERE source IN ('GDELT','SEC/EDGAR')");
    return super.upsertHealth(h);
  }

  async status(){
    const s=await super.status();
    s.sourceHealth=(s.sourceHealth||[]).filter(x=>!REMOVED_SOURCES.has(x.source));
    return s;
  }

  async lastWeek(){
    const c=this.cfg(),m=this.executionModel(c);
    return runLastWeekHindsight(this.env,{
      feeFixed:m.feeFixed,
      feePercent:m.feePercent,
      slippagePercent:m.slippagePercent
    });
  }
}
