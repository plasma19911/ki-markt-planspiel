import assert from 'node:assert/strict';
import {loadTradeRepublicMaster,isExactTradeRepublicRow,tradeRepublicMasterRows} from '../src/trade-republic-master.js';

const exact={symbol:'FORTUM.HE',name:'Fortum Oyj',isin:'FI0009007132',assetClass:'EQUITY',brokerVerified:true,brokerMatchMode:'EXACT_NORMALIZED_NAME',brokerVerificationSource:'official Trade Republic Trading Universe PDF'};
const fuzzy={...exact,symbol:'BAD.HE',brokerMatchMode:'RELAXED_NAME'};

assert.equal(isExactTradeRepublicRow(exact),true);
assert.equal(isExactTradeRepublicRow(fuzzy),false);
assert.equal(tradeRepublicMasterRows({equities:[exact]}).length,1);

let requested='';
const env={ASSETS:{fetch:async req=>{requested=new URL(req.url).pathname;return new Response(JSON.stringify({generated_at:'2026-08-26T00:00:00Z',equities:[exact,fuzzy]}),{status:200,headers:{'content-type':'application/json'}})}}};
const out=await loadTradeRepublicMaster(env);
assert.equal(requested,'/universe.json');
assert.equal(out.source,'env.ASSETS:/universe.json');
assert.equal(out.rows.length,1);
assert.equal(out.rows[0].symbol,'FORTUM.HE');
assert.equal(out.generatedAt,'2026-08-26T00:00:00Z');

const legacy=await loadTradeRepublicMaster({}, {legacyLoader:async()=>({equities:[exact]})});
assert.equal(legacy.source,'legacy-zero-assets');
assert.equal(legacy.rows.length,1);

console.log('Trade Republic master resolver regression OK');
