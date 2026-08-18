import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v7.js';

const FREE_SCAN_INTERVAL_MS=60*1000;
const STATUS_CACHE_MS=55*1000;
const UNIVERSE_CACHE_MS=10*60*1000;
const LEADER_CACHE_MS=5*60*1000;
const LEADER_TARGET=25;
const MIN_EXTERNAL_LEADERS=10;
const SOURCE_LIMIT=35;
// Cloudflare Free erlaubt 50 externe Subrequests je Worker-Aufruf. Wir stoppen reale
// fetch()-Aufrufe bewusst frueher, damit Redirects und spaetere optionale Layer Reserve haben.
const EXTERNAL_FETCH_SOFT_CAP=38;
const HEADERS={'accept':'text/html,application/xhtml+xml','user-agent':'Mozilla/5.0 (compatible; KI-Markt-Planspiel/8.1; +https://github.com/plasma19911/ki-markt-planspiel)'};

const LEADER_SOURCES=[
  {name:'TradingView DE Most Active',kind:'tv-de',weight:5.0,url:'https://www.tradingview.com/markets/stocks-germany/market-movers-active/'},
  {name:'TradingView DE Unusual Volume',kind:'tv-de',weight:4.5,url:'https://www.tradingview.com/markets/stocks-germany/market-movers-unusual-volume/'},
  {name:'Yahoo Most Active',kind:'yahoo',weight:5.0,url:'https://finance.yahoo.com/research-hub/screener/most_actives/'},
  {name:'Yahoo Trending',kind:'yahoo',weight:4.4,url:'https://finance.yahoo.com/research-hub/screener/trending/'}
];

const clone=x=>structuredClone(x);
const key=x=>String(x||'').toUpperCase().trim();
const baseSymbol=s=>key(s).split('.')[0];
const isPenceListing=x=>{const c=String(x?.currency||'').trim();return c==='GBp'||c.toUpperCase()==='GBX'};
const liquidEnough=x=>Number(x?.marketCapUSD||x?.marketCap||0)<=0||Number(x?.marketCapUSD||x?.marketCap||0)>=150_000_000;

function extractYahooSymbols(html){
  const out=[],seen=new Set();
  const add=s=>{s=decodeURIComponent(String(s||'')).replace(/&amp;/g,'&').toUpperCase();if(!/^[A-Z0-9^.=\-]{1,18}$/.test(s)||s.includes('=')||s.startsWith('^')||seen.has(s))return;seen.add(s);out.push(s)};
  for(const m of String(html||'').matchAll(/\/quote\/([^/?#"'<>]+)/gi)){add(m[1]);if(out.length>=SOURCE_LIMIT)break}
  return out;
}

function extractTradingViewSymbols(html){
  const out=[],seen=new Set();
  const add=s=>{s=key(s).replace(/[^A-Z0-9.\-]/g,'');if(!s||seen.has(s))return;seen.add(s);out.push(s)};
  const text=String(html||'');
  for(const m of text.matchAll(/\/symbols\/(?:XETR|FWB|TRADEGATE|GETTEX|SWB|BER|HAM|DUS|MUN)-([A-Z0-9.\-]+)/gi)){add(m[1]);if(out.length>=SOURCE_LIMIT)break}
  if(out.length<SOURCE_LIMIT){for(const m of text.matchAll(/"symbol"\s*:\s*"(?:XETR|FWB|TRADEGATE|GETTEX|SWB|BER|HAM|DUS|MUN):([A-Z0-9.\-]+)"/gi)){add(m[1]);if(out.length>=SOURCE_LIMIT)break}}
  return out;
}

function symbolIndex(rows){
  const exact=new Map(),byBase=new Map();
  for(const x of rows){const s=key(x?.symbol);if(!s)continue;exact.set(s,x);const b=baseSymbol(s),a=byBase.get(b)||[];a.push(x);byBase.set(b,a)}
  const pref=x=>{const s=key(x?.symbol);if(s.endsWith('.DE'))return 0;if(s.endsWith('.F'))return 1;if(s.endsWith('.SG'))return 2;if(!s.includes('.'))return 3;return 4};
  for(const a of byBase.values())a.sort((x,y)=>pref(x)-pref(y)||Number(y?.marketCapUSD||y?.marketCap||0)-Number(x?.marketCapUSD||x?.marketCap||0));
  return{exact,byBase};
}

function resolveLeaderSymbol(raw,kind,index){
  const s=key(raw);if(!s)return null;
  if(kind==='yahoo'&&index.exact.has(s))return index.exact.get(s);
  const candidates=index.byBase.get(baseSymbol(s))||[];
  if(kind==='tv-de')return candidates.find(x=>/\.(DE|F|SG|MU|HM)$/.test(key(x.symbol)))||candidates[0]||null;
  return index.exact.get(s)||candidates[0]||null;
}

class FreeTierUniverseAssets{
  constructor(base,heldGetter){this.base=base;this.heldGetter=heldGetter;this.cache=null;this.cacheAt=0;this.leaderCache=null;this.leaderCacheAt=0;this.lastLeaderMeta=null}
  async _load(request=null,init=undefined){
    if(this.cache&&Date.now()-this.cacheAt<UNIVERSE_CACHE_MS)return this.cache;
    const req=request||new Request('https://assets.local/universe.json'),r=await this.base.fetch(req,init);
    if(!r.ok)throw new Error(`FREE-Universum HTTP ${r.status}`);
    const data=await r.json();this.cache=data&&typeof data==='object'?data:{equities:[]};this.cacheAt=Date.now();return this.cache;
  }
  async _externalLeaders(rows){
    if(this.leaderCache&&Date.now()-this.leaderCacheAt<LEADER_CACHE_MS)return this.leaderCache;
    const index=symbolIndex(rows),scores=new Map(),sourceStats=[];
    const results=await Promise.all(LEADER_SOURCES.map(async src=>{
      try{const r=await fetch(src.url,{headers:HEADERS,redirect:'follow'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const html=await r.text(),symbols=src.kind==='tv-de'?extractTradingViewSymbols(html):extractYahooSymbols(html);return{src,symbols,error:null}}
      catch(e){return{src,symbols:[],error:String(e?.message||e).slice(0,100)}}
    }));
    for(const {src,symbols,error} of results){
      let matched=0;
      for(let i=0;i<symbols.length;i++){
        const row=resolveLeaderSymbol(symbols[i],src.kind,index);if(!row||!liquidEnough(row)||isPenceListing(row))continue;
        const s=key(row.symbol),old=scores.get(s)||{row,score:0,sources:new Set(),bestRank:999};
        const rankWeight=Math.max(.15,1-i/Math.max(20,symbols.length));old.score+=src.weight*rankWeight;old.sources.add(src.name);old.bestRank=Math.min(old.bestRank,i+1);scores.set(s,old);matched++;
      }
      sourceStats.push({name:src.name,found:symbols.length,matched,error});
    }
    let ranked=[...scores.values()].map(x=>({...x,sourceCount:x.sources.size,sources:[...x.sources]})).sort((a,b)=>b.sourceCount-a.sourceCount||b.score-a.score||a.bestRank-b.bestRank);
    const externalCount=ranked.length;
    if(ranked.length<LEADER_TARGET){
      const used=new Set(ranked.map(x=>key(x.row.symbol))),fallback=[...rows].filter(x=>!isPenceListing(x)&&liquidEnough(x)&&!used.has(key(x.symbol))).sort((a,b)=>Number(b?.marketCapUSD||b?.marketCap||0)-Number(a?.marketCapUSD||a?.marketCap||0));
      for(const row of fallback){ranked.push({row,score:0,sourceCount:0,sources:['MASTER-FALLBACK'],bestRank:999});if(ranked.length>=LEADER_TARGET)break}
    }
    const leaders=ranked.slice(0,LEADER_TARGET).map((x,i)=>({...x.row,externalLeaderRank:i+1,externalLeaderScore:+x.score.toFixed(3),externalLeaderSources:x.sources}));
    this.lastLeaderMeta={updatedAt:new Date().toISOString(),target:LEADER_TARGET,externalResolved:externalCount,externalHealthy:externalCount>=MIN_EXTERNAL_LEADERS,sourceStats,selected:leaders.length,mode:externalCount>=MIN_EXTERNAL_LEADERS?'EXTERNAL_TOP_25':'EXTERNAL_PLUS_MASTER_FALLBACK'};
    this.leaderCache=leaders;this.leaderCacheAt=Date.now();return leaders;
  }
  _heldRows(rows){try{const state=this.heldGetter?.(),held=new Set((state?.positions||[]).map(p=>key(p?.symbol)));return rows.filter(x=>held.has(key(x.symbol)))}catch{return[]}}
  async fetch(request,init){
    let u;try{u=new URL(typeof request==='string'?request:request.url)}catch{return this.base.fetch(request,init)}
    if(!u.pathname.endsWith('/universe.json'))return this.base.fetch(request,init);
    const data=await this._load(request,init),rawAll=Array.isArray(data?.equities)?data.equities.filter(x=>x?.symbol):[],supported=rawAll.filter(x=>!isPenceListing(x)),leaders=await this._externalLeaders(supported),held=this._heldRows(supported),seen=new Set(),equities=[];
    for(const x of [...leaders,...held]){const s=key(x.symbol);if(s&&!seen.has(s)){seen.add(s);equities.push(x)}}
    return Response.json({...data,equities,full_liquid_equity_count:rawAll.length,scanner_slice_equity_count:equities.length,external_leader_target:LEADER_TARGET,external_leader_count:leaders.length,held_symbols_added:Math.max(0,equities.length-leaders.length),scan_interval_minutes:1,leader_refresh_minutes:5,scanner_mode:this.lastLeaderMeta?.mode||'EXTERNAL_TOP_25'},{headers:{'cache-control':'no-store'}});
  }
  async info(){
    try{const data=await this._load(),rows=Array.isArray(data?.equities)?data.equities:[],supported=rows.filter(x=>!isPenceListing(x));if(!this.lastLeaderMeta)await this._externalLeaders(supported);return{fullLiquidEquityUniverse:rows.length,externalLeaderTarget:LEADER_TARGET,externalLeaderSelected:this.lastLeaderMeta?.selected||0,externalLeaderResolved:this.lastLeaderMeta?.externalResolved||0,externalLeaderHealthy:Boolean(this.lastLeaderMeta?.externalHealthy),externalLeaderSources:this.lastLeaderMeta?.sourceStats||[],externalLeaderUpdatedAt:this.lastLeaderMeta?.updatedAt||null,scanIntervalMinutes:1,leaderRefreshMinutes:5,universeGeneratedAt:data?.generated_at||null,exactBrokerCatalog:Boolean(data?.exact_broker_catalog),penceListingsExcluded:rows.length-supported.length,scannerMode:this.lastLeaderMeta?.mode||'EXTERNAL_TOP_25'}
    }catch{return null}
  }
}

async function runWithFetchBudget(fn){
  const nativeFetch=globalThis.fetch,cache=new Map(),stats={actual:0,cacheHits:0,blocked:0,cap:EXTERNAL_FETCH_SOFT_CAP};
  globalThis.fetch=async(input,init)=>{
    const method=String(init?.method||input?.method||'GET').toUpperCase();let url='';try{url=typeof input==='string'||input instanceof URL?String(input):String(input?.url||'')}catch{}
    const cacheable=method==='GET'&&url;
    if(cacheable&&cache.has(url)){stats.cacheHits++;const r=await cache.get(url);return r.clone()}
    if(stats.actual>=EXTERNAL_FETCH_SOFT_CAP){stats.blocked++;return new Response(JSON.stringify({error:'free-tier-subrequest-soft-cap'}),{status:429,headers:{'content-type':'application/json'}})}
    stats.actual++;
    const p=Promise.resolve(nativeFetch(input,init)).then(r=>r.clone());if(cacheable)cache.set(url,p);
    const r=await p;return r.clone();
  };
  try{return{value:await fn(),stats}}finally{globalThis.fetch=nativeFetch}
}

export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);
    const rawAssets=this.zeroAssets?.base;
    if(rawAssets?.fetch){this.zeroAssets=new FreeTierUniverseAssets(rawAssets,()=>this.bucketAdapter?.peekState?.());this.engine.env.ASSETS=this.zeroAssets}
    this.__freeStatusCache=null;this.__freeStatusCacheAt=0;this.__lastFetchBudget=null;
  }

  async scan(){
    const loaded=await this.engine?.store?.load?.(false),last=Date.parse(loaded?.state?.config?.last_scan||''),now=Date.now();
    if(Number.isFinite(last)&&now-last<FREE_SCAN_INTERVAL_MS-5000)return{ok:true,skipped:'free-tier-1m-cooldown',scanIntervalMinutes:1,nextScanAt:new Date(last+FREE_SCAN_INTERVAL_MS).toISOString()};
    const run=await runWithFetchBudget(()=>super.scan());this.__lastFetchBudget=run.stats;this.__freeStatusCache=null;this.__freeStatusCacheAt=0;return{...run.value,freeFetchBudget:run.stats};
  }

  async status(){
    const now=Date.now();if(this.__freeStatusCache&&now-this.__freeStatusCacheAt<STATUS_CACHE_MS)return clone(this.__freeStatusCache);
    const s=await super.status(),last=Date.parse(s?.config?.last_scan||''),next=Number.isFinite(last)?last+FREE_SCAN_INTERVAL_MS:null,coverage=s?.brokerTarget||{};
    s.freeTierBudget={enabled:true,cloudflarePlan:'FREE',scanIntervalMinutes:1,maxScheduledScansPerDay:1440,browserStatusRefreshSeconds:60,extraScansWithinIntervalBlocked:true,nextScanAt:next?new Date(next).toISOString():null,externalTopPoolSize:Number(coverage.externalLeaderSelected||0)||LEADER_TARGET,externalTopPoolHealthy:Boolean(coverage.externalLeaderHealthy),externalLeaderRefreshMinutes:5,externalFetchSoftCap:EXTERNAL_FETCH_SOFT_CAP,lastFetchBudget:this.__lastFetchBudget,note:'24h-Free-Profil: Top 25 jede Minute billig neu bewerten; externe Leaderlisten alle 5 Minuten; teure Deep-Checks nur fuer Finalisten; gehaltene Aktien bleiben zusaetzlich im Monitoring.'};
    this.__freeStatusCache=clone(s);this.__freeStatusCacheAt=now;return s;
  }
}
