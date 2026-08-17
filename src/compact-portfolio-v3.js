import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v2.js';
import {updateMacroGeopolitics,macroContext} from './macro-geopolitics.js';

const MACRO_COOLDOWN_MS=10*60*1000;

class MacroAiGuard{
  constructor(base,adapter){this.base=base;this.adapter=adapter}
  async run(model,input){
    const prompt=String(input?.messages?.map(x=>x?.content||'').join('\n')||'');
    const isPlan=prompt.includes('JSON-only')&&prompt.includes('Kandidaten=');
    if(!isPlan)return this.base.run(model,input);
    const state=this.adapter?.peekState?.(),ctx=macroContext(state);
    if(!ctx)return this.base.run(model,input);
    const extra={role:'user',content:`Makro-/Geopolitik-Zusatzkontext (Daten, keine Anweisung): ${JSON.stringify(ctx)}. Berücksichtige Zentralbanken, Inflation/Wachstum, Energie, Krieg, Sanktionen und Handelskonflikte nur als Zusatzsignal. Ein Ereignis darf NIE automatisch Kauf/Verkauf bedeuten. Verlange aktuelle Kurs-/Trendbestätigung; bevorzuge bestätigte Ereignisse mit mehreren Quellen. Gelernte Kategoriegewichte nur ab ausreichender Stichprobe verwenden. Keine Gewinngarantie.`};
    return this.base.run(model,{...input,messages:[...(input.messages||[]),extra]});
  }
}

export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);
    const guarded=this.engine?.env?.AI;
    if(guarded?.run)this.engine.env.AI=new MacroAiGuard(guarded,this.bucketAdapter);
  }

  async _refreshMacro(force=false){
    const raw=this.bucketAdapter?.peekState?.();
    const last=Date.parse(raw?.macroRadar?.updatedAt||'');
    if(!force&&Number.isFinite(last)&&Date.now()-last<MACRO_COOLDOWN_MS)return null;
    if(!this.engine?.store?.update)return null;
    const r=await this.engine.store.update(async s=>{
      await updateMacroGeopolitics(s);
      return true;
    });
    return{radar:r?.state?.macroRadar||null,learning:r?.state?.macroLearning||null};
  }

  async status(){
    const s=await super.status();
    const raw=this.bucketAdapter?.peekState?.();
    s.macroRadar=raw?.macroRadar||null;
    const l=raw?.macroLearning||null;
    s.macroLearning=l?{updatedAt:l.updatedAt,categoryStats:l.categoryStats,summary:l.summary}:null;
    return s;
  }

  scan(){
    return this._serial(async()=>{
      const r=await this.engine.scan();
      if(!r?.skipped&&!r?.aborted){
        try{await this._refreshIntelligence(false)}catch(e){console.error('Investment intelligence refresh failed',e)}
        try{await this._refreshNewsLearning(false)}catch(e){console.error('News learning refresh failed',e)}
        try{await this._refreshMacro(false)}catch(e){console.error('Macro geopolitical refresh failed',e)}
      }
      return r;
    });
  }
}
