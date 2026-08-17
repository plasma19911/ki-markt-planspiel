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
assert.equal(roundTrip.total,2,'300 € Ganzstück Roundtrip = 1 € Kauf + 1 € Verkauf');

console.log(JSON.stringify({
  ok:true,
  model:ZERO_FEE_MODEL.version,
  whole600,
  whole300,
  frac100:{notional:frac100.notional,fee:frac100.fee},
  mixed400:{notional:mixed400.notional,fee:mixed400.fee},
  mixed1000:{notional:mixed1000.notional,fee:mixed1000.fee},
  etf100:{notional:etf100.notional,fee:etf100.fee,totalCost:etf100.totalCost},
  etf600:{notional:etf600.notional,fee:etf600.fee,totalCost:etf600.totalCost},
  roundTrip
},null,2));
