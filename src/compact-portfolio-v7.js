import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v6.js';
import {ZERO_FEE_MODEL,zeroAffordableBuy,zeroOrderFee} from './zero-fee-model.js';
import {ZERO_ETF_MASTER_COUNT,ZERO_ETF_ALWAYS_COUNT,ZERO_ETF_ROTATING_PER_MINUTE} from './constants.js';

const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

function positionQuantity(p){
  const stored=num(p?.zero_quantity,0);if(stored>0)return stored;
  const priceBase=num(p?.entry_price)*num(p?.entry_fx,1);return priceBase>0?num(p?.invested)/priceBase:0;
}
function positionMarketValue(p,price=p?.last_price,fx=p?.last_fx){
  const invested=num(p?.invested),entryPrice=num(p?.entry_price),entryFx=num(p?.entry_fx,1);
  if(!(entryPrice>0))return invested;
  return invested*(num(price)/entryPrice)*(num(fx,1)/entryFx);
}
function positionSnapshot(state){const m=new Map();for(const p of state?.positions||[])m.set(String(p.symbol||'').toUpperCase(),{...p,zero_quantity:positionQuantity(p)});return m}
function lastId(rows){return Math.max(0,...(rows||[]).map(x=>num(x?.id,0)))}
function accountingFromStatus(s){
  const cash=num(s?.config?.cash),marketValue=(s?.positions||[]).reduce((a,p)=>a+positionMarketValue(p),0),openCostBasis=(s?.positions||[]).reduce((a,p)=>a+num(p?.invested),0),openEntryFees=(s?.positions||[]).reduce((a,p)=>a+num(p?.entry_fee),0),equity=cash+marketValue,start=num(s?.config?.start_capital),pnl=equity-start,unrealized=(s?.positions||[]).reduce((a,p)=>a+positionMarketValue(p)-num(p?.invested)-num(p?.entry_fee),0),historyRealized=num(s?.statistics?.realizedPnl),ledgerRealized=pnl-unrealized;
  return{cash,marketValue,openCostBasis,openEntryFees,equity,pnl,pnlPct:start?(equity/start-1)*100:0,unrealizedPnl:unrealized,ledgerRealizedPnl:ledgerRealized,historyRealizedPnl:historyRealized,realizedReconciliationDelta:ledgerRealized-historyRealized,totalFees:num(s?.config?.total_fees),identityDelta:equity-(cash+marketValue)};
}

async function ensureZeroConfig(engine){
  const loaded=await engine?.store?.load?.(true);const s=loaded?.state;
  if(!s?.config)return;
  if(num(s.config.fee_fixed,0)===0&&num(s.config.fee_percent,0)===0&&s.config.zero_fee_model_version===ZERO_FEE_MODEL.version)return;
  await engine.store.update(x=>{x.config.fee_fixed=0;x.config.fee_percent=0;x.config.zero_fee_model_version=ZERO_FEE_MODEL.version;x.config.zero_fee_model='finanzen.net ZERO securities';return true});
}

export async function reconcileZeroFees(engine,before){
  const loaded=await engine?.store?.load?.(true),state=loaded?.state;if(!state)return null;
  const fresh=(state.history||[]).filter(h=>num(h.id)>before.historyId);
  if(!fresh.some(h=>h.action==='KAUF'||h.action==='VERKAUF'))return null;
  return engine.store.update(s=>{
    const rows=(s.history||[]).filter(h=>num(h.id)>before.historyId).sort((a,b)=>num(a.id)-num(b.id));
    let cashCorrection=0,equityCorrection=0,feeCorrection=0,blockedBuys=0,reconciledBuys=0,reconciledSells=0;
    const currentBySymbol=new Map((s.positions||[]).map(p=>[String(p.symbol||'').toUpperCase(),p]));
    for(const h of rows){
      if(h.action==='KAUF'){
        const symbol=String(h.symbol||'').toUpperCase(),p=currentBySymbol.get(symbol),oldFee=num(h.fee),baseNotional=Math.max(0,Math.abs(num(h.amount))-oldFee),baseOutflow=baseNotional+oldFee;
        const priceBase=p?num(p.entry_price)*num(p.entry_fx,1):0;
        if(p&&baseNotional>0&&priceBase>0){
          const oldPositionValue=positionMarketValue(p),type=String(p.instrument_type||'EQUITY').toUpperCase(),fractionalAllowed=type!=='ETF';
          const fill=zeroAffordableBuy({budgetEur:baseOutflow,priceEur:priceBase,instrumentType:type,fractionalAllowed});
          if(!fill.ok){
            const i=s.positions.indexOf(p);if(i>=0)s.positions.splice(i,1);currentBySymbol.delete(symbol);
            const deltaCash=baseOutflow,deltaEquity=deltaCash-oldPositionValue;
            cashCorrection+=deltaCash;equityCorrection+=deltaEquity;feeCorrection-=oldFee;blockedBuys++;
            h.action='KAUF_BLOCKIERT_ZERO';h.amount=0;h.fee=0;h.trade_pnl=null;h.zero_fee_model_version=ZERO_FEE_MODEL.version;
            h.reason=`${String(h.reason||'').replace(/ · Gebühr [^·]+/,'')} · ZERO: keine ausführbare Einheit innerhalb des Budgets; Kauf rückgängig gemacht.`;
            const id=num(s.aiLog?.at(-1)?.id,0)+1;s.aiLog.push({id,ts:new Date().toISOString(),kind:'SYSTEM',symbol,title:'ZERO-Ausführung blockiert',message:`${symbol}: keine ausführbare Einheit innerhalb des vorgesehenen Budgets.`,confidence:null,meta:{feeModel:ZERO_FEE_MODEL.version}});if(s.aiLog.length>300)s.aiLog=s.aiLog.slice(-300);
          }else{
            const fee=fill.fee,actualOut=fill.notional+fee,deltaCash=baseOutflow-actualOut;
            p.invested=fill.notional;p.entry_fee=fee;p.zero_quantity=fill.quantity;p.zero_whole_shares=fill.feeInfo?.wholeQuantity||0;p.zero_fractional_shares=fill.feeInfo?.fractionalQuantity||0;p.zero_uses_fractional=Boolean(fill.usesFractional);p.zero_fee_model_version=ZERO_FEE_MODEL.version;
            const newPositionValue=positionMarketValue(p),deltaEquity=deltaCash+newPositionValue-oldPositionValue;
            cashCorrection+=deltaCash;equityCorrection+=deltaEquity;feeCorrection+=fee-oldFee;reconciledBuys++;
            h.amount=-actualOut;h.fee=fee;h.zero_fee_model_version=ZERO_FEE_MODEL.version;h.zero_fee_details=fill.feeInfo;
            h.reason=`${String(h.reason||'').replace(/ · Gebühr [^·]+/,'')} · ZERO Brokergebühr ${fee.toFixed(2)} €${fill.usesFractional?' inkl. Bruchstück-Zuschlag':''}; Spread/Ausführung separat.`;
          }
        }
      }else if(h.action==='VERKAUF'){
        const symbol=String(h.symbol||'').toUpperCase(),p=before.positions.get(symbol),oldFee=num(h.fee),gross=Math.max(0,num(h.amount)+oldFee),qty=num(p?.zero_quantity,positionQuantity(p));
        if(p&&gross>0&&qty>0){
          const priceBase=gross/qty,type=String(p.instrument_type||'EQUITY').toUpperCase(),fractionalAllowed=type!=='ETF';
          const info=zeroOrderFee({notionalEur:gross,priceEur:priceBase,quantity:qty,instrumentType:type,fractionalAllowed}),fee=info.total,deltaCash=oldFee-fee;
          cashCorrection+=deltaCash;equityCorrection+=deltaCash;feeCorrection+=fee-oldFee;reconciledSells++;
          h.amount=Math.max(0,gross-fee);h.fee=fee;h.trade_pnl=num(h.trade_pnl)+deltaCash;h.zero_fee_model_version=ZERO_FEE_MODEL.version;h.zero_fee_details=info;
          h.reason=`${String(h.reason||'').replace(/ · Gebühr [^·]+/,'')} · ZERO Brokergebühr ${fee.toFixed(2)} €${info.usesFractional?' inkl. Bruchstück-Zuschlag':''}; Spread/Ausführung separat.`;
        }
      }
      if(Number.isFinite(Number(h.cash_after)))h.cash_after=num(h.cash_after)+cashCorrection;
      if(Number.isFinite(Number(h.equity)))h.equity=num(h.equity)+equityCorrection;
      if(Number.isFinite(Number(h.total_pnl)))h.total_pnl=num(h.total_pnl)+equityCorrection;
    }
    s.config.cash=Math.max(0,num(s.config.cash)+cashCorrection);s.config.total_fees=Math.max(0,num(s.config.total_fees)+feeCorrection);s.config.fee_fixed=0;s.config.fee_percent=0;s.config.zero_fee_model_version=ZERO_FEE_MODEL.version;
    for(const snap of s.snapshots||[])if(num(snap.id)>before.snapshotId){snap.cash=Math.max(0,num(snap.cash)+cashCorrection);snap.equity=num(snap.equity)+equityCorrection}
    const finalEquity=num(s.config.cash)+(s.positions||[]).reduce((a,p)=>a+positionMarketValue(p),0),finalPnl=finalEquity-num(s.config.start_capital);
    const lastHistory=s.history?.at(-1);if(lastHistory&&num(lastHistory.id)>before.historyId){lastHistory.cash_after=num(s.config.cash);lastHistory.equity=finalEquity;lastHistory.total_pnl=finalPnl}
    const lastSnapshot=s.snapshots?.at(-1);if(lastSnapshot&&num(lastSnapshot.id)>before.snapshotId){lastSnapshot.cash=num(s.config.cash);lastSnapshot.equity=finalEquity}
    return{cashCorrection,equityCorrection,feeCorrection,blockedBuys,reconciledBuys,reconciledSells,finalEquity,finalPnl};
  });
}

function installZeroExecution(engine){
  if(!engine||engine.__zeroFeeInstalled)return;engine.__zeroFeeInstalled=true;
  const baseStart=engine.start.bind(engine),baseScan=engine.scan.bind(engine);
  engine.start=async options=>baseStart({...options,feeFixed:0,feePercent:0});
  engine.scan=async()=>{
    await ensureZeroConfig(engine);
    const loaded=await engine.store.load(true),before={historyId:lastId(loaded.state?.history),snapshotId:lastId(loaded.state?.snapshots),positions:positionSnapshot(loaded.state)};
    const result=await baseScan();
    if(!result?.aborted&&!result?.skipped){
      const rec=await reconcileZeroFees(engine,before),r=rec?.result||null;
      if(r){result.zeroExecution=r;result.equity=r.finalEquity;result.pnl=r.finalPnl;if(r.blockedBuys)result.actions=Math.max(0,num(result.actions)-r.blockedBuys)}
    }
    return result;
  };
}

export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){super(ctx,env);installZeroExecution(this.engine)}
  async reset(){const r=await super.reset();await ensureZeroConfig(this.engine);return r}
  async status(){
    const s=await super.status(),a=accountingFromStatus(s);
    s.equity=a.equity;s.pnl=a.pnl;s.pnl_pct=a.pnlPct;s.accounting=a;
    if(s.statistics){s.statistics={...s.statistics,unrealizedPnl:a.unrealizedPnl,realizedPnl:a.ledgerRealizedPnl,historyRealizedPnl:a.historyRealizedPnl,realizedReconciliationDelta:a.realizedReconciliationDelta}}
    if(s.risk)s.risk={...s.risk,equity:a.equity,availableCash:a.cash};
    if(s.snapshots?.length){const x=s.snapshots.at(-1);x.cash=a.cash;x.equity=a.equity}
    if(s.history?.length){const x=s.history[0];x.cash_after=a.cash;x.equity=a.equity;x.total_pnl=a.pnl}
    s.executionModel={...(s.executionModel||{}),feeFixed:0,feePercent:0,brokerFeeModel:ZERO_FEE_MODEL.version,smallOrderThresholdEur:ZERO_FEE_MODEL.smallOrderThresholdEur,smallOrderSurchargeEur:ZERO_FEE_MODEL.smallOrderSurchargeEur,fractionalSurchargeEur:ZERO_FEE_MODEL.fractionalSurchargeEur,fractionalMinEur:ZERO_FEE_MODEL.fractionalMinEur,spreadIsSeparate:true,wholeShareEtfs:true};
    if(s.brokerTarget)s.brokerTarget={...s.brokerTarget,feeModel:ZERO_FEE_MODEL,feesMatchedToZeroRules:true,spreadStillMarketDependent:true,fullEtfMasterPool:ZERO_ETF_MASTER_COUNT,etfCoreEveryMinute:ZERO_ETF_ALWAYS_COUNT,etfRotatingPerMinute:Math.min(ZERO_ETF_ROTATING_PER_MINUTE,Math.max(0,ZERO_ETF_MASTER_COUNT-ZERO_ETF_ALWAYS_COUNT)),estimatedEtfRotationMinutes:ZERO_ETF_MASTER_COUNT>ZERO_ETF_ALWAYS_COUNT?Math.ceil((ZERO_ETF_MASTER_COUNT-ZERO_ETF_ALWAYS_COUNT)/ZERO_ETF_ROTATING_PER_MINUTE):1,brokerCatalogVerificationRequired:true,exactBrokerCatalog:false};
    return s;
  }
}
