import assert from 'node:assert/strict';
import {ZERO_FEE_MODEL,zeroOrderFee,zeroAffordableBuy,zeroRoundTripBrokerFees} from '../src/zero-fee-model.js';

assert.equal(ZERO_FEE_MODEL.broker,'Trade Republic');
assert.equal(ZERO_FEE_MODEL.standardOrderFeeEur,1);

const whole600=zeroOrderFee({notionalEur:600,priceEur:100,quantity:6,instrumentType:'EQUITY'});
assert.equal(whole600.total,1,'jede regulaere Trade-Republic-Aktienorder kostet im Planspiel 1 EUR');
assert.equal(whole600.usesFractional,false);

const tooSmall=zeroAffordableBuy({budgetEur:100,priceEur:200,instrumentType:'EQUITY'});
assert.equal(tooSmall.ok,false,'Budget muss mindestens eine ganze Aktie plus 1 EUR Gebuehr tragen');

const exact=zeroAffordableBuy({budgetEur:201,priceEur:200,instrumentType:'EQUITY'});
assert.equal(exact.ok,true);
assert.equal(exact.quantity,1);
assert.equal(exact.notional,200);
assert.equal(exact.fee,1);
assert.equal(exact.cashResidual,0);
assert.equal(exact.usesFractional,false,'das Planspiel handelt nur ganze Aktien');

const wholeShares=zeroAffordableBuy({budgetEur:1000,priceEur:300,instrumentType:'EQUITY'});
assert.equal(wholeShares.ok,true);
assert.equal(wholeShares.quantity,3);
assert.equal(wholeShares.notional,900);
assert.equal(wholeShares.fee,1);
assert.equal(wholeShares.cashResidual,99);

const roundTrip=zeroRoundTripBrokerFees({notionalEur:1000,priceEur:300,instrumentType:'EQUITY'});
assert.equal(roundTrip.affordable,true);
assert.equal(roundTrip.tradeNotional,900);
assert.equal(roundTrip.total,2,'Kauf und Verkauf kosten zusammen 2 EUR vor Spread und Slippage');
assert.equal(roundTrip.cashResidual,99);

const nonStock=zeroAffordableBuy({budgetEur:1000,priceEur:100,instrumentType:'ETF'});
assert.equal(nonStock.ok,false);
assert.equal(nonStock.reason,'TRADE_REPUBLIC_STOCKS_ONLY');

console.log(JSON.stringify({ok:true,broker:ZERO_FEE_MODEL.broker,model:ZERO_FEE_MODEL.version,wholeSharesOnly:true,orderFeeEur:whole600.total,roundTripFeeEur:roundTrip.total},null,2));
