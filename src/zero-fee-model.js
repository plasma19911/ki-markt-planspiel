const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const EPS=1e-9;

// Compatibility name retained because older portfolio layers import ZERO_FEE_MODEL.
// Effective broker model is Trade Republic stocks-only paper trading.
export const ZERO_FEE_MODEL={
  version:'trade-republic-securities-2026-08-v1',
  broker:'Trade Republic',
  standardOrderFeeEur:1,
  smallOrderThresholdEur:0,
  smallOrderSurchargeEur:0,
  fractionalSurchargeEur:0,
  fractionalMinEur:0,
  fractionalStocksOnly:false,
  fractionalExecution:'disabled in this paper-trading model; regular stock orders are modelled as whole-share orders',
  note:'Trade-Republic-Modell: 1 € Abwicklungspauschale je regulärer Aktienorder. Spread/Preisdifferenz und Marktausführung werden separat berücksichtigt. ETFs, Derivate und Krypto sind im Planspiel ausgeschlossen.'
};

export const TRADE_REPUBLIC_FEE_MODEL=ZERO_FEE_MODEL;

export function zeroOrderFee({notionalEur=0,priceEur=0,quantity=null,instrumentType='EQUITY'}={}){
  const notional=Math.max(0,num(notionalEur)),price=Math.max(0,num(priceEur));
  if(!(notional>0))return{total:0,wholeOrderFee:0,fractionalFee:0,wholeQuantity:0,fractionalQuantity:0,usesFractional:false,fractionalOrderValue:0,model:ZERO_FEE_MODEL.version};
  const qty=quantity==null?(price>0?notional/price:0):Math.max(0,num(quantity));
  const whole=Math.max(0,Math.floor(qty+EPS));
  return{total:ZERO_FEE_MODEL.standardOrderFeeEur,wholeOrderFee:ZERO_FEE_MODEL.standardOrderFeeEur,fractionalFee:0,wholeQuantity:whole,fractionalQuantity:0,usesFractional:false,wholeOrderValue:+notional.toFixed(6),fractionalOrderValue:0,fractionalMeetsMinimum:true,model:ZERO_FEE_MODEL.version,instrumentType:String(instrumentType||'EQUITY').toUpperCase()};
}

export function zeroAffordableBuy({budgetEur=0,priceEur=0,instrumentType='EQUITY'}={}){
  const budget=Math.max(0,num(budgetEur)),price=Math.max(0,num(priceEur));
  if(!(budget>0&&price>0))return{ok:false,notional:0,fee:0,totalCost:0,quantity:0,reason:'NO_BUDGET_OR_PRICE'};
  if(String(instrumentType||'EQUITY').toUpperCase()!=='EQUITY')return{ok:false,notional:0,fee:0,totalCost:0,quantity:0,reason:'TRADE_REPUBLIC_STOCKS_ONLY'};
  const fee=ZERO_FEE_MODEL.standardOrderFeeEur;
  const quantity=Math.floor(Math.max(0,budget-fee)/price+EPS);
  if(quantity<1)return{ok:false,notional:0,fee:0,totalCost:0,quantity:0,reason:'WHOLE_SHARE_NOT_AFFORDABLE_AFTER_TR_FEE'};
  const notional=quantity*price,totalCost=notional+fee;
  return{ok:true,notional:+notional.toFixed(6),fee,totalCost:+totalCost.toFixed(6),quantity,feeInfo:zeroOrderFee({notionalEur:notional,priceEur:price,quantity,instrumentType}),usesFractional:false,selectionReason:'TRADE_REPUBLIC_WHOLE_SHARE',cashResidual:+Math.max(0,budget-totalCost).toFixed(6)};
}

export function zeroRoundTripBrokerFees({notionalEur=0,priceEur=0,instrumentType='EQUITY'}={}){
  const buy=zeroAffordableBuy({budgetEur:notionalEur,priceEur,instrumentType});
  if(!buy.ok)return{buyFee:0,sellFee:0,total:0,tradeNotional:0,quantity:0,affordable:false};
  const sell=zeroOrderFee({notionalEur:buy.notional,priceEur,quantity:buy.quantity,instrumentType});
  return{buyFee:buy.fee,sellFee:sell.total,total:buy.fee+sell.total,tradeNotional:buy.notional,quantity:buy.quantity,affordable:true,usesFractional:false,selectionReason:buy.selectionReason,cashResidual:buy.cashResidual||0,broker:'Trade Republic'};
}

export const tradeRepublicOrderFee=zeroOrderFee;
export const tradeRepublicAffordableBuy=zeroAffordableBuy;
export const tradeRepublicRoundTripBrokerFees=zeroRoundTripBrokerFees;
