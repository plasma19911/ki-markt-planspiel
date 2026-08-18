import assert from 'node:assert/strict';
import {evaluateSecondChance} from '../src/profit-optimizer-v2.js';

const eslt={symbol:'ESLT',score:6.09,confidence:.77,day_change:.40,news_score:.04,eventRisk:'NONE',momentum5:.15,momentum20:.32,momentumAcceleration5:.04,drawdownFrom20mHighPct:-.05,rsi:62,volumeRatio:1.20,momentumBreakoutScore:1.1,momentumState:'BUILDING',momentumSellSignal:'NONE',pro:['EMA9 über EMA21','Kurs über EMA21'],contra:[]};
const good=evaluateSecondChance(eslt,null);
assert.equal(good.confirmed,true,'ESLT-artiges starkes Near-High-Setup soll eine streng bestaetigte zweite Chance bekommen');
assert.ok(good.expected>=7.4,'Finaler Erwartungswert muss weiterhin ausreichend hoch sein');

assert.equal(evaluateSecondChance({...eslt,day_change:8.2,rsi:80},null).confirmed,false,'Spaete/ueberhitzte Gainer duerfen nicht durch Second-Chance gekauft werden');
assert.equal(evaluateSecondChance({...eslt,momentumState:'REVERSAL',momentumSellSignal:'STRONG'},null).confirmed,false,'Reversal bleibt blockiert');
assert.equal(evaluateSecondChance({...eslt,eventRisk:'HIGH'},null).confirmed,false,'HIGH-Eventrisiko bleibt blockiert');
assert.equal(evaluateSecondChance({...eslt,symbol:'BAD.V'},null).confirmed,false,'Venture-/OTC-artige Symbole bleiben blockiert');
assert.equal(evaluateSecondChance({...eslt,momentum5:.01,momentum20:.05,momentumAcceleration5:-.08},null).confirmed,false,'Fehlende kurzfristige Bestaetigung darf nicht umgangen werden');

console.log(JSON.stringify({ok:true,eslt:good,lateChaseBlocked:true,reversalBlocked:true,eventBlocked:true,venueBlocked:true},null,2));
