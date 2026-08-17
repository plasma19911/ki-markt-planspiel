import assert from 'node:assert/strict';
import {ZERO_FEE_MODEL,zeroOrderFee,zeroAffordableBuy,zeroRoundTripBrokerFees} from '../src/zero-fee-model.js';

const whole600=zeroOrderFee({notionalEur:600,priceEur:100,quantity:6,instrumentType:'EQUITY'});
assert.equal(whole600.total,0,'600 € Ganzstückorder muss 0 € Brokergebühr haben');

const whole300=zeroOrderFee({notionalEur:300,priceEur:100,quantity:3,instrumentType:'EQUITY'});
assert.equal(whole300.total,1,'300 € Ganzstückorder muss 1 € Mindermengenzuschlag haben');

const frac100=zeroAffordableBuy({budgetEur:100,priceEur:200,instrumentType:'EQUITY',fractionalAllowed:true});
assert.equal(frac100.ok,true);
assert.equal(frac100.fee,1,'reine Bruchstückorder kostet 1 €');
assert.ok(Math.abs(frac100.notional-99)<1e-6,'bei 100 € Budget bleiben 99 € Investition nach 1 € Bruchstückgebühr');
assert.equal(frac100.usesFractional,true);

const belowFractionMinimum=zeroAffordableBuy({budgetEur:1.99,priceEur:100,instrumentType:'EQUITY',fractionalAllowed:true});
assert.equal(belowFractionMinimum.ok,false,'1 € Mindest-Bruchstück plus 1 € Gebühr erfordern mindestens 2 € Gesamtbudget');

const exactFractionMinimum=zeroAffordableBuy({budgetEur:2,priceEur:100,instrumentType:'EQUITY',fractionalAllowed:true});
assert.equal(exactFractionMinimum.ok,true);
assert.equal(exactFractionMinimum.notional,1);
assert.equal(exactFractionMinimum.fee,1);
assert.equal(exactFractionMinimum.feeInfo.fractionalOrderValue,1);

const residualTooSmall=zeroAffordableBuy({budgetEur:501.5,priceEur:100,instrumentType:'EQUITY',fractionalAllowed:true});
assert.equal(residualTooSmall.ok,true);
assert.equal(residualTooSmall.notional,500,'0,50 € Restwert darf keine Bruchstückorder auslösen');
assert.equal(residualTooSmall.fee,0);
assert.equal(residualTooSmall.usesFractional,false);

const residualEnough=zeroAffordableBuy({budgetEur:502,priceEur:100,instrumentType:'EQUITY',fractionalAllowed:true});
assert.equal(residualEnough.ok,true);
assert.equal(residualEnough.notional,501,'1 € Bruchstück + 1 € Gebühr darf bei 502 € Budget ausgeführt werden');
assert.equal(residualEnough.fee,1);
assert.equal(residualEnough.feeInfo.fractionalOrderValue,1);

const mixed400=zeroAffordableBuy({budgetEur:400,priceEur:150,instrumentType:'EQUITY',fractionalAllowed:true});
assert.equal(mixed400.ok,true);
assert.equal(mixed400.fee,2,'Ganzstückanteil <500 € plus Bruchstückanteil müssen zusammen 2 € kosten');
assert.equal(mixed400.feeInfo.wholeOrderFee,1);
assert.equal(mixed400.feeInfo.fractionalFee,1);

const mixed1000=zeroAffordableBuy({budgetEur:1000,priceEur:300,instrumentType:'EQUITY',fractionalAllowed:true});
assert.equal(mixed1000.ok,true);
assert.equal(mixed1000.fee,1,'Ganzstückanteil >=500 € ist gebührenfrei, Bruchstückanteil kostet 1 €');
assert.equal(mixed1000.feeInfo.wholeOrderFee,0);
assert.equal(mixed1000.feeInfo.fractionalFee,1);

const etf100=zeroAffordableBuy({budgetEur:100,priceEur:80,instrumentType:'ETF',fractionalAllowed:false});
assert.equal(etf100.ok,true);
assert.equal(etf100.quantity,1);
assert.equal(etf100.notional,80);
assert.equal(etf100.fee,1);
assert.equal(etf100.totalCost,81);

const etfTooExpensive=zeroAffordableBuy({budgetEur:100,priceEur:120,instrumentType:'ETF',fractionalAllowed:false});
assert.equal(etfTooExpensive.ok,false,'ETF ohne bezahlbares Ganzstück muss blockiert werden');

const etf600=zeroAffordableBuy({budgetEur:600,priceEur:250,instrumentType:'ETF',fractionalAllowed:false});
assert.equal(etf600.ok,true);
assert.equal(etf600.quantity,2);
assert.equal(etf600.notional,500);
assert.equal(etf600.fee,0,'500 € Ganzstückorder muss gebührenfrei sein');
assert.equal(etf600.totalCost,500);

const roundTrip=zeroRoundTripBrokerFees({notionalEur:300,priceEur:100,instrumentType:'EQUITY',fractionalAllowed:false});
assert.equal(roundTrip.total,2,'Budgetbegrenzter Ganzstück-Roundtrip unter 500 € = 1 € Kauf + 1 € Verkauf');

console.log(JSON.stringify({
  ok:true,
  model:ZERO_FEE_MODEL.version,
  whole600,
  whole300,
  frac100:{notional:frac100.notional,fee:frac100.fee},
  exactFractionMinimum:{notional:exactFractionMinimum.notional,fee:exactFractionMinimum.fee},
  residualTooSmall:{notional:residualTooSmall.notional,fee:residualTooSmall.fee},
  residualEnough:{notional:residualEnough.notional,fee:residualEnough.fee},
  mixed400:{notional:mixed400.notional,fee:mixed400.fee},
  mixed1000:{notional:mixed1000.notional,fee:mixed1000.fee},
  etf100:{notional:etf100.notional,fee:etf100.fee,totalCost:etf100.totalCost},
  etf600:{notional:etf600.notional,fee:etf600.fee,totalCost:etf600.totalCost},
  roundTrip
},null,2));
