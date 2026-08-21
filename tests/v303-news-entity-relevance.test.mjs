import assert from 'node:assert/strict';
import {newsHeadlineMatchesEntity,sanitizeNewsEntityRelevance} from '../src/news-entity-relevance.js';

const revenio={symbol:'REG1V.HE',name:'Revenio Group Oyj'};
assert.equal(newsHeadlineMatchesEntity(revenio,'SBO AG (SBOEY) Q2 2026 Earnings Call Highlights: Sales Grow'),false,'SBO-Meldung darf nicht Revenio zugeordnet werden');
assert.equal(newsHeadlineMatchesEntity(revenio,'Revenio Group reports improved profitability in Q2'),true,'Explizite Revenio-Meldung muss erhalten bleiben');

const state={
 universe:[revenio],
 candidates:[{...revenio,score:6,newsScore:.5,newsConfidence:.6,newsSources:['Yahoo'],headlines:['SBO AG Q2 2026 Earnings Call Highlights'],pro:['News +0.5 · 1 Ereigniscluster','Momentum positiv'],contra:[],reasons:['News +0.5 · 1 Ereigniscluster','Momentum positiv']}],
 newsRadar:[{...revenio,score:.5,confidence:.6,latestWeight:1.55,freshImpact:.465,tendency:'BULLISH',sources:['Yahoo'],sourceCount:1,clusterCount:1,confirmationCount:1,headline:'SBO AG (SBOEY) Q2 2026 Earnings Call Highlights: Sales Grow',headlines:['SBO AG (SBOEY) Q2 2026 Earnings Call Highlights: Sales Grow']}]
};
const out=sanitizeNewsEntityRelevance(state),c=out.candidates[0];
assert.equal(out.newsRadar.length,0,'Fremde Symbol-News muss aus dem Radar entfernt werden');
assert.equal(c.newsScore,0,'Fremde News darf keinen Kandidaten-NewsScore behalten');
assert.equal(c.newsConfidence,0,'Fremde News darf keine Coverage-Konfidenz behalten');
assert.equal(c.newsEntityFiltered,true);
assert.ok(Math.abs(c.score-(6-.5*.6*1.55))<1e-9,'Bereits eingerechneter News-Beitrag muss exakt neutralisiert werden');
assert.deepEqual(c.pro,['Momentum positiv'],'Falscher News-Pro-Grund muss entfernt werden');
assert.equal(out.newsEntityFilter.droppedRows,1);
assert.equal(out.newsEntityFilter.neutralizedCandidates,1);

console.log(JSON.stringify({ok:true,guard:'symbol news entity relevance',case:'REG1V.HE must reject SBO AG headline'},null,2));
