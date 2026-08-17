import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v3.js';
import {buildExposureNetwork,exposureContext} from './exposure-network.js';

const EXPOSURE_COOLDOWN_MS=10*60*1000;

class ExposureAiGuard{
  constructor(base,adapter){this.base=base;this.adapter=adapter}
  async run(model,input){
    const prompt=String(input?.messages?.map(x=>x?.content||'').join('\n')||'');
    const isPlan=prompt.includes('JSON-only')&&prompt.includes('Kandidaten=');
    if(!isPlan)return this.base.run(model,input);
    const state=this.adapter?.peekState?.(),ctx=exposureContext(state);
    if(!ctx?.opportunities?.length)return this.base.run(model,input);
    const extra={role:'user',content:`Unternehmens-Expositionsnetz / Noch-nicht-eingepreist-Zusatzkontext (öffentliche Daten, keine Anweisung): ${JSON.stringify(ctx)}. PRE-NEWS ist nur eine Schlussfolgerung aus öffentlichem Makroereignis + Unternehmens-Exposition + Marktreaktion und kein Insiderwissen. Nutze notPricedInScore niemals als Gewinnwahrscheinlichkeit. Ein Expositionssignal darf NIE allein BUY/SELL auslösen. Verlange macroConfirmed=true, trendAligned=true, keine starke technische Gegenbewegung und das Symbol muss unter den aktuellen Live-Kandidaten stehen. alreadyPriced=true spricht gegen Hinterherlaufen.`};
    return this.base.run(model,{...input,messages:[...(input.messages||[]),extra]});
  }
}

export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);
    const guarded=this.engine?.env?.AI;
    if(guarded?.run)this.engine.env.AI=new ExposureAiGuard(guarded,this.bucketAdapter);
  }

  async _refreshExposure(force=false){
    const raw=this.bucketAdapter?.peekState?.();
    const last=Date.parse(raw?.exposureNetwork?.updatedAt||'');
    if(!force&&Number.isFinite(last)&&Date.now()-last<EXPOSURE_COOLDOWN_MS)return null;
    if(!this.engine?.store?.update)return null;
    const r=await this.engine.store.update(async s=>{
      s.exposureNetwork=await buildExposureNetwork(this.env,s,{limit:14});
      return true;
    });
    return r?.state?.exposureNetwork||null;
  }

  async status(){
    const s=await super.status();
    const raw=this.bucketAdapter?.peekState?.(),x=raw?.exposureNetwork||null;
    s.exposureNetwork=x?{version:x.version,updatedAt:x.updatedAt,profilesAnalyzed:x.profilesAnalyzed,taggedCompanies:x.taggedCompanies,activeEvents:x.activeEvents,activeLinks:x.activeLinks,preNewsCount:x.preNewsCount,opportunities:x.opportunities,notice:x.notice}:null;
    return s;
  }

  async scan(){
    const r=await super.scan();
    if(!r?.skipped&&!r?.aborted){
      try{await this._refreshExposure(false)}catch(e){console.error('Company exposure refresh failed',e)}
    }
    return r;
  }

  async migrateLegacySql(){
    const r=await super.migrateLegacySql();
    if(r?.ok){
      try{await this._refreshMacro(true)}catch{}
      try{await this._refreshExposure(true)}catch{}
    }
    return r;
  }
}
