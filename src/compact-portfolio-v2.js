import {MarketPortfolio as BasePortfolio} from './compact-portfolio.js';
import {updateNewsLearning,newsLearningContext} from './news-learning-v2.js';
import {captureNewsLearningQuoteCache} from './news-learning.js';
import {consumeNewsLearningQuotes} from './market-v3-base.js';

// Die nachgelagerte Kursauswertung ist kein Live-News-Abruf. Ein Stundenrhythmus
// reicht für 15m/1h/4h/6h-Horizonte und verhindert Yahoo-429-Drosselungen.
export const NEWS_LEARNING_COOLDOWN_MS=60*60*1000;

class NewsLearningAiGuard{
  constructor(base,adapter){this.base=base;this.adapter=adapter}
  async run(model,input){
    const prompt=String(input?.messages?.map(x=>x?.content||'').join('\n')||'');
    const isPlan=prompt.includes('JSON-only')&&prompt.includes('Kandidaten=');
    if(!isPlan)return this.base.run(model,input);
    const state=this.adapter?.peekState?.(),ctx=newsLearningContext(state);
    if(!ctx)return this.base.run(model,input);
    const extra={role:'user',content:`Historisches News-Wirkungslernen (nur kausal ausgewertete Live-Meldungen, keine Gewinngarantie): ${JSON.stringify(ctx)}. Nutze Quellen-/Ereignisgewichte nur wenn genügend Samples vorhanden sind. "ReliabilityScore" ist eine geschrumpfte historische Wirkungskennzahl, keine Erfolgswahrscheinlichkeit. Eine Quelle mit wenigen Samples darf niemals allein einen Trade auslösen.`};
    return this.base.run(model,{...input,messages:[...(input.messages||[]),extra]});
  }
}

export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);
    const guarded=this.engine?.env?.AI;
    if(guarded?.run)this.engine.env.AI=new NewsLearningAiGuard(guarded,this.bucketAdapter);
  }

  async _refreshNewsLearning(force=false){
    const raw=this.bucketAdapter?.peekState?.();
    const last=Date.parse(raw?.newsLearning?.updatedAt||''),scanNo=Number(raw?.config?.scan_count||0),learningVersion=Number(raw?.newsLearning?.version||1);
    // Start entzerren: erster News-Lernlauf erst ab Scan 3. Die normalen Live-News
    // laufen davon unabhaengig bereits ab Scan 1.
    if(!force&&!Number.isFinite(last)&&scanNo<3)return null;
    // Eine neue Lernschema-Version migriert beim ersten normalen Scan sofort.
    // Danach gilt wieder der sparsame Stundentakt.
    if(!force&&learningVersion>=3&&Number.isFinite(last)&&Date.now()-last<NEWS_LEARNING_COOLDOWN_MS)return null;
    if(!this.engine?.store?.update)return null;
    const r=await this.engine.store.update(async s=>{
      await updateNewsLearning(s);
      return true;
    });
    return r?.state?.newsLearning||null;
  }

  // Eigener Durable-Object-Aufruf: Die Yahoo-Kursauswertung teilt sich dadurch
  // nicht mehr das externe Request-Budget mit dem deutlich groesseren Marktscan.
  refreshNewsLearning(options={}){
    return this._serial(async()=>{
      const learning=await this._refreshNewsLearning(Boolean(options?.force));
      const summary=learning?.summary||this.bucketAdapter?.peekState?.()?.newsLearning?.summary||{};
      return{ok:true,skipped:learning?null:'cooldown',source:String(options?.source||'SEPARATE_REQUEST'),updatedAt:learning?.updatedAt||null,evaluatedEvents:Number(summary.evaluatedEvents)||0,pendingEvents:Number(summary.pendingEvents)||0,baselineEvents:Number(summary.baselineEvents)||0,quoteCount:Number(summary.lastEvaluationQuoteCount)||0,provider:summary.lastEvaluationProvider||null,error:summary.lastEvaluationError||null};
    });
  }

  async status(){
    const s=await super.status();
    const raw=this.bucketAdapter?.peekState?.();
    const l=raw?.newsLearning||null;
    s.newsLearning=l?{version:l.version,updatedAt:l.updatedAt,benchmark:l.benchmark,summary:l.summary,sourceStats:l.sourceStats,typeStats:l.typeStats,sourceTypeStats:l.sourceTypeStats,trustedSources:l.trustedSources,confirmationStats:l.confirmationStats}:null;
    s.scanFunnel={catalog:Number(s?.config?.universe_count)||0,referenceMarketOpen:Number(s?.config?.open_symbols)||0,freshCandidates:Array.isArray(s?.candidates)?s.candidates.filter(x=>x?.fresh!==false&&x?.fresh!==0).length:0,visibleCandidates:Array.isArray(s?.candidates)?s.candidates.length:0,newsVisible:Array.isArray(s?.newsRadar)?s.newsRadar.length:0,newsEvaluationCacheHits:Number(l?.summary?.lastEvaluationCacheHits)||0,newsEvaluationNetworkSymbols:Number(l?.summary?.lastEvaluationNetworkSymbols)||0,newsEvaluationProvider:l?.summary?.lastEvaluationProvider||null,explanation:'Vom Trade-Republic-Katalog über aktuell offene Referenzmärkte und frische Kurse bis zu sichtbaren Kandidaten und News.'};
    return s;
  }

  scan(){
    return this._serial(async()=>{
      const r=await this.engine.scan();
      if(!r?.skipped&&!r?.aborted){
        try{const newsQuotes=consumeNewsLearningQuotes();await this.engine.store.update(async s=>{captureNewsLearningQuoteCache(s,[...newsQuotes,...(s.candidates||[]),...(s.positions||[])]);return true})}catch(e){console.error('News quote cache refresh failed',e)}
        try{await this._refreshIntelligence(false)}catch(e){console.error('Investment intelligence refresh failed',e)}
      }
      return r;
    });
  }

  migrateLegacySql(){
    return this._serial(async()=>{
      const sql=this.ctx.storage.sql;
      let config;
      try{config=sql.exec('SELECT * FROM config WHERE id=1').toArray()[0]}catch{return{ok:false,error:'Keine alte SQL-Konfiguration gefunden.'}}
      const safe=query=>{try{return sql.exec(query).toArray()}catch{return[]}};
      const old={config,positions:safe('SELECT * FROM positions ORDER BY opened_at'),history:safe('SELECT * FROM history ORDER BY id DESC LIMIT 800'),snapshots:safe('SELECT * FROM snapshots ORDER BY id DESC LIMIT 1200').reverse(),candidates:safe('SELECT * FROM candidates ORDER BY score DESC LIMIT 35'),newsRadar:safe('SELECT * FROM news_radar ORDER BY COALESCE(news_at,updated_at) DESC LIMIT 80'),sourceHealth:safe('SELECT * FROM source_health ORDER BY source'),aiLog:safe('SELECT * FROM ai_log ORDER BY id DESC LIMIT 180')};
      const r=await this.engine.importLegacy(old);
      try{await this._refreshIntelligence(true)}catch{}
      try{await this._refreshNewsLearning(true)}catch{}
      return{...r,storage:'Durable Object Free · kompakter Hauptzustand'};
    });
  }
}
