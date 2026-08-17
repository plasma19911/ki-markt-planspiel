import {DurableObject} from 'cloudflare:workers';
import {R2Portfolio} from './r2-portfolio.js';

const STATE_KEY='compact/current-v1';
const MAX_BYTES=1_800_000;
const AI_PLAN_COOLDOWN_MS=5*60*1000;
const AI_NEWS_COOLDOWN_MS=15*60*1000;

const clone=x=>structuredClone(x);

function compactStateBody(body){
  let text=String(body||'{}');
  if(new TextEncoder().encode(text).length<=MAX_BYTES)return text;
  try{
    const s=JSON.parse(text);
    // Die Live-Oberflaeche zeigt ohnehin nur einen Ausschnitt. Alte Daten werden hier
    // begrenzt, damit der einzige DO-KV-Wert sicher unter Cloudflares 2-MB-Limit bleibt.
    if(Array.isArray(s.history))s.history=s.history.slice(-500);
    if(Array.isArray(s.snapshots))s.snapshots=s.snapshots.slice(-1200);
    if(Array.isArray(s.aiLog))s.aiLog=s.aiLog.slice(-180);
    if(Array.isArray(s.newsRadar))s.newsRadar=s.newsRadar.slice(-80);
    if(Array.isArray(s.candidates))s.candidates=s.candidates.slice(-35);
    text=JSON.stringify(s);
    if(new TextEncoder().encode(text).length<=MAX_BYTES)return text;
    if(Array.isArray(s.history))s.history=s.history.slice(-300);
    if(Array.isArray(s.snapshots))s.snapshots=s.snapshots.slice(-700);
    if(Array.isArray(s.aiLog))s.aiLog=s.aiLog.slice(-120);
    if(Array.isArray(s.newsRadar))s.newsRadar=s.newsRadar.slice(-60);
    return JSON.stringify(s);
  }catch{return text.slice(0,MAX_BYTES)}
}

class DurableObjectBucketAdapter{
  constructor(ctx){this.ctx=ctx}
  async get(){
    const row=this.ctx.storage.kv.get(STATE_KEY);
    if(!row)return null;
    const version=Number(row.version||1),body=String(row.body||'{}');
    return{etag:String(version),json:async()=>JSON.parse(body)};
  }
  async put(_key,body,options={}){
    const current=this.ctx.storage.kv.get(STATE_KEY);
    const expected=options?.onlyIf?.etagMatches;
    if(expected!=null&&String(current?.version||'')!==String(expected))return null;
    const version=Number(current?.version||0)+1;
    this.ctx.storage.kv.put(STATE_KEY,{version,body:compactStateBody(body)});
    return{etag:String(version)};
  }
}

class FreeAiGuard{
  constructor(ai){
    this.ai=ai;
    this.planAt=0;
    this.newsAt=0;
    this.lastNewsResponse='';
  }
  async run(model,input){
    const prompt=String(input?.messages?.map(x=>x?.content||'').join('\n')||'');
    const isPlan=prompt.includes('JSON-only')&&prompt.includes('Kandidaten=');
    const isNews=prompt.includes('Fasse die aktuelle Mehrquellen-Nachrichtenlage');
    const now=Date.now();

    if(isPlan&&now-this.planAt<AI_PLAN_COOLDOWN_MS){
      return{response:JSON.stringify({summary:'KI-Wartefenster: Markt und News werden weiter jede Minute gescannt; nächste KI-Neubewertung spätestens nach 5 Minuten.',actions:[]})};
    }
    if(isNews&&now-this.newsAt<AI_NEWS_COOLDOWN_MS){
      return{response:this.lastNewsResponse||'News werden weiter gesammelt; die KI-Zusammenfassung wird im 15-Minuten-Fenster aktualisiert.'};
    }

    if(!this.ai?.run){
      if(isPlan)return{response:JSON.stringify({summary:'KI derzeit nicht verfügbar; keine automatische Ersatzorder.',actions:[]})};
      return{response:'KI derzeit nicht verfügbar; Markt- und News-Daten werden trotzdem weiter gesammelt.'};
    }

    try{
      const r=await this.ai.run(model,input);
      const response=String(r?.response||r?.result?.response||'');
      if(isPlan)this.planAt=now;
      if(isNews){this.newsAt=now;this.lastNewsResponse=response.slice(0,500)}
      return r;
    }catch(e){
      // Auf Workers Free werden verbrauchte AI-Neurons hart blockiert statt berechnet.
      // Wichtig: Bei AI-Ausfall KEIN regelbasierter Ersatztrade.
      if(isPlan)return{response:JSON.stringify({summary:`KI-Free-Limit/Fehler: ${String(e?.message||e).slice(0,140)} · keine Ersatzorder.`,actions:[]})};
      return{response:this.lastNewsResponse||'KI-Free-Limit erreicht oder KI vorübergehend nicht verfügbar; News-Radar läuft ohne Zusatzkosten weiter.'};
    }
  }
}

export class MarketPortfolio extends DurableObject{
  constructor(ctx,env){
    super(ctx,env);
    this.ctx=ctx;
    this.env=env;
    this.engine=new R2Portfolio({...env,STATE:new DurableObjectBucketAdapter(ctx),AI:new FreeAiGuard(env.AI)});
    this._queue=Promise.resolve();
  }

  _serial(fn){
    const job=this._queue.then(fn,fn);
    this._queue=job.catch(()=>{});
    return job;
  }

  async status(){
    return this._serial(async()=>{
      const s=await this.engine.status();
      s.storage={backend:'Durable Object Free · kompakter 1-Zeilen-Zustand',key:STATE_KEY,rowReadsPerRefresh:'maximal 1',r2:false};
      return s;
    });
  }
  start(options={}){return this._serial(()=>this.engine.start({...options,includeEtfs:true,includeLeverage:false}))}
  stop(){return this._serial(()=>this.engine.stop())}
  reset(){return this._serial(()=>this.engine.reset())}
  scan(){return this._serial(()=>this.engine.scan())}

  // Einmalige Migration aus den alten SQL-Tabellen. Erst ausfuehren, wenn das heutige
  // alte Row-Read-Limit wieder zurueckgesetzt ist. Der normale Betrieb nutzt SQL NICHT.
  migrateLegacySql(){
    return this._serial(async()=>{
      const sql=this.ctx.storage.sql;
      let config;
      try{config=sql.exec('SELECT * FROM config WHERE id=1').toArray()[0]}catch{return{ok:false,error:'Keine alte SQL-Konfiguration gefunden.'}}
      const safe=(query)=>{try{return sql.exec(query).toArray()}catch{return[]}};
      const old={
        config,
        positions:safe('SELECT * FROM positions ORDER BY opened_at'),
        history:safe('SELECT * FROM history ORDER BY id DESC LIMIT 800'),
        snapshots:safe('SELECT * FROM snapshots ORDER BY id DESC LIMIT 1200').reverse(),
        candidates:safe('SELECT * FROM candidates ORDER BY score DESC LIMIT 35'),
        newsRadar:safe('SELECT * FROM news_radar ORDER BY COALESCE(news_at,updated_at) DESC LIMIT 80'),
        sourceHealth:safe('SELECT * FROM source_health ORDER BY source'),
        aiLog:safe('SELECT * FROM ai_log ORDER BY id DESC LIMIT 180')
      };
      const r=await this.engine.importLegacy(old);
      return{...r,storage:'Durable Object Free · 1 Zeile'};
    });
  }
}
