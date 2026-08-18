import {num} from './constants.js';
import {ZERO_FEE_MODEL,zeroOrderFee} from './zero-fee-model.js';

export const ZERO_BROKER={
  id:'FINANZEN_NET_ZERO',
  name:'finanzen.net ZERO',
  venue:'gettex',
  venueMic:['MUNC','MUND'],
  weekdayHours:'07:30–23:00',
  saturdayHours:'14:00–19:00 (ausgewählte Wertpapiere)',
  advertisedStocks:8500,
  gettexStocksApprox:8600,
  assetClass:'EQUITY_ONLY',
  stocksOnly:true,
  smallOrderThresholdEur:ZERO_FEE_MODEL.smallOrderThresholdEur,
  smallOrderSurchargeEur:ZERO_FEE_MODEL.smallOrderSurchargeEur,
  fractionalOrderSurchargeEur:ZERO_FEE_MODEL.fractionalSurchargeEur,
  productListStocks:'https://mein.finanzen-zero.net/handelbare-produkte?type=A',
  targetOnly:true,
  exactCatalogSynced:false,
  catalogMode:'BROKER_SIZED_STOCK_MASTER_POOL_PLUS_PRE_ORDER_VERIFICATION',
  catalogNote:'Das Planspiel handelt ausschließlich Aktien. Der Aktien-Masterpool orientiert sich an der Größenordnung des ZERO/gettex-Angebots; die konkrete Broker-Verfügbarkeit muss vor jeder späteren echten Order erneut verifiziert werden.'
};

export function zeroEquityQuality(x){
  const cap=num(x?.marketCapUSD),vol=num(x?.avgVolume),priority=Boolean(x?.priority);
  if(priority)return true;
  if(cap>0&&cap<100_000_000)return false;
  if(vol>0&&vol<5_000)return false;
  return true;
}

export function zeroTradeLabel(){
  return 'ZERO/gettex · Aktien-Masterpool';
}

export function zeroExecutionNote(orderEur=0,{fractional=false,priceEur=0,quantity=null}={}){
  const n=Math.max(0,num(orderEur));
  if(priceEur>0){const f=zeroOrderFee({notionalEur:n,priceEur,quantity,instrumentType:'EQUITY',fractionalAllowed:true});return`ZERO-Modell Aktien: Brokergebühr ${f.total.toFixed(2)} €${f.usesFractional?' inkl. Bruchstück-Zuschlag':''}; marktüblicher Spread/Ausführung kommt separat hinzu.`}
  if(fractional)return 'ZERO-Modell Aktien: Bruchstückauftrag 1 €; ein eventueller Ganzstückauftrag wird separat nach der 500-€-Schwelle berechnet.';
  if(n>0&&n<ZERO_BROKER.smallOrderThresholdEur)return 'ZERO-Modell Aktien: Ganzstückorder unter 500 € = 1 € Mindermengenzuschlag; Spread/Ausführung separat.';
  return 'ZERO-Modell Aktien: Ganzstückorder ab 500 € = 0 € Brokergebühr; Spread/Ausführung separat.';
}
