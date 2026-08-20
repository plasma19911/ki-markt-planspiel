import {normalizeQuoteCurrency} from './quote-currency-units.js';
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>normalizeQuoteCurrency(v);

const COMMON_SCALE_MIN=50;
const COMMON_SCALE_MAX=150;
const COMMON_INVERSE_MIN=.006;
const COMMON_INVERSE_MAX=.02;
const MAX_VALUATION_FACTOR=20;
const MIN_VALUATION_FACTOR=.05;

function scaleAligned(entry,current){
  const e=num(entry),c=num(current);
  if(!(e>0&&c>0))return c;
  const r=c/e;
  if(r>=COMMON_SCALE_MIN&&r<=COMMON_SCALE_MAX)return c/100;
  if(r>=COMMON_INVERSE_MIN&&r<=COMMON_INVERSE_MAX)return c*100;
  return c;
}

function fxBasisMismatch(p,baseCurrency='EUR'){
  const currency=key(p?.currency),base=key(baseCurrency||'EUR'),ep=num(p?.entry_price),lp=num(p?.last_price,ep),ef=num(p?.entry_fx,1),lf=num(p?.last_fx,ef);
  if(!currency||currency===base||!(ep>0&&lp>0&&ef>0&&lf>0))return false;
  const samePriceScale=lp/ep>.35&&lp/ep<2.85;
  return samePriceScale&&Math.abs(ef-1)<1e-9&&Math.abs(lf-1)>.025;
}

function positionValue(p,baseCurrency='EUR'){
  const invested=num(p?.invested),ep=num(p?.entry_price),lp=num(p?.last_price,ep),ef=fxBasisMismatch(p,baseCurrency)?num(p?.last_fx,1):num(p?.entry_fx,1),lf=num(p?.last_fx,ef);
  if(!(invested>=0&&ep>0&&lp>0&&ef>0&&lf>0))return invested;
  return invested*(lp/ep)*(lf/ef);
}

function repairPosition(p,baseCurrency='EUR'){
  const ep=num(p?.entry_price),originalEf=num(p?.entry_fx,1);
  if(!(ep>0&&originalEf>0))return{changed:false,rejected:false,fxBasisRepaired:false};
  const oldPrice=num(p.last_price,ep),oldFx=num(p.last_fx,originalEf);
  let fxBasisRepaired=false;

  // Core/legacy execution can create a foreign-currency position with a native
  // entry price but entry_fx=1. Once the first real FX quote arrives (e.g. SEK
  // ~=0.09 EUR), valuation would instantly look like -91%. Persist the live FX
  // as the missing entry basis. The trade is only minutes old, so current FX is
  // the safest available approximation and massively more accurate than 1.0.
  if(fxBasisMismatch(p,baseCurrency)){
    p.entry_fx=oldFx;
    const pxEur=ep*oldFx,qty=pxEur>0?num(p.invested)/pxEur:0;
    if(qty>0){
      p.zero_quantity=qty;
      p.zero_whole_shares=Math.floor(qty+1e-12);
      p.zero_fractional_shares=Math.max(0,qty-Math.floor(qty+1e-12));
      p.zero_uses_fractional=p.zero_fractional_shares>1e-8;
    }
    p.fx_basis_repaired_at=new Date().toISOString();
    p.fx_basis_repair_reason='FOREIGN_NATIVE_ENTRY_PRICE_WITH_ENTRY_FX_1';
    p.fx_basis_original_entry_fx=originalEf;
    fxBasisRepaired=true;
  }

  const ef=num(p?.entry_fx,1);
  let price=scaleAligned(ep,oldPrice),fx=scaleAligned(ef,oldFx),changed=fxBasisRepaired||Math.abs(price-oldPrice)>1e-10||Math.abs(fx-oldFx)>1e-10,rejected=false;
  let factor=(price/ep)*(fx/ef);

  // Falls der Feed nach der 100x-/FX-Basis-Korrektur immer noch eine in einem
  // 60-Sekunden-Scan unplausible Neubewertung liefert, verwenden wir den letzten
  // nachweislich plausiblen Mark bzw. den Einstieg.
  if(!Number.isFinite(factor)||factor>MAX_VALUATION_FACTOR||factor<MIN_VALUATION_FACTOR){
    const sanePrice=num(p.quote_sanity_last_price,ep),saneFx=num(p.quote_sanity_last_fx,ef);
    price=sanePrice>0?sanePrice:ep;fx=saneFx>0?saneFx:ef;factor=(price/ep)*(fx/ef);changed=true;rejected=true;
  }

  p.last_price=price;
  p.last_fx=fx;
  if(Number.isFinite(factor)&&factor>=MIN_VALUATION_FACTOR&&factor<=MAX_VALUATION_FACTOR){
    p.quote_sanity_last_price=price;
    p.quote_sanity_last_fx=fx;
  }
  if(changed){
    p.quote_sanity_repaired_at=new Date().toISOString();
    p.quote_sanity_reason=fxBasisRepaired?'FOREIGN_FX_ENTRY_BASIS_REPAIRED':rejected?'OUTLIER_REJECTED':'COMMON_100X_SCALE_REPAIRED';
  }
  return{changed,rejected,fxBasisRepaired,oldPrice,oldFx,price,fx,factor};
}

function symbolSuffix(symbol){const s=key(symbol),i=s.lastIndexOf('.');return i>=0?s.slice(i):''}
function repairPhantomForeignFxSells(state,baseCurrency='EUR'){
  const history=Array.isArray(state?.history)?state.history:[],positions=Array.isArray(state?.positions)?state.positions:[];
  if(!history.length)return{repaired:0,cashDelta:0,realizedDelta:0};
  // A currently open position from the same exchange/currency gives us the live
  // FX factor. This is deliberately strict: only a fresh sell that looks like an
  // extra multiplication by exactly that foreign FX factor is repaired.
  const fxBySuffix=new Map();
  for(const p of positions){
    const suffix=symbolSuffix(p?.symbol),currency=key(p?.currency),fx=num(p?.last_fx,1);
    if(!suffix||!currency||currency===key(baseCurrency)||!(fx>0)||Math.abs(fx-1)<.025)continue;
    fxBySuffix.set(suffix,fx);
  }
  if(!fxBySuffix.size)return{repaired:0,cashDelta:0,realizedDelta:0};
  const sorted=[...history].sort((a,b)=>Date.parse(String(a?.ts||''))-Date.parse(String(b?.ts||'')));
  let repaired=0,cashDelta=0,realizedDelta=0;
  for(let i=0;i<sorted.length;i++){
    const h=sorted[i],action=key(h?.action),symbol=key(h?.symbol);if(action!=='VERKAUF'||!symbol||h?.fx_phantom_sell_repaired)continue;
    const m=String(h?.reason||'').match(/P\/L\s+(-?\d+(?:[.,]\d+)?)%/i),reported=m?Number(String(m[1]).replace(',','.')):NaN;
    if(!Number.isFinite(reported)||reported>-70||reported<-97)continue;
    let buy=null;
    for(let j=i-1;j>=0;j--){const x=sorted[j];if(key(x?.symbol)!==symbol)continue;if(key(x?.action)==='KAUF'){buy=x;break}if(key(x?.action)==='VERKAUF')break}
    if(!buy)continue;
    const buyTs=Date.parse(String(buy?.ts||'')),sellTs=Date.parse(String(h?.ts||''));if(!Number.isFinite(buyTs)||!Number.isFinite(sellTs)||sellTs-buyTs<0||sellTs-buyTs>45*60*1000)continue;
    const buyOut=Math.abs(num(buy?.amount)),oldNet=Math.max(0,num(h?.amount)),oldFee=Math.max(0,num(h?.fee)),oldGross=oldNet+oldFee,fx=fxBySuffix.get(symbolSuffix(symbol));
    if(!(buyOut>0&&oldGross>0&&fx>0))continue;
    const rawRatio=oldGross/buyOut;if(rawRatio<.035||rawRatio>.30)continue;
    const priceMoveProxy=rawRatio/fx;if(priceMoveProxy<.65||priceMoveProxy>1.35)continue;
    const correctedGross=oldGross/fx,correctedNet=Math.max(0,correctedGross-oldFee);
    if(correctedNet<buyOut*.65||correctedNet>buyOut*1.35)continue;
    const delta=correctedNet-oldNet,oldTradePnl=num(h?.trade_pnl,oldNet-buyOut),newTradePnl=correctedNet-buyOut,newPct=buyOut?newTradePnl/buyOut*100:0;
    if(!(delta>buyOut*.45))continue;
    h.fx_phantom_sell_repaired=true;h.fx_phantom_sell_repaired_at=new Date().toISOString();h.fx_phantom_sell_original_amount=oldNet;h.fx_phantom_sell_original_trade_pnl=oldTradePnl;h.fx_phantom_sell_fx=fx;
    h.amount=correctedNet;h.trade_pnl=newTradePnl;
    h.reason=`${String(h.reason||'').replace(/P\/L\s+-?\d+(?:[.,]\d+)?%/i,`P/L ${newPct>=0?'+':''}${newPct.toFixed(2)}%`)} · FX-PHANTOM-LOSS repariert: doppelter Fremdwährungsfaktor ${fx.toFixed(6)} aus Verkaufserlös entfernt.`;
    cashDelta+=delta;realizedDelta+=newTradePnl-oldTradePnl;repaired++;
    // Every later ledger/snapshot value inherited the too-small sale proceeds.
    for(const row of history){const ts=Date.parse(String(row?.ts||''));if(Number.isFinite(ts)&&ts>=sellTs){if(Number.isFinite(Number(row?.cash_after)))row.cash_after=num(row.cash_after)+delta;if(Number.isFinite(Number(row?.equity)))row.equity=num(row.equity)+delta;if(Number.isFinite(Number(row?.total_pnl)))row.total_pnl=num(row.total_pnl)+delta}}
    for(const snap of state?.snapshots||[]){const ts=Date.parse(String(snap?.ts||snap?.at||''));if(Number.isFinite(ts)&&ts>=sellTs){if(Number.isFinite(Number(snap?.cash)))snap.cash=num(snap.cash)+delta;if(Number.isFinite(Number(snap?.equity)))snap.equity=num(snap.equity)+delta}}
  }
  if(repaired){
    state.config.cash=Math.max(0,num(state?.config?.cash)+cashDelta);
    if(state.statistics&&Number.isFinite(Number(state.statistics.realizedPnl)))state.statistics.realizedPnl=num(state.statistics.realizedPnl)+realizedDelta;
  }
  return{repaired,cashDelta,realizedDelta};
}

function sanitizeSeries(state,currentEquity,earliestFxRepairAt=null){
  const start=Math.max(1,num(state?.config?.start_capital,1)),baseline=Math.max(start,currentEquity,1),hi=baseline*20,lo=baseline/20;
  let removedSnapshots=0,correctedHistory=0,removedFxSnapshots=0;
  const repairTs=Date.parse(String(earliestFxRepairAt||''));
  if(Array.isArray(state.snapshots)){
    const before=state.snapshots.length;
    state.snapshots=state.snapshots.filter(x=>{
      const e=num(x?.equity,baseline),ts=Date.parse(String(x?.ts||x?.at||x?.created_at||''));
      if(e>0&&(e<lo||e>hi))return false;
      if(Number.isFinite(repairTs)&&Number.isFinite(ts)&&ts>=repairTs&&currentEquity>0&&Math.abs(e/currentEquity-1)>.15){removedFxSnapshots++;return false}
      return true;
    });
    removedSnapshots=before-state.snapshots.length;
    const last=state.snapshots.at(-1);if(last){last.cash=num(state.config?.cash);last.equity=currentEquity}
  }
  if(Array.isArray(state.history)){
    for(const h of state.history){
      const e=num(h?.equity,baseline),ts=Date.parse(String(h?.ts||''));
      const extreme=e>hi||e<lo;
      const fxWindow=Number.isFinite(repairTs)&&Number.isFinite(ts)&&ts>=repairTs&&currentEquity>0&&Math.abs(e/currentEquity-1)>.15;
      if((extreme&&['HALTEN','FEHLER'].includes(String(h?.action||'').toUpperCase()))||fxWindow){
        h.equity=currentEquity;h.total_pnl=currentEquity-start;correctedHistory++;
      }
    }
  }
  return{removedSnapshots,removedFxSnapshots,correctedHistory};
}

export function repairQuoteAnomaliesState(state){
  if(!state||!Array.isArray(state.positions))return{changed:false,repairedPositions:0,rejectedPositions:0,fxBasisRepairs:0,phantomFxSellsRepaired:0,removedSnapshots:0,removedFxSnapshots:0,correctedHistory:0};
  const baseCurrency=key(state?.config?.currency||'EUR');
  let repairedPositions=0,rejectedPositions=0,fxBasisRepairs=0,earliestFxRepairAt=null;
  for(const p of state.positions){
    const r=repairPosition(p,baseCurrency);if(r.changed)repairedPositions++;if(r.rejected)rejectedPositions++;
    if(r.fxBasisRepaired){fxBasisRepairs++;const opened=p?.opened_at||p?.openedAt||p?.fx_basis_repaired_at;if(!earliestFxRepairAt||Date.parse(String(opened))<Date.parse(String(earliestFxRepairAt)))earliestFxRepairAt=opened}
  }
  const phantom=repairPhantomForeignFxSells(state,baseCurrency);
  const currentEquity=num(state?.config?.cash)+state.positions.reduce((a,p)=>a+positionValue(p,baseCurrency),0),series=sanitizeSeries(state,currentEquity,earliestFxRepairAt),changed=repairedPositions>0||phantom.repaired>0||series.removedSnapshots>0||series.correctedHistory>0;
  if(changed){
    state.aiLog=Array.isArray(state.aiLog)?state.aiLog:[];
    const prev=state.aiLog.at(-1),msg=`Quote-Sanity: ${repairedPositions} Position(en) korrigiert, davon ${fxBasisRepairs} FX-Einstiegsbasis repariert, ${phantom.repaired} bereits verbuchte FX-Phantom-Verkäufe korrigiert, ${rejectedPositions} extremer Feed-Ausreißer verworfen, ${series.removedSnapshots} fehlerhafte Depot-Snapshot(s) entfernt.`;
    if(prev?.title!=='Kurs-/FX-Ausreißer korrigiert'||prev?.message!==msg){
      state.aiLog.push({id:num(prev?.id)+1,ts:new Date().toISOString(),kind:'SYSTEM',symbol:'',title:'Kurs-/FX-Ausreißer korrigiert',message:msg,confidence:null,meta:{quoteSanity:true,repairedPositions,fxBasisRepairs,phantomFxSellsRepaired:phantom.repaired,phantomFxCashDelta:phantom.cashDelta,rejectedPositions,...series}});
      if(state.aiLog.length>300)state.aiLog=state.aiLog.slice(-300);
    }
  }
  return{changed,repairedPositions,fxBasisRepairs,phantomFxSellsRepaired:phantom.repaired,phantomFxCashDelta:phantom.cashDelta,rejectedPositions,currentEquity,...series};
}

export function sanitizeHeldPromptPositions(held,state){
  const baseCurrency=key(state?.config?.currency||'EUR'),map=new Map((state?.positions||[]).map(p=>[String(p?.symbol||'').toUpperCase(),p]));
  return (Array.isArray(held)?held:[]).map(h=>{
    const pnl=num(h?.pnlPct),p=map.get(String(h?.symbol||'').toUpperCase());
    if(p&&fxBasisMismatch(p,baseCurrency)){
      const ep=num(p.entry_price),lp=num(p.last_price,ep),fee=num(p.entry_fee),invested=Math.max(1e-9,num(p.invested));
      const safePnl=ep>0?(lp/ep-1)*100-fee/invested*100:0;
      return{...h,pnlPct:+safePnl.toFixed(3),peakPnlPct:+Math.max(safePnl,0).toFixed(3),givebackPct:0,quoteSanity:'foreign FX entry basis repaired for AI prompt'};
    }
    if(Math.abs(pnl)<=500)return h;
    let safePnl=0;
    if(p&&num(p.invested)>0){const v=positionValue(p,baseCurrency);safePnl=(v/num(p.invested)-1)*100;if(!Number.isFinite(safePnl)||Math.abs(safePnl)>500)safePnl=0}
    return{...h,pnlPct:+safePnl.toFixed(3),peakPnlPct:+Math.max(safePnl,0).toFixed(3),givebackPct:0,quoteSanity:'extreme prompt P/L replaced before AI decision'};
  });
}
