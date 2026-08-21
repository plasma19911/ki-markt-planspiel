import {num} from './constants.js';
import {ZERO_FEE_MODEL,zeroOrderFee} from './zero-fee-model.js';

export const TRADE_REPUBLIC_BROKER={
  id:'TRADE_REPUBLIC',
  name:'Trade Republic',
  venue:'Bestpreis / Trade Republic execution',
  weekdayHours:'07:30–23:00',
  assetClass:'EQUITY_ONLY',
  stocksOnly:true,
  regularOrderFeeEur:ZERO_FEE_MODEL.standardOrderFeeEur,
  targetOnly:true,
  exactCatalogSynced:true,
  catalogMode:'OFFICIAL_TRADING_UNIVERSE_CONSERVATIVE_EQUITY_INTERSECTION',
  catalogNote:'Das Planspiel berücksichtigt nur Yahoo-klassifizierte Aktien, die zugleich im offiziellen Trade-Republic Trading Universe eindeutig zugeordnet werden konnten. Nicht bestätigte Titel werden nicht in den handelbaren Master aufgenommen.'
};

// Compatibility export retained for older layers.
export const ZERO_BROKER=TRADE_REPUBLIC_BROKER;

export function tradeRepublicEquityQuality(x){
  const cap=num(x?.marketCapUSD),vol=num(x?.avgVolume),priority=Boolean(x?.priority);
  if(x?.brokerVerified===false)return false;
  if(priority)return true;
  if(cap>0&&cap<100_000_000)return false;
  if(vol>0&&vol<5_000)return false;
  return true;
}
export const zeroEquityQuality=tradeRepublicEquityQuality;

export function tradeRepublicTradeLabel(){return 'Trade Republic · bestätigte Aktien';}
export const zeroTradeLabel=tradeRepublicTradeLabel;

export function tradeRepublicExecutionNote(orderEur=0,{priceEur=0,quantity=null}={}){
  const n=Math.max(0,num(orderEur));
  const f=zeroOrderFee({notionalEur:n,priceEur,quantity,instrumentType:'EQUITY'});
  return`Trade-Republic-Modell Aktien: ${f.total.toFixed(2)} € Abwicklungspauschale je Order; Spread/Marktausführung kommt separat hinzu.`;
}
export const zeroExecutionNote=tradeRepublicExecutionNote;
