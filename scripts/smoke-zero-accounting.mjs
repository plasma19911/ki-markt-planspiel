import assert from 'node:assert/strict';
import {reconcileZeroFees} from '../src/zero-accounting.js';

function makeEngine(state){
  return {store:{
    async load(){return{state:structuredClone(state),etag:'1'}},
    async update(fn){const next=structuredClone(state);const result=await fn(next);state=next;return{state:structuredClone(state),result,etag:'2'}}
  },get state(){return state}};
}

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

const resizeState={
  config:{cash:0,start_capital:600,total_fees:0,fee_fixed:0,fee_percent:0},
  positions:[{symbol:'ETF2',instrument_type:'ETF',invested:600,entry_fee:0,entry_price:250.25,last_price:250,entry_fx:1,last_fx:1}],
  history:[{id:1,action:'KAUF',symbol:'ETF2',amount:-600,fee:0,cash_after:0,equity:600*(250/250.25),total_pnl:600*(250/250.25)-600}],
  snapshots:[{id:1,cash:0,equity:600*(250/250.25)}],aiLog:[]
};
const resizeEngine=makeEngine(resizeState);
const resized=await reconcileZeroFees(resizeEngine,{historyId:0,snapshotId:0,positions:new Map()});
assert.equal(resized.result.reconciledBuys,1);
assert.ok(Math.abs(resizeEngine.state.config.cash-99.5)<1e-8,'ETF-Restcash muss exakt zurückkommen');
assert.ok(Math.abs(resizeEngine.state.positions[0].invested-500.5)<1e-8);
const expectedEquity=99.5+500.5*(250/250.25);
assert.ok(Math.abs(resizeEngine.state.history.at(-1).equity-expectedEquity)<1e-8);
assert.ok(Math.abs(resizeEngine.state.snapshots.at(-1).equity-expectedEquity)<1e-8);
assert.ok(Math.abs(resizeEngine.state.config.cash+resizeEngine.state.positions[0].invested-600)<1e-8,'Cash + Kaufwert muss vor Marktbewegung wieder Startbudget ergeben');

console.log(JSON.stringify({ok:true,blockedCash:blockedEngine.state.config.cash,resizedCash:resizeEngine.state.config.cash,resizedInvested:resizeEngine.state.positions[0].invested,resizedEquity:expectedEquity},null,2));
