import assert from 'node:assert/strict';
import fs from 'node:fs';
import {quoteCurrencyInfo,normalizeQuoteCurrency,normalizeQuotePrice} from '../src/quote-currency-units.js';
import {marketRegime} from '../src/forward-curve-learning.js';
import {regionOf,existingPortfolioRiskAlerts} from '../src/portfolio-risk-calibration.js';
import {enforceLossSellInvariant} from '../src/loss-sell-invariant.js';

// 1) Minor quote currencies: prices must be converted exactly once into major units.
assert.equal(quoteCurrencyInfo('GBp').majorCurrency,'GBP');
assert.equal(quoteCurrencyInfo('GBX').priceScale,.01);
assert.equal(normalizeQuotePrice(238.2,'GBp'),2.382);
assert.equal(normalizeQuotePrice(12345,'ZAc'),123.45);
assert.equal(normalizeQuotePrice(350,'ILA'),3.5);
assert.equal(normalizeQuotePrice(2.382,'GBP'),2.382,'major-unit GBP must never be scaled a second time');
assert.equal(normalizeQuoteCurrency('ZAc'),'ZAR');

// 2) Broad-market context must beat the selected-winner subset when enough broad samples exist.
const selected=[
 {price:100,intraday5m:.4,intraday20m:.8,momentumAcceleration5:.2},
 {price:100,intraday5m:.3,intraday20m:.7,momentumAcceleration5:.1},
 {price:100,intraday5m:.2,intraday20m:.6,momentumAcceleration5:.1}
];
const broadRiskOff={source:'COARSE_OPEN_UNIVERSE',sampleCount:100,regime:'RISK_OFF',breadthUp20:.21,breadthUpDay:.28,median20:-.34,medianAccel:-.08};
const reg=marketRegime(selected,broadRiskOff);
assert.equal(reg.regime,'RISK_OFF');
assert.equal(reg.source,'COARSE_OPEN_UNIVERSE');
const fallback=marketRegime(selected,{...broadRiskOff,sampleCount:5});
assert.notEqual(fallback.source,'COARSE_OPEN_UNIVERSE','tiny broad sample must fall back instead of pretending to be representative');

// 3) UK alternate venue must not be classified as OTHER.
assert.equal(regionOf('OCDOL.XC','GBP'),'UK');
assert.equal(regionOf('VOD.L','GBP'),'UK');

// 4) Legacy position above the new 25% cap is explicitly visible, not silently treated as compliant.
const overCap=existingPortfolioRiskAlerts({
 config:{cash:6100,currency:'EUR'},
 positions:[{symbol:'BIG.DE',invested:3900,entry_price:10,last_price:10,entry_fx:1,last_fx:1,currency:'EUR'}]
});
assert.equal(overCap.hasAlerts,true);
assert.ok(overCap.alerts.some(x=>x.type==='SINGLE_POSITION_OVER_CAP'&&x.symbol==='BIG.DE'&&x.pct>38&&x.limitPct===25));

// 5) Raw GBp order is fail-closed until normalization; normalized/verified GBP is not blocked by quote-unit safety.
const rawPlan={summary:'FINAL-CONTROLLER V27.4',actions:[{symbol:'OCDOL.XC',action:'BUY',confidence:.75,allocation_pct:30,reason:'FINAL-CONTROLLER V27.4 BUY PULLBACK_RECLAIM'}]};
const rawState={config:{cash:2000,currency:'EUR',slippage_percent:.1},positions:[],candidates:[{symbol:'OCDOL.XC',price:238.2,currency:'GBp',instrument_type:'EQUITY'}]};
const rawOut=enforceLossSellInvariant(rawPlan,rawState);
assert.equal(rawOut.plan.actions[0].action,'HOLD');
assert.match(rawOut.plan.actions[0].reason,/(?:QUOTE-UNIT-SAFETY|FX-SAFETY) V27\.5/);

const normalizedState={config:{cash:2000,currency:'EUR',slippage_percent:.1},positions:[],candidates:[{symbol:'OCDOL.XC',price:2.382,currency:'GBP',quoteCurrencyRaw:'GBp',quotePriceScale:.01,quoteUnitNormalized:true,fx_rate:1.165,fx_verified:true,instrument_type:'EQUITY'}]};
const normalizedOut=enforceLossSellInvariant(rawPlan,normalizedState);
assert.equal(normalizedOut.minorUnitBlocks,0,'properly normalized pence quote must not be blocked as raw minor-unit data');
assert.doesNotMatch(normalizedOut.plan.actions[0].reason,/QUOTE-UNIT-SAFETY/);

// 6) Foreign BUY with missing/unverified FX must fail closed instead of inventing FX=1.
const fxPlan={summary:'FINAL-CONTROLLER V27.5',actions:[{symbol:'FOREIGN.NS',action:'BUY',confidence:.8,allocation_pct:30,reason:'FINAL-CONTROLLER V27.5 BUY PULLBACK_RECLAIM'}]};
const missingFx={config:{cash:5000,currency:'EUR',slippage_percent:.1},positions:[],candidates:[{symbol:'FOREIGN.NS',price:100,currency:'INR',fx_rate:0,fx_verified:false,instrument_type:'EQUITY'}]};
const missingFxOut=enforceLossSellInvariant(fxPlan,missingFx);
assert.equal(missingFxOut.plan.actions[0].action,'HOLD');
assert.match(missingFxOut.plan.actions[0].reason,/FX-SAFETY V27\.5/);

// 7) Execution path must hard-block scale-up and alternate held-entity candidates before openPosition.
const r2=fs.readFileSync(new URL('../src/r2-portfolio.js',import.meta.url),'utf8');
assert.match(r2,/const existing=s\.positions\.find\(p=>entityKey\(p\)===entityKey\(cand\)\);if\(existing\)return false;/,'execution must fail closed before any scale-up cash mutation');
assert.match(r2,/existingKeys\.has\(entityKey\(cand\)\)/,'candidate collection must exclude already-held entity keys');
assert.doesNotMatch(r2,/AUFSTOCKUNG:/,'unreachable historic automatic scale-up implementation must be removed, not merely hidden behind a guard');
assert.doesNotMatch(r2,/mergePositionTranche/,'R2 execution must no longer carry the old scale-up helper');
assert.doesNotMatch(r2,/Einzige harte Portfoliogrenze: Cash inklusive Kosten/,'inner prompt must not contradict the productive final risk caps');
assert.match(r2,/fx_rate:num\(c\.fxRate,0\),fx_verified:Boolean\(c\.fxVerified\)/,'persisted candidates must preserve FX verification and never default foreign FX to 1');

// 8) Foreign foresight must use loaded FX; 1m checks must not silently fall back to FX=1.
const market=fs.readFileSync(new URL('../src/market-v3.js',import.meta.url),'utf8');
assert.doesNotMatch(market,/recheckForesight\(x,1\)/,'foreign foresight must not silently default to FX=1');
assert.match(market,/result\?\.fxRates\?\.\[normalizeQuoteCurrency\(x\?\.currency\)\]/,'foresight must use the already-loaded FX map');

// 9) Yahoo live metadata is the final quote-unit source of truth; FX lookup itself is fail-closed.
const marketBase=fs.readFileSync(new URL('../src/market-v3-base.js',import.meta.url),'utf8');
assert.match(marketBase,/liveRawCurrency=m\.currency\|\|rawCurrency\(info\)/,'Spark metadata currency must override universe currency for quote-unit scaling');
assert.match(marketBase,/liveRawCurrency=res\.meta\?\.currency\|\|rawCurrency\(info\)/,'1m chart metadata currency must override universe currency');
assert.match(marketBase,/inverse>0\?1\/inverse:null/,'missing foreign FX pair must become null, never a fake rate of 1');
assert.match(marketBase,/fxVerified=/,'scanner candidates must carry explicit FX verification state');

// 10) Quote-sanity and outer risk status must use the canonical production rules.
const sanity=fs.readFileSync(new URL('../src/quote-sanity.js',import.meta.url),'utf8');
assert.match(sanity,/normalizeQuoteCurrency/,'quote sanity must use canonical minor/major currency mapping');
const outer=fs.readFileSync(new URL('../src/compact-portfolio-v22-active-learning.js',import.meta.url),'utf8');
assert.match(outer,/s\.risk=\{\.\.\.\(s\.risk\|\|\{\}\),hardLimits:true,budgetOnly:false,positionLimit:V27_RISK_LIMITS\.maxSinglePositionPct/,'outer production status must override obsolete core risk metadata');
assert.match(outer,/executionScaleUpHardBlocked:true/);

// 11) A transient FX outage for an EXISTING foreign position must never mark its value with FX=0.
assert.match(r2,/function trustedHeldQuote\(/,'existing holdings need a dedicated last-trusted-FX failover path');
assert.match(r2,/if\(num\(q\.fxRate,0\)>0\)p\.last_fx=num\(q\.fxRate\)/,'held-position mark update must never persist FX=0');
assert.match(r2,/markFx=num\(fx,0\)>0\?num\(fx\):entryFx/,'valuation must fall back to entry FX instead of zero if a bad mark slips through');
assert.match(r2,/fx_stale=Boolean\(q\.fxStale\)/,'stale-but-trusted held FX must be explicitly marked');
assert.match(r2,/fx_verified:fxVerified/,'new positions must persist the verified-FX fact');
assert.match(r2,/if\(!q\?\.fresh\|\|!\(num\(q\.fxRate,0\)>0\)\)continue/,'sell execution must never use FX=0');

console.log('V27.5 full-audit invariant regression tests: OK');
