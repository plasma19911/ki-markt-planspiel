import assert from 'node:assert/strict';
import {ZERO_FEE_MODEL,zeroOrderFee,zeroAffordableBuy,zeroRoundTripBrokerFees} from '../src/zero-fee-model.js';

const whole600=zeroOrderFee({notionalEur:600,priceEur:100,quantity:6,instrumentType:'EQUITY'});
assert.equal(whole600.total,0,'600 € Ganzstückorder muss 0 € Brokergebühr haben');

const whole300=zeroOrderFee({notionalEur:300,priceEur:100,quantity:3,instrumentType:'EQUITY'});
assert.equal(whole300.total,1,'300 € Ganzstückorder muss 1 € Mindermengenzuschlag haben');

const frac100=zeroAffordableBuy({budgetEur:100,priceEur:200,instrumentType:'EQUITY',fractionalAllowed:true});
assert.equal(frac100.ok,true);
assert.equal(frac100.fee,1,'reine Aktien-Bruchstückorder kostet 1 €');
assert.ok(Math.abs(frac100.notional-99)<1e-6,'bei 100 € Budget werden 99 € investiert und 1 € Gebühr verwendet');
assert.equal(frac100.usesFractional,true);
assert.ok(frac100.cashResidual<1e-6,'100-€-Aktienbudget darf strategisch kein Cash übrig lassen');

const belowFractionMinimum=zeroAffordableBuy({budgetEur:1.99,priceEur:100,instrumentType:'EQUITY',fractionalAllowed:true});
assert.equal(belowFractionMinimum.ok,false,'1 € Mindest-Bruchstück plus 1 € Gebühr erfordern mindestens 2 € Gesamtbudget');

const exactFractionMinimum=zeroAffordableBuy({budgetEur:2,priceEur:100,instrumentType:'EQUITY',fractionalAllowed:true});
assert.equal(exactFractionMinimum.ok,true);
assert.equal(exactFractionMinimum.notional,1);
assert.equal(exactFractionMinimum.fee,1);
assert.equal(exactFractionMinimum.feeInfo.fractionalOrderValue,1);
assert.ok(exactFractionMinimum.cashResidual<1e-6);

const full501=zeroAffordableBuy({budgetEur:501.5,priceEur:100,instrumentType:'EQUITY',fractionalAllowed:true});
assert.equal(full501.ok,true);
assert.equal(full501.usesFractional,true,'Restcash soll durch eine zulässige Aktien-Bruchstückorder genutzt werden');
assert.ok(Math.abs(full501.totalCost-501.5)<1e-6,'501,50 € Budget muss inklusive Gebühren vollständig ausgeschöpft werden');
assert.ok(full501.cashResidual<1e-6);

const residualEnough=zeroAffordableBuy({budgetEur:502,priceEur:100,instrumentType:'EQUITY',fractionalAllowed:true});
assert.equal(residualEnough.ok,true);
assert.equal(residualEnough.notional,501,'1 € Bruchstück + 1 € Gebühr darf bei 502 € Budget ausgeführt werden');
assert.equal(residualEnough.fee,1);
assert.ok(residualEnough.cashResidual<1e-6);

const mixed400=zeroAffordableBuy({budgetEur:400,priceEur:150,instrumentType:'EQUITY',fractionalAllowed:true});
assert.equal(mixed400.ok,true);
assert.equal(mixed400.fee,2,'Gemischte Aktienorder unter 500 € enthält Ganzstück- und Bruchstückgebühr');
assert.equal(mixed400.usesFractional,true);
assert.ok(Math.abs(mixed400.totalCost-400)<1e-6);
assert.ok(mixed400.cashResidual<1e-6);

const fullCash200=zeroAffordableBuy({budgetEur:200,priceEur:150,instrumentType:'EQUITY',fractionalAllowed:true});
assert.equal(fullCash200.ok,true);
assert.equal(fullCash200.notional,198,'Bei 200 € Budget werden 198 € investiert und 2 € Gebühren genutzt statt 50 € Cash liegen zu lassen');
assert.equal(fullCash200.fee,2);
assert.equal(fullCash200.usesFractional,true);
assert.match(fullCash200.selectionReason||'',/FULL_CASH/);
assert.ok(Math.abs(fullCash200.totalCost-200)<1e-6);
assert.ok(fullCash200.cashResidual<1e-6,'200-€-Budget muss praktisch vollständig genutzt werden');
const fullCashRoundTrip=zeroRoundTripBrokerFees({notionalEur:200,priceEur:150,instrumentType:'EQUITY',fractionalAllowed:true});
assert.equal(fullCashRoundTrip.tradeNotional,198);
assert.equal(fullCashRoundTrip.total,4);
assert.ok(fullCashRoundTrip.cashResidual<1e-6);

const mixed1000=zeroAffordableBuy({budgetEur:1000,priceEur:300,instrumentType:'EQUITY',fractionalAllowed:true});
assert.equal(mixed1000.ok,true);
assert.equal(mixed1000.fee,1,'Ganzstückanteil >=500 € ist gebührenfrei, Bruchstückanteil kostet 1 €');
assert.equal(mixed1000.feeInfo.wholeOrderFee,0);
assert.equal(mixed1000.feeInfo.fractionalFee,1);
assert.ok(Math.abs(mixed1000.totalCost-1000)<1e-6);
assert.ok(mixed1000.cashResidual<1e-6,'1000-€-Budget muss praktisch vollständig genutzt werden');

const roundTrip=zeroRoundTripBrokerFees({notionalEur:300,priceEur:100,instrumentType:'EQUITY',fractionalAllowed:false});
assert.equal(roundTrip.total,2,'Budgetbegrenzter Ganzstück-Roundtrip unter 500 € = 1 € Kauf + 1 € Verkauf');

console.log(JSON.stringify({
  ok:true,
  stocksOnly:true,
  fullCashPolicy:true,
  model:ZERO_FEE_MODEL.version,
  whole600,
  whole300,
  frac100:{notional:frac100.notional,fee:frac100.fee,residual:frac100.cashResidual},
  full501:{notional:full501.notional,fee:full501.fee,residual:full501.cashResidual},
  mixed400:{notional:mixed400.notional,fee:mixed400.fee,residual:mixed400.cashResidual},
  fullCash200:{notional:fullCash200.notional,fee:fullCash200.fee,residual:fullCash200.cashResidual},
  mixed1000:{notional:mixed1000.notional,fee:mixed1000.fee,residual:mixed1000.cashResidual},
  roundTrip
},null,2));
