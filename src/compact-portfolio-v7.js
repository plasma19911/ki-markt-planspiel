import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v6.js';
import {ZERO_FEE_MODEL} from './zero-fee-model.js';
import {accountingFromStatus,lastId,num,positionSnapshot,reconcileZeroFees} from './zero-accounting.js';
import {blockUnsafeFreshBuys} from './trade-safety.js';
import {ZERO_ETF_MASTER_COUNT,ZERO_ETF_ALWAYS_COUNT,ZERO_ETF_ROTATING_PER_MINUTE} from './constants.js';

async function ensureZeroConfig(engine){
  const loaded=await engine?.store?.load?.(true);const s=loaded?.state;
  if(!s?.config)return;
  if(num(s.config.fee_fixed,0)===0&&num(s.config.fee_percent,0)===0&&s.config.zero_fee_model_version===ZERO_FEE_MODEL.version)return;
  await engine.store.update(x=>{x.config.fee_fixed=0;x.config.fee_percent=0;x.config.zero_fee_model_version=ZERO_FEE_MODEL.version;x.config.zero_fee_model='finanzen.net ZERO securities';return true});
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
      const safety=await blockUnsafeFreshBuys(engine,before),sr=safety?.result||null;
      if(sr?.blocked){result.tradeSafety=sr;result.actions=Math.max(0,num(result.actions)-sr.blocked)}
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
    s.executionModel={...(s.executionModel||{}),feeFixed:0,feePercent:0,brokerFeeModel:ZERO_FEE_MODEL.version,smallOrderThresholdEur:ZERO_FEE_MODEL.smallOrderThresholdEur,smallOrderSurchargeEur:ZERO_FEE_MODEL.smallOrderSurchargeEur,fractionalSurchargeEur:ZERO_FEE_MODEL.fractionalSurchargeEur,fractionalMinEur:ZERO_FEE_MODEL.fractionalMinEur,spreadIsSeparate:true,wholeShareEtfs:true,unsafeFallbackBuysBlocked:true,sameScanReentryBlocked:true};
    if(s.brokerTarget)s.brokerTarget={...s.brokerTarget,feeModel:ZERO_FEE_MODEL,feesMatchedToZeroRules:true,spreadStillMarketDependent:true,fullEtfMasterPool:ZERO_ETF_MASTER_COUNT,etfCoreEveryMinute:ZERO_ETF_ALWAYS_COUNT,etfRotatingPerMinute:Math.min(ZERO_ETF_ROTATING_PER_MINUTE,Math.max(0,ZERO_ETF_MASTER_COUNT-ZERO_ETF_ALWAYS_COUNT)),estimatedEtfRotationMinutes:ZERO_ETF_MASTER_COUNT>ZERO_ETF_ALWAYS_COUNT?Math.ceil((ZERO_ETF_MASTER_COUNT-ZERO_ETF_ALWAYS_COUNT)/ZERO_ETF_ROTATING_PER_MINUTE):1,brokerCatalogVerificationRequired:true,exactBrokerCatalog:false};
    return s;
  }
}
