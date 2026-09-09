import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isNonEquityEntry} from '../src/leader-entry-filter.js';
import {isExactTradeRepublicRow,canonicalExecutionRow} from '../src/trade-republic-master.js';
import {targetVenueIssue} from '../src/target-venue-ai-guard.js';

const universe=JSON.parse(readFileSync(new URL('../public/universe.json',import.meta.url),'utf8'));
const equities=universe.equities;
const workerIndex=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const agentStatus=readFileSync(new URL('../src/compact-portfolio-v10.js',import.meta.url),'utf8');
const pcScanner=readFileSync(new URL('../public/pc-first-scanner.ps1',import.meta.url),'utf8');
const pcAgent=readFileSync(new URL('../public/pc-agent-latest.ps1',import.meta.url),'utf8');

{
  const relaxed=equities.filter(x=>x.brokerMatchMode==='UNIQUE_LEGAL_SUFFIX_NORMALIZED_NAME');
  assert.ok(relaxed.length>1000,'master must contain verified unique legal-suffix matches');
  assert.ok(targetVenueIssue(relaxed[0]),'raw non-canonical row must remain blocked');
  const canonical=canonicalExecutionRow(relaxed[0]);
  assert.equal(canonical.brokerMatchMode,'EXACT_NORMALIZED_NAME');
  assert.equal(canonical.brokerMatchOriginalMode,'UNIQUE_LEGAL_SUFFIX_NORMALIZED_NAME');
  assert.equal(canonical.brokerMatchCanonicalized,true);
  assert.equal(targetVenueIssue(canonical),null,'verified canonical master row must pass');
}

{
  const unverified={symbol:'FAKE.DE',brokerVerified:false,assetClass:'EQUITY',isin:'DE0007236101',brokerVerificationSource:'official Trade Republic Trading Universe PDF',brokerMatchMode:'RELAXED'};
  assert.equal(isExactTradeRepublicRow(unverified),false);
  assert.ok(targetVenueIssue(unverified));
  assert.equal(isExactTradeRepublicRow({...equities[0],isin:'NOT-AN-ISIN'}),false);
}

{
  const junk=['NDX','DJI','IXIC','DAX','UKX','NI225','PX1','US2000USD','NYA','XAX','GC1','SI1','CL1','NG1','RB1','HG1','PL1','US10Y','DE10Y','FR10Y','EU10Y','GB10Y','IT10Y','AAPL5455705','US97023CK9','^GSPC'];
  for(const s of junk)assert.equal(isNonEquityEntry(s),true,`${s} must be filtered`);
}

{
  const falsePositives=equities.map(x=>String(x.symbol).toUpperCase()).filter(isNonEquityEntry);
  assert.deepEqual(falsePositives,[],'leader filter must not remove broker-master equities');
  for(const s of ['0700.HK','601988.SS','8035.T','002594.SZ','2308.TW','NVDA','AAPL'])assert.equal(isNonEquityEntry(s),false,`${s} is an equity`);
}

{
  assert.match(workerIndex,/canonicalExecutionRow\(raw\)/,'agent universe must canonicalize verified master rows');
  assert.match(workerIndex,/brokerMatchCanonicalizedCount/,'canonicalized broker rows must be observable');
  assert.match(agentStatus,/droppedNonEquityEntries/,'filtered external entries must be observable');
  assert.match(pcScanner,/query1\.finance\.yahoo\.com/);
  assert.match(pcScanner,/query2\.finance\.yahoo\.com/);
  assert.match(pcScanner,/for\(\$attempt=1;\$attempt -le 1;\$attempt\+\+\)/,'scanner must fail fast instead of repeating a bad Yahoo host');
  assert.match(pcScanner,/DateTimeOffset\]::UtcNow\.ToUnixTimeSeconds/,'fresh-row timestamps must be compared as UTC epoch seconds');
  assert.match(pcAgent,/1\.2\.9-v31\.7\.47-fast-fail-scanner/);
  assert.match(pcAgent,/TimeoutSec \$TimeoutSec/);
}

console.log('V31.7.30 broker canonicalization + leader filter tests: OK');
