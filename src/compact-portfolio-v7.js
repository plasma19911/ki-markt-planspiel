import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v6.js';
import {ZERO_FEE_MODEL} from './zero-fee-model.js';
import {accountingFromStatus,lastId,num,positionMarketValue,positionSnapshot,reconcileZeroFees} from './zero-accounting.js';
import {blockUnsafeFreshBuys} from './trade-safety.js';

const STOCK_TYPE='EQUITY';
const isStock=x=>String(x?.type||x?.instrument_type||STOCK_TYPE).toUpperCase()===STOCK_TYPE;
const responseText=r=>String(r?.response||r?.result?.response||'');

function planParts(text){
  const marker='Kandidaten=',heldMarker=' Gehalten=',a=text.indexOf(marker),b=text.indexOf(heldMarker,a+marker.length);if(a<0||b<0)return null;
  try{
    const candidates=JSON.parse(text.slice(a+marker.length,b).trim()),held=JSON.parse(text.slice(b+heldMarker.length).trim());
    return{a,b,marker,heldMarker,candidates:Array.isArray(candidates)?candidates:[],held:Array.isArray(held)?held:[]};
  }catch{return null}
}

function rewriteStockOnlyPlan(text,state){
  const p=planParts(text);if(!p)return text;
  const current=new Map((state?.candidates||[]).filter(isStock).map(x=>[String(x.symbol||'').toUpperCase(),x]));
  const candidates=p.candidates.filter(isStock).map(x=>{
    const live=current.get(String(x.symbol||'').toUpperCase()),price=num(live?.price||x.price,0);
    return{...x,type:STOCK_TYPE,...(price>0?{price:+price.toFixed(6)}:{})};
  });
  const held=p.held.filter(x=>String(x?.type||STOCK_TYPE).toUpperCase()===STOCK_TYPE);
  let out=text.slice(0,p.a+p.marker.length)+JSON.stringify(candidates)+p.heldMarker+JSON.stringify(held);
  out=out
    .replace(/Aktien und normale ETFs/gi,'ausschließlich Aktien')
    .replace(/Aktien \+ normale ETFs/gi,'ausschließlich Aktien')
    .replace(/Aktien sowie normale europaeische UCITS-ETF-Kandidaten/gi,'Aktien')
    .replace(/Erlaubt sind ausschließlich Aktien und normale ETFs\./gi,'Erlaubt sind ausschließlich Aktien. ETFs sind in diesem Planspiel ausgeschlossen.');
  return `${out} AKTIEN-ONLY: BUY ist ausschließlich für Kandidaten type=EQUITY erlaubt. ETF und LEVERAGED_ETF niemals kaufen.`;
}

function allowedStockSymbolsFromInput(input){
  for(const m of input?.messages||[]){const t=String(m?.content||''),p=planParts(t);if(p)return new Set(p.candidates.filter(isStock).map(x=>String(x.symbol||'').toUpperCase()))}
  return new Set();
}

function filterPlanResponseToStocks(r,allowed){
  const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return r;
  try{
    const j=JSON.parse(raw.slice(a,b+1));if(!Array.isArray(j.actions))return r;
    j.actions=j.actions.filter(x=>String(x?.action||'').toUpperCase()!=='BUY'||allowed.has(String(x?.symbol||'').toUpperCase()));
    return{...r,response:JSON.stringify(j)};
  }catch{return r}
}

class StocksOnlyAiGuard{
  constructor(base,adapter){this.base=base;this.adapter=adapter}
  async run(model,input){
    const joined=String(input?.messages?.map(x=>x?.content||'').join('\n')||''),isPlan=joined.includes('JSON-only')&&joined.includes('Kandidaten=');
    if(!isPlan)return this.base.run(model,input);
    const state=this.adapter?.peekState?.();
    const messages=(input.messages||[]).map(m=>String(m?.content||'').includes('Kandidaten=')?{...m,content:rewriteStockOnlyPlan(String(m.content||''),state)}:m);
    const next={...input,messages},allowed=allowedStockSymbolsFromInput(next),r=await this.base.run(model,next);
    return filterPlanResponseToStocks(r,allowed);
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
    s.executionModel={...(s.executionModel||{}),feeFixed:0,feePercent:0,brokerFeeModel:ZERO_FEE_MODEL.version,smallOrderThresholdEur:ZERO_FEE_MODEL.smallOrderThresholdEur,smallOrderSurchargeEur:ZERO_FEE_MODEL.smallOrderSurchargeEur,fractionalSurchargeEur:ZERO_FEE_MODEL.fractionalSurchargeEur,fractionalMinEur:ZERO_FEE_MODEL.fractionalMinEur,spreadIsSeparate:true,stocksOnly:true,unsafeFallbackBuysBlocked:true,sameScanReentryBlocked:true};
    if(s.brokerTarget){const {fullEtfMasterPool,etfCoreEveryMinute,etfRotatingPerMinute,estimatedEtfRotationMinutes,...b}=s.brokerTarget;s.brokerTarget={...b,assetClass:'EQUITY_ONLY',stocksOnly:true,feeModel:ZERO_FEE_MODEL,feesMatchedToZeroRules:true,spreadStillMarketDependent:true,brokerCatalogVerificationRequired:true,exactBrokerCatalog:false}}
    return s;
  }
}
