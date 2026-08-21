import assert from 'node:assert/strict';
import {DAYTRADE_LARGECAP_V299,marketCapBiasV299,marketCapUsdV299} from '../src/daytrade-largecap-v299.js';

assert.equal(DAYTRADE_LARGECAP_V299.immediateBuyMin,56,'BUY threshold must remain 56');
assert.equal(DAYTRADE_LARGECAP_V299.visibleCandidateTarget,10,'candidate UI should stay focused');

const mega=marketCapBiasV299({marketCapUSD:250_000_000_000});
const large=marketCapBiasV299({marketCapUSD:35_000_000_000});
const midLarge=marketCapBiasV299({marketCapUSD:4_000_000_000});
const small=marketCapBiasV299({marketCapUSD:350_000_000});
const micro=marketCapBiasV299({marketCapUSD:120_000_000});
const unknown=marketCapBiasV299({});

assert.equal(mega.tier,'MEGA');
assert.equal(large.tier,'LARGE');
assert.equal(midLarge.tier,'MID_LARGE');
assert.equal(small.tier,'SMALL');
assert.equal(micro.tier,'MICRO');
assert.ok(large.points>midLarge.points,'large caps must receive a stronger preference than mid-large caps');
assert.ok(midLarge.points>small.points,'mid-large caps must rank above small caps for the same intraday base score');
assert.ok(small.points>micro.points,'micro caps must receive the strongest penalty');
assert.equal(unknown.points,0,'missing market-cap data must stay neutral rather than creating a false block');
assert.equal(marketCapUsdV299({marketCapUSD:12_345}),12_345);

// Same underlying intraday score: a large cap should cross 56 while a small cap
// can remain below it. This keeps one authoritative threshold instead of a second gate.
const baseScore=52;
assert.ok(baseScore+large.points>=56,'large-cap preference should be able to promote a near-threshold setup');
assert.ok(baseScore+small.points<56,'small-cap setup should require stronger real intraday evidence');

console.log('V29.9 large-cap daytrade tests passed');
