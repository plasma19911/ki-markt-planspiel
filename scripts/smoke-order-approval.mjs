import assert from 'node:assert/strict';
import {queueOrderApprovals,listOrderApprovals,approveOrderApproval,rejectOrderApproval,orderApprovalCapabilities} from '../src/order-approval.js';
import {verifyCloudflareAccess} from '../src/access-auth.js';

const map=new Map(),storage={kv:{get:k=>map.get(k),put:(k,v)=>map.set(k,v)}};
const prompt='PAPER-TRADING ONLY. Handelsstil=offensiv. Cash 1000.00 EUR; JSON-only {"summary":"","actions":[]} Kandidaten='+JSON.stringify([{symbol:'AAA',type:'EQUITY',momentumState:'BREAKOUT'}])+' Gehalten='+JSON.stringify([{symbol:'BBB',type:'EQUITY',pnlPct:4.2}]);
queueOrderApprovals(storage,[{symbol:'AAA',action:'BUY',confidence:.82,allocation_pct:20,reason:'confirmed setup'},{symbol:'BBB',action:'SELL',confidence:.78,allocation_pct:0,reason:'reversal'}],prompt,null,'TEST');
let rows=listOrderApprovals(storage);assert.equal(rows.length,2);const buy=rows.find(x=>x.symbol==='AAA'),sell=rows.find(x=>x.symbol==='BBB');assert.equal(buy.status,'PENDING');assert.equal(buy.estimatedNotional,200);assert.equal(buy.brokerTarget,'finanzen.net ZERO');assert.equal(buy.brokerAvailabilityVerified,false);assert.equal(buy.brokerVerificationRequired,true);assert.equal(sell.action,'SELL');
const caps=orderApprovalCapabilities({});assert.equal(caps.enabled,false);assert.equal(caps.brokerDispatchEnabled,false);assert.equal(caps.brokerAvailabilityVerificationRequired,true);
const auth=await verifyCloudflareAccess(new Request('https://example.test/api/order-approvals'),{});assert.equal(auth.ok,false);assert.equal(auth.status,503,'approval API must fail closed when Access is not configured');
const approved=approveOrderApproval(storage,buy.id,'tester@example.test');assert.equal(approved.ok,true);assert.equal(approved.brokerSent,false);assert.equal(approved.order.status,'APPROVED_LOCAL');assert.equal(approved.order.dispatchState,'AWAITING_OFFICIAL_CONNECTOR_AND_BROKER_VERIFICATION');assert.equal(approved.order.brokerAvailabilityVerified,false);
const rejected=rejectOrderApproval(storage,sell.id,'tester@example.test');assert.equal(rejected.ok,true);assert.equal(rejected.order.status,'REJECTED');
console.log(JSON.stringify({ok:true,pending:listOrderApprovals(storage).length,approvedBrokerSent:approved.brokerSent,brokerVerificationRequired:approved.order.brokerVerificationRequired,authFailClosed:auth.status},null,2));
