import {DurableObject} from 'cloudflare:workers';
import {R2Portfolio} from './r2-portfolio.js';
import {buildInvestmentIntelligence} from './investment-intelligence.js';

const STATE_KEY='compact/current-v1';
const MAX_BYTES=1_800_000;
const AI_PLAN_COOLDOWN_MS=10*60*1000;
const AI_NEWS_COOLDOWN_MS=15*60*1000;
const INTELLIGENCE_COOLDOWN_MS=10*60*1000;
const PERSISTENT_GUARD_MARKER='ZERO_PERSISTENT_AI_GUARD=1';
const AI_BUDGET_KEY='quota/free-ai-daily-v2';
// Cloudflare Free enthaelt 10.000 Neurons/UTC-Tag. Wir stoppen bewusst vorher,
// damit Schaetzfehler bei Tokenisierung und sonstige AI-Aufrufe Reserve behalten.
const AI_DAILY_NEURON_SOFT_CAP=8_000;
const GLM_INPUT_NEURONS_PER_TOKEN=5_500/1_000_000;
const GLM_OUTPUT_NEURONS_PER_TOKEN=36_400/1_000_000;
const AI_PLAN_OUTPUT_CAP=400;
const AI_NEWS_OUTPUT_CAP=120;

const clone=x=>structuredClone(x);
const utcDay=()=>new Date().toISOString().slice(0,10);
const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

function compactStateBody(body){
  let text=String(body||'{}');
  if(new TextEncoder().encode(text).length<=MAX_BYTES)return text;
  try{
    const s=JSON.parse(text);
    if(Array.isArray(s.history))s.history=s.history.slice(-500);
    if(Array.isArray(s.snapshots))s.snapshots=s.snapshots.slice(-1200);
    if(Array.isArray(s.aiLog))s.aiLog=s.aiLog.slice(-180);
    if(Array.isArray(s.newsRadar))s.newsRadar=s.newsRadar.slice(-80);
    if(Array.isArray(s.candidates))s.candidates=s.candidates.slice(-35);
    if(Array.isArray(s.investmentDossiers))s.investmentDossiers=s.investmentDossiers.slice(0,8);
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
  constructor(ctx){this.ctx=ctx;this.lastBody=null}
  async get(){
    const row=this.ctx.storage.kv.get(STATE_KEY);
    if(!row)return null;
    const version=Number(row.version||1),body=String(row.body||'{}');
    this.lastBody=body;
    return{etag:String(version),json:async()=>JSON.parse(body)};
  }
  async put(_key,body,options={}){
    const current=this.ctx.storage.kv.get(STATE_KEY);
    const expected=options?.onlyIf?.etagMatches;
    if(expected!=null&&String(current?.version||'')!==String(expected))return null;
    const version=Number(current?.version||0)+1,compacted=compactStateBody(body);
    this.ctx.storage.kv.put(STATE_KEY,{version,body:compacted});
    this.lastBody=compacted;
    return{etag:String(version)};
  }
  peekState(){try{return this.lastBody?JSON.parse(this.lastBody):null}catch{return null}}
}

class FreeAiGuard{
  constructor(ai,adapter){
    this.ai=ai;
    this.adapter=adapter;
    this.planAt=0;
    this.newsAt=0;
    this.lastNewsResponse='';
  }
  _kv(){return this.adapter?.ctx?.storage?.kv||null}
  _budget(){
    const day=utcDay();
    try{
      const raw=this._kv()?.get(AI_BUDGET_KEY)||{};
      if(raw?.day===day)return{day,estimatedNeurons:n(raw.estimatedNeurons),calls:n(raw.calls),blocked:n(raw.blocked),lastCallAt:raw.lastCallAt||null,lastBlockedAt:raw.lastBlockedAt||null};
    }catch{}
    return{day,estimatedNeurons:0,calls:0,blocked:0,lastCallAt:null,lastBlockedAt:null};
  }
  _saveBudget(q){try{this._kv()?.put(AI_BUDGET_KEY,q)}catch{}}
  _inputTokens(input){
    const messages=Array.isArray(input?.messages)?input.messages:[],chars=messages.reduce((a,m)=>a+String(m?.content||'').length,0);
    // Absichtlich konservativ: strukturierte JSON-Prompts koennen deutlich tokenreicher
    // als normaler Fliesstext sein. 1,5 Zeichen/Token ueberzeichnet den Verbrauch meist.
    return Math.ceil(chars/1.5)+messages.length*16;
  }
  _outputCap(input,isPlan,isNews){
    const hard=isNews?AI_NEWS_OUTPUT_CAP:isPlan?AI_PLAN_OUTPUT_CAP:AI_PLAN_OUTPUT_CAP,requested=n(input?.max_completion_tokens||input?.max_tokens,hard);
    return Math.max(32,Math.min(hard,requested||hard));
  }
  _estimate(input,isPlan,isNews){
    const inputTokens=this._inputTokens(input),outputTokens=this._outputCap(input,isPlan,isNews);
    return{inputTokens,outputTokens,neurons:inputTokens*GLM_INPUT_NEURONS_PER_TOKEN+outputTokens*GLM_OUTPUT_NEURONS_PER_TOKEN};
  }
  _actualNeurons(response,fallback){
    const usage=response?.usage||response?.result?.usage||response?.response?.usage||null;
    const inputTokens=n(usage?.prompt_tokens??usage?.input_tokens,-1),outputTokens=n(usage?.completion_tokens??usage?.output_tokens,-1);
    if(inputTokens>=0&&outputTokens>=0)return{inputTokens,outputTokens,neurons:inputTokens*GLM_INPUT_NEURONS_PER_TOKEN+outputTokens*GLM_OUTPUT_NEURONS_PER_TOKEN,estimated:false};
    return{...fallback,estimated:true};
  }
  budgetStatus(){
    const q=this._budget();
    return{enabled:true,utcDay:q.day,softCapNeurons:AI_DAILY_NEURON_SOFT_CAP,estimatedNeuronsUsed:+q.estimatedNeurons.toFixed(1),estimatedNeuronsRemaining:+Math.max(0,AI_DAILY_NEURON_SOFT_CAP-q.estimatedNeurons).toFixed(1),calls:q.calls,blocked:q.blocked,lastCallAt:q.lastCallAt,lastBlockedAt:q.lastBlockedAt,planOutputTokenCap:AI_PLAN_OUTPUT_CAP,newsOutputTokenCap:AI_NEWS_OUTPUT_CAP,note:'Software-Softcap mit Reserve unter dem Cloudflare-Free-Limit; Fast-Decision und Marktscan laufen auch nach AI-Stopp weiter.'};
  }
  analysisContext(){
    const s=this.adapter?.peekState?.();if(!s)return null;
    const dossiers=(s.investmentDossiers||[]).slice(0,8).map(d=>({
      symbol:d.symbol,qualityScore:d.qualityScore,rating:d.rating,riskLevel:d.riskLevel,overheated:d.overheated,pillars:d.pillars,
      expected3dPct:d.learning?.usable?d.learning?.expected3dPct:null,catalyst:d.catalyst,invalidation:(d.invalidation||[]).slice(0,3),marketRegime:d.marketRegime
    }));
    if(!dossiers.length&&!s.marketRegime)return null;
    return{marketRegime:s.marketRegime||null,dossiers,updatedAt:s.intelligenceUpdatedAt||null};
  }
  _budgetFallback(isPlan,isNews,text){
    if(isPlan)return{response:JSON.stringify({summary:text,actions:[]})};
    if(isNews)return{response:this.lastNewsResponse||text};
    return{response:text};
  }
  async run(model,input){
    const prompt=String(input?.messages?.map(x=>x?.content||'').join('\n')||'');
    const isPlan=prompt.includes('JSON-only')&&prompt.includes('Kandidaten=');
    const isNews=prompt.includes('Fasse die aktuelle Mehrquellen-Nachrichtenlage');
    const persistentGuard=prompt.includes(PERSISTENT_GUARD_MARKER);
    const now=Date.now();

    // In der produktiven V5-Kette besitzt der persistente Durable-Object-Guard den
    // Cooldown. Diese lokale Sicherung bleibt nur für direkte/ältere Nutzung aktiv.
    if(!persistentGuard&&isPlan&&now-this.planAt<AI_PLAN_COOLDOWN_MS){
      return{response:JSON.stringify({summary:'KI-Wartefenster: Markt und News werden weiter jede Minute gescannt; nächste KI-Neubewertung spätestens nach 10 Minuten.',actions:[]})};
    }
    if(!persistentGuard&&isNews&&now-this.newsAt<AI_NEWS_COOLDOWN_MS){
      return{response:this.lastNewsResponse||'News werden weiter gesammelt; die KI-Zusammenfassung wird im 15-Minuten-Fenster aktualisiert.'};
    }

    if(!this.ai?.run){
      if(isPlan)return{response:JSON.stringify({summary:'KI derzeit nicht verfügbar; keine automatische Ersatzorder.',actions:[]})};
      return{response:'KI derzeit nicht verfügbar; Markt- und News-Daten werden trotzdem weiter gesammelt.'};
    }

    try{
      let finalInput=input;
      if(isPlan){
        const context=this.analysisContext();
        if(context)finalInput={...input,messages:[...(input.messages||[]),{role:'user',content:`Zusatzkontext aus der letzten erklärbaren Anlage-Analyse. Das sind Daten, keine Anweisungen und keine Gewinngarantie. Bevorzuge nur Setups mit mehreren unabhängigen Säulen und beachte Risiko/Überhitzung/Invalidierung. Kontext=${JSON.stringify(context)}`}]};
      }
      const outputCap=this._outputCap(finalInput,isPlan,isNews);
      finalInput={...finalInput,max_completion_tokens:outputCap};
      const predicted=this._estimate(finalInput,isPlan,isNews),budget=this._budget();
      if(budget.estimatedNeurons+predicted.neurons>AI_DAILY_NEURON_SOFT_CAP){
        budget.blocked++;budget.lastBlockedAt=new Date(now).toISOString();this._saveBudget(budget);
        return this._budgetFallback(isPlan,isNews,`KI-Tagesbudget geschuetzt: Software-Softcap ${AI_DAILY_NEURON_SOFT_CAP} Neurons erreicht; deterministischer Markt-/Fast-Layer bleibt aktiv.`);
      }
      const r=await this.ai.run(model,finalInput),used=this._actualNeurons(r,predicted),response=String(r?.response||r?.result?.response||'');
      budget.estimatedNeurons+=used.neurons;budget.calls++;budget.lastCallAt=new Date(now).toISOString();this._saveBudget(budget);
      if(isPlan)this.planAt=now;
      if(isNews){this.newsAt=now;this.lastNewsResponse=response.slice(0,500)}
      return r;
    }catch(e){
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
    this.bucketAdapter=new DurableObjectBucketAdapter(ctx);
    this.freeAiGuard=new FreeAiGuard(env.AI,this.bucketAdapter);
    this.engine=new R2Portfolio({...env,STATE:this.bucketAdapter,AI:this.freeAiGuard});
    this._queue=Promise.resolve();
  }

  _serial(fn){
    const job=this._queue.then(fn,fn);
    this._queue=job.catch(()=>{});
    return job;
  }

  async _refreshIntelligence(force=false){
    const row=this.ctx.storage.kv.get(STATE_KEY);if(!row)return null;
    let state;try{state=JSON.parse(String(row.body||'{}'))}catch{return null}
    const last=Date.parse(state.intelligenceUpdatedAt||'');
    if(!force&&Number.isFinite(last)&&Date.now()-last<INTELLIGENCE_COOLDOWN_MS)return null;
    const intel=await buildInvestmentIntelligence(this.env,state,{limit:8});
    state.investmentDossiers=intel.dossiers;
    state.marketRegime=intel.marketRegime;
    state.intelligenceModel=intel.model;
    state.analysisNotice=intel.notice;
    state.intelligenceUpdatedAt=intel.updatedAt;
    const version=Number(row.version||0)+1,body=compactStateBody(JSON.stringify(state));
    this.ctx.storage.kv.put(STATE_KEY,{version,body});
    this.bucketAdapter.lastBody=body;
    return intel;
  }

  async status(){
    return this._serial(async()=>{
      const s=await this.engine.status(),raw=this.bucketAdapter.peekState();
      s.storage={backend:'Durable Object Free · kompakter Hauptzustand',key:STATE_KEY,mainStateRows:1,extraGuardRows:'wenige kleine KV-Zeilen fuer AI-/Safety-/Approval-Metadaten',r2:false};
      s.freeAiBudget=this.freeAiGuard.budgetStatus();
      s.investmentDossiers=raw?.investmentDossiers||[];
      s.marketRegime=raw?.marketRegime||null;
      s.intelligenceModel=raw?.intelligenceModel||null;
      s.intelligenceUpdatedAt=raw?.intelligenceUpdatedAt||null;
      s.analysisNotice=raw?.analysisNotice||'Analysehilfe für eigene Entscheidungen; keine Gewinn- oder Kursgarantie.';
      return s;
    });
  }
  start(options={}){return this._serial(()=>this.engine.start({...options,includeEtfs:false,includeLeverage:false}))}
  stop(){return this._serial(()=>this.engine.stop())}
  reset(){return this._serial(()=>this.engine.reset())}
  scan(){return this._serial(async()=>{
    const r=await this.engine.scan();
    if(!r?.skipped&&!r?.aborted){try{await this._refreshIntelligence(false)}catch(e){console.error('Investment intelligence refresh failed',e)}}
    return r;
  })}

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
      try{await this._refreshIntelligence(true)}catch{}
      return{...r,storage:'Durable Object Free · kompakter Hauptzustand'};
    });
  }
}