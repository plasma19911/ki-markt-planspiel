import assert from 'node:assert/strict';
import fs from 'node:fs';
import {classifyHardExit} from '../src/hard-exit-classifier.js';

const micro=classifyHardExit({momentumState:'REVERSAL',momentumSellSignal:'STRONG',momentum5:-.18,momentum20:-.42,drawdownFrom20mHighPct:-.55},{reason:'FAST-SELL Momentum-Reversal STRONG'});
assert.equal(micro.hard,false,'Mikro-Reversal darf Candle-Flow nicht mehr als harten Sofortexit umgehen');
assert.equal(micro.momentumAlarm,true);

const severe=classifyHardExit({momentumState:'REVERSAL',momentumSellSignal:'STRONG',momentum5:-1.05,momentum20:-1.7,drawdownFrom20mHighPct:-1.8},{});
assert.equal(severe.hard,true,'Echter schneller Kursbruch muss sofort ausstiegsfaehig bleiben');
assert.equal(severe.flashBreak,true);

assert.equal(classifyHardExit({eventRisk:'HIGH'},{reason:'news'}).hard,true,'HIGH-Event-Risk bleibt harter Exit');
assert.equal(classifyHardExit({},{reason:'STOP-LOSS: harte Verlustgrenze'}).hard,true,'Expliziter Stop-Loss bleibt harter Exit');

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const fresh=read('src/fresh-position-churn-guard.js'),candle=read('src/candle-flow-ai-guard.js');
assert.match(fresh,/classifyHardExit/,'Fresh-position guard muss den gemeinsamen Hard-Exit-Klassifizierer verwenden');
assert.match(candle,/classifyHardExit/,'Candle-Flow muss denselben Hard-Exit-Klassifizierer verwenden');
assert.doesNotMatch(candle,/e==='HIGH'\|\|s==='REVERSAL'\|\|x==='STRONG'/,'REVERSAL/STRONG darf nicht mehr pauschal Candle-Flow umgehen');

console.log(JSON.stringify({ok:true,microReversalNeedsCandles:!micro.hard,severeBreakImmediate:severe.hard,eventImmediate:true,stopLossImmediate:true},null,2));
