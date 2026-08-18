import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v6.js';
import {ZERO_FEE_MODEL} from './zero-fee-model.js';
import {accountingFromStatus,lastId,num,positionMarketValue,positionSnapshot,reconcileZeroFees} from './zero-accounting.js';
import {blockUnsafeFreshBuys} from './trade-safety.js';

const STOCK_TYPE='EQUITY';
const isStock=x=>String(x?.type||x?.instrument_type||STOCK_TYPE).toUpperCase()===STOCK_TYPE;
const responseText=r=>String(r?.response||r?.result?.response||'');
const key=x=>String(x?.symbol||'').toUpperCase();

function planParts(text){
  const marker='Kandidaten=',heldMarker=' Gehalten=',a=text.indexOf(marker),b=text.indexOf(heldMarker,a+marker.length);if(a<0||b<0)return null;
  try{
    const candidates=JSON.parse(text.slice(a+marker.length,b).trim()),held=JSON.parse(text.slice(b+heldMarker.length).trim());
    return{a,b,marker,heldMarker,candidates:Array.isArray(candidates)?candidates:[],held:Array.isArray(held)?held:[]};
  }catch{return null}
}

function currentPlanContext(input){
  for(const m of input?.messages||[]){const text=String(m?.content||''),p=planParts(text);if(p){const cash=num(text.match(/Cash\s+([0-9.+-]+)/i)?.[1],0);return{...p,text,cash}}}
  return null;
}

function rewriteStockOnlyPlan(text,state){
  const p=planParts(text);if(!p)return text;
  const previous=new Map((state?.candidates||[]).filter(isStock).map(x=>[key(x),x]));
  const candidates=p.candidates.filter(isStock).map(x=>{
    // Preis dient nur der Vorab-Kostenschätzung. Falls derselbe Titel bereits im letzten
    // gespeicherten Scan vorkam, ist dieser Preis besser als gar kein Preis; die echte
    // Paper-Ausführung nutzt anschließend den aktuellen cand.price des laufenden Scans.
    const old=previous.get(key(x)),price=num(x.price||old?.price,0);
    return{...x,type:STOCK_TYPE,...(price>0?{price:+price.toFixed(6)}:{})};
  });
  const held=p.held.filter(x=>String(x?.type||STOCK_TYPE).toUpperCase()===STOCK_TYPE);
  let prefix=text.slice(0,p.a)
    .replace(/Aktien und normale ETFs/gi,'ausschließlich Aktien')
    .replace(/Aktien \+ normale ETFs/gi,'ausschließlich Aktien')
    .replace(/Aktien sowie normale europaeische UCITS-ETF-Kandidaten/gi,'Aktien')
    .replace(/Erlaubt sind ausschließlich Aktien und normale ETFs\./gi,'Erlaubt sind ausschließlich Aktien. ETFs sind in diesem Planspiel ausgeschlossen.');
  const policy='AKTIEN-ONLY: BUY ist ausschließlich für Kandidaten type=EQUITY erlaubt. ETF und LEVERAGED_ETF niemals kaufen. FULL-CASH-POLICY: Solange handelbare Aktienkandidaten vorhanden sind, soll strategisch kein Cash zurückgehalten werden; finale BUY-Anteile sollen zusammen 100% des verfügbaren Cashs verwenden. ';
  // WICHTIG: Nach Gehalten= darf nichts mehr stehen. Mehrere nachgelagerte Parser lesen
  // das Held-JSON bis zum Nachrichtenende. Die Policy steht deshalb VOR Kandidaten=.
  return `${prefix}${policy}${p.marker}${JSON.stringify(candidates)}${p.heldMarker}${JSON.stringify(held)}`;
}

function parsePlan(r){
  const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;
  try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}
}

function candidateRank(x){return num(x?.liveScore,x?.score)*1.0+num(x?.liveConfidence,x?.confidence)*.75+num(x?.news)*.12+Math.max(0,num(x?.momentumBreakoutScore))*.08-Math.max(0,num(x?.momentumExhaustionScore))*.12}
function estimatedDeployableCash(ctx,actions){
  let cash=num(ctx?.cash,0);const sells=new Set((actions||[]).filter(x=>String(x?.action||'').toUpperCase()==='SELL').map(key));
  for(const h of ctx?.held||[])if(sells.has(key(h))){const invested=num(h.invested),pnl=num(h.pnlPct);cash+=Math.max(0,invested*(1+pnl/100))}
  return cash;
}
function eligibleCurrentCandidates(ctx,actions){
  const held=new Set((ctx?.held||[]).map(key)),sellSymbols=new Set((actions||[]).filter(x=>String(x?.action||'').toUpperCase()==='SELL').map(key));
  return (ctx?.candidates||[]).filter(isStock).filter(x=>!held.has(key(x))&&!sellSymbols.has(key(x))).filter(x=>String(x?.momentumSellSignal||'NONE').toUpperCase()!=='STRONG'&&String(x?.eventRisk||'NONE').toUpperCase()!=='HIGH').sort((a,b)=>candidateRank(b)-candidateRank(a));
}
function enforceOuterFullCash(r,input,reason=''){const ctx=currentPlanContext(input),j=parsePlan(r)||{summary:`Deterministischer Ersatzplan${reason?`: ${reason}`:''}`,actions:[]};if(!ctx)return{...r,response:JSON.stringify(j)};const allowed=new Set((ctx.candidates||[]).filter(isStock).map(key)),sellSymbols=new Set((j.actions||[]).filter(x=>String(x?.action||'').toUpperCase()==='SELL').map(key)),others=(j.actions||[]).filter(x=>String(x?.action||'').toUpperCase()!=='BUY'),map=new Map();for(const x of j.actions||[]){if(String(x?.action||'').toUpperCase()!=='BUY')continue;const s=key(x);if(!allowed.has(s)||sellSymbols.has(s))continue;const old=map.get(s);if(!old||candidateRank(ctx.candidates.find(c=>key(c)===s)||x)>candidateRank(ctx.candidates.find(c=>key(c)===key(old))||old))map.set(s,x)}let buys=[...map.values()],deployable=estimatedDeployableCash(ctx,j.actions);if(deployable>0.01&&!buys.length){const best=eligibleCurrentCandidates(ctx,j.actions)[0];if(best)buys=[{symbol:key(best),action:'BUY',confidence:Math.max(.5,Math.min(.74,num(best.liveConfidence,.5))),allocation_pct:100,reason:`OUTER-FULL-CASH-BEST: bester aktueller Aktienkandidat des laufenden Scans · Score ${num(best.liveScore).toFixed(2)}${reason?` · ${reason}`:''}`}]}if(deployable>0.01&&buys.length){const cMap=new Map((ctx.candidates||[]).map(x=>[key(x),x])),weights=buys.map(x=>Math.max(.1,num(x.allocation_pct,1))*Math.max(.4,1+candidateRank(cMap.get(key(x))||x)/10)),sum=weights.reduce((a,b)=>a+b,0)||1;buys=buys.map((x,i)=>({...x,allocation_pct:+(100*weights[i]/sum).toFixed(4)}));const total=buys.reduce((a,x)=>a+num(x.allocation_pct),0),delta=+(100-total).toFixed(4);if(Math.abs(delta)>.0001)buys[0].allocation_pct=+(num(buys[0].allocation_pct)+delta).toFixed(4);buys=buys.map(x=>({...x,reason:`${String(x.reason||'').slice(0,360)} · OUTER-FULL-CASH ${num(x.allocation_pct).toFixed(2)}%`}));j.summary=`${String(j.summary||'KI-Plan').slice(0,300)} · OUTER-FULL-CASH: 100% des verfügbaren Cashs auf ${buys.length} Aktien-BUY(s) verteilt.`}j.actions=[...others,...buys];return{...r,response:JSON.stringify(j)}}

class StocksOnlyAiGuard{
  constructor(base,adapter){this.base=base;this.adapter=adapter}
  async run(model,input){
    const joined=String(input?.messages?.map(x=>x?.content||'').join('\n')||''),isPlan=joined.includes('JSON-only')&&joined.includes('Kandidaten=');
    if(!isPlan)return this.base.run(model,input);
    const state=this.adapter?.peekState?.();
    const messages=(input.messages||[]).map(m=>String(m?.content||'').includes('Kandidaten=')?{...m,content:rewriteStockOnlyPlan(String(m.content||''),state)}:m),next={...input,messages};
    try{return enforceOuterFullCash(await this.base.run(model,next),next)}catch(e){return enforceOuterFullCash({response:JSON.stringify({summary:'Workers AI/Fast-Layer nicht verfügbar',actions:[]})},next,`AI-Ausfall ${String(e?.message||e).slice(0,100)}`)}
  }
}

async function ensureZeroConfig(engine){
  const loaded=await engine?.store?.load?.(true);const s=loaded?.state;
  if(!s?.config)return;
  if(num(s.config.fee_fixed,0)===0&&num(s.config.fee_percent,0)===0&&s.config.zero_fee_model_version===ZERO_FEE_MODEL.version)return;
  await engine.store.update(x=>{x.config.fee_fixed=0;x.config.fee_percent=0;x.config.zero_fee_model_version=ZERO_FEE_MODEL.version;x.config.zero_fee_model='finanzen.net ZERO securities';return true});
}

async function ensureStocksOnlyState(engine){
  const loaded=await engine?.store?.load?.(true),s=loaded?.state;if(!s?.config)return null;
  const nonStocks=(s.positions||[]).filter(p=>!isStock(p)),badCandidates=(s.candidates||[]).some(x=>!isStock(x)),badNews=(s.newsRadar||[]).some(x=>!isStock(x)),needs=num(s.config.include_etfs,0)!==0||num(s.config.include_leverage,0)!==0||nonStocks.length||badCandidates||badNews;
  if(!needs)return null;
  return engine.store.update(state=>{
    state.config.include_etfs=0;state.config.include_leverage=0;state.candidates=(state.candidates||[]).filter(isStock);state.newsRadar=(state.newsRadar||[]).filter(isStock);
    const allPositions=Array.isArray(state.positions)?state.positions:[],remove=allPositions.filter(p=>!isStock(p)),keep=allPositions.filter(isStock);
    if(remove.length){
      const initialCash=num(state.config.cash),removed=remove.map(p=>({p,value:Math.max(0,positionMarketValue(p))})),finalCash=initialCash+removed.reduce((a,x)=>a+x.value,0),finalEquity=finalCash+keep.reduce((a,p)=>a+positionMarketValue(p),0),finalPnl=finalEquity-num(state.config.start_capital);
      state.history=Array.isArray(state.history)?state.history:[];let cash=initialCash,nextId=Math.max(0,...state.history.map(x=>num(x?.id,0)));
      for(const {p,value} of removed){const before=cash,tradePnl=value-num(p.invested)-num(p.entry_fee);cash+=value;state.history.push({id:++nextId,ts:new Date().toISOString(),end_ts:null,event_count:1,start_scan:num(state.config.scan_count),end_scan:num(state.config.scan_count),action:'VERKAUF',symbol:p.symbol,name:p.name,instrument_type:p.instrument_type,amount:value,fee:0,trade_pnl:tradePnl,cash_before:before,cash_after:cash,equity:finalEquity,total_pnl:finalPnl,score:p.score??null,reason:'AKTIEN-ONLY-MIGRATION: Nicht-Aktien-Position zum letzten bekannten Paper-Marktwert glattgestellt; keine neue ETF-Position mehr erlaubt.'})}
      state.positions=keep;state.config.cash=finalCash;
      state.aiLog=Array.isArray(state.aiLog)?state.aiLog:[];const id=num(state.aiLog.at(-1)?.id,0)+1;state.aiLog.push({id,ts:new Date().toISOString(),kind:'SYSTEM',symbol:'',title:'Aktien-only aktiviert',message:`${remove.length} Nicht-Aktien-Position(en) wurden im Paper-Depot zum letzten bekannten Marktwert glattgestellt.`,confidence:null,meta:{stocksOnly:true}});if(state.aiLog.length>300)state.aiLog=state.aiLog.slice(-300);
    }
    return{removedNonStocks:remove.length};
  });
}

function installZeroExecution(engine){
  if(!engine||engine.__zeroFeeInstalled)return;engine.__zeroFeeInstalled=true;
  const baseStart=engine.start.bind(engine),baseScan=engine.scan.bind(engine);
  engine.start=async options=>baseStart({...options,includeEtfs:false,includeLeverage:false,feeFixed:0,feePercent:0});
  engine.scan=async()=>{
    await ensureZeroConfig(engine);await ensureStocksOnlyState(engine);
    const loaded=await engine.store.load(true),before={historyId:lastId(loaded.state?.history),snapshotId:lastId(loaded.state?.snapshots),positions:positionSnapshot(loaded.state)};
    const result=await baseScan();
    if(!result?.aborted&&!result?.skipped){
      const safety=await blockUnsafeFreshBuys(engine,before),sr=safety?.result||null;
      if(sr?.blocked){result.tradeSafety=sr;result.actions=Math.max(0,num(result.actions)-sr.blocked)}
      const rec=await reconcileZeroFees(engine,before),r=rec?.result||null;
      if(r){result.zeroExecution=r;result.equity=r.finalEquity;result.pnl=r.finalPnl;if(r.blockedBuys)result.actions=Math.max(0,num(result.actions)-r.blockedBuys)}
      await ensureStocksOnlyState(engine);
    }
    return result;
  };
}

export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);installZeroExecution(this.engine);
    const guarded=this.engine?.env?.AI;if(guarded?.run)this.engine.env.AI=new StocksOnlyAiGuard(guarded,this.bucketAdapter);
  }
  async start(options={}){const r=await super.start({...options,includeEtfs:false,includeLeverage:false});await ensureStocksOnlyState(this.engine);return r}
  async reset(){const r=await super.reset();await ensureZeroConfig(this.engine);await ensureStocksOnlyState(this.engine);return r}
  async status(){
    await ensureStocksOnlyState(this.engine);
    const s=await super.status(),a=accountingFromStatus(s);
    s.config.include_etfs=0;s.config.include_leverage=0;s.positions=(s.positions||[]).filter(isStock);s.candidates=(s.candidates||[]).filter(isStock);s.newsRadar=(s.newsRadar||[]).filter(isStock);
    s.equity=a.equity;s.pnl=a.pnl;s.pnl_pct=a.pnlPct;s.accounting=a;
    if(s.statistics){s.statistics={...s.statistics,unrealizedPnl:a.unrealizedPnl,realizedPnl:a.ledgerRealizedPnl,historyRealizedPnl:a.historyRealizedPnl,realizedReconciliationDelta:a.realizedReconciliationDelta}}
    if(s.risk)s.risk={...s.risk,equity:a.equity,availableCash:a.cash};
    if(s.snapshots?.length){const x=s.snapshots.at(-1);x.cash=a.cash;x.equity=a.equity}
    if(s.history?.length){const x=s.history[0];x.cash_after=a.cash;x.equity=a.equity;x.total_pnl=a.pnl}
    s.executionModel={...(s.executionModel||{}),feeFixed:0,feePercent:0,brokerFeeModel:ZERO_FEE_MODEL.version,smallOrderThresholdEur:ZERO_FEE_MODEL.smallOrderThresholdEur,smallOrderSurchargeEur:ZERO_FEE_MODEL.smallOrderSurchargeEur,fractionalSurchargeEur:ZERO_FEE_MODEL.fractionalSurchargeEur,fractionalMinEur:ZERO_FEE_MODEL.fractionalMinEur,spreadIsSeparate:true,stocksOnly:true,fullCashPolicy:true,strategicCashReservePct:0,unsafeFallbackBuysBlocked:true,sameScanReentryBlocked:true};
    if(s.brokerTarget){const {fullEtfMasterPool,etfCoreEveryMinute,etfRotatingPerMinute,estimatedEtfRotationMinutes,...b}=s.brokerTarget;s.brokerTarget={...b,assetClass:'EQUITY_ONLY',stocksOnly:true,fullCashPolicy:true,strategicCashReservePct:0,feeModel:ZERO_FEE_MODEL,feesMatchedToZeroRules:true,spreadStillMarketDependent:true,brokerCatalogVerificationRequired:true,exactBrokerCatalog:false}}
    return s;
  }
}
