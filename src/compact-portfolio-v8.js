import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v7.js';

const FREE_SCAN_INTERVAL_MS=5*60*1000;
const STATUS_CACHE_MS=45*1000;

const clone=x=>structuredClone(x);

export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);
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
      return{
        ok:true,
        skipped:'free-tier-5m-cooldown',
        scanIntervalMinutes:5,
        nextScanAt:new Date(last+FREE_SCAN_INTERVAL_MS).toISOString()
      };
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
    const last=Date.parse(s?.config?.last_scan||'');
    const next=Number.isFinite(last)?last+FREE_SCAN_INTERVAL_MS:null;
    s.freeTierBudget={
      enabled:true,
      cloudflarePlan:'FREE',
      scanIntervalMinutes:5,
      maxScheduledScansPerDay:288,
      browserStatusRefreshSeconds:60,
      extraScansWithinIntervalBlocked:true,
      nextScanAt:next?new Date(next).toISOString():null,
      note:'24h-Free-Profil: Markt/News maximal alle 5 Minuten; UI-Status wird separat sparsam aktualisiert.'
    };
    this.__freeStatusCache=clone(s);
    this.__freeStatusCacheAt=now;
    return s;
  }
}
