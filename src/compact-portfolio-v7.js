import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v6.js';
import {ZERO_FEE_MODEL,zeroAffordableBuy,zeroOrderFee} from './zero-fee-model.js';
import {ZERO_ETF_MASTER_COUNT,ZERO_ETF_ALWAYS_COUNT,ZERO_ETF_ROTATING_PER_MINUTE} from './constants.js';

const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

function positionQuantity(p){
  const stored=num(p?.zero_quantity,0);if(stored>0)return stored;
  const priceBase=num(p?.entry_price)*num(p?.entry_fx,1);return priceBase>0?num(p?.invested)/priceBase:0;
}
function positionSnapshot(state){const m=new Map();for(const p of state?.positions||[])m.set(String(p.symbol||'').toUpperCase(),{...p,zero_quantity:positionQuantity(p)});return m}
function lastId(rows){return Math.max(0,...(rows||[]).map(x=>num(x?.id,0)))}

async function ensureZeroConfig(engine){
  const loaded=await engine?.store?.load?.(true);const s=loaded?.state;
  if(!s?.config)return;
  if(num(s.config.fee_fixed,0)===0&&num(s.config.fee_percent,0)===0&&s.config.zero_fee_model_version===ZERO_FEE_MODEL.version)return;
  await engine.store.update(x=>{x.config.fee_fixed=0;x.config.fee_percent=0;x.config.zero_fee_model_version=ZERO_FEE_MODEL.version;x.config.zero_fee_model='finanzen.net ZERO securities';return true});
}

async function reconcileZeroFees(engine,before){
  const loaded=await engine?.store?.load?.(true),state=loaded?.state;if(!state)return null;
  const fresh=(state.history||[]).filter(h=>num(h.id)>before.historyId);
  if(!fresh.some(h=>h.action==='KAUF'||h.action==='VERKAUF'))return null;
  return engine.store.update(s=>{
    const rows=(s.history||[]).filter(h=>num(h.id)>before.historyId).sort((a,b)=>num(a.id)-num(b.id));
    let cashDelta=0,equityDelta=0,addedFees=0;
    const currentBySymbol=new Map((s.positions||[]).map(p=>[String(p.symbol||'').toUpperCase(),p]));
    for(const h of rows){
      if(h.action==='KAUF'){
        const symbol=String(h.symbol||'').toUpperCase(),p=currentBySymbol.get(symbol),budget=Math.max(0,Math.abs(num(h.amount))-num(h.fee));
        const priceBase=p?num(p.entry_price)*num(p.entry_fx,1):0;
        if(p&&budget>0&&priceBase>0){
          const type=String(p.instrument_type||'EQUITY').toUpperCase(),fractionalAllowed=type!=='ETF';
          const fill=zeroAffordableBuy({budgetEur:budget,priceEur:priceBase,instrumentType:type,fractionalAllowed});
          if(!fill.ok){
            const i=s.positions.indexOf(p);if(i>=0)s.positions.splice(i,1);currentBySymbol.delete(symbol);
            cashDelta+=budget;
            h.action='KAUF_BLOCKIERT_ZERO';h.amount=0;h.fee=0;h.trade_pnl=null;h.zero_fee_model_version=ZERO_FEE_MODEL.version;
            h.reason=`${String(h.reason||'').replace(/ · Gebühr [^·]+/,'')} · ZERO: keine ganze ETF-Einheit innerhalb des Budgets; Kauf rückgängig gemacht.`;
          }else{
            const fee=fill.fee,actualOut=fill.notional+fee,refund=Math.max(0,budget-actualOut);
            p.invested=fill.notional;p.entry_fee=fee;p.zero_quantity=fill.quantity;p.zero_whole_shares=fill.feeInfo?.wholeQuantity||0;p.zero_fractional_shares=fill.feeInfo?.fractionalQuantity||0;p.zero_uses_fractional=Boolean(fill.usesFractional);p.zero_fee_model_version=ZERO_FEE_MODEL.version;
            cashDelta+=refund;equityDelta-=fee;addedFees+=fee;
            h.amount=-actualOut;h.fee=fee;h.zero_fee_model_version=ZERO_FEE_MODEL.version;h.zero_fee_details=fill.feeInfo;
            h.reason=`${String(h.reason||'').replace(/ · Gebühr [^·]+/,'')} · ZERO Brokergebühr ${fee.toFixed(2)} €${fill.usesFractional?' inkl. Bruchstück-Zuschlag':''}; Spread/Ausführung separat.`;
          }
        }
      }else if(h.action==='VERKAUF'){
        const symbol=String(h.symbol||'').toUpperCase(),p=before.positions.get(symbol),oldFee=num(h.fee),gross=Math.max(0,num(h.amount)+oldFee),qty=num(p?.zero_quantity,positionQuantity(p));
        if(p&&gross>0&&qty>0){
          const priceBase=gross/qty,type=String(p.instrument_type||'EQUITY').toUpperCase(),fractionalAllowed=type!=='ETF';
          const info=zeroOrderFee({notionalEur:gross,priceEur:priceBase,quantity:qty,instrumentType:type,fractionalAllowed}),fee=info.total;
          cashDelta-=fee;equityDelta-=fee;addedFees+=Math.max(0,fee-oldFee);
          h.amount=Math.max(0,gross-fee);h.fee=fee;h.trade_pnl=num(h.trade_pnl)-Math.max(0,fee-oldFee);h.zero_fee_model_version=ZERO_FEE_MODEL.version;h.zero_fee_details=info;
          h.reason=`${String(h.reason||'').replace(/ · Gebühr [^·]+/,'')} · ZERO Brokergebühr ${fee.toFixed(2)} €${info.usesFractional?' inkl. Bruchstück-Zuschlag':''}; Spread/Ausführung separat.`;
        }
      }
      if(Number.isFinite(Number(h.cash_after)))h.cash_after=num(h.cash_after)+cashDelta;
      if(Number.isFinite(Number(h.equity)))h.equity=num(h.equity)+equityDelta;
      if(Number.isFinite(Number(h.total_pnl)))h.total_pnl=num(h.total_pnl)+equityDelta;
    }
    s.config.cash=Math.max(0,num(s.config.cash)+cashDelta);s.config.total_fees=Math.max(0,num(s.config.total_fees)+addedFees);s.config.fee_fixed=0;s.config.fee_percent=0;s.config.zero_fee_model_version=ZERO_FEE_MODEL.version;
    for(const snap of s.snapshots||[])if(num(snap.id)>before.snapshotId){snap.cash=Math.max(0,num(snap.cash)+cashDelta);snap.equity=num(snap.equity)+equityDelta}
    return{cashDelta,equityDelta,addedFees};
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
    if(!result?.aborted&&!result?.skipped)await reconcileZeroFees(engine,before);
    return result;
  };
}

export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){super(ctx,env);installZeroExecution(this.engine)}
  async status(){
    const s=await super.status();
    s.executionModel={...(s.executionModel||{}),feeFixed:0,feePercent:0,brokerFeeModel:ZERO_FEE_MODEL.version,smallOrderThresholdEur:ZERO_FEE_MODEL.smallOrderThresholdEur,smallOrderSurchargeEur:ZERO_FEE_MODEL.smallOrderSurchargeEur,fractionalSurchargeEur:ZERO_FEE_MODEL.fractionalSurchargeEur,spreadIsSeparate:true,wholeShareEtfs:true};
    if(s.brokerTarget)s.brokerTarget={...s.brokerTarget,feeModel:ZERO_FEE_MODEL,feesMatchedToZeroRules:true,spreadStillMarketDependent:true,fullEtfMasterPool:ZERO_ETF_MASTER_COUNT,etfCoreEveryMinute:ZERO_ETF_ALWAYS_COUNT,etfRotatingPerMinute:Math.min(ZERO_ETF_ROTATING_PER_MINUTE,Math.max(0,ZERO_ETF_MASTER_COUNT-ZERO_ETF_ALWAYS_COUNT)),estimatedEtfRotationMinutes:ZERO_ETF_MASTER_COUNT>ZERO_ETF_ALWAYS_COUNT?Math.ceil((ZERO_ETF_MASTER_COUNT-ZERO_ETF_ALWAYS_COUNT)/ZERO_ETF_ROTATING_PER_MINUTE):1,brokerCatalogVerificationRequired:true,exactBrokerCatalog:false};
    return s;
  }
}
