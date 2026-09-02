import assert from 'node:assert/strict';
import {reconcilePaperExplorationExecutionV3175} from '../src/paper-exploration-execution-reconcile-v3175.js';

const now=Date.now(),freshAt=new Date(now).toISOString();
const broker={symbol:'ASML.AS',name:'ASML Holding',tradeRepublicName:'ASML Holding',isin:'NL0010273215',brokerVerified:true,brokerMatchMode:'EXACT_NORMALIZED_NAME',brokerVerificationSource:'Trade Republic master',assetClass:'EQUITY'};
const candidate={...broker,price:650,currency:'EUR',fx_rate:1,fx_verified:true,fresh:1,updated_at:freshAt,score:65};
const buy={symbol:'ASML.AS',name:'ASML Holding',action:'BUY',allocation_pct:6,confidence:.7,paperExplorationV3172:true,reason:'controlled test probe'};
const unified={latest:{plan:{actions:[buy]}}};

function baseState(overrides={}){
  return {
    config:{cash:8000,currency:'EUR',fee_fixed:1,fee_percent:0,slippage_percent:.1,total_fees:0,start_capital:10000,scan_count:10},
    positions:[{symbol:'OLD',invested:2000,entry_price:100,last_price:100,entry_fx:1,last_fx:1}],
    candidates:[candidate],history:[],aiLog:[],...overrides
  };
}
async function run(state){
  const engine={store:{update:async fn=>({result:fn(state)})}};
  return reconcilePaperExplorationExecutionV3175({engine,unified,brokerRows:[broker],baseResult:{actions:0},now});
}

{
  const state=baseState();
  const out=await run(state);
  assert.equal(out.executed,true,'one unrelated position must not prevent a reconciled controlled probe');
  assert.equal(out.reason,'CONTROLLED_PROBE_RECONCILED');
  assert.equal(state.positions.length,2);
  assert.equal(state.positions.at(-1).symbol,'ASML.AS');
  assert.equal(state.positions.at(-1).paper_exploration_v3177,true);
  assert.ok(out.amount>0&&out.amount<500,'6% starter remains small after fees');
}

{
  const state=baseState({positions:[{symbol:'ASML.AS',invested:1000,entry_price:650,last_price:650,entry_fx:1,last_fx:1}]});
  const out=await run(state);
  assert.equal(out.executed,false);
  assert.equal(out.reason,'SYMBOL_ALREADY_OPEN');
}

{
  const positions=[1,2,3].map(i=>({symbol:`OLD${i}`,invested:1000,entry_price:100,last_price:100,entry_fx:1,last_fx:1}));
  const state=baseState({positions});
  const out=await run(state);
  assert.equal(out.executed,false);
  assert.equal(out.reason,'PROBE_POSITION_LIMIT');
}

{
  const state=baseState({config:{...baseState().config,cash:8200},positions:[{symbol:'P1',invested:1800,entry_price:100,last_price:100,entry_fx:1,last_fx:1,paper_exploration_v3177:true}]});
  const out=await run(state);
  assert.equal(out.executed,false);
  assert.equal(out.reason,'PROBE_EXPOSURE_LIMIT');
}

console.log('V31.7.7 multi-position paper exploration execution reconciliation tests passed');
