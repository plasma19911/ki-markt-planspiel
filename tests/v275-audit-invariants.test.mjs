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

// 5) Raw GBp order is fail-closed until normalization; normalized GBP is not blocked by quote-unit safety.
const rawPlan={summary:'FINAL-CONTROLLER V27.4',actions:[{symbol:'OCDOL.XC',action:'BUY',confidence:.75,allocation_pct:30,reason:'FINAL-CONTROLLER V27.4 BUY PULLBACK_RECLAIM'}]};
const rawState={config:{cash:2000,slippage_percent:.1},positions:[],candidates:[{symbol:'OCDOL.XC',price:238.2,currency:'GBp',instrument_type:'EQUITY'}]};
const rawOut=enforceLossSellInvariant(rawPlan,rawState);
assert.equal(rawOut.minorUnitBlocks,1);
assert.equal(rawOut.plan.actions[0].action,'HOLD');
assert.match(rawOut.plan.actions[0].reason,/QUOTE-UNIT-SAFETY V27\.5/);

const normalizedState={config:{cash:2000,slippage_percent:.1},positions:[],candidates:[{symbol:'OCDOL.XC',price:2.382,currency:'GBP',quoteCurrencyRaw:'GBp',quotePriceScale:.01,quoteUnitNormalized:true,instrument_type:'EQUITY'}]};
const normalizedOut=enforceLossSellInvariant(rawPlan,normalizedState);
assert.equal(normalizedOut.minorUnitBlocks,0,'properly normalized pence quote must not be blocked as raw minor-unit data');

// 6) Execution path must hard-block scale-up and alternate held-entity candidates before openPosition.
const r2=fs.readFileSync(new URL('../src/r2-portfolio.js',import.meta.url),'utf8');
assert.match(r2,/const existing=s\.positions\.find\(p=>entityKey\(p\)===entityKey\(cand\)\);if\(existing\)return false;/,'execution must fail closed before any scale-up cash mutation');
assert.match(r2,/existingKeys\.has\(entityKey\(cand\)\)/,'candidate collection must exclude already-held entity keys');
assert.doesNotMatch(r2,/recheckForesight\(x,1\)/,'foreign foresight must not silently default to FX=1');

const market=fs.readFileSync(new URL('../src/market-v3.js',import.meta.url),'utf8');
assert.match(market,/result\?\.fxRates\?\.\[normalizeQuoteCurrency\(x\?\.currency\)\]/,'foresight must use the already-loaded FX map');

console.log('V27.5 full-audit invariant regression tests: OK');
