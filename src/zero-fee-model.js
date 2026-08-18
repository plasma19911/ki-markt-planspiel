const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const EPS=1e-9;

export const ZERO_FEE_MODEL={
  version:'zero-securities-2026-08-v4-stock-full-cash',
  standardOrderFeeEur:0,
  smallOrderThresholdEur:500,
  smallOrderSurchargeEur:1,
  fractionalSurchargeEur:1,
  fractionalMinEur:1,
  fractionalStocksOnly:true,
  fractionalExecution:'once daily from 15:00; orders after 14:45 next trading day',
  note:'Brokergebühren nach ZERO-Regeln. Marktspread/Preisdifferenz ist separat und keine Brokergebühr. Im Aktien-Planspiel hat vollständige Cash-Auslastung Vorrang vor dem absichtlichen Zurückhalten von Restcash; Bruchstücke werden genutzt, wenn sie das vorgesehene Budget besser ausschöpfen.'
};

export function zeroOrderFee({notionalEur=0,priceEur=0,quantity=null,instrumentType='EQUITY',fractionalAllowed=true}={}){
  const notional=Math.max(0,num(notionalEur)),price=Math.max(0,num(priceEur));
  if(!(notional>0))return{total:0,wholeOrderFee:0,fractionalFee:0,wholeQuantity:0,fractionalQuantity:0,usesFractional:false,fractionalOrderValue:0};
  let qty=quantity==null?(price>0?notional/price:0):Math.max(0,num(quantity));
  if(!(qty>0)&&price>0)qty=notional/price;
  const whole=Math.floor(qty+EPS),fraction=Math.max(0,qty-whole),stock=String(instrumentType||'EQUITY').toUpperCase()!=='ETF',canFraction=stock&&fractionalAllowed,effectiveFraction=canFraction&&fraction>1e-6?fraction:0;
  const wholeValue=price>0?whole*price:Math.max(0,notional-(effectiveFraction?notional*(effectiveFraction/Math.max(qty,EPS)):0)),fractionalOrderValue=price>0?effectiveFraction*price:Math.max(0,notional-wholeValue);
  const wholeOrderFee=whole>0&&wholeValue<ZERO_FEE_MODEL.smallOrderThresholdEur?ZERO_FEE_MODEL.smallOrderSurchargeEur:0;
  const fractionalFee=effectiveFraction>1e-6?ZERO_FEE_MODEL.fractionalSurchargeEur:0;
  return{
    total:wholeOrderFee+fractionalFee,
    wholeOrderFee,fractionalFee,
    wholeQuantity:whole,
    fractionalQuantity:effectiveFraction,
    usesFractional:effectiveFraction>1e-6,
    wholeOrderValue:+wholeValue.toFixed(6),
    fractionalOrderValue:+fractionalOrderValue.toFixed(6),
    fractionalMeetsMinimum:effectiveFraction<=1e-6||fractionalOrderValue+EPS>=ZERO_FEE_MODEL.fractionalMinEur,
    model:ZERO_FEE_MODEL.version
  };
}

function candidateWhole(budget,price,instrumentType){
  const candidates=new Set([Math.floor(budget/price+EPS),Math.floor(Math.max(0,budget-ZERO_FEE_MODEL.smallOrderSurchargeEur)/price+EPS)]);
  let best=null;
  for(const q0 of candidates){const q=Math.max(0,Math.floor(q0));if(!q)continue;const notional=q*price,info=zeroOrderFee({notionalEur:notional,priceEur:price,quantity:q,instrumentType,fractionalAllowed:false}),total=notional+info.total;if(total<=budget+EPS&&(!best||total>best.totalCost+EPS||Math.abs(total-best.totalCost)<=EPS&&notional>best.notional))best={ok:true,notional,fee:info.total,totalCost:total,quantity:q,feeInfo:info,usesFractional:false,selectionReason:'WHOLE_ONLY'}}
  return best;
}

function candidateMixed(budget,price,instrumentType){
  if(price<=ZERO_FEE_MODEL.fractionalMinEur)return null;
  const maxWhole=Math.floor(budget/price+EPS),wholeCandidates=new Set([maxWhole,maxWhole-1,Math.floor(Math.max(0,budget-1)/price),Math.floor(Math.max(0,budget-2)/price),0]);
  let best=null;
  for(const q0 of wholeCandidates){
    const whole=Math.max(0,Math.floor(q0)),wholeValue=whole*price,wholeFee=whole>0&&wholeValue<ZERO_FEE_MODEL.smallOrderThresholdEur?ZERO_FEE_MODEL.smallOrderSurchargeEur:0;
    const availableForFraction=budget-wholeValue-wholeFee-ZERO_FEE_MODEL.fractionalSurchargeEur;
    if(availableForFraction+EPS<ZERO_FEE_MODEL.fractionalMinEur)continue;
    const fractionalValue=Math.min(price-1e-7,availableForFraction);if(fractionalValue+EPS<ZERO_FEE_MODEL.fractionalMinEur)continue;
    const fraction=fractionalValue/price,quantity=whole+fraction,notional=wholeValue+fractionalValue,info=zeroOrderFee({notionalEur:notional,priceEur:price,quantity,instrumentType,fractionalAllowed:true}),total=notional+info.total;
    if(!info.usesFractional||!info.fractionalMeetsMinimum||total>budget+1e-7)continue;
    if(!best||total>best.totalCost+EPS||Math.abs(total-best.totalCost)<=EPS&&notional>best.notional)best={ok:true,notional,fee:info.total,totalCost:total,quantity,feeInfo:info,usesFractional:true,selectionReason:'MIXED_FULL_CASH'};
  }
  return best;
}

function chooseFullCashFill(whole,mixed){
  if(!whole)return mixed;if(!mixed)return whole;
  if(mixed.totalCost>whole.totalCost+EPS)return mixed;
  if(whole.totalCost>mixed.totalCost+EPS)return whole;
  return mixed.notional>=whole.notional?mixed:whole;
}

export function zeroAffordableBuy({budgetEur=0,priceEur=0,instrumentType='EQUITY',fractionalAllowed=true}={}){
  const budget=Math.max(0,num(budgetEur)),price=Math.max(0,num(priceEur));
  if(!(budget>0&&price>0))return{ok:false,notional:0,fee:0,totalCost:0,quantity:0,reason:'NO_BUDGET_OR_PRICE'};
  const isEtf=String(instrumentType||'EQUITY').toUpperCase()==='ETF',canFraction=!isEtf&&fractionalAllowed;
  const whole=candidateWhole(budget,price,instrumentType),mixed=canFraction?candidateMixed(budget,price,instrumentType):null;
  let best=chooseFullCashFill(whole,mixed);
  if(!best&&canFraction&&budget>=ZERO_FEE_MODEL.fractionalMinEur+ZERO_FEE_MODEL.fractionalSurchargeEur&&price>ZERO_FEE_MODEL.fractionalMinEur){
    const fractionalValue=Math.min(price-1e-7,budget-ZERO_FEE_MODEL.fractionalSurchargeEur);
    if(fractionalValue+EPS>=ZERO_FEE_MODEL.fractionalMinEur){const quantity=fractionalValue/price,info=zeroOrderFee({notionalEur:fractionalValue,priceEur:price,quantity,instrumentType,fractionalAllowed:true}),total=fractionalValue+info.total;if(info.usesFractional&&info.fractionalMeetsMinimum&&total<=budget+EPS)best={ok:true,notional:fractionalValue,fee:info.total,totalCost:total,quantity,feeInfo:info,usesFractional:true,selectionReason:'FRACTIONAL_ONLY_FULL_CASH'}}
  }
  if(!best)return{ok:false,notional:0,fee:0,totalCost:0,quantity:0,reason:canFraction?'ZERO_MINIMUM_NOT_AFFORDABLE':'WHOLE_SHARE_NOT_AFFORDABLE'};
  return{...best,notional:+best.notional.toFixed(6),totalCost:+best.totalCost.toFixed(6),cashResidual:+Math.max(0,budget-best.totalCost).toFixed(6)};
}

export function zeroRoundTripBrokerFees({notionalEur=0,priceEur=0,instrumentType='EQUITY',fractionalAllowed=true}={}){
  const buy=zeroAffordableBuy({budgetEur:notionalEur,priceEur,instrumentType,fractionalAllowed});
  if(!buy.ok)return{buyFee:0,sellFee:0,total:0,tradeNotional:0,quantity:0,affordable:false};
  const sell=zeroOrderFee({notionalEur:buy.notional,priceEur,quantity:buy.quantity,instrumentType,fractionalAllowed});
  return{buyFee:buy.fee,sellFee:sell.total,total:buy.fee+sell.total,tradeNotional:buy.notional,quantity:buy.quantity,affordable:true,usesFractional:buy.usesFractional,selectionReason:buy.selectionReason||null,cashResidual:buy.cashResidual||0};
}
