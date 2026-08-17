import {num} from './constants.js';

export const ZERO_BROKER={
  id:'FINANZEN_NET_ZERO',
  name:'finanzen.net ZERO',
  venue:'gettex',
  venueMic:['MUNC','MUND'],
  weekdayHours:'07:30–23:00',
  saturdayHours:'14:00–19:00 (ausgewählte Wertpapiere)',
  smallOrderThresholdEur:500,
  smallOrderSurchargeEur:1,
  fractionalOrderSurchargeEur:1,
  productListStocks:'https://mein.finanzen-zero.net/handelbare-produkte?type=A',
  productListEtfs:'https://mein.finanzen-zero.net/handelbare-produkte?type=E-C',
  targetOnly:true,
  exactCatalogSynced:false,
  catalogNote:'ZERO/gettex-Zieluniversum: breites, branchenunabhängiges Universum liquider Aktien plus normale europäische UCITS-ETF-Kandidaten. Tech und Rüstung sind nur Teilbereiche. Die öffentliche ZERO-Produktliste ist dynamisch; vor einer späteren echten Order muss die konkrete Broker-Verfügbarkeit erneut geprüft werden.'
};

// Das Planspiel soll später praktisch bei ZERO umsetzbar sein. Für Aktien verwenden wir
// deshalb keine Mini-/Micro-Caps oder extrem illiquiden Zweitlistings. Priority-Titel dürfen
// die statische Volumenschwelle passieren, müssen live aber weiterhin einen frischen Kurs liefern.
export function zeroEquityQuality(x){
  const cap=num(x?.marketCapUSD),vol=num(x?.avgVolume),priority=Boolean(x?.priority);
  if(priority)return true;
  if(cap>0&&cap<100_000_000)return false;
  if(vol>0&&vol<5_000)return false;
  return true;
}

export function zeroTradeLabel(x){
  if(x?.type==='ETF')return 'ZERO/gettex · UCITS-Kandidat';
  return 'ZERO/gettex · liquide Aktie';
}

export function zeroExecutionNote(orderEur=0,{fractional=false}={}){
  const n=Math.max(0,num(orderEur));
  if(fractional)return 'ZERO-Modell: Bruchstückorder konservativ mit 1 € Zuschlag simulieren; Spread kommt zusätzlich über Slippage.';
  if(n>0&&n<ZERO_BROKER.smallOrderThresholdEur)return 'ZERO-Modell: unter 500 € konservativ 1 € Mindermengenzuschlag; Spread kommt zusätzlich über Slippage.';
  return 'ZERO-Modell: ab 500 € kann die reine Ordergebühr 0 € sein; Spread/Marktausführung bleibt relevant.';
}
