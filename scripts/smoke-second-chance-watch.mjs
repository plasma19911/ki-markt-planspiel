import assert from 'node:assert/strict';
import {buildSecondChanceWatch,SECOND_CHANCE_TARGET} from '../src/second-chance-watch-utils.js';

const now=Date.now(),iso=new Date(now).toISOString(),stale=new Date(now-20*60_000).toISOString();
const previous={candidates:[
 {symbol:'KEEP',score:5.8,confidence:.72,event_risk:'NONE',momentum_state:'BUILDING',momentum_sell_signal:'NONE',lastSeenAt:iso},
 {symbol:'STALE',score:7,confidence:.8,event_risk:'NONE',momentum_state:'BUILDING',momentum_sell_signal:'NONE',lastSeenAt:stale}
]};
const current=[
 {symbol:'ESLT',score:6.09,confidence:.77,event_risk:'NONE',momentum_state:'BUILDING',momentum_sell_signal:'NONE'},
 {symbol:'REV',score:8,confidence:.9,event_risk:'NONE',momentum_state:'REVERSAL',momentum_sell_signal:'STRONG'},
 {symbol:'EVENT',score:8,confidence:.9,event_risk:'HIGH',momentum_state:'BUILDING',momentum_sell_signal:'NONE'},
 {symbol:'BAD.V',score:9,confidence:.9,event_risk:'NONE',momentum_state:'BUILDING',momentum_sell_signal:'NONE'}
];
const watch=buildSecondChanceWatch(previous,current,now);
assert.ok(watch.candidates.some(x=>x.symbol==='ESLT'),'Starker neuer Kandidat muss in die 12m-Watchlist');
assert.ok(watch.candidates.some(x=>x.symbol==='KEEP'),'Noch frischer starker Kandidat soll erhalten bleiben');
assert.equal(watch.candidates.some(x=>x.symbol==='STALE'),false,'Abgelaufene Kandidaten muessen entfernt werden');
assert.equal(watch.candidates.some(x=>x.symbol==='REV'),false,'Reversal darf nicht gehalten werden');
assert.equal(watch.candidates.some(x=>x.symbol==='EVENT'),false,'HIGH-Eventrisiko darf nicht gehalten werden');
assert.equal(watch.candidates.some(x=>x.symbol==='BAD.V'),false,'Venture-Symbol darf nicht gehalten werden');
assert.ok(watch.candidates.length<=SECOND_CHANCE_TARGET,'Watchlist muss begrenzt bleiben');
assert.equal(watch.forcedBuy,false,'Watchlist darf keinen Kauf erzwingen');
assert.equal(watch.requiresFreshOneMinuteRecheck,true,'Wiedereintritt muss frischen 1m-Zweitcheck verlangen');
console.log(JSON.stringify({ok:true,count:watch.candidateCount,retentionMinutes:watch.retentionMinutes,recheckPerScan:watch.recheckPerScan,symbols:watch.candidates.map(x=>x.symbol)},null,2));
