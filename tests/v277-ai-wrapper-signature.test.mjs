import assert from 'node:assert/strict';
import {AgmPreviewAiGuard} from '../src/agm-preview-ai-guard.js';
import {TradingBehaviorGuardV277} from '../src/trading-behavior-v277.js';

const model='@cf/test/model',input={messages:[{role:'user',content:'nur Signaturtest'}]};

{
 let seen=null;const inner={run:async(...args)=>{seen=args;return{response:JSON.stringify({summary:'ok',actions:[]})}}};
 const guard=new AgmPreviewAiGuard(inner,{env:{},getState:()=>({})});
 await guard.run(model,input);
 assert.equal(seen.length,2,'AGM wrapper must forward model and input separately');
 assert.equal(seen[0],model);assert.equal(seen[1],input);
}

{
 let seen=null;const inner={run:async(...args)=>{seen=args;return{response:JSON.stringify({summary:'ok',actions:[]})}}};
 const guard=new TradingBehaviorGuardV277(inner,{getState:()=>({config:{cash:1000},positions:[],candidates:[]})});
 await guard.run(model,input);
 assert.equal(seen.length,2,'V27.7 behavior wrapper must forward model and input separately');
 assert.equal(seen[0],model);assert.equal(seen[1],input);
}

// Legacy direct one-argument test/invocation remains tolerated for local unit tests.
{
 let calls=0;const inner={run:async()=>{calls++;return{response:JSON.stringify({summary:'ok',actions:[]})}}};
 const guard=new TradingBehaviorGuardV277(inner,{getState:()=>({config:{cash:1000},positions:[],candidates:[]})});
 await guard.run(input);assert.equal(calls,1);
}

console.log('V27.7 Cloudflare AI wrapper signature regression tests: OK');
