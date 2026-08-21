import assert from 'node:assert/strict';
import {reconcileZeroFees,positionMarketValue} from '../src/zero-accounting.js';
import {mergePositionTranche} from '../src/position-scale-up.js';

function makeEngine(state){
  return {store:{
    async load(){return{state:structuredClone(state),etag:'1'}},
    async update(fn){const next=structuredClone(state);const result=await fn(next);state=next;return{state:structuredClone(state),result,etag:'2'}}
  },get state(){return state}};
}

// Stocks-only sanity: an accidental ETF BUY must be fully rolled back.
const blockedState={
  config:{cash:0,start_capital:100,total_fees:0,fee_fixed:0,fee_percent:0},
  positions:[{symbol:'ETF1',instrument_type:'ETF',invested:100,entry_fee:0,entry_price:120.12,last_price:120,entry_fx:1,last_fx:1}],
  history:[{id:1,action:'KAUF',symbol:'ETF1',amount:-100,fee:0,cash_after:0,equity:100*(120/120.12),total_pnl:100*(120/120.12)-100}],
  snapshots:[{id:1,cash:0,equity:100*(120/120.12)}],aiLog:[]
};
const blockedEngine=makeEngine(blockedState);
const blocked=await reconcileZeroFees(blockedEngine,{historyId:0,snapshotId:0,positions:new Map()});
assert.equal(blocked.result.blockedBuys,1);
assert.equal(blockedEngine.state.positions.length,0);
assert.ok(Math.abs(blockedEngine.state.config.cash-100)<1e-8);
assert.ok(Math.abs(blockedEngine.state.history.at(-1).equity-100)<1e-8);
assert.ok(Math.abs(blockedEngine.state.snapshots.at(-1).equity-100)<1e-8);

// Normal stock BUY: whole shares + 1 EUR Trade-Republic fee, residual cash is restored.
const resizeState={
  config:{cash:0,start_capital:600,total_fees:0,fee_fixed:0,fee_percent:0},
  positions:[{symbol:'EQ2',instrument_type:'EQUITY',invested:600,entry_fee:0,entry_price:250.25,last_price:250,entry_fx:1,last_fx:1}],
  history:[{id:1,action:'KAUF',symbol:'EQ2',amount:-600,fee:0,cash_after:0,equity:600*(250/250.25),total_pnl:600*(250/250.25)-600}],
  snapshots:[{id:1,cash:0,equity:600*(250/250.25)}],aiLog:[]
};
const resizeEngine=makeEngine(resizeState);
const resized=await reconcileZeroFees(resizeEngine,{historyId:0,snapshotId:0,positions:new Map()});
assert.equal(resized.result.reconciledBuys,1);
assert.ok(Math.abs(resizeEngine.state.config.cash-98.5)<1e-8,'Restcash nach 2 Aktien zu 250,25 EUR plus 1 EUR Gebuehr muss 98,50 EUR sein');
assert.ok(Math.abs(resizeEngine.state.positions[0].invested-500.5)<1e-8);
assert.equal(resizeEngine.state.positions[0].entry_fee,1);
const expectedEquity=98.5+500.5*(250/250.25);
assert.ok(Math.abs(resizeEngine.state.history.at(-1).equity-expectedEquity)<1e-8);
assert.ok(Math.abs(resizeEngine.state.snapshots.at(-1).equity-expectedEquity)<1e-8);
assert.ok(Math.abs(resizeEngine.state.config.cash+resizeEngine.state.positions[0].invested+resizeEngine.state.positions[0].entry_fee-600)<1e-8,'Cash + Kaufwert + Gebuehr muss das Startbudget ergeben');

// Successful stock scale-up: correct only the new tranche and preserve the old basis.
const beforeAdd={symbol:'ADD',name:'Add Test',instrument_type:'EQUITY',invested:500,entry_fee:1,entry_price:100,last_price:100,entry_fx:1,last_fx:1,zero_quantity:5,zero_whole_shares:5,zero_fractional_shares:0,zero_uses_fractional:false,opened_at:'2026-08-19T10:00:00.000Z',add_count:0,score:5,signal_confidence:.72};
const provisionalAdd=mergePositionTranche(beforeAdd,{notional:300,entryPrice:110.11,fx:1,fee:0,quantity:300/110.11},{lastPrice:110,lastFx:1,score:5.6,confidence:.79,addedAt:'2026-08-19T11:00:00.000Z'});
const provisionalValue=positionMarketValue(provisionalAdd);
const addState={
 config:{cash:200,start_capital:1000,total_fees:1,fee_fixed:0,fee_percent:0},
 positions:[provisionalAdd],
 history:[
  {id:1,action:'KAUF',symbol:'ADD',amount:-501,fee:1,cash_after:499,equity:999,total_pnl:-1},
  {id:2,action:'KAUF',symbol:'ADD',amount:-300,fee:0,cash_after:200,equity:200+provisionalValue,total_pnl:200+provisionalValue-1000,reason:'AUFSTOCKUNG Test'}
 ],
 snapshots:[{id:1,cash:499,equity:999},{id:2,cash:200,equity:200+provisionalValue}],aiLog:[]
};
const addEngine=makeEngine(addState);
const addResult=await reconcileZeroFees(addEngine,{historyId:1,snapshotId:1,positions:new Map([['ADD',structuredClone(beforeAdd)]])});
assert.equal(addResult.result.reconciledScaleUps,1,'Successful second stock BUY must be recognized as scale-up');
assert.equal(addEngine.state.positions.length,1);
assert.ok(addEngine.state.positions[0].invested>500);
assert.ok(addEngine.state.positions[0].entry_fee>1);
assert.ok(addEngine.state.positions[0].zero_quantity>5);
assert.equal(addEngine.state.positions[0].add_count,1);
assert.ok(addEngine.state.positions[0].last_add_notional>0);

// Defensive legacy case: an accidental ETF scale-up is rejected and the old position restored.
const beforeBlockedAdd={symbol:'ETFADD',instrument_type:'ETF',invested:500,entry_fee:1,entry_price:250,last_price:250,entry_fx:1,last_fx:1,zero_quantity:2,zero_whole_shares:2,zero_fractional_shares:0,zero_uses_fractional:false,opened_at:'2026-08-19T10:00:00.000Z',add_count:0};
const provisionalBlockedAdd=mergePositionTranche(beforeBlockedAdd,{notional:50,entryPrice:250.25,fx:1,fee:0,quantity:50/250.25},{lastPrice:250,lastFx:1,addedAt:'2026-08-19T11:00:00.000Z'});
const blockedAddState={config:{cash:450,start_capital:1000,total_fees:1,fee_fixed:0,fee_percent:0},positions:[provisionalBlockedAdd],history:[{id:2,action:'KAUF',symbol:'ETFADD',amount:-50,fee:0,cash_after:450,equity:1000,reason:'AUFSTOCKUNG Test'}],snapshots:[{id:2,cash:450,equity:1000}],aiLog:[]};
const blockedAddEngine=makeEngine(blockedAddState);
const blockedAdd=await reconcileZeroFees(blockedAddEngine,{historyId:1,snapshotId:1,positions:new Map([['ETFADD',structuredClone(beforeBlockedAdd)]])});
assert.equal(blockedAdd.result.blockedScaleUps,1);
assert.equal(blockedAddEngine.state.positions.length,1);
assert.equal(blockedAddEngine.state.positions[0].invested,500);
assert.equal(blockedAddEngine.state.positions[0].zero_quantity,2);
assert.ok(Math.abs(blockedAddEngine.state.config.cash-500)<1e-8);

console.log(JSON.stringify({ok:true,broker:'Trade Republic',stocksOnly:true,blockedEtfBuy:true,resizedCash:resizeEngine.state.config.cash,resizedInvested:resizeEngine.state.positions[0].invested,resizedEntryFee:resizeEngine.state.positions[0].entry_fee,scaleUpReconciled:addResult.result.reconciledScaleUps,blockedLegacyEtfScaleUp:true},null,2));
