import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../src/compact-portfolio-v310-unified.js',import.meta.url),'utf8');
const start=src.indexOf('  async agentStatusLite(){'),end=src.indexOf('\n  }\n',start)+4;
assert.ok(start>0&&end>start,'agentStatusLite nicht gefunden');
const arr=v=>Array.isArray(v)?v:[];
const lite=new Function('arr',`return ({${src.slice(start,end)}}).agentStatusLite`)(arr);

// 1) Kalter Durable Object: RAM-Puffer leer -> persistenter Dashboard-Status statt leerer Listen.
{
  const self={bucketAdapter:{peekState:()=>null},_actualState:()=>({}),
    dashboardStatus:async()=>({positions:[{symbol:'BITTI.HE'}],candidates:[{symbol:'UPM.HE'}],history:[{id:1}]})};
  const r=await lite.call(self);
  assert.equal(r.positions.length,1,'Positionen muessen nach DO-Neustart sichtbar bleiben');
  assert.equal(r.candidates[0].symbol,'UPM.HE');
}
// 2) Warmer RAM-Puffer wird direkt genutzt, ohne teuren Statusaufbau.
{
  let built=false;
  const self={bucketAdapter:{peekState:()=>({positions:[{symbol:'A'}],candidates:[],history:[]})},_actualState:()=>({}),dashboardStatus:async()=>{built=true;return{}}};
  const r=await lite.call(self);
  assert.equal(r.positions[0].symbol,'A');assert.equal(built,false);
}
// 3) Echt leeres Depot bleibt leer (kein Fallback erfindet Daten).
{
  const self={bucketAdapter:{peekState:()=>({positions:[],candidates:[],history:[]})},dashboardStatus:async()=>{throw new Error('darf nicht laufen')}};
  const r=await lite.call(self);assert.deepEqual(r,{positions:[],candidates:[],history:[]});
}
// 4) Zu wenige Minutenkerzen gelten nicht als Quellenausfall.
{
  const base=readFileSync(new URL('../src/market-v3-base.js',import.meta.url),'utf8');
  assert.ok(!base.includes("cl.length<22)throw new Error('Zu wenig Minuten')"),'Zu wenig Minuten darf Yahoo 1m nicht als DEGRADED markieren');
  const v3=readFileSync(new URL('../src/market-v3.js',import.meta.url),'utf8');
  assert.ok(!v3.includes("error:'Zu wenig Minuten',sourceOk:false"),'Second-Chance darf duenne Minutenhistorie nicht als Quellenfehler zaehlen');
}
console.log('v31748 lite-status + insufficient-bars: ok');
