import {FAST_CALIBRATION} from './generated-fast-calibration.js';
import {classifyEntryTiming} from './live-signal-learning.js';

const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const arr=v=>Array.isArray(v)?v:[];
const key=v=>String(v||'').toUpperCase().trim();

export const V27_RISK_LIMITS={
 maxSinglePositionPct:25,
 maxThemePct:40,
 maxRegionPct:55,
 maxForeignCurrencyPct:55,
 maxBaseCurrencyPct:70,
 minAllocationPctOfCash:2
};

function positionValue(p={}){
 const invested=Math.max(0,num(p.invested));
 const ep=num(p.entry_price),lp=num(p.last_price,ep),ef=num(p.entry_fx,1),lf=num(p.last_fx,ef);
 if(ep>0&&lp>0&&ef>0&&lf>0)return invested*(lp/ep)*(lf/ef);
 return invested;
}

export function regionOf(symbol='',currency=''){
 const s=key(symbol),cur=key(currency);
 if(/\.(HE|ST|CO|OL)$/.test(s))return'NORDICS';
 if(/\.IS$/.test(s))return'TURKEY';
 if(/\.(DE|F|PA|AS|BR|MI|MC|L|SW|VI)$/.test(s))return'EUROPE';
 if(/\.(NS|BO)$/.test(s))return'INDIA';
 if(/\.HK$/.test(s))return'HONG_KONG';
 if(/\.T$/.test(s))return'JAPAN';
 if(/\.AX$/.test(s))return'AUSTRALIA';
 if(/\.JK$/.test(s))return'INDONESIA';
 if(!s.includes('.'))return'US';
 if(cur==='EUR')return'EUROPE';
 return'OTHER';
}

function themeOf(x={}){
 return key(x.theme||x.sector||x.industry||'');
}

export function portfolioSnapshot(state={}){
 const cash=Math.max(0,num(state?.config?.cash)),positions=arr(state?.positions),rows=positions.map(p=>({
  symbol:key(p?.symbol),value:positionValue(p),theme:themeOf(p),currency:key(p?.currency||state?.config?.currency||'EUR'),region:regionOf(p?.symbol,p?.currency)
 }));
 const marketValue=rows.reduce((a,x)=>a+x.value,0),equity=Math.max(1,cash+marketValue),baseCurrency=key(state?.config?.currency||'EUR');
 const sumBy=(field)=>{const m=new Map();for(const r of rows){const k=r[field]||'';if(!k)continue;m.set(k,num(m.get(k))+r.value)}return m};
 return{cash,marketValue,equity,baseCurrency,rows,themeExposure:sumBy('theme'),currencyExposure:sumBy('currency'),regionExposure:sumBy('region')};
}

export function calibratedEntryExpectation(candidate={},learningStatus=null){
 const bucket=classifyEntryTiming(candidate),buckets=arr(learningStatus?.buckets),row=buckets.find(x=>String(x?.bucket||'')===bucket)||null;
 const priorN=12,priorMean=num(FAST_CALIBRATION?.validation?.holdoutBuyMeanPct,.046),priorWin=clamp(num(FAST_CALIBRATION?.validation?.holdoutBuyHitRate,.45),0,1);
 const n=Math.max(0,num(row?.samples15)),empMean=n?num(row?.qualityPct):priorMean,empWin=n&&row?.winRatePct!=null?clamp(num(row.winRatePct)/100,0,1):priorWin;
 const posteriorMean=(priorMean*priorN+empMean*n)/(priorN+n||1),posteriorWin=(priorWin*priorN+empWin*n)/(priorN+n||1),reliability=clamp(n/24,0,1);
 const block=n>=12&&posteriorMean<-.10&&posteriorWin<.43;
 const sizeMultiplier=block?0:clamp(.86+(posteriorMean-.02)*.65+(posteriorWin-.45)*.80,.68,1.16);
 const confidenceDelta=clamp((posteriorWin-priorWin)*.35,-.08,.06);
 return{
  bucket,samples15:n,posteriorExpectedMovePct:+posteriorMean.toFixed(3),posteriorWinRate:+posteriorWin.toFixed(3),reliability:+reliability.toFixed(3),sizeMultiplier:+sizeMultiplier.toFixed(3),confidenceDelta:+confidenceDelta.toFixed(3),block,
  prior:{sampleCount:num(FAST_CALIBRATION?.holdoutSampleCount),meanPct:priorMean,hitRate:priorWin,version:FAST_CALIBRATION?.version||'unknown'}
 };
}

function capForCandidate(candidate,snapshot,plannedValue=0,plannedTheme=new Map(),plannedCurrency=new Map(),plannedRegion=new Map()){
 const eq=snapshot.equity,theme=themeOf(candidate),currency=key(candidate?.currency||snapshot.baseCurrency),region=regionOf(candidate?.symbol,currency);
 const singleCap=eq*V27_RISK_LIMITS.maxSinglePositionPct/100;
 const themeNow=theme?num(snapshot.themeExposure.get(theme))+num(plannedTheme.get(theme)):0;
 const currencyNow=num(snapshot.currencyExposure.get(currency))+num(plannedCurrency.get(currency));
 const regionNow=num(snapshot.regionExposure.get(region))+num(plannedRegion.get(region));
 const themeCap=theme?Math.max(0,eq*V27_RISK_LIMITS.maxThemePct/100-themeNow):Infinity;
 const currencyLimit=currency===snapshot.baseCurrency?V27_RISK_LIMITS.maxBaseCurrencyPct:V27_RISK_LIMITS.maxForeignCurrencyPct;
 const currencyCap=Math.max(0,eq*currencyLimit/100-currencyNow);
 const regionCap=Math.max(0,eq*V27_RISK_LIMITS.maxRegionPct/100-regionNow);
 const capacity=Math.max(0,Math.min(singleCap,themeCap,currencyCap,regionCap));
 return{capacity,theme,currency,region,singleCap,themeCap,currencyCap,regionCap,plannedValue};
}

export function applyPortfolioRiskCaps(rows=[],state={},cashOverride=null){
 const snapshot=portfolioSnapshot(state),cash=cashOverride==null?snapshot.cash:Math.max(0,num(cashOverride));if(cash<=0)return[];
 const plannedTheme=new Map(),plannedCurrency=new Map(),plannedRegion=new Map(),out=[];
 for(const row of rows){
  const requestedPct=clamp(num(row?.allocation),0,100),requestedValue=cash*requestedPct/100,cap=capForCandidate(row?.c||row,snapshot,0,plannedTheme,plannedCurrency,plannedRegion),allowedValue=Math.min(requestedValue,cap.capacity,cash),allowedPct=100*allowedValue/cash;
  if(allowedPct<V27_RISK_LIMITS.minAllocationPctOfCash)continue;
  const reasons=[];if(allowedValue+1e-6<requestedValue){
   if(cap.capacity===cap.singleCap)reasons.push(`Einzelposition max. ${V27_RISK_LIMITS.maxSinglePositionPct}% Depot`);
   if(cap.theme&&cap.capacity===cap.themeCap)reasons.push(`Themencluster ${cap.theme} max. ${V27_RISK_LIMITS.maxThemePct}%`);
   if(cap.capacity===cap.currencyCap)reasons.push(`Währung ${cap.currency} begrenzt`);
   if(cap.capacity===cap.regionCap)reasons.push(`Region ${cap.region} begrenzt`);
  }
  plannedTheme.set(cap.theme,num(plannedTheme.get(cap.theme))+allowedValue);plannedCurrency.set(cap.currency,num(plannedCurrency.get(cap.currency))+allowedValue);plannedRegion.set(cap.region,num(plannedRegion.get(cap.region))+allowedValue);
  out.push({...row,allocation:+allowedPct.toFixed(2),riskCap:{requestedPct:+requestedPct.toFixed(2),allowedPct:+allowedPct.toFixed(2),allowedValue:+allowedValue.toFixed(2),theme:cap.theme||null,currency:cap.currency,region:cap.region,reasons}});
 }
 return out;
}
