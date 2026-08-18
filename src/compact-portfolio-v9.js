import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v8.js';
import {buildFutureWatch} from './future-watch.js';

const FUTURE_WATCH_COOLDOWN_MS=10*60*1000;

export class MarketPortfolio extends BasePortfolio{
  async _refreshFutureWatch(force=false){
    const raw=this.bucketAdapter?.peekState?.();
    const last=Date.parse(raw?.futureWatch?.updatedAt||''),scanNo=Number(raw?.config?.scan_count||0);
    // Der erste Scan bleibt fuer Kurs/Leader/Fast reserviert. Ab Scan 2 startet der
    // Zukunftsradar und bleibt danach bei maximal einem externen Refresh je 10 Minuten.
    if(!force&&!Number.isFinite(last)&&scanNo<2)return null;
    if(!force&&Number.isFinite(last)&&Date.now()-last<FUTURE_WATCH_COOLDOWN_MS)return raw?.futureWatch||null;
    if(!this.engine?.store?.update)return null;
    const r=await this.engine.store.update(async s=>{s.futureWatch=await buildFutureWatch(this.env,s);return true});
    return r?.state?.futureWatch||null;
  }

  async scan(){
    const r=await super.scan();
    if(!r?.skipped&&!r?.aborted){try{await this._refreshFutureWatch(false)}catch(e){console.error('Future watch refresh failed',e)}}
    return r;
  }

  async status(){
    const s=await super.status(),raw=this.bucketAdapter?.peekState?.();
    s.futureWatch=raw?.futureWatch||null;
    return s;
  }
}
