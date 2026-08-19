import {ZERO_FEE_MODEL,zeroAffordableBuy,zeroOrderFee} from './zero-fee-model.js';

export const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

const key=v=>String(v||'').trim().toUpperCase();
function foreignFxBasisMismatch(p,price=p?.last_price,fx=p?.last_fx,baseCurrency='EUR'){
  const currency=key(p?.currency),base=key(baseCurrency||'EUR'),ep=num(p?.entry_price),lp=num(price,ep),ef=num(p?.entry_fx,1),lf=num(fx,ef);
  if(!currency||currency===base||!(ep>0&&lp>0&&ef>0&&lf>0))return false;
  const samePriceScale=lp/ep>.35&&lp/ep<2.85;
  return samePriceScale&&Math.abs(ef-1)<1e-9&&Math.abs(lf-1)>.025;
}
function effectiveEntryFx(p,price=p?.last_price,fx=p?.last_fx,baseCurrency='EUR'){
  const ef=num(p?.entry_fx,1),lf=num(fx,ef);
  // Legacy/base-engine positions could store a native-currency entry price while
  // entry_fx stayed at 1. As soon as the live quote carries the real FX rate this
  // would fake losses around -90% (SEK, JPY etc.). For valuation, use the live FX
  // as the entry basis until the persisted position is repaired by quote-sanity.
  return foreignFxBasisMismatch(p,price,fx,baseCurrency)?lf:ef;
}

function zeroBlockExplanation(fill,budget,price,type){
  const code=String(fill?.reason||'UNKNOWN');
  let text='keine ausführbare Einheit innerhalb des vorgesehenen Budgets';
  if(code==='NO_BUDGET_OR_PRICE')text='Budget oder umgerechneter EUR-Kurs fehlt bzw. ist 0';
  else if(code==='ZERO_MINIMUM_NOT_AFFORDABLE')text='Budget reicht nicht für das kleinste zulässige Aktien-Bruchstück plus ZERO-Bruchstückgebühr';
  else if(code==='WHOLE_SHARE_NOT_AFFORDABLE')text='Budget reicht nicht für eine ganze handelbare Einheit inklusive ZERO-Gebühr';
  return `${text} · Budget ${num(budget).toFixed(2)} € · Kurs ${num(price).toFixed(4)} €/Stk. · Typ ${String(type||'EQUITY')} · ZERO-Code ${code}`;
}

export function positionQuantity(p){
  const stored=num(p?.zero_quantity,0),entryFx=effectiveEntryFx(p,p?.last_price,p?.last_fx,'EUR');
  if(stored>0&&!foreignFxBasisMismatch(p,p?.last_price,p?.last_fx,'EUR'))return stored;
  const priceBase=num(p?.entry_price)*entryFx;return priceBase>0?num(p?.invested)/priceBase:0;
}
export function positionMarketValue(p,price=p?.last_price,fx=p?.last_fx){
  const invested=num(p?.invested),entryPrice=num(p?.entry_price),entryFx=effectiveEntryFx(p,price,fx,'EUR');
  if(!(entryPrice>0))return invested;
  return invested*(num(price)/entryPrice)*(num(fx,1)/entryFx);
}
export function positionSnapshot(state){const m=new Map();for(const p of state?.positions||[])m.set(String(p.symbol||'').toUpperCase(),{...p,zero_quantity:positionQuantity(p)});return m}
export function lastId(rows){return Math.max(0,...(rows||[]).map(x=>num(x?.id,0)))}
export function accountingFromStatus(s){
  const cash=num(s?.config?.cash),marketValue=(s?.positions||[]).reduce((a,p)=>a+positionMarketValue(p),0),openCostBasis=(s?.positions||[]).reduce((a,p)=>a+num(p?.invested),0),openEntryFees=(s?.positions||[]).reduce((a,p)=>a+num(p?.entry_fee),0),equity=cash+marketValue,start=num(s?.config?.start_capital),pnl=equity-start,unrealized=(s?.positions||[]).reduce((a,p)=>a+positionMarketValue(p)-num(p?.invested)-num(p?.entry_fee),0),historyRealized=num(s?.statistics?.realizedPnl),ledgerRealized=pnl-unrealized;
  return{cash,marketValue,openCostBasis,openEntryFees,equity,pnl,pnlPct:start?(equity/start-1)*100:0,unrealizedPnl:unrealized,ledgerRealizedPnl:ledgerRealized,historyRealizedPnl:historyRealized,realizedReconciliationDelta:ledgerRealized-historyRealized,totalFees:num(s?.config?.total_fees),identityDelta:equity-(cash+marketValue)};
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
        const priceBase=p?num(p.entry_price)*effectiveEntryFx(p,p.last_price,p.last_fx,'EUR'):0;
        if(p&&baseNotional>0&&priceBase>0){
          const oldPositionValue=positionMarketValue(p),type=String(p.instrument_type||'EQUITY').toUpperCase(),fractionalAllowed=type!=='ETF';
          const fill=zeroAffordableBuy({budgetEur:baseOutflow,priceEur:priceBase,instrumentType:type,fractionalAllowed});
          if(!fill.ok){
            const i=s.positions.indexOf(p);if(i>=0)s.positions.splice(i,1);currentBySymbol.delete(symbol);
            const deltaCash=baseOutflow,deltaEquity=deltaCash-oldPositionValue,detail=zeroBlockExplanation(fill,baseOutflow,priceBase,type);
            cashCorrection+=deltaCash;equityCorrection+=deltaEquity;feeCorrection-=oldFee;blockedBuys++;
            h.action='KAUF_BLOCKIERT_ZERO';h.amount=0;h.fee=0;h.trade_pnl=null;h.zero_fee_model_version=ZERO_FEE_MODEL.version;
            h.zero_block_details={code:String(fill?.reason||'UNKNOWN'),budgetEur:+baseOutflow.toFixed(6),priceEur:+priceBase.toFixed(6),instrumentType:type,fractionalAllowed};
            h.reason=`${String(h.reason||'').replace(/ · Gebühr [^·]+/,'')} · ZERO: ${detail}; Kauf rückgängig gemacht.`;
            const id=num(s.aiLog?.at(-1)?.id,0)+1;s.aiLog.push({id,ts:new Date().toISOString(),kind:'SYSTEM',symbol,title:'ZERO-Ausführung blockiert',message:`${symbol}: ${detail}.`,confidence:null,meta:{feeModel:ZERO_FEE_MODEL.version,code:String(fill?.reason||'UNKNOWN'),budgetEur:+baseOutflow.toFixed(6),priceEur:+priceBase.toFixed(6),instrumentType:type,fractionalAllowed}});if(s.aiLog.length>300)s.aiLog=s.aiLog.slice(-300);
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
