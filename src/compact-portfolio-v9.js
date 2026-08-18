import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v8.js';
import {buildFutureWatch} from './future-watch.js';
import {gettexSessionState} from './gettex-session.js';

const FUTURE_WATCH_COOLDOWN_MS=10*60*1000;
const PREOPEN_KEY='state/gettex-preopen-v1';
const PREOPEN_FETCH_SOFT_CAP=24;

async function withPreopenFetchBudget(fn){
  const nativeFetch=globalThis.fetch,cache=new Map(),stats={actual:0,cacheHits:0,blocked:0,cap:PREOPEN_FETCH_SOFT_CAP};
  globalThis.fetch=async(input,init)=>{
    const method=String(init?.method||input?.method||'GET').toUpperCase();let url='';try{url=typeof input==='string'||input instanceof URL?String(input):String(input?.url||'')}catch{}
    if(method==='GET'&&url&&cache.has(url)){stats.cacheHits++;const r=await cache.get(url);return r.clone()}
    if(stats.actual>=PREOPEN_FETCH_SOFT_CAP){stats.blocked++;return new Response(JSON.stringify({error:'preopen-free-tier-soft-cap'}),{status:429,headers:{'content-type':'application/json'}})}
    stats.actual++;const p=Promise.resolve(nativeFetch(input,init)).then(r=>r.clone());if(method==='GET'&&url)cache.set(url,p);const r=await p;return r.clone();
  };
  try{return{value:await fn(),stats}}finally{globalThis.fetch=nativeFetch}
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
      // 1) externe Top-25-Listen aktualisieren, 2) Overnight-Makro/Weltlage einlesen,
      // 3) strukturelle Future-Watch-Kandidaten aktualisieren. Keine Orderausfuehrung.
      let leaders=null,macro=null,future=null;
      try{leaders=await this.zeroAssets?.info?.()}catch{}
      try{macro=await this._refreshMacro(true)}catch(e){console.error('Preopen macro failed',e)}
      try{future=await this._refreshFutureWatch(true)}catch(e){console.error('Preopen future watch failed',e)}
      return{leaders,macro:macro?.radar?{updatedAt:macro.radar.updatedAt,eventCount:macro.radar.events?.length||0}:null,future:future?{updatedAt:future.updatedAt,candidateCount:future.candidateCount||0}:null};
    });
    const preparedAt=new Date().toISOString(),payload={localDate:session.localDate,preparedAt,freeFetchBudget:run.stats};try{kv?.put(PREOPEN_KEY,payload)}catch{}
    return{ok:true,preopen:true,noTrades:true,gettexSession:session,preparedAt,freeFetchBudget:run.stats,prepared:run.value};
  }

  async scan(){
    const session=gettexSessionState(new Date());
    // Harte Aussenkontrolle: ausserhalb gettex 07:30-23:00 werden weder Kurs-,
    // News-, Makro- noch Future-Watch-Scans gestartet. 07:25 ist nur Vorbereitung.
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
      s.freeTierBudget={...s.freeTierBudget,activeWindowLocal:'07:25 Vorbereitung · 07:30-23:00 Handel',sleepOutsideGettexHours:true,newsAtNight:false,maxScheduledMarketScansPerTradingDay:930,preopenPrepareOncePerTradingDay:true,note:'Cloudflare-Free-Schlafmodus: nachts, am Wochenende und an gettex-Handelsfeiertagen keine Markt-/News-Scans. 07:25 einmal Overnight-Vorbereitung, 07:30-23:00 Top-25-Minutenbetrieb.'};
    }
    return s;
  }
}
