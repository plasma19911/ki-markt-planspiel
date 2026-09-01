import assert from 'node:assert/strict';
import {enforcePaperExplorationV3172} from '../src/paper-exploration-v3172.js';

const broker={symbol:'ASML.AS',name:'ASML Holding',isin:'NL0010273215',brokerVerified:true,brokerMatchMode:'EXACT_NORMALIZED_NAME',brokerVerificationSource:'Trade Republic master',assetClass:'EQUITY'};
const candidate={...broker,price:650,day_change:1.1,momentum5Pct:.08,momentum20Pct:.12,acceleration5Pct:.01,newsScore:0,intradayRsi:55,chartDirectionMode:'UP',confidence:.55,quoteAgeMinutes:.4};
const prediction={symbol:'ASML.AS',score:35,forecast20mScore:36.2,signalConfidence:.48,velocity5:3.2,agreement:4,regime:'BULL',m5:.08,m20:.12,accel:.01,news:0,day:1.1,rsi:55,direction:'UP'};
const learning={status:{matured:240,buySamples:0,missedOpportunities:12},predictions:{'ASML.AS':prediction}};
const state={positions:[],history:[],candidates:[candidate],config:{cash:10000}};

{
  const plan={actions:[{symbol:'ASML.AS',action:'HOLD',reason:'Score noch unter normaler Kaufzone'}],summary:'test'};
  const out=enforcePaperExplorationV3172(plan,state,learning,[broker],Date.now());
  const action=out.plan.actions.find(x=>x.symbol==='ASML.AS');
  assert.equal(out.counters.injected,1);
  assert.equal(action.action,'BUY');
  assert.equal(action.allocation_pct,6);
  assert.equal(action.paperExplorationV3172,true);
}

{
  const bad={...candidate,newsScore:-.6};
  const badLearning={...learning,predictions:{'ASML.AS':{...prediction,news:-.6}}};
  const out=enforcePaperExplorationV3172({actions:[],summary:'test'},{...state,candidates:[bad]},badLearning,[broker],Date.now());
  assert.equal(out.counters.injected,0);
}

{
  const learned={...learning,status:{...learning.status,buySamples:1}};
  const out=enforcePaperExplorationV3172({actions:[],summary:'test'},state,learned,[broker],Date.now());
  assert.equal(out.counters.injected,0);
  assert.equal(out.counters.reason,'LEARNING_TRIGGER_NOT_MET');
}

console.log('V31.7.2 controlled paper exploration tests passed');
