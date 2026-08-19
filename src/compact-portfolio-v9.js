import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v8.js';
import {withRequestFetchBudget} from './request-fetch-budget.js';
import {buildFutureWatch} from './future-watch.js';
import {gettexSessionState} from './gettex-session.js';

const FUTURE_WATCH_COOLDOWN_MS=10*60*1000;
const PREOPEN_KEY='state/gettex-preopen-v1';
const PREOPEN_FETCH_SOFT_CAP=24;

async function withPreopenFetchBudget(fn){
  return withRequestFetchBudget(fn,{cap:PREOPEN_FETCH_SOFT_CAP,blockedError:'preopen-free-tier-soft-cap',label:'preopen'});
}

export class MarketPortfolio extends BasePortfolio{
  async _refreshFutureWatch(force=false){
    const raw=this.bucketAdapter?.peekState?.();
    const last=Date.parse(raw?.futureWatch?.updatedAt||''),scanNo=Number(raw?.config?.scan_count||0);
    if(!force&&!Number.isFinite(last)&&scanNo<2)return null;
    if(!force&&Number.isFinite(last)&&Date.now()-last<FUTURE_WATCH_COOLDOWN_MS)return raw?.futureWatch||null;
    if(!this.engine?.store?.update)return null;
    const r=await this.engine.store.update(async s=>{s.futureWatch=await buildFutureWatch(this.env,s);return true});
    return r?.state?.futureWatch||null;
  }

  async preOpenPrepare(date=new Date()){
    const session=gettexSessionState(date);
    if(!session.preopen)return{ok:true,skipped:'gettex-not-preopen',gettexSession:session};
    const kv=this.ctx?.storage?.kv;
    try{const old=kv?.get(PREOPEN_KEY);if(old?.localDate===session.localDate)return{ok:true,skipped:'gettex-preopen-already-prepared',gettexSession:session,preparedAt:old.preparedAt||null,freeFetchBudget:old.freeFetchBudget||null}}catch{}
    const run=await withPreopenFetchBudget(async()=>{
      // Externe Daten sind nur hier und waehrend echter Handels-Scans erlaubt.
      // Status-Aufrufe laden diese Listen niemals nach.
      let leaders=null,macro=null,future=null;
      try{leaders=await this.zeroAssets?.refreshExternalLeaders?.()}catch(e){console.error('Preopen leaders failed',e)}
      try{macro=await this._refreshMacro(true)}catch(e){console.error('Preopen macro failed',e)}
      try{future=await this._refreshFutureWatch(true)}catch(e){console.error('Preopen future watch failed',e)}
      return{leaderCount:Array.isArray(leaders)?leaders.length:0,macro:macro?.radar?{updatedAt:macro.radar.updatedAt,eventCount:macro.radar.events?.length||0}:null,future:future?{updatedAt:future.updatedAt,candidateCount:future.candidateCount||0}:null};
    });
    const preparedAt=new Date().toISOString(),payload={localDate:session.localDate,preparedAt,freeFetchBudget:run.stats};try{kv?.put(PREOPEN_KEY,payload)}catch{}
    return{ok:true,preopen:true,noTrades:true,gettexSession:session,preparedAt,freeFetchBudget:run.stats,prepared:run.value};
  }

  async scan(){
    const session=gettexSessionState(new Date());
    if(!session.open){
      if(session.preopen)return this.preOpenPrepare(new Date());
      return{ok:true,skipped:'gettex-closed-sleep',sleeping:true,noNews:true,noMarketScan:true,gettexSession:session};
    }
    const r=await super.scan();
    if(!r?.skipped&&!r?.aborted){try{await this._refreshFutureWatch(false)}catch(e){console.error('Future watch refresh failed',e)}}
    return{...r,gettexSession:session};
  }

  async status(){
    const s=await super.status(),raw=this.bucketAdapter?.peekState?.(),session=gettexSessionState(new Date());
    s.futureWatch=raw?.futureWatch||null;s.gettexSession=session;
    if(s.freeTierBudget){
      s.freeTierBudget={...s.freeTierBudget,activeWindowLocal:'07:25 Vorbereitung · 07:30-23:00 Handel',sleepOutsideGettexHours:true,newsAtNight:false,maxScheduledScansPerDay:930,maxScheduledMarketScansPerTradingDay:930,preopenPrepareOncePerTradingDay:true,note:'Cloudflare-Free-Schlafmodus: nachts, am Wochenende und an gettex-Handelsfeiertagen keine Markt-/News-Scans. 07:25 einmal Overnight-Vorbereitung, 07:30-23:00 Top-25-Minutenbetrieb.'};
    }
    return s;
  }
}
