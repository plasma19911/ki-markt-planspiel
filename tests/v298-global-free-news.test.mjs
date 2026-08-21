import assert from 'node:assert/strict';
import {classifyNewsImpact,detectNewsLanguageV298} from '../src/news-impact-intelligence.js';
import {dedupeNewsV298,freshnessWeightV298,scoreNewsRowsV298} from '../src/global-free-news-v298.js';

const now=Date.parse('2026-08-21T08:00:00Z');

assert.equal(detectNewsLanguageV298('業績予想を上方修正'), 'ja');
assert.equal(classifyNewsImpact('会社は業績予想を上方修正').type,'GUIDANCE_RAISE');
assert.equal(classifyNewsImpact('公司上调盈利预期').type,'GUIDANCE_RAISE');
assert.equal(classifyNewsImpact('회사는 실적 전망을 하향 조정했다').type,'GUIDANCE_CUT');
assert.equal(classifyNewsImpact('La empresa eleva previsión anual').type,'GUIDANCE_RAISE');
assert.equal(classifyNewsImpact('La société abaisse ses prévisions annuelles').type,'GUIDANCE_CUT');
assert.equal(classifyNewsImpact('Компания повысила прогноз выручки').type,'GUIDANCE_RAISE');
assert.equal(classifyNewsImpact('कंपनी ने अनुमान घटाया').type,'GUIDANCE_CUT');

assert.equal(freshnessWeightV298('2026-08-21T07:55:00Z',now),1);
assert.ok(freshnessWeightV298('2026-08-21T00:00:00Z',now)<.5);

const dup=dedupeNewsV298([
 {symbol:'ABC',headline:'ABC raises full-year forecast after strong orders',source:'SEC EDGAR 8-K',primary:true,publishedAt:'2026-08-21T07:52:00Z'},
 {symbol:'ABC',headline:'ABC raises full-year forecast after strong orders',source:'GDELT/example.com',publishedAt:'2026-08-21T07:54:00Z'}
]);
assert.equal(dup.length,1);
assert.equal(dup[0].duplicateSources.length,2);

const positive=scoreNewsRowsV298([
 {symbol:'ABC',headline:'ABC raises full-year forecast',source:'SEC EDGAR 8-K',primary:true,publishedAt:'2026-08-21T07:55:00Z'}
],now);
assert.ok(positive.newsScore>0.4);
assert.ok(positive.confidence>0.3);

const stale=scoreNewsRowsV298([
 {symbol:'ABC',headline:'ABC raises full-year forecast',source:'GDELT/example.com',publishedAt:'2026-08-20T12:00:00Z'}
],now);
assert.ok(stale.newsScore<positive.newsScore);

const negative=scoreNewsRowsV298([
 {symbol:'ABC',headline:'ABC cuts guidance after weak demand',source:'SEC EDGAR 8-K',primary:true,publishedAt:'2026-08-21T07:57:00Z'}
],now);
assert.ok(negative.newsScore<-.4);

console.log('V29.8 global free news tests passed');
