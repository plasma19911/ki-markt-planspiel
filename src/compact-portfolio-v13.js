import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v12.js';

// V13: vierter Kandidaten-Pool fuer fruehe Beschleuniger / beginnende Breakouts.
// Discovery ist KEIN Kaufsignal. Die Werte muessen danach dieselben Live-, Safety-,
// Anti-Chase-, News-, Liquiditaets- und Profit-Optimizer-Pruefungen bestehen.

const BREAKOUT_STATE_KEY='state/early-breakout-watch-v1';
const BREAKOUT_TARGET=12;
const BREAKOUT_TTL_MS=10*60*1000;
const BREAKOUT_REFRESH_MS=5*60*1000;
const MIN_MARKET_CAP=150_000_000;
const SOURCE_LIMIT=40;
const HEADERS={'accept':'text/html,application/xhtml+xml','user-agent':'Mozilla/5.0 (compatible; KI-Markt-Planspiel/EarlyBreakoutRadar)'};

const SOURCES=[
  {name:'TradingView DE Top Gainers',kind:'tv-de',market:'DE',url:'https://www.tradingview.com/markets/stocks-germany/market-movers-gainers/'},
  {name:'Yahoo Day Gainers',kind:'yahoo',market:'GLOBAL',url:'https://finance.yahoo.com/research-hub/screener/day_gainers/'}
];

const arr=v=>Array.isArray(v)?v:[];
const key=v=>String(v||'').toUpperCase().trim();
const baseSymbol=v=>key(v).split('.')[0];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const fresh=(ts,ttl=BREAKOUT_TTL_MS)=>{const t=Date.parse(String(ts||''));return Number.isFinite(t)&&Date.now()-t>=0&&Date.now()-t<ttl};
const clean=(v,n=120)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n);

function extractYahooSymbols(html){
  const out=[],seen=new Set();
  for(const m of String(html||'').matchAll(/\/quote\/([^/?#"'<>]+)/gi)){
    const s=decodeURIComponent(String(m[1]||'')).replace(/&amp;/g,'&').toUpperCase();
    if(!/^[A-Z0-9.\-]{1,18}$/.test(s)||s.includes('=')||s.startsWith('^')||seen.has(s))continue;
    seen.add(s);out.push(s);if(out.length>=SOURCE_LIMIT)break;
  }
  return out;
}
function extractTvSymbols(html){
  const out=[],seen=new Set(),text=String(html||'');
  const add=s=>{s=key(s).replace(/[^A-Z0-9.\-]/g,'');if(!s||seen.has(s))return;seen.add(s);out.push(s)};
  for(const m of text.matchAll(/\/symbols\/(?:XETR|FWB|TRADEGATE|GETTEX|SWB|BER|HAM|DUS|MUN)-([A-Z0-9.\-]+)/gi)){add(m[1]);if(out.length>=SOURCE_LIMIT)break}
  if(out.length<SOURCE_LIMIT)for(const m of text.matchAll(/"symbol"\s*:\s*"(?:XETR|FWB|TRADEGATE|GETTEX|SWB|BER|HAM|DUS|MUN):([A-Z0-9.\-]+)"/gi)){add(m[1]);if(out.length>=SOURCE_LIMIT)break}
  return out;
}
function masterIndex(rows){
  const exact=new Map(),byBase=new Map();
  for(const row of rows){const s=key(row?.symbol);if(!s)continue;exact.set(s,row);const b=baseSymbol(s),a=byBase.get(b)||[];a.push(row);byBase.set(b,a)}
  const pref=row=>{const s=key(row?.symbol);if(s.endsWith('.DE'))return 0;if(s.endsWith('.F'))return 1;if(s.endsWith('.SG'))return 2;if(!s.includes('.'))return 3;return 4};
  for(const a of byBase.values())a.sort((x,y)=>pref(x)-pref(y)||num(y?.marketCapUSD||y?.marketCap)-num(x?.marketCapUSD||x?.marketCap));
  return{exact,byBase};
}
function resolve(entry,index){
  const s=key(entry?.symbol);if(!s)return null;
  if(String(entry?.market||'').toUpperCase()==='DE')return(index.byBase.get(baseSymbol(s))||[]).find(x=>/\.(DE|F|SG|MU|HM)$/.test(key(x?.symbol)))||index.exact.get(s)||(index.byBase.get(baseSymbol(s))||[])[0]||null;
  return index.exact.get(s)||(index.byBase.get(baseSymbol(s))||[])[0]||null;
}
function liquidEnough(row){const cap=num(row?.marketCapUSD||row?.marketCap);return cap<=0||cap>=MIN_MARKET_CAP}
function normalizeEntries(input){
  const out=[],seen=new Set();
  for(const x of arr(input).slice(0,140)){
    const symbol=key(typeof x==='string'?x:x?.symbol);if(!symbol||symbol.length>24)continue;
    const market=clean(typeof x==='string'?'GLOBAL':x?.market||'GLOBAL',16).toUpperCase();
    const source=clean(typeof x==='string'?'PC-Agent Early Breakout':x?.source||'PC-Agent Early Breakout',80);
    const rank=Math.max(1,Math.round(num(typeof x==='string'?out.length+1:x?.rank,out.length+1)));
    const k=`${market}:${symbol}:${source}`;if(seen.has(k))continue;seen.add(k);
    out.push({symbol,market,source,rank});
  }
  return out;
}
function buildWatch(entries,rows,mode='PC_AGENT'){
  const index=masterIndex(rows),scores=new Map(),sourceStats=new Map();
  for(const e of entries){
    const stat=sourceStats.get(e.source)||{name:e.source,found:0,matched:0};stat.found++;
    const row=resolve(e,index);if(!row||!liquidEnough(row)){sourceStats.set(e.source,stat);continue}
    stat.matched++;sourceStats.set(e.source,stat);
    const s=key(row.symbol),old=scores.get(s)||{row,score:0,bestRank:999,sources:new Set(),market:e.market};
    old.score+=Math.max(.15,6-(e.rank-1)*.14);old.bestRank=Math.min(old.bestRank,e.rank);old.sources.add(e.source);if(e.market==='DE')old.market='DE';scores.set(s,old);
  }
  const ranked=[...scores.values()].sort((a,b)=>b.sources.size-a.sources.size||b.score-a.score||a.bestRank-b.bestRank);
  const picked=[],used=new Set();
  const take=(list,n)=>{for(const x of list){const s=key(x.row.symbol);if(used.has(s))continue;used.add(s);picked.push(x);if(--n<=0)break}};
  take(ranked.filter(x=>x.market==='DE'),7);take(ranked.filter(x=>x.market!=='DE'),5);if(picked.length<BREAKOUT_TARGET)take(ranked,BREAKOUT_TARGET-picked.length);
  const candidates=picked.slice(0,BREAKOUT_TARGET).map((x,i)=>({
    symbol:key(x.row.symbol),name:clean(x.row.name||x.row.symbol,120),rank:i+1,sourceRank:x.bestRank,
    source:[...x.sources].join(' + '),sourceCount:x.sources.size,market:x.market,
    watchReason:'Early-Breakout-Discovery – Tagesstaerke nur als Fundstelle; BUY erst bei frischer Beschleunigung und Live-Bestaetigung'
  }));
  return{version:1,updatedAt:new Date().toISOString(),candidateCount:candidates.length,target:BREAKOUT_TARGET,mode,candidates,sourceStats:[...sourceStats.values()],confirmationRequired:true,antiChaseRequired:true,notice:'Top-Gainer-Rank ist nur Discovery. Keine Aktie wird allein wegen Tagesplus gekauft; 1m/5m/20m-Momentum, Beschleunigung, Volumen, RSI, News/Event-Risiko und Anti-Chase muessen bestaetigen.'};
}

export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);
    this.ctx=ctx;this.env=env;
    const assets=this.zeroAssets;
    if(assets?.fetch&&!assets.__earlyBreakoutUniverseOverlay){
      assets.__earlyBreakoutUniverseOverlay=true;
      const baseFetch=assets.fetch.bind(assets);
      assets.fetch=async(request,init)=>{
        const r=await baseFetch(request,init);let u;try{u=new URL(typeof request==='string'?request:request.url)}catch{return r}
        if(!u.pathname.endsWith('/universe.json')||!r.ok)return r;
        let data;try{data=await r.json()}catch{return r}
        let raw=null;try{raw=await assets._load?.()}catch{}
        const rows=arr(raw?.equities).filter(x=>x?.symbol),index=masterIndex(rows);
        let watch=this._readEarlyBreakoutWatch();
        if(!watch||!fresh(watch.updatedAt))watch=await this._refreshEarlyBreakoutFallback(rows);
        const seen=new Set(arr(data?.equities).map(x=>key(x?.symbol))),extras=[];
        for(const c of arr(watch?.candidates)){
          if(extras.length>=BREAKOUT_TARGET)break;
          const row=resolve({symbol:c.symbol,market:c.market},index),s=key(row?.symbol);if(!row||!s||seen.has(s))continue;
          seen.add(s);extras.push({...row,earlyBreakoutWatch:true,earlyBreakoutRank:num(c.rank),earlyBreakoutSource:c.source||watch?.mode||'Early Breakout Radar'});
        }
        return Response.json({...data,equities:[...arr(data?.equities),...extras],early_breakout_watch_count:num(watch?.candidateCount),early_breakout_scan_count:extras.length,early_breakout_scan_target:BREAKOUT_TARGET,scanner_slice_equity_count:arr(data?.equities).length+extras.length,scanner_mode:`${data?.scanner_mode||'LEADERS'}+EARLY_BREAKOUT`},{headers:{'cache-control':'no-store'}});
      };
      if(this.engine?.env)this.engine.env.ASSETS=assets;
    }
  }

  _readEarlyBreakoutWatch(){
    const s=this.bucketAdapter?.peekState?.()?.earlyBreakoutWatch;if(s)return s;
    try{return this.ctx?.storage?.kv?.get(BREAKOUT_STATE_KEY)||null}catch{return null}
  }
  async _storeEarlyBreakoutWatch(watch){
    try{this.ctx?.storage?.kv?.put(BREAKOUT_STATE_KEY,watch)}catch{}
    if(this.engine?.store?.update)try{await this.engine.store.update(s=>{s.earlyBreakoutWatch=watch;return true})}catch{}
    return watch;
  }
  async _refreshEarlyBreakoutFallback(rows){
    const current=this._readEarlyBreakoutWatch();if(current&&fresh(current.updatedAt,BREAKOUT_REFRESH_MS))return current;
    const entries=[],stats=[];
    const results=await Promise.all(SOURCES.map(async src=>{
      try{
        const r=await fetch(src.url,{headers:HEADERS,redirect:'follow'});if(!r.ok)throw new Error(`HTTP ${r.status}`);
        const html=await r.text(),symbols=src.kind==='tv-de'?extractTvSymbols(html):extractYahooSymbols(html);
        return{src,symbols,error:null};
      }catch(e){return{src,symbols:[],error:String(e?.message||e).slice(0,120)}}
    }));
    for(const x of results){stats.push({name:x.src.name,found:x.symbols.length,error:x.error});x.symbols.forEach((symbol,i)=>entries.push({symbol,market:x.src.market,source:x.src.name,rank:i+1}))}
    const watch=buildWatch(entries,rows,'CLOUDFLARE_FALLBACK');
    watch.sourceStats=stats.map(s=>({...s,matched:watch.sourceStats.find(x=>x.name===s.name)?.matched||0}));
    return this._storeEarlyBreakoutWatch(watch);
  }

  async agentPrefetch(payload={}){
    const result=await super.agentPrefetch(payload);
    const entries=normalizeEntries(payload?.breakoutEntries);
    if(entries.length){
      let raw=null;try{raw=await this.zeroAssets?._load?.()}catch{}
      const rows=arr(raw?.equities).filter(x=>x?.symbol),watch=buildWatch(entries,rows,'WINDOWS_PC_AGENT');
      await this._storeEarlyBreakoutWatch(watch);
      result.prefetch={...(result.prefetch||{}),earlyBreakoutCandidates:watch.candidateCount};
    }
    return result;
  }

  async status(){
    const s=await super.status(),watch=this._readEarlyBreakoutWatch();
    s.earlyBreakoutScan={enabled:true,target:BREAKOUT_TARGET,candidateCount:num(watch?.candidateCount),updatedAt:watch?.updatedAt||null,source:watch?.mode||'PENDING',sourceStats:arr(watch?.sourceStats),confirmationRequired:true,antiChaseRequired:true,mode:'bis zu 12 fruehe Tagesstaerke-/Beschleunigungswerte separat entdecken; BUY erst nach 1m/5m/20m-Live-Bestaetigung'};
    if(s.pcAgent)s.pcAgent={...s.pcAgent,earlyBreakoutCandidates:num(watch?.candidateCount),earlyBreakoutSource:watch?.mode||null};
    if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,earlyBreakoutDiscovery:true,earlyBreakoutTarget:BREAKOUT_TARGET,earlyBreakoutNeverForcesBuy:true};
    if(s.freeTierBudget)s.freeTierBudget={...s.freeTierBudget,earlyBreakoutPoolTarget:BREAKOUT_TARGET,earlyBreakoutPoolCandidates:num(watch?.candidateCount),note:`${s.freeTierBudget.note||''} Vierter Pool: bis zu ${BREAKOUT_TARGET} aufkommende Gewinner/Breakout-Kandidaten werden zusaetzlich entdeckt. Tagesplus allein ist kein BUY; der Live-Scanner muss frische Beschleunigung ohne Ueberhitzung bestaetigen.`};
    return s;
  }
}
