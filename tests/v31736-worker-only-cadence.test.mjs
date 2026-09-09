import assert from 'node:assert/strict';
import fs from 'node:fs';

const core=fs.readFileSync(new URL('../src/index-core.js',import.meta.url),'utf8');
const status=fs.readFileSync(new URL('../src/compact-portfolio-v10.js',import.meta.url),'utf8');
assert.doesNotMatch(core,/localMinute\s*%\s*5/,'worker-only mode must not be throttled to five minutes');
assert.match(core,/CLOUDFLARE_MINUTE_CRON/);
assert.match(status,/pcAgentRequired:false|pcAgentOptional:true/);
console.log('V31.7.36 worker-only minute cadence regression: OK');
