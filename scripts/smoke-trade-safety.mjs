import assert from 'node:assert/strict';
import {blockUnsafeFreshBuys} from '../src/trade-safety.js';

function makeEngine(state){
  return {store:{
    async load(){return{state:structuredClone(state),etag:'1'}},
    async update(fn){const next=structuredClone(state);const result=await fn(next);state=next;return{state:structuredClone(state),result,etag:'2'}}
  },get state(){return state}};
}

const fallbackState={
  config:{cash:0,start_capital:100,total_fees:0},
  positions:[{symbol:'FALL',instrument_type:'EQUITY',invested:100,entry_fee:0,entry_price:100,last_price:100,entry_fx:1,last_fx:1}],
  history:[{id:1,action:'KAUF',symbol:'FALL',amount:-100,fee:0,cash_after:0,equity:100,total_pnl:0,reason:'KI BUY 55%: stärkstes verfügbares Fallback-Signal 2.10'}],
  snapshots:[{id:1,cash:0,equity:100}],aiLog:[]
};
const fallbackEngine=makeEngine(fallbackState);
const blockedFallback=await blockUnsafeFreshBuys(fallbackEngine,{historyId:0,snapshotId:0,positions:new Map()});
assert.equal(blockedFallback.result.blocked,1,'Fallback-Kauf muss blockiert werden');
assert.equal(fallbackEngine.state.positions.length,0);
assert.equal(fallbackEngine.state.config.cash,100);
assert.equal(fallbackEngine.state.history.at(-1).action,'KAUF_BLOCKIERT_SICHERHEIT');

const churnState={
  config:{cash:40,start_capital:100,total_fees:0},
  positions:[{symbol:'CHURN',instrument_type:'EQUITY',invested:60,entry_fee:0,entry_price:60,last_price:60,entry_fx:1,last_fx:1}],
  history:[
    {id:1,action:'VERKAUF',symbol:'CHURN',amount:100,fee:0,cash_after:100,equity:100,total_pnl:0,reason:'SELL'},
    {id:2,action:'KAUF',symbol:'CHURN',amount:-60,fee:0,cash_after:40,equity:100,total_pnl:0,reason:'KI BUY 80%: neues Signal'}
  ],
  snapshots:[{id:1,cash:40,equity:100}],aiLog:[]
};
const churnEngine=makeEngine(churnState);
const blockedChurn=await blockUnsafeFreshBuys(churnEngine,{historyId:0,snapshotId:0,positions:new Map()});
assert.equal(blockedChurn.result.blocked,1,'Verkauf und Wiederkauf im selben Scan muss blockiert werden');
assert.equal(churnEngine.state.positions.length,0);
assert.equal(churnEngine.state.config.cash,100);
assert.equal(churnEngine.state.history.at(-1).action,'KAUF_BLOCKIERT_SICHERHEIT');

console.log(JSON.stringify({ok:true,fallbackCash:fallbackEngine.state.config.cash,churnCash:churnEngine.state.config.cash},null,2));
