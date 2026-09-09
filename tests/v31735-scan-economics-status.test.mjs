import assert from 'node:assert/strict';
import {entryOrderEconomics,MAX_ENTRY_ROUNDTRIP_COST_PCT} from '../src/r2-portfolio.js';

assert.equal(entryOrderEconomics(87,{fee_fixed:1,fee_percent:0,slippage_percent:.1}).ok,false);
assert.equal(entryOrderEconomics(145,{fee_fixed:1,fee_percent:0,slippage_percent:.1}).ok,false);
assert.equal(entryOrderEconomics(250,{fee_fixed:1,fee_percent:0,slippage_percent:.1}).ok,true);
assert.equal(MAX_ENTRY_ROUNDTRIP_COST_PCT,1.2);
console.log('V31.7.35 scan/economics/status regression: OK');
