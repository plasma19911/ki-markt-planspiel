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
  advertisedEtfs:2000,
  gettexStocksApprox:8600,
  smallOrderThresholdEur:ZERO_FEE_MODEL.smallOrderThresholdEur,
  smallOrderSurchargeEur:ZERO_FEE_MODEL.smallOrderSurchargeEur,
  fractionalOrderSurchargeEur:ZERO_FEE_MODEL.fractionalSurchargeEur,
  productListStocks:'https://mein.finanzen-zero.net/handelbare-produkte?type=A',
  productListEtfs:'https://mein.finanzen-zero.net/handelbare-produkte?type=E-C',
  targetOnly:true,
  exactCatalogSynced:false,
  catalogMode:'BROKER_SIZED_MASTER_POOL_PLUS_PRE_ORDER_VERIFICATION',
  catalogNote:'Der Master-Pool wird auf die Größenordnung des aktuellen ZERO/gettex-Angebots erweitert. Die öffentliche ZERO-Produktliste ist JavaScript-dynamisch und derzeit nicht als stabile öffentliche API dokumentiert; deshalb muss die konkrete Broker-Verfügbarkeit vor jeder späteren echten Order erneut verifiziert werden.'
};

export function zeroEquityQuality(x){
  const cap=num(x?.marketCapUSD),vol=num(x?.avgVolume),priority=Boolean(x?.priority);
  if(priority)return true;
  if(cap>0&&cap<100_000_000)return false;
  if(vol>0&&vol<5_000)return false;
  return true;
}

export function zeroTradeLabel(x){
  if(x?.type==='ETF')return 'ZERO/gettex · ETF-Masterpool';
  return 'ZERO/gettex · Aktien-Masterpool';
}

export function zeroExecutionNote(orderEur=0,{fractional=false,priceEur=0,quantity=null,instrumentType='EQUITY'}={}){
  const n=Math.max(0,num(orderEur));
  if(priceEur>0){const f=zeroOrderFee({notionalEur:n,priceEur,quantity,instrumentType,fractionalAllowed:fractional||instrumentType!=='ETF'});return`ZERO-Modell: Brokergebühr ${f.total.toFixed(2)} €${f.usesFractional?' inkl. Bruchstück-Zuschlag':''}; marktüblicher Spread/Ausführung kommt separat hinzu.`}
  if(fractional)return 'ZERO-Modell: Bruchstückauftrag 1 €; kein zusätzlicher Mindermengenzuschlag auf den Bruchstückauftrag. Ein eventueller Ganzstückauftrag wird separat nach 500-€-Schwelle berechnet.';
  if(n>0&&n<ZERO_BROKER.smallOrderThresholdEur)return 'ZERO-Modell: normale Ganzstückorder unter 500 € = 1 € Mindermengenzuschlag; Spread/Ausführung separat.';
  return 'ZERO-Modell: normale Ganzstückorder ab 500 € = 0 € Brokergebühr; Spread/Ausführung separat.';
}
