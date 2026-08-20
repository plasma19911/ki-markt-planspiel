import assert from 'node:assert/strict';
import {enforceLossSellInvariant} from '../src/loss-sell-invariant.js';

const buyPlan=(reason,allocation=30)=>({summary:'FINAL-CONTROLLER V27.3',actions:[{symbol:'TEST.DE',action:'BUY',confidence:.72,allocation_pct:allocation,reason}]});
const candidate=(extra={})=>({symbol:'TEST.DE',price:100,fx_rate:1,instrument_type:'EQUITY',score:5,confidence:.7,momentum5:.15,momentum20:.4,momentum_acceleration5:.06,news_score:.1,forwardForecast:{version:2,samples:4,uniqueSymbols:2,marketRegime:{regime:'BROAD_UP',median5:.05,median20:.15},horizons:{15:{expectedPct:.2},30:{expectedPct:.25}}},...extra});
const state=(c,extra={})=>({config:{cash:10000,start_capital:10000,currency:'EUR',slippage_percent:.10},positions:[],candidates:[c],...extra});

{
 const reason='FINAL-CONTROLLER V27.3 BUY EARLY_BREAKOUT: Qualität 0.70 · Setup-Kalibrierung NORMAL_ENTRY: E[Move] +0.050% · Trefferbasis 56.0% · n=12';
 const out=enforceLossSellInvariant(buyPlan(reason),state(candidate()));
 assert.equal(out.edgeBlocks,1,'reifer Erwartungswert unter Roundtrip-Kosten muss BUY blockieren');
 assert.equal(out.plan.actions[0].action,'HOLD');
 assert.match(out.plan.actions[0].reason,/NET-EDGE V27\.4/);
}

{
 const reason='FINAL-CONTROLLER V27.3 BUY EARLY_BREAKOUT: Qualität 0.70 · Setup-Kalibrierung NORMAL_ENTRY: E[Move] +0.050% · Trefferbasis 56.0% · n=2';
 const out=enforceLossSellInvariant(buyPlan(reason),state(candidate()));
 assert.equal(out.edgeBlocks,0,'unreife Statistik darf wegen kleinem E[Move] noch keinen Hardblock erzeugen');
 assert.equal(out.plan.actions[0].action,'BUY');
}

{
 const reason='FINAL-CONTROLLER V27.3 BUY EARLY_BREAKOUT: Qualität 0.72 · Setup-Kalibrierung NORMAL_ENTRY: E[Move] +0.800% · Trefferbasis 62.0% · n=12';
 const c=candidate({score:4.5,confidence:.60,momentum5:.05,momentum20:.10,momentum_acceleration5:.03,forwardForecast:{version:2,samples:18,uniqueSymbols:5,marketRegime:{regime:'RISK_OFF',median5:-.04,median20:-.05},horizons:{15:{expectedPct:.5},30:{expectedPct:.6}}}});
 const out=enforceLossSellInvariant(buyPlan(reason,40),state(c));
 assert.equal(out.regimeBlocks,1,'schwacher EARLY_BREAKOUT darf in RISK_OFF nicht gegen den Gesamtmarkt gekauft werden');
 assert.equal(out.plan.actions[0].action,'HOLD');
 assert.match(out.plan.actions[0].reason,/MARKET-REGIME V27\.4/);
}

{
 const reason='FINAL-CONTROLLER V27.3 BUY EARLY_BREAKOUT: Qualität 0.82 · Setup-Kalibrierung CONFIRMED_BREAKOUT: E[Move] +0.800% · Trefferbasis 66.0% · n=12';
 const c=candidate({score:5.4,confidence:.72,momentum5:.18,momentum20:.50,momentum_acceleration5:.07,news_score:.10,forwardForecast:{version:2,samples:18,uniqueSymbols:5,marketRegime:{regime:'RISK_OFF',median5:-.08,median20:-.10},horizons:{15:{expectedPct:.65},30:{expectedPct:.75}}}});
 const out=enforceLossSellInvariant(buyPlan(reason,40),state(c));
 assert.equal(out.regimeBlocks,0,'echte relative Stärke darf auch in RISK_OFF kaufbar bleiben');
 assert.equal(out.regimeCaps,1,'Risk-off-Trade muss kleiner dimensioniert werden');
 assert.equal(out.plan.actions[0].action,'BUY');
 assert.equal(out.plan.actions[0].allocation_pct,22);
 assert.match(out.plan.actions[0].reason,/NET-EDGE V27\.4/);
}

{
 const reason='FINAL-CONTROLLER V27.3 BUY EARLY_BREAKOUT: Qualität 0.76 · Setup-Kalibrierung NORMAL_ENTRY: E[Move] +0.650% · Trefferbasis 61.0% · n=12';
 const c=candidate({forwardForecast:{version:2,samples:18,uniqueSymbols:5,marketRegime:{regime:'RANGE',median5:0,median20:0},horizons:{15:{expectedPct:.55},30:{expectedPct:.60}}},score:4.7,confidence:.62});
 const out=enforceLossSellInvariant(buyPlan(reason,40),state(c));
 assert.equal(out.plan.actions[0].action,'BUY');
 assert.equal(out.plan.actions[0].allocation_pct,30,'normaler Breakout in RANGE wird auf 75% der vorgesehenen Größe reduziert');
}

console.log('V27.4 net edge / market regime regression tests: OK');
