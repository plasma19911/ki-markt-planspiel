import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v4.js';
import {ZERO_BROKER,zeroExecutionNote} from './zero-broker.js';

// Das statische Universum darf deutlich breiter sein als ein einzelner 1-Minuten-Scan.
// Auf Workers Free werden deshalb die groessten/liquidesten Werte dauerhaft und der
// restliche Aktien-Pool rotierend gescannt. PRIORITY_EQUITIES, ETFs und gehaltene Werte
// werden von market-v3 danach zusaetzlich beruecksichtigt.
const ZERO_CORE_EQUITIES=80;
const ZERO_ROTATING_EQUITIES=160;
const ZERO_UNIVERSE_CACHE_MS=10*60*1000;
const ZERO_AI_PLAN_MAX_TOKENS=600;
const ZERO_AI_PLAN_COOLDOWN_MS=10*60*1000;
const ZERO_AI_NEWS_COOLDOWN_MS=15*60*1000;
const ZERO_AI_QUOTA_KEY='quota/zero-ai-v1';

function rotate(pool,count,seed){
  if(!pool.length||count<=0)return[];
  const n=Math.min(count,pool.length),start=(seed*n)%pool.length,out=[];
  for(let i=0;i<n;i++)out.push(pool[(start+i)%pool.length]);
  return out;
}

class ZeroUniverseAssets{
  constructor(base){this.base=base;this.cache=null;this.cacheAt=0}

  async _load(request=null,init=undefined){
    if(this.cache&&Date.now()-this.cacheAt<ZERO_UNIVERSE_CACHE_MS)return this.cache;
    const req=request||new Request('https://assets.local/universe.json');
    const r=await this.base.fetch(req,init);
    if(!r.ok)throw new Error(`ZERO-Universum HTTP ${r.status}`);
    const data=await r.json();
    this.cache=data&&typeof data==='object'?data:{equities:[]};
    this.cacheAt=Date.now();
    return this.cache;
  }

  async fetch(request,init){
    let u;
    try{u=new URL(typeof request==='string'?request:request.url)}catch{return this.base.fetch(request,init)}
    if(!u.pathname.endsWith('/universe.json'))return this.base.fetch(request,init);
    const data=await this._load(request,init);
    const all=Array.isArray(data?.equities)?data.equities.filter(x=>x?.symbol):[];
    if(all.length<=ZERO_CORE_EQUITIES+ZERO_ROTATING_EQUITIES){
      return Response.json(data,{headers:{'cache-control':'no-store'}});
    }
    const core=all.slice(0,ZERO_CORE_EQUITIES),pool=all.slice(ZERO_CORE_EQUITIES);
    const minute=Math.floor(Date.now()/60000),rotating=rotate(pool,ZERO_ROTATING_EQUITIES,minute);
    const seen=new Set(),equities=[];
    for(const x of [...core,...rotating]){const k=String(x.symbol).toUpperCase();if(!seen.has(k)){seen.add(k);equities.push(x)}}
    const body={
      ...data,
      equities,
      full_liquid_equity_count:all.length,
      scanner_slice_equity_count:equities.length,
      scanner_core_equities:Math.min(ZERO_CORE_EQUITIES,all.length),
      scanner_rotating_equities:Math.min(ZERO_ROTATING_EQUITIES,Math.max(0,all.length-ZERO_CORE_EQUITIES)),
      scanner_rotation_minute:minute,
      scanner_mode:'ZERO_BROAD_ROTATION'
    };
    return Response.json(body,{headers:{'cache-control':'no-store'}});
  }

  async info(){
    try{
      const data=await this._load();
      const n=Array.isArray(data?.equities)?data.equities.length:0,pool=Math.max(0,n-ZERO_CORE_EQUITIES);
      return{
        fullLiquidEquityUniverse:n,
        coreEquitiesEveryMinute:Math.min(n,ZERO_CORE_EQUITIES),
        rotatingEquitiesPerMinute:Math.min(pool,ZERO_ROTATING_EQUITIES),
        estimatedFullRotationMinutes:pool?Math.ceil(pool/ZERO_ROTATING_EQUITIES):1,
        universeGeneratedAt:data?.generated_at||null,
        exactBrokerCatalog:Boolean(data?.exact_broker_catalog)
      };
    }catch{return null}
  }
}

class ZeroBrokerAiGuard{
  constructor(base,storage){this.base=base;this.storage=storage}
  quota(){
    try{return this.storage?.kv?.get(ZERO_AI_QUOTA_KEY)||{}}
    catch{return{}}
  }
  saveQuota(q){
    try{this.storage?.kv?.put(ZERO_AI_QUOTA_KEY,q)}catch{}
  }
  async run(model,input){
    const prompt=String(input?.messages?.map(x=>x?.content||'').join('\n')||'');
    const isPlan=prompt.includes('JSON-only')&&prompt.includes('Kandidaten=');
    const isNews=prompt.includes('Fasse die aktuelle Mehrquellen-Nachrichtenlage');
    if(!isPlan&&!isNews)return this.base.run(model,input);

    const now=Date.now(),q=this.quota();
    if(isPlan&&now-Number(q.planAt||0)<ZERO_AI_PLAN_COOLDOWN_MS){
      return{response:JSON.stringify({summary:'KI-Wartefenster: Markt und News werden weiter jede Minute gescannt; nächste KI-Neubewertung spätestens nach 10 Minuten.',actions:[]})};
    }
    if(isNews&&now-Number(q.newsAt||0)<ZERO_AI_NEWS_COOLDOWN_MS){
      return{response:String(q.lastNewsResponse||'News werden weiter gesammelt; die KI-Zusammenfassung wird im 15-Minuten-Fenster aktualisiert.')};
    }

    if(isPlan){q.planAt=now;this.saveQuota(q)}
    if(isNews){q.newsAt=now;this.saveQuota(q)}

    let finalInput=input;
    if(isPlan){
      const extra={role:'user',content:`Zieldepot fuer spaetere praktische Umsetzung: finanzen.net ZERO ueber gettex. Das bleibt PAPER-TRADING; keine echten Brokerorders. Der Scanner durchsucht ein breites, rotierendes Universum gut handelbarer Aktien sowie normale europaeische UCITS-ETF-Kandidaten und darf branchenunabhaengig die besten Setups waehlen. Defense/Tech sind Zusatzbereiche, aber kein Hauptfilter. US-domiciled Analyse-Proxys wie SPY/QQQ duerfen Marktinformationen liefern, sind aber keine kaufbaren ETF-Kandidaten. Bevorzuge liquide Werte und vermeide duenne/exotische Notierungen. Bei kleinen oder fraktionalen Orders konservativ 1 EUR Zuschlag plus Spread/Slippage annehmen. Broker-Verfuegbarkeit kann sich aendern und ist keine Kaufaussage.`};
      const requested=Number(input?.max_completion_tokens||ZERO_AI_PLAN_MAX_TOKENS);
      finalInput={...input,max_completion_tokens:Math.min(Math.max(120,requested),ZERO_AI_PLAN_MAX_TOKENS),messages:[...(input.messages||[]),extra]};
    }

    const r=await this.base.run(model,finalInput);
    if(isNews){
      const response=String(r?.response||r?.result?.response||'').trim();
      const latest=this.quota();latest.newsAt=now;if(response)latest.lastNewsResponse=response.slice(0,500);this.saveQuota(latest);
    }
    return r;
  }
}

export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);
    const guarded=this.engine?.env?.AI;
    if(guarded?.run)this.engine.env.AI=new ZeroBrokerAiGuard(guarded,ctx.storage);
    const assets=this.engine?.env?.ASSETS;
    if(assets?.fetch){this.zeroAssets=new ZeroUniverseAssets(assets);this.engine.env.ASSETS=this.zeroAssets}
  }

  async status(){
    const s=await super.status(),coverage=await this.zeroAssets?.info?.();
    s.brokerTarget={
      ...ZERO_BROKER,
      currentScannerUniverse:Number(s?.config?.universe_count||0),
      ...(coverage||{}),
      aiPlanCooldownMinutes:ZERO_AI_PLAN_COOLDOWN_MS/60000,
      aiNewsCooldownMinutes:ZERO_AI_NEWS_COOLDOWN_MS/60000,
      aiCooldownPersistent:true,
      aiPlanMaxCompletionTokens:ZERO_AI_PLAN_MAX_TOKENS,
      executionNote:zeroExecutionNote(Number(s?.config?.cash||0),{fractional:true}),
      paperTradingOnly:true,
      liveBrokerConnection:false
    };
    if(s.executionModel)s.executionModel={...s.executionModel,targetBroker:ZERO_BROKER.name,venue:ZERO_BROKER.venue,zeroConservativeModel:true};
    return s;
  }
}
