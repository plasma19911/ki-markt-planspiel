from pathlib import Path
import re, sys

ROOT=Path(__file__).resolve().parents[1]
changed=[]

def read(p): return (ROOT/p).read_text(encoding='utf-8')
def write(p,s):
    (ROOT/p).write_text(s,encoding='utf-8')
    changed.append(p)
def once(p,old,new):
    s=read(p)
    if new in s: return
    if s.count(old)!=1: raise SystemExit(f'{p}: expected exactly one match, got {s.count(old)} for {old[:100]!r}')
    write(p,s.replace(old,new,1))
def rxonce(p,pat,repl):
    s=read(p); n=len(re.findall(pat,s,flags=re.S))
    if n==0 and re.search(repl if isinstance(repl,str) else r'$^',s): return
    if n!=1: raise SystemExit(f'{p}: regex expected once, got {n}: {pat[:120]}')
    write(p,re.sub(pat,repl,s,count=1,flags=re.S))

# --- market-v3-base: canonical quote units + broad market breadth + expose FX map ---
p='src/market-v3-base.js'
once(p,"import {selectBalancedDeepCandidates} from './deep-candidate-selection.js';", "import {selectBalancedDeepCandidates} from './deep-candidate-selection.js';\nimport {quoteCurrencyInfo,normalizeQuoteCurrency,normalizeQuotePrice} from './quote-currency-units.js';")
once(p,"function inferCurrency(info){return info?.currency||sessionRule(info)[6]||'USD'}", "function rawCurrency(info){return info?.quoteCurrencyRaw||info?.quote_currency_raw||info?.currency||sessionRule(info)[6]||'USD'}\nfunction inferCurrency(info){return normalizeQuoteCurrency(rawCurrency(info))}")
once(p,"out.push({...x,currency:inferCurrency(x),companyKey:x.companyKey||key.replace(/^EQ:/,'')})", "out.push({...x,quoteCurrencyRaw:rawCurrency(x),quotePriceScale:quoteCurrencyInfo(rawCurrency(x)).priceScale,currency:inferCurrency(x),companyKey:x.companyKey||key.replace(/^EQ:/,'')})")
once(p,"out.push({...info,price,dayChange:day,coarseMomentum:mom", "out.push({...info,currency:inferCurrency(info),quoteCurrencyRaw:rawCurrency(info),quotePriceScale:quoteCurrencyInfo(rawCurrency(info)).priceScale,quoteUnitNormalized:true,price:normalizeQuotePrice(price,rawCurrency(info)),dayChange:day,coarseMomentum:mom")
once(p,"markHealth(h,'Yahoo 1m Chart',true,'',started);return{...info,price,score,dayChange:day", "markHealth(h,'Yahoo 1m Chart',true,'',started);return{...info,currency:inferCurrency(info),quoteCurrencyRaw:rawCurrency(info),quotePriceScale:quoteCurrencyInfo(rawCurrency(info)).priceScale,quoteUnitNormalized:true,price:normalizeQuotePrice(price,rawCurrency(info)),score,dayChange:day")
insert="""function median(xs){const a=(xs||[]).filter(Number.isFinite).sort((a,b)=>a-b);if(!a.length)return 0;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}\nfunction coarseMarketBreadth(rows=[]){const a=(rows||[]).filter(x=>x?.fresh&&!x?.benchmark&&Number.isFinite(Number(x?.coarseMomentum)));const n=a.length;if(!n)return{source:'COARSE_OPEN_UNIVERSE',sampleCount:0,regime:'UNKNOWN',breadthUp20:.5,breadthUpDay:.5,median20:0,medianAccel:0};const up20=a.filter(x=>num(x.coarseMomentum)>.03).length/n,upDay=a.filter(x=>num(x.dayChange)>0).length/n,med20=median(a.map(x=>num(x.coarseMomentum))),medA=median(a.map(x=>num(x.momentumAcceleration)));let regime='MIXED';if(up20>=.64&&med20>.08)regime='BROAD_UP';else if(up20<=.34&&med20<-.08)regime='RISK_OFF';else if(med20>0&&medA<-.05)regime='REVERSAL_DOWN';else if(med20<0&&medA>.05)regime='REVERSAL_UP';else if(Math.abs(med20)<.10)regime='RANGE';return{source:'COARSE_OPEN_UNIVERSE',sampleCount:n,regime,breadthUp20:+up20.toFixed(3),breadthUpDay:+upDay.toFixed(3),median20:+med20.toFixed(3),medianAccel:+medA.toFixed(3)}}\n\n"""
once(p,"export async function scanMarket(env,cfg,heldSymbols=[]){",insert+"export async function scanMarket(env,cfg,heldSymbols=[]){")
once(p,"const tradable=coarse.filter(x=>!x.benchmark),freshTradable=tradable.filter(x=>x.fresh),selected=selectBalancedDeepCandidates", "const tradable=coarse.filter(x=>!x.benchmark),freshTradable=tradable.filter(x=>x.fresh),marketBreadth=coarseMarketBreadth(freshTradable),selected=selectBalancedDeepCandidates")
once(p,"return{universe:uni.items,generatedAt:uni.generatedAt,candidates:deep,newsRadar,benchmarks,events:Object.fromEntries(events)", "return{universe:uni.items,generatedAt:uni.generatedAt,candidates:deep,newsRadar,benchmarks,marketBreadth,fxRates:fx,events:Object.fromEntries(events)")

# --- market-v3: normalize 1m rechecks and use base FX map for foresight/second chance ---
p='src/market-v3.js'
once(p,"import {loadEventCalendarFallback,eventFallbackRisk} from './event-calendar-fallback.js';", "import {loadEventCalendarFallback,eventFallbackRisk} from './event-calendar-fallback.js';\nimport {quoteCurrencyInfo,normalizeQuoteCurrency,normalizeQuotePrice} from './quote-currency-units.js';")
once(p,"function barsFrom(res){\n const q=res?.indicators?.quote?.[0]||{},times=res?.timestamp||[],cl=[],vol=[],ts=[];\n for(let i=0;i<(q.close||[]).length;i++){const c=Number(q.close[i]);if(!Number.isFinite(c)||c<=0)continue;cl.push(c);vol.push(Math.max(0,num(q.volume?.[i])));ts.push(num(times[i]))}\n return{cl,vol,ts};\n}", "function barsFrom(res){\n const q=res?.indicators?.quote?.[0]||{},times=res?.timestamp||[],cl=[],vol=[],ts=[],quoteUnit=quoteCurrencyInfo(res?.meta?.currency||'');\n for(let i=0;i<(q.close||[]).length;i++){const c=Number(q.close[i]);if(!Number.isFinite(c)||c<=0)continue;cl.push(normalizeQuotePrice(c,quoteUnit.rawCurrency));vol.push(Math.max(0,num(q.volume?.[i])));ts.push(num(times[i]))}\n return{cl,vol,ts,quoteUnit};\n}")
s=read(p)
s=s.replace("const res=got.x,{cl,vol,ts}=barsFrom(res);", "const res=got.x,{cl,vol,ts,quoteUnit}=barsFrom(res);") if False else s
# exact source uses got.x then barsFrom(res) twice
s=s.replace("const res=got.x,{cl,vol,ts}=barsFrom(res);", "const res=got.x,{cl,vol,ts,quoteUnit}=barsFrom(res);")
s=s.replace("const res=got.x,{cl,vol,ts}=barsFrom(res);", "const res=got.x,{cl,vol,ts,quoteUnit}=barsFrom(res);")
# Handle the two actual textual forms.
s=s.replace("const res=got.x,{cl,vol,ts}=barsFrom(res);if(cl.length<22)", "const res=got.x,{cl,vol,ts,quoteUnit}=barsFrom(res);if(cl.length<22)")
s=s.replace("const res=got.x,{cl,vol,ts}=barsFrom(res);if(cl.length<22)", "const res=got.x,{cl,vol,ts,quoteUnit}=barsFrom(res);if(cl.length<22)")
s=s.replace("const res=got.x,{cl,vol,ts}=barsFrom(res);", "const res=got.x,{cl,vol,ts,quoteUnit}=barsFrom(res);")
# First recheck has newline after got.x.
s=s.replace("const res=got.x,{cl,vol,ts}=barsFrom(res);", "const res=got.x,{cl,vol,ts,quoteUnit}=barsFrom(res);")
# Generic destructuring replacement is safe exactly twice.
s,n=re.subn(r"\{cl,vol,ts\}=barsFrom\(res\)","{cl,vol,ts,quoteUnit}=barsFrom(res)",s)
if n not in (0,2): raise SystemExit(f'market-v3 bars destructuring unexpected {n}')
s=s.replace("pclose=num(res.meta?.previousClose,cl[0])", "pclose=num(normalizeQuotePrice(res.meta?.previousClose,quoteUnit.rawCurrency),cl[0])")
s=s.replace("return{candidate:{...info,type:'EQUITY',price,fxRate:", "return{candidate:{...info,type:'EQUITY',currency:quoteUnit.majorCurrency||normalizeQuoteCurrency(info?.currency),quoteCurrencyRaw:quoteUnit.rawCurrency||info?.quoteCurrencyRaw||info?.currency,quotePriceScale:quoteUnit.priceScale,quoteUnitNormalized:true,price,fxRate:")
s=s.replace("return{candidate:{symbol:key(info.symbol),name:info.name||info.symbol,type:'EQUITY',currency:info.currency||res.meta?.currency||null,exchange:", "return{candidate:{symbol:key(info.symbol),name:info.name||info.symbol,type:'EQUITY',currency:quoteUnit.majorCurrency||normalizeQuoteCurrency(info.currency||res.meta?.currency),quoteCurrencyRaw:quoteUnit.rawCurrency||info?.quoteCurrencyRaw||info?.currency,quotePriceScale:quoteUnit.priceScale,quoteUnitNormalized:true,exchange:")
s=s.replace("const checked=await Promise.all(foresight.map(x=>recheckForesight(x,1)));", "const checked=await Promise.all(foresight.map(x=>recheckForesight(x,num(result?.fxRates?.[normalizeQuoteCurrency(x?.currency)],1))));")
s=s.replace("return recheck(info,w,num(w?.fx_rate,num(same?.fxRate,1)))", "return recheck(info,w,num(w?.fx_rate,num(same?.fxRate,num(result?.fxRates?.[normalizeQuoteCurrency(info?.currency)],1))))")
if s==read(p): raise SystemExit('market-v3: no changes applied')
write(p,s)

# --- r2 portfolio: held quote units, legacy repair, broad breadth, hard no-scale-up ---
p='src/r2-portfolio.js'
once(p,"import {mergePositionTranche} from './position-scale-up.js';", "import {mergePositionTranche} from './position-scale-up.js';\nimport {quoteCurrencyInfo,normalizeQuoteCurrency,normalizeQuotePrice} from './quote-currency-units.js';")
once(p,"const normalizedCurrency=v=>{const c=String(v||'').trim();return c==='GBp'||c.toUpperCase()==='GBX'?'GBP':c.toUpperCase()};", "const normalizedCurrency=v=>normalizeQuoteCurrency(v);")
once(p,"positions:[],history:[],snapshots:[],candidates:[],newsRadar:[],sourceHealth:[],aiLog:[]", "positions:[],history:[],snapshots:[],candidates:[],newsRadar:[],sourceHealth:[],aiLog:[],marketBreadth:null")
once(p,"function normalizeCandidate(c){return{symbol:c.symbol,name:c.name||c.symbol,instrument_type:c.type,theme:c.theme||null,price:num(c.price),fx_rate:num(c.fxRate,1),currency:c.currency||null,score:", "function normalizeCandidate(c){return{symbol:c.symbol,name:c.name||c.symbol,instrument_type:c.type,theme:c.theme||null,price:num(c.price),fx_rate:num(c.fxRate,1),currency:normalizeQuoteCurrency(c.currency)||null,quote_currency_raw:c.quoteCurrencyRaw||c.quote_currency_raw||c.currency||null,quote_price_scale:num(c.quotePriceScale??c.quote_price_scale,1),quote_unit_normalized:Boolean(c.quoteUnitNormalized??c.quote_unit_normalized),score:")
# Replace held quote function wholesale via bounded regex.
s=read(p)
pat=r"async function fetchHeldQuotes\(positions,baseCurrency\)\{.*?return out\}\n\nfunction ema"
new="""async function fetchHeldQuotes(positions,baseCurrency){const ps=(positions||[]).filter(p=>p?.symbol&&p.instrument_type!=='LEVERAGED_ETF');if(!ps.length)return new Map();const base=normalizedCurrency(baseCurrency||'EUR')||'EUR',currencies=[...new Set(ps.map(p=>normalizedCurrency(p.currency)).filter(c=>c&&c!==base))],pairs=[];for(const c of currencies)pairs.push(`${c}${base}=X`,`${base}${c}=X`);const symbols=[...new Set([...ps.map(p=>String(p.symbol).toUpperCase()),...pairs])],raw=new Map();for(const batch of chunks(symbols,40)){try{const u=new URL('https://query1.finance.yahoo.com/v7/finance/spark');u.searchParams.set('symbols',batch.join(','));u.searchParams.set('range','1d');u.searchParams.set('interval','5m');u.searchParams.set('indicators','close');u.searchParams.set('includePrePost','false');const r=await fetch(u,{headers:HEADERS});if(!r.ok)continue;const j=await r.json();for(const item of j?.spark?.result||[]){const res=item?.response?.[0];if(!res)continue;const meta=res.meta||{},sym=String(item.symbol||meta.symbol||'').toUpperCase(),cl=(res?.indicators?.quote?.[0]?.close||[]).filter(v=>Number.isFinite(Number(v))).map(Number);if(!sym||!cl.length)continue;const price=num(meta.regularMarketPrice,cl.at(-1)),prev=num(meta.previousClose,cl[0]),back=cl[Math.max(0,cl.length-4)],day=prev?(price/prev-1)*100:0,mom=back?(price/back-1)*100:0,ts=num(meta.regularMarketTime,0);raw.set(sym,{price,score:day*.65+mom*1.35,dayChange:day,momentum:mom,fresh:ts>0&&(Date.now()/1000-ts)<35*60,quoteCurrencyRaw:meta.currency||null})}}catch{}}const fx={[base]:1};for(const c of currencies){const d=raw.get(`${c}${base}=X`)?.price,inv=raw.get(`${base}${c}=X`)?.price;fx[c]=num(d)>0?num(d):num(inv)>0?1/num(inv):null}const out=new Map();for(const p of ps){const q=raw.get(String(p.symbol).toUpperCase());if(!q)continue;const rawCurrency=q.quoteCurrencyRaw||p.quote_currency_raw||p.quoteCurrencyRaw||p.currency,unit=quoteCurrencyInfo(rawCurrency),cur=unit.majorCurrency||normalizedCurrency(p.currency),rate=cur===base?1:(num(fx[cur],0)>0?num(fx[cur]):num(p.last_fx,1)),price=normalizeQuotePrice(q.price,unit.rawCurrency);out.set(p.symbol,{symbol:p.symbol,name:p.name,type:p.instrument_type,price,fxRate:rate,currency:cur,quoteCurrencyRaw:unit.rawCurrency,quotePriceScale:unit.priceScale,quoteUnitNormalized:true,score:q.score,confidence:num(p.signal_confidence,.5),fresh:q.fresh,dayChange:q.dayChange,momentum5:q.momentum,momentum20:q.momentum,newsScore:0})}return out}\n\nfunction repairLegacyMinorUnitPosition(p,q,baseCurrency='EUR'){const raw=p?.quote_currency_raw||p?.quoteCurrencyRaw||p?.currency,unit=quoteCurrencyInfo(raw);if(!unit.minorUnit||p?.minor_unit_repaired_at||p?.quote_unit_repaired_at)return false;const ep=num(p?.entry_price),live=num(q?.price),scaled=ep*unit.priceScale;if(!(ep>0&&live>0&&scaled>0))return false;const dScaled=Math.abs(Math.log(live/scaled)),dRaw=Math.abs(Math.log(live/ep));if(!(dScaled+.25<dRaw))return false;const fx=num(q?.fxRate,p?.last_fx||1);p.entry_price=scaled;p.last_price=live;p.currency=unit.majorCurrency;p.quote_currency_raw=unit.rawCurrency;p.quote_price_scale=unit.priceScale;p.quote_unit_normalized=true;if(fx>0){p.entry_fx=fx;p.last_fx=fx}const pxBase=p.entry_price*num(p.entry_fx,1),qty=pxBase>0?num(p.invested)/pxBase:0;if(qty>0){p.zero_quantity=qty;p.zero_whole_shares=Math.floor(qty+1e-10);p.zero_fractional_shares=Math.max(0,qty-p.zero_whole_shares);p.zero_uses_fractional=p.zero_fractional_shares>1e-8}p.minor_unit_repaired_at=nowIso();p.minor_unit_repair_reason=`${unit.rawCurrency}->${unit.majorCurrency} price x${unit.priceScale}`;return true}\n\nfunction ema"""
s,n=re.subn(pat,new,s,count=1,flags=re.S)
if n!=1: raise SystemExit(f'r2 fetchHeldQuotes replacement {n}')
# Hard execution no scale-up before any cash mutation.
s=s.replace("const existing=s.positions.find(p=>entityKey(p)===entityKey(cand));let amount=", "const existing=s.positions.find(p=>entityKey(p)===entityKey(cand));if(existing)return false;let amount=")
# Persist unit metadata on new positions.
s=s.replace("currency:cand.currency||null,opened_at:addedAt", "currency:normalizeQuoteCurrency(cand.currency)||cand.currency||null,quote_currency_raw:cand.quoteCurrencyRaw||cand.quote_currency_raw||cand.currency||null,quote_price_scale:num(cand.quotePriceScale??cand.quote_price_scale,1),quote_unit_normalized:Boolean(cand.quoteUnitNormalized??cand.quote_unit_normalized),opened_at:addedAt")
# Status expose broad breadth.
s=s.replace("sourceHealth:s.sourceHealth,aiLog:s.aiLog.slice(-200).reverse()", "sourceHealth:s.sourceHealth,marketBreadth:s.marketBreadth||null,aiLog:s.aiLog.slice(-200).reverse()")
# Persist broad context and repair old minor-unit holdings BEFORE decisions/equity.
s=s.replace("cfg.closed_symbols=num(ms.closedSymbols);s.candidates=", "cfg.closed_symbols=num(ms.closedSymbols);s.marketBreadth=m.marketBreadth||null;s.candidates=")
s=s.replace("const heldMap=ms.mode==='NEWS_ONLY'?new Map():await fetchHeldQuotes(s.positions,cfg.currency);for(const p of s.positions){const q=candidates.find(x=>x.symbol===p.symbol)||heldMap.get(p.symbol);if(q?.fresh){p.last_price=", "const heldMap=ms.mode==='NEWS_ONLY'?new Map():await fetchHeldQuotes(s.positions,cfg.currency);let minorUnitRepairs=0;for(const p of s.positions){const q=candidates.find(x=>x.symbol===p.symbol)||heldMap.get(p.symbol);if(q?.fresh){if(repairLegacyMinorUnitPosition(p,q,cfg.currency))minorUnitRepairs++;p.last_price=")
s=s.replace("p.signal_confidence=num(q.confidence,p.signal_confidence)}}const trend=newsTrend(s)", "p.signal_confidence=num(q.confidence,p.signal_confidence);if(q.currency)p.currency=normalizeQuoteCurrency(q.currency);if(q.quoteCurrencyRaw)p.quote_currency_raw=q.quoteCurrencyRaw;if(q.quotePriceScale)p.quote_price_scale=q.quotePriceScale;if(q.quoteUnitNormalized)p.quote_unit_normalized=true}}if(minorUnitRepairs)logAI(s,'SYSTEM','Minor-Unit-Kursbasis repariert',`${minorUnitRepairs} Position(en) von Pence/Cent-Notierung auf Hauptwährung normalisiert; Kostenbasis und investierter EUR-Betrag erhalten.`,{meta:{minorUnitRepairs}});const trend=newsTrend(s)")
# Actually use existingKeys before buy collection; blocks alternate listings too.
s=s.replace("for(const cand of candidates){if(!cand.fresh)continue;const a=am.get(cand.symbol);", "for(const cand of candidates){if(!cand.fresh||existingKeys.has(entityKey(cand)))continue;const a=am.get(cand.symbol);")
if s==read(p): raise SystemExit('r2: no changes')
write(p,s)

# --- portfolio risk: UK mapping + existing over-cap diagnostics ---
p='src/portfolio-risk-calibration.js'
once(p,"if(/\\.IS$/.test(s))return'TURKEY';", "if(/\\.IS$/.test(s))return'TURKEY';\n if(/\\.(L|XC)$/.test(s)||cur==='GBP')return'UK';")
insert="""\nexport function existingPortfolioRiskAlerts(state={}){\n const snap=portfolioSnapshot(state),eq=snap.equity,alerts=[];\n for(const r of snap.rows){const pct=100*r.value/eq;if(pct>V27_RISK_LIMITS.maxSinglePositionPct+.01)alerts.push({type:'SINGLE_POSITION_OVER_CAP',symbol:r.symbol,pct:+pct.toFixed(2),limitPct:V27_RISK_LIMITS.maxSinglePositionPct});}\n for(const [theme,value] of snap.themeExposure){const pct=100*value/eq;if(pct>V27_RISK_LIMITS.maxThemePct+.01)alerts.push({type:'THEME_OVER_CAP',theme,pct:+pct.toFixed(2),limitPct:V27_RISK_LIMITS.maxThemePct});}\n for(const [region,value] of snap.regionExposure){const pct=100*value/eq;if(pct>V27_RISK_LIMITS.maxRegionPct+.01)alerts.push({type:'REGION_OVER_CAP',region,pct:+pct.toFixed(2),limitPct:V27_RISK_LIMITS.maxRegionPct});}\n return{hasAlerts:alerts.length>0,alerts,equity:+eq.toFixed(2),rule:'Bestehende Altpositionen über dem aktuellen Cap werden gemeldet und für weitere Käufe gesperrt, aber nicht allein wegen des Caps zwangsverkauft.'};\n}\n"""
once(p,"function capForCandidate(candidate,snapshot,plannedTheme=new Map(),plannedCurrency=new Map(),plannedRegion=new Map()){",insert+"\nfunction capForCandidate(candidate,snapshot,plannedTheme=new Map(),plannedCurrency=new Map(),plannedRegion=new Map()){")

# --- forward learning: prefer broad coarse-open-universe context over selected candidates ---
p='src/forward-curve-learning.js'
s=read(p)
old="export function marketRegime(candidates=[]){\n const rows=arr(candidates).map(m).filter(x=>x.price>0||Number.isFinite(x.m20));if(!rows.length)return{regime:'UNKNOWN',breadthUp20:.5,breadthUp5:.5,median5:0,median20:0,medianAccel:0};"
new="export function marketRegime(candidates=[],broad=null){\n if(broad&&num(broad?.sampleCount)>=12&&String(broad?.source||'')==='COARSE_OPEN_UNIVERSE'){return{regime:String(broad.regime||'MIXED'),source:'COARSE_OPEN_UNIVERSE',sampleCount:num(broad.sampleCount),breadthUp20:num(broad.breadthUp20,.5),breadthUp5:num(broad.breadthUp20,.5),breadthUpDay:num(broad.breadthUpDay,.5),median5:num(broad.median20),median20:num(broad.median20),medianAccel:num(broad.medianAccel)}}\n const rows=arr(candidates).map(m).filter(x=>x.price>0||Number.isFinite(x.m20));if(!rows.length)return{regime:'UNKNOWN',source:'SELECTED_CANDIDATES_FALLBACK',breadthUp20:.5,breadthUp5:.5,median5:0,median20:0,medianAccel:0};"
if old not in s: raise SystemExit('forward marketRegime header not found')
s=s.replace(old,new,1)
s=s.replace("return{regime,breadthUp20:+up20.toFixed(3)", "return{regime,source:'SELECTED_CANDIDATES_FALLBACK',breadthUp20:+up20.toFixed(3)",1)
s=s.replace("reg=marketRegime(candidates);", "reg=marketRegime(candidates,state?.marketBreadth);",1)
s=s.replace("export function getForwardCurveForecast(storage,candidate={},marketCandidates=[]){\n const state={...defaults(),...read(storage,defaults())},reg=marketRegime(marketCandidates)", "export function getForwardCurveForecast(storage,candidate={},marketCandidates=[],marketBreadth=null){\n const state={...defaults(),...read(storage,defaults())},reg=marketRegime(marketCandidates,marketBreadth)",1)
s=s.replace("rule:'Überlappende Beobachtungen derselben Aktie", "marketRegimeSource:s.marketRegime?.source||null,rule:'Überlappende Beobachtungen derselben Aktie",1)
write(p,s)

# --- FX safety: all supported minor-unit currencies ---
p='src/fx-safety-overlay.js'
once(p,"const HEADERS=", "import {normalizeQuoteCurrency} from './quote-currency-units.js';\n\nconst HEADERS=")
once(p,"function normalizedCurrency(v){const c=String(v||'').trim();return c==='GBp'||c.toUpperCase()==='GBX'?'GBP':c.toUpperCase()}", "function normalizedCurrency(v){return normalizeQuoteCurrency(v)}")

# --- regional benchmark: .XC UK instruments use FTSE ---
p='src/regional-benchmark-overlay.js'
once(p,"if(/\\.L$/.test(s))return'^FTSE';", "if(/\\.(L|XC)$/.test(s))return'^FTSE';")

print('V27.5 audit patch changed:', ', '.join(dict.fromkeys(changed)))
