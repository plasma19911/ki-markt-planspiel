const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

export const ZERO_FEE_MODEL={
  version:'zero-securities-2026-08-v1',
  standardOrderFeeEur:0,
  smallOrderThresholdEur:500,
  smallOrderSurchargeEur:1,
  fractionalSurchargeEur:1,
  fractionalMinEur:1,
  fractionalStocksOnly:true,
  fractionalExecution:'once daily from 15:00; orders after 14:45 next trading day',
  note:'Brokergebühren nach ZERO-Regeln. Marktspread/Preisdifferenz ist separat und keine Brokergebühr.'
};

export function zeroOrderFee({notionalEur=0,priceEur=0,quantity=null,instrumentType='EQUITY',fractionalAllowed=true}={}){
  const notional=Math.max(0,num(notionalEur)),price=Math.max(0,num(priceEur));
  if(!(notional>0))return{total:0,wholeOrderFee:0,fractionalFee:0,wholeQuantity:0,fractionalQuantity:0,usesFractional:false};
  let qty=quantity==null?(price>0?notional/price:0):Math.max(0,num(quantity));
  if(!(qty>0)&&price>0)qty=notional/price;
  const whole=Math.floor(qty+1e-9),fraction=Math.max(0,qty-whole),usesFractional=fraction>1e-6;
  const stock=String(instrumentType||'EQUITY').toUpperCase()!=='ETF';
  const canFraction=stock&&fractionalAllowed;
  const effectiveFraction=canFraction?fraction:0;
  const wholeValue=price>0?whole*price:Math.max(0,notional-(usesFractional?notional*(fraction/Math.max(qty,1e-9)):0));
  const wholeOrderFee=whole>0&&wholeValue<ZERO_FEE_MODEL.smallOrderThresholdEur?ZERO_FEE_MODEL.smallOrderSurchargeEur:0;
  const fractionalFee=effectiveFraction>1e-6?ZERO_FEE_MODEL.fractionalSurchargeEur:0;
  return{
    total:wholeOrderFee+fractionalFee,
    wholeOrderFee,fractionalFee,
    wholeQuantity:whole,
    fractionalQuantity:effectiveFraction,
    usesFractional:effectiveFraction>1e-6,
    wholeOrderValue:+wholeValue.toFixed(6),
    model:ZERO_FEE_MODEL.version
  };
}

export function zeroAffordableBuy({budgetEur=0,priceEur=0,instrumentType='EQUITY',fractionalAllowed=true}={}){
  const budget=Math.max(0,num(budgetEur)),price=Math.max(0,num(priceEur));
  if(!(budget>0&&price>0))return{ok:false,notional:0,fee:0,totalCost:0,quantity:0,reason:'NO_BUDGET_OR_PRICE'};
  const isEtf=String(instrumentType||'EQUITY').toUpperCase()==='ETF';
  const canFraction=!isEtf&&fractionalAllowed;
  if(!canFraction){
    let qty=Math.floor(budget/price+1e-9);
    while(qty>0){
      const notional=qty*price,info=zeroOrderFee({notionalEur:notional,priceEur:price,quantity:qty,instrumentType,fractionalAllowed:false}),total=notional+info.total;
      if(total<=budget+1e-9)return{ok:true,notional:+notional.toFixed(6),fee:info.total,totalCost:+total.toFixed(6),quantity:qty,feeInfo:info,usesFractional:false};
      qty--;
    }
    return{ok:false,notional:0,fee:0,totalCost:0,quantity:0,reason:'WHOLE_SHARE_NOT_AFFORDABLE'};
  }
  let notional=budget,info=null;
  for(let i=0;i<6;i++){
    const qty=notional/price;
    info=zeroOrderFee({notionalEur:notional,priceEur:price,quantity:qty,instrumentType,fractionalAllowed:true});
    const next=Math.max(0,budget-info.total);
    if(Math.abs(next-notional)<1e-8){notional=next;break}
    notional=next;
  }
  if(!(notional>0))return{ok:false,notional:0,fee:info?.total||0,totalCost:info?.total||0,quantity:0,reason:'FEE_EXCEEDS_BUDGET'};
  const quantity=notional/price;
  info=zeroOrderFee({notionalEur:notional,priceEur:price,quantity,instrumentType,fractionalAllowed:true});
  const total=notional+info.total;
  if(total>budget+1e-7)return{ok:false,notional:0,fee:info.total,totalCost:total,quantity:0,reason:'BUDGET_MISMATCH'};
  return{ok:true,notional:+notional.toFixed(6),fee:info.total,totalCost:+total.toFixed(6),quantity,feeInfo:info,usesFractional:info.usesFractional};
}

export function zeroRoundTripBrokerFees({notionalEur=0,priceEur=0,instrumentType='EQUITY',fractionalAllowed=true}={}){
  const buy=zeroAffordableBuy({budgetEur:notionalEur,priceEur,instrumentType,fractionalAllowed});
  if(!buy.ok)return{buyFee:0,sellFee:0,total:0,tradeNotional:0,quantity:0,affordable:false};
  const sell=zeroOrderFee({notionalEur:buy.notional,priceEur,quantity:buy.quantity,instrumentType,fractionalAllowed});
  return{buyFee:buy.fee,sellFee:sell.total,total:buy.fee+sell.total,tradeNotional:buy.notional,quantity:buy.quantity,affordable:true,usesFractional:buy.usesFractional};
}
