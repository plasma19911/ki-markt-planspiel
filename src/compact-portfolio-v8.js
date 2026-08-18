import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v7.js';

const FREE_SCAN_INTERVAL_MS=5*60*1000;
const STATUS_CACHE_MS=45*1000;
const UNIVERSE_CACHE_MS=10*60*1000;
const CORE_EQUITIES=80;
const ROTATING_EQUITIES=160;

const clone=x=>structuredClone(x);
const isPenceListing=x=>{const c=String(x?.currency||'').trim();return c==='GBp'||c.toUpperCase()==='GBX'};
function localMinute(tz,date=new Date()){try{const p=new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date),o={};for(const x of p)o[x.type]=x.value;return Number(o.hour)*60+Number(o.minute)}catch{return-1}}
function inVerifiedMiddayPause(symbol,date=new Date()){const s=String(symbol||'').toUpperCase();let tz=null,lo=-1,hi=-1;if(/\.T$/.test(s)){tz='Asia/Tokyo';lo=11*60+30;hi=12*60+30}else if(/\.(SS|SZ)$/.test(s)){tz='Asia/Shanghai';lo=11*60+30;hi=13*60}else if(/\.HK$/.test(s)){tz='Asia/Hong_Kong';lo=12*60;hi=13*60}else return false;const m=localMinute(tz,date);return m>=lo&&m<hi}
function rotate(pool,count,slot){if(!pool.length||count<=0)return[];const n=Math.min(count,pool.length),start=(slot*n)%pool.length,out=[];for(let i=0;i<n;i++)out.push(pool[(start+i)%pool.length]);return out}

class FreeTierUniverseAssets{
  constructor(base){this.base=base;this.cache=null;this.cacheAt=0}
  async _load(request=null,init=undefined){
    if(this.cache&&Date.now()-this.cacheAt<UNIVERSE_CACHE_MS)return this.cache;
    const req=request||new Request('https://assets.local/universe.json'),r=await this.base.fetch(req,init);
    if(!r.ok)throw new Error(`FREE-Universum HTTP ${r.status}`);
    const data=await r.json();this.cache=data&&typeof data==='object'?data:{equities:[]};this.cacheAt=Date.now();return this.cache;
  }
  async fetch(request,init){
    let u;try{u=new URL(typeof request==='string'?request:request.url)}catch{return this.base.fetch(request,init)}
    if(!u.pathname.endsWith('/universe.json'))return this.base.fetch(request,init);
    const data=await this._load(request,init),rawAll=Array.isArray(data?.equities)?data.equities.filter(x=>x?.symbol):[],supported=rawAll.filter(x=>!isPenceListing(x)),penceExcluded=rawAll.length-supported.length,all=supported.filter(x=>!inVerifiedMiddayPause(x.symbol)),paused=supported.length-all.length;
    if(all.length<=CORE_EQUITIES+ROTATING_EQUITIES)return Response.json({...data,equities:all,full_liquid_equity_count:rawAll.length,scanner_slice_equity_count:all.length,midday_pause_excluded:paused,pence_listings_excluded:penceExcluded,scanner_mode:'FREE_5M_BROAD_ROTATION'},{headers:{'cache-control':'no-store'}});
    const core=all.slice(0,CORE_EQUITIES),pool=all.slice(CORE_EQUITIES),slot=Math.floor(Date.now()/FREE_SCAN_INTERVAL_MS),rotating=rotate(pool,ROTATING_EQUITIES,slot),seen=new Set(),equities=[];
    for(const x of [...core,...rotating]){const k=String(x.symbol).toUpperCase();if(!seen.has(k)){seen.add(k);equities.push(x)}}
    return Response.json({...data,equities,full_liquid_equity_count:rawAll.length,scanner_slice_equity_count:equities.length,scanner_core_equities:Math.min(CORE_EQUITIES,all.length),scanner_rotating_equities:Math.min(ROTATING_EQUITIES,Math.max(0,all.length-CORE_EQUITIES)),scanner_rotation_slot:slot,scan_interval_minutes:5,midday_pause_excluded:paused,pence_listings_excluded:penceExcluded,scanner_mode:'FREE_5M_BROAD_ROTATION'},{headers:{'cache-control':'no-store'}});
  }
  async info(){
    try{
      const data=await this._load(),rows=Array.isArray(data?.equities)?data.equities:[],supported=rows.filter(x=>!isPenceListing(x)),n=rows.length,pool=Math.max(0,supported.length-CORE_EQUITIES),paused=supported.filter(x=>inVerifiedMiddayPause(x.symbol)).length,rotationScans=pool?Math.ceil(pool/ROTATING_EQUITIES):1;
      return{fullLiquidEquityUniverse:n,coreEquitiesEveryMinute:Math.min(supported.length,CORE_EQUITIES),rotatingEquitiesPerMinute:Math.min(pool,ROTATING_EQUITIES),coreEquitiesPerScan:Math.min(supported.length,CORE_EQUITIES),rotatingEquitiesPerScan:Math.min(pool,ROTATING_EQUITIES),scanIntervalMinutes:5,estimatedFullRotationMinutes:rotationScans*5,estimatedFullRotationScans:rotationScans,universeGeneratedAt:data?.generated_at||null,exactBrokerCatalog:Boolean(data?.exact_broker_catalog),middayPauseExcludedNow:paused,penceListingsExcluded:rows.length-supported.length,scannerMode:'FREE_5M_BROAD_ROTATION'};
    }catch{return null}
  }
}

export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);
    // V5 hat bereits einen Universe-Wrapper installiert. Fuer das Free-Profil gehen wir
    // wieder an dessen rohe Asset-Bindung und rotieren exakt pro 5-Minuten-Slot.
    const rawAssets=this.zeroAssets?.base;
    if(rawAssets?.fetch){this.zeroAssets=new FreeTierUniverseAssets(rawAssets);this.engine.env.ASSETS=this.zeroAssets}
    this.__freeStatusCache=null;
    this.__freeStatusCacheAt=0;
  }

  async scan(){
    // Cloudflare-Free-Schutz: maximal ein kompletter Markt-/News-Scan je 5 Minuten.
    // Das gilt auch fuer manuelle /api/scan-Aufrufe und verhindert, dass mehrere
    // Browser-Tabs oder versehentliche Klicks das Tagesbudget vervielfachen.
    const loaded=await this.engine?.store?.load?.(false);
    const last=Date.parse(loaded?.state?.config?.last_scan||'');
    const now=Date.now();
    if(Number.isFinite(last)&&now-last<FREE_SCAN_INTERVAL_MS-5000){
      return{ok:true,skipped:'free-tier-5m-cooldown',scanIntervalMinutes:5,nextScanAt:new Date(last+FREE_SCAN_INTERVAL_MS).toISOString()};
    }
    const result=await super.scan();
    this.__freeStatusCache=null;
    this.__freeStatusCacheAt=0;
    return result;
  }

  async status(){
    const now=Date.now();
    if(this.__freeStatusCache&&now-this.__freeStatusCacheAt<STATUS_CACHE_MS)return clone(this.__freeStatusCache);
    const s=await super.status();
    const last=Date.parse(s?.config?.last_scan||''),next=Number.isFinite(last)?last+FREE_SCAN_INTERVAL_MS:null,coverage=s?.brokerTarget||{};
    s.freeTierBudget={enabled:true,cloudflarePlan:'FREE',scanIntervalMinutes:5,maxScheduledScansPerDay:288,browserStatusRefreshSeconds:60,extraScansWithinIntervalBlocked:true,nextScanAt:next?new Date(next).toISOString():null,fullUniverseRotationMinutes:Number(coverage.estimatedFullRotationMinutes||0)||null,note:'24h-Free-Profil: Markt/News maximal alle 5 Minuten; 80 Kernaktien + 160 rotierende Aktien je Scan; UI-Status separat sparsam.'};
    this.__freeStatusCache=clone(s);
    this.__freeStatusCacheAt=now;
    return s;
  }
}
