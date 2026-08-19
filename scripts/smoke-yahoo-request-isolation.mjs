import assert from 'node:assert/strict';
import fs from 'node:fs';

const src=fs.readFileSync(new URL('../src/yahoo-spark-repair.js',import.meta.url),'utf8');
const budget=fs.readFileSync(new URL('../src/request-fetch-budget.js',import.meta.url),'utf8');

assert.match(src,/withRequestLocalTask/,'Yahoo repair must use request-local task dedupe');
assert.match(src,/crossRequestPromiseSharing:false/,'Yahoo stats must state that request promises are never shared');
assert.doesNotMatch(src,/\bsessionPromise\b/,'Yahoo session promise must not be module-global');
assert.doesNotMatch(src,/\bchartInflight\s*=|\bchartInflight\.(?:has|get|set|delete)/,'Yahoo chart in-flight Promise map must not be shared across requests');
assert.doesNotMatch(src,/\bchartQueue\s*=|\bchartQueue\.(?:push|shift)/,'Yahoo chart queue must not be module-global');
assert.doesNotMatch(src,/\bchartActive\b|\blastChartStart\b|function\s+chartGate|function\s+pumpChartQueue/,'Yahoo pacing state must not be request-global');
assert.match(src,/const chartCache=new Map\(\)/,'Completed chart snapshots may remain shared');
assert.match(budget,/AsyncLocalStorage/,'Request-local task context must use AsyncLocalStorage');
assert.match(budget,/withRequestLocalTask/,'Request-local task helper must stay available');
assert.match(budget,/ctx\.tasks/,'In-flight task promises must live in the current request context');

console.log(JSON.stringify({ok:true,crossRequestPromiseSharing:false,requestLocalYahooTasks:true,completedSnapshotCacheShared:true},null,2));
