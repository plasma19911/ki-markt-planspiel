const num=(v,d=null)=>Number.isFinite(Number(v))?Number(v):d;

export function quoteCurrencyInfo(currency=''){
  const raw=String(currency??'').trim(),upper=raw.toUpperCase();
  if(raw==='GBp'||upper==='GBX')return{rawCurrency:raw||'GBp',majorCurrency:'GBP',priceScale:.01,minorUnit:true,unit:'pence'};
  if(upper==='ZAC')return{rawCurrency:raw||'ZAc',majorCurrency:'ZAR',priceScale:.01,minorUnit:true,unit:'cent'};
  if(upper==='ILA')return{rawCurrency:raw||'ILA',majorCurrency:'ILS',priceScale:.01,minorUnit:true,unit:'agora'};
  return{rawCurrency:raw||upper,majorCurrency:upper,priceScale:1,minorUnit:false,unit:'major'};
}

export const normalizeQuoteCurrency=currency=>quoteCurrencyInfo(currency).majorCurrency;

export function normalizeQuotePrice(price,currency){
  const n=num(price,null);if(n===null)return price;
  return n*quoteCurrencyInfo(currency).priceScale;
}

export function isMinorQuoteCurrency(currency){return quoteCurrencyInfo(currency).minorUnit;}

export function positionQuoteUnit(position={}){
  return quoteCurrencyInfo(position?.quote_currency_raw??position?.quoteCurrencyRaw??position?.currency??'');
}

export function candidateQuoteUnit(candidate={}){
  return quoteCurrencyInfo(candidate?.quoteCurrencyRaw??candidate?.quote_currency_raw??candidate?.currency??'');
}

export function applyQuoteUnitToCandidate(candidate={}){
  const unit=candidateQuoteUnit(candidate),out={...candidate};
  if(unit.minorUnit&&!candidate?.quoteUnitNormalized){
    if(Number.isFinite(Number(out.price)))out.price=Number(out.price)*unit.priceScale;
  }
  out.currency=unit.majorCurrency||out.currency;
  out.quoteCurrencyRaw=unit.rawCurrency||out.currency;
  out.quotePriceScale=unit.priceScale;
  out.quoteUnitNormalized=true;
  return out;
}
