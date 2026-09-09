import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DECISION_QUOTE_MAX_AGE_MINUTES,POSITION_QUOTE_MAX_AGE_MINUTES,isFreshMarketQuote,latestFiniteBar,quoteAgeMinutes,withMarketFreshness} from '../src/market-freshness.js';
import {heldQuoteFromYahooResult} from '../src/r2-portfolio.js';

const now=Date.parse('2026-09-08T08:00:00.000Z');
const recent={symbol:'TEST',price:100,fresh:true,marketTimestamp:(now-3*60_000)/1000};
const old={...recent,marketTimestamp:(now-20*60_000)/1000};

assert.equal(DECISION_QUOTE_MAX_AGE_MINUTES,8);
assert.equal(POSITION_QUOTE_MAX_AGE_MINUTES,12);
assert.equal(quoteAgeMinutes(recent,now),3);
assert.equal(isFreshMarketQuote(recent,DECISION_QUOTE_MAX_AGE_MINUTES,now),true);
assert.equal(isFreshMarketQuote(old,DECISION_QUOTE_MAX_AGE_MINUTES,now),false);
assert.equal(isFreshMarketQuote(null,DECISION_QUOTE_MAX_AGE_MINUTES,now),false,'a completely missing held quote must fail closed without aborting the scan');
assert.equal(quoteAgeMinutes(null,now),null,'a missing quote must not invent a timestamp');
assert.equal(isFreshMarketQuote({price:100,fresh:true},DECISION_QUOTE_MAX_AGE_MINUTES,now),false,'missing market timestamp must fail closed');
assert.equal(withMarketFreshness(old,DECISION_QUOTE_MAX_AGE_MINUTES,now).stale,true);
assert.deepEqual(latestFiniteBar([100,200,300],[99,101,null]),{timestamp:200,value:101,index:1},'an empty newest candle must not lend its timestamp to the previous price');
assert.equal(latestFiniteBar([100,200],[99,null])?.timestamp,100);
assert.deepEqual(
  heldQuoteFromYahooResult({meta:{symbol:'COST.L',currency:'GBp',previousClose:220},timestamp:[100,200,300],indicators:{quote:[{close:[219,225,null]}]}},'COST.L',300_000),
  {symbol:'COST.L',price:225,score:(225/220-1)*100*.65+(225/219-1)*100*1.35,dayChange:(225/220-1)*100,momentum:(225/219-1)*100,marketTimestamp:200,quoteAgeMinutes:1.6666666666666667,fresh:true,quoteCurrencyRaw:'GBp'},
  'the held-position fallback must keep the latest finite price paired with its own timestamp'
);

const portfolio=fs.readFileSync(new URL('../src/r2-portfolio.js',import.meta.url),'utf8');
assert.match(portfolio,/filter\(c=>c\.fresh\)/,'stale scan candidates must be removed before the AI plan');
assert.match(portfolio,/last_quote_at/,'position quote time must be stored separately from scan time');
assert.match(portfolio,/quoteFreshnessPolicy/,'status must expose the freshness policy');
assert.match(portfolio,/latestFiniteBar\(res\?\.timestamp\|\|\[\],rawCloses\)/,'held price and timestamp must use the same candle');
assert.match(portfolio,/fetchSingleHeldChart/,'a missing Spark row must receive an individual chart fallback');
assert.match(portfolio,/p\.quote_fresh=checked\.fresh;p\.price_stale=!checked\.fresh/,'stale position state must be persisted before later decision wrappers run');

const scanner=fs.readFileSync(new URL('../src/market-v3-base.js',import.meta.url),'utf8');
assert.match(scanner,/marketTimestamp:last,quoteAgeMinutes/,'deep chart must preserve the actual market timestamp');
assert.match(scanner,/includePrePost','true'/,'extended-session bars must be considered');

const pcScanner=fs.readFileSync(new URL('../public/pc-first-scanner.ps1',import.meta.url),'utf8');
assert.match(pcScanner,/\$marketTime=\[int64\]\$barTimes\[-1\]/,'PC scanner must pair the price with its own bar timestamp');
assert.match(pcScanner,/\$nowUnix-\[int64\]\$_\.marketTimestamp/,'rolling PC rows must recalculate age on every use');
assert.match(pcScanner,/PcFirstVersion='29\.8'/,'freshness fix and current reference-market scanner must remain present');

const pcAgent=fs.readFileSync(new URL('../public/pc-agent-latest.ps1',import.meta.url),'utf8');
const recovery=fs.readFileSync(new URL('../src/compact-portfolio-v310-agent-recovery.js',import.meta.url),'utf8');
assert.match(pcAgent,/\$scan\.ok-eq \$false/,'PC agent must inspect an HTTP-200 scan result instead of assuming success');
assert.match(recovery,/if\(r\?\.ok===false\)/,'worker recovery must preserve internal scan failures');

console.log('V31.7.34 quote freshness tests passed.');
