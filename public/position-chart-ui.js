const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const fmt=(v,d=2)=>Number(v||0).toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d});
let state=null,selected=null,range='1d',chartData=null,loading=false;

function installCompactStyle(){
 if(document.getElementById('compact-trade-chart-style'))return;
 const s=document.createElement('style');s.id='compact-trade-chart-style';s.textContent=`
 #positionTradeChart.positionTradeChart{display:block!important;order:10!important;grid-column:1/-1!important;width:100%!important;max-width:980px!important;justify-self:start!important;padding:14px!important;min-height:0!important}
 #positionTradeChart .cardTitle{margin-bottom:8px!important}
 #positionTradeChart .cardTitle h2{font-size:17px!important}
 #positionTradeChart .tradeChartSymbols{display:flex!important;flex-wrap:wrap!important;gap:6px!important;margin:0 0 8px!important}
 #positionTradeChart .tradeSymbol{border:1px solid #29445d!important;background:#0c1b29!important;color:#dbe9f5!important;border-radius:9px!important;padding:6px 9px!important;min-height:34px!important;cursor:pointer!important}
 #positionTradeChart .tradeSymbol b{font-size:12px!important}.tradeSymbol span{display:block!important;margin-top:1px!important;font-size:9px!important;color:#849ab0!important}
 #positionTradeChart .tradeSymbol.active{border-color:#3d7ca2!important;background:#10283a!important}
 #positionTradeChart .tradeChartToolbar{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;margin:0 0 7px!important}
 #positionTradeChart .tradeChartRanges{display:flex!important;gap:5px!important}.tradeChartRanges button{border:1px solid #29445d!important;background:#0b1824!important;color:#9fb5c9!important;border-radius:8px!important;padding:5px 8px!important;font-size:10px!important;cursor:pointer!important}.tradeChartRanges button.active{color:#e8f5ff!important;border-color:#3d7ca2!important;background:#10283a!important}
 #positionTradeChart .tradeChartLegend{display:flex!important;gap:10px!important;font-size:10px!important;color:#9eb2c4!important}.tradeChartLegend span{display:flex!important;align-items:center!important;gap:4px!important}.tradeChartLegend i{display:inline-block!important;width:8px!important;height:8px!important;border-radius:50%!important}.tradeChartLegend .buyDot{background:#46d69a!important}.tradeChartLegend .sellDot{background:#ff7080!important}
 #positionTradeChart .tradeCanvasWrap{position:relative!important;width:100%!important;height:220px!important;min-height:220px!important;max-height:220px!important;overflow:hidden!important;border:1px solid rgba(74,108,137,.28)!important;border-radius:10px!important;background:#081521!important}
 #positionTradeChart #tradeChartCanvas{display:block!important;width:100%!important;height:220px!important;min-height:220px!important;max-height:220px!important}
 #positionTradeChart .tradeChartEmpty{position:absolute!important;inset:0!important;display:grid!important;place-items:center!important;padding:16px!important;color:#8196aa!important;font-size:12px!important;text-align:center!important}.tradeChartEmpty[hidden]{display:none!important}
 #positionTradeChart .tradeChartInfo{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:7px!important;margin-top:8px!important}.tradeChartInfo>div{padding:7px 9px!important;border:1px solid rgba(67,94,118,.28)!important;border-radius:9px!important;background:#0a1824!important}.tradeChartInfo span{display:block!important;font-size:9px!important;color:#8499ad!important}.tradeChartInfo b{display:block!important;margin-top:2px!important;font-size:12px!important}
 @media(max-width:900px){#positionTradeChart.positionTradeChart{max-width:none!important}#positionTradeChart .tradeCanvasWrap,#positionTradeChart #tradeChartCanvas{height:200px!important;min-height:200px!important;max-height:200px!important}}
 @media(max-width:520px){#positionTradeChart.positionTradeChart{padding:10px!important}#positionTradeChart .tradeChartToolbar{align-items:flex-start!important;flex-direction:column!important}#positionTradeChart .tradeCanvasWrap,#positionTradeChart #tradeChartCanvas{height:180px!important;min-height:180px!important;max-height:180px!important}#positionTradeChart .tradeChartInfo{grid-template-columns:1fr 1fr!important}.tradeChartLegend{font-size:9px!important}}
 `;document.head.appendChild(s)
}

function ensure(){
 let card=$('positionTradeChart');if(card)return card;
 const pos=$('positions');if(!pos)return null;
 card=document.createElement('section');card.id='positionTradeChart';card.className='card positionTradeChart';
 card.innerHTML=`<div class="cardTitle"><div><span class="sectionEyebrow">TRADES</span><h2>Aktien-Chart mit Kauf &amp; Verkauf</h2><div id="tradeChartSubtitle" class="muted">Kauf- und Verkaufspunkte direkt im Kursverlauf</div></div><span id="tradeChartPill" class="tag">–</span></div><div id="tradeChartSymbols" class="tradeChartSymbols"></div><div class="tradeChartToolbar"><div class="tradeChartRanges"><button type="button" data-range="1d" class="active">1 Tag</button><button type="button" data-range="5d">5 Tage</button><button type="button" data-range="1mo">1 Monat</button></div><div class="tradeChartLegend"><span><i class="buyDot"></i>Kauf</span><span><i class="sellDot"></i>Verkauf</span></div></div><div class="tradeCanvasWrap"><canvas id="tradeChartCanvas"></canvas><div id="tradeChartEmpty" class="tradeChartEmpty">Noch keine gehandelte Aktie.</div></div><div id="tradeChartInfo" class="tradeChartInfo"></div>`;
 pos.insertAdjacentElement('afterend',card);
 card.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{range=b.dataset.range;card.querySelectorAll('[data-range]').forEach(x=>x.classList.toggle('active',x===b));loadChart(true)});
 return card;
}

function symbolsFromStatus(s){
 const m=new Map();
 for(const p of s?.positions||[]){const sym=String(p.symbol||'').toUpperCase();if(sym)m.set(sym,{symbol:sym,name:p.name||sym,open:true,position:p})}
 for(const h of s?.history||[]){const a=String(h.action||'').toUpperCase();if(!['KAUF','VERKAUF','BUY','SELL'].includes(a))continue;const sym=String(h.symbol||'').toUpperCase();if(!sym)continue;const old=m.get(sym)||{symbol:sym,name:h.name||sym,open:false,position:null};if(!old.name||old.name===sym)old.name=h.name||sym;m.set(sym,old)}
 return [...m.values()].slice(0,12);
}

function renderSymbols(){
 const el=$('tradeChartSymbols');if(!el||!state)return;const rows=symbolsFromStatus(state);
 if(!rows.length){el.innerHTML='';selected=null;showEmpty('Noch keine gehandelte Aktie. Sobald die KI kauft, erscheint hier automatisch der Kurs mit Einstieg.');return}
 if(!selected||!rows.some(x=>x.symbol===selected))selected=(rows.find(x=>x.open)||rows[0]).symbol;
 el.innerHTML=rows.map(x=>`<button type="button" class="tradeSymbol ${x.symbol===selected?'active':''}" data-symbol="${esc(x.symbol)}"><b>${esc(x.symbol)}</b><span>${x.open?'OFFEN':'HISTORIE'}</span></button>`).join('');
 el.querySelectorAll('[data-symbol]').forEach(b=>b.onclick=()=>{selected=b.dataset.symbol;renderSymbols();loadChart(true)});
}

function showEmpty(text){const e=$('tradeChartEmpty'),c=$('tradeChartCanvas');if(e){e.textContent=text;e.hidden=false}if(c)c.style.visibility='hidden';if($('tradeChartInfo'))$('tradeChartInfo').innerHTML=''}
function showCanvas(){const e=$('tradeChartEmpty'),c=$('tradeChartCanvas');if(e)e.hidden=true;if(c)c.style.visibility='visible'}

function setupCanvas(canvas){
 const rect=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1),w=Math.max(300,Math.round(rect.width||700)),h=Math.max(180,Math.round(rect.height||220));
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);const x=canvas.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);return{x,w,h};
}

function nearestBar(bars,ts){let best=null,dist=Infinity;for(const b of bars){const d=Math.abs(Number(b.ts)-Number(ts));if(d<dist){dist=d;best=b}}return best}
function draw(){
 const canvas=$('tradeChartCanvas');if(!canvas||!chartData?.bars?.length)return showEmpty('Keine Kursdaten für diesen Zeitraum verfügbar.');showCanvas();
 const {x,w,h}=setupCanvas(canvas),bars=chartData.bars,prices=bars.map(b=>num(b.close)).filter(v=>v>0);if(!prices.length)return showEmpty('Keine Kursdaten verfügbar.');
 const padL=58,padR=18,padT=25,padB=32,plotW=w-padL-padR,plotH=h-padT-padB,min0=Math.min(...prices),max0=Math.max(...prices),span=Math.max(max0-min0,max0*.004),min=min0-span*.12,max=max0+span*.12,t0=Number(bars[0].ts),t1=Number(bars.at(-1).ts)||t0+1;
 const px=t=>padL+(Number(t)-t0)/Math.max(1,t1-t0)*plotW,py=p=>padT+(max-Number(p))/Math.max(.000001,max-min)*plotH;
 x.clearRect(0,0,w,h);x.font='11px system-ui, sans-serif';x.lineWidth=1;
 for(let i=0;i<=4;i++){const y=padT+i*plotH/4,v=max-i*(max-min)/4;x.strokeStyle='rgba(122,171,255,.12)';x.beginPath();x.moveTo(padL,y);x.lineTo(w-padR,y);x.stroke();x.fillStyle='#8fa3bd';x.textAlign='right';x.fillText(fmt(v,v<10?3:2),padL-8,y+4)}
 x.strokeStyle='#78d6ff';x.lineWidth=2;x.beginPath();bars.forEach((b,i)=>{const xx=px(b.ts),yy=py(b.close);i?x.lineTo(xx,yy):x.moveTo(xx,yy)});x.stroke();
 const entry=num(chartData?.position?.entryPrice,0);if(entry>0){const y=py(entry);x.setLineDash([5,5]);x.strokeStyle='rgba(70,214,154,.42)';x.beginPath();x.moveTo(padL,y);x.lineTo(w-padR,y);x.stroke();x.setLineDash([]);x.fillStyle='#46d69a';x.textAlign='left';x.fillText(`Einstieg ${fmt(entry,entry<10?3:2)}`,padL+7,Math.max(14,y-6))}
 for(const e of chartData.events||[]){const ts=Date.parse(e.ts),b=nearestBar(bars,ts),price=num(e.price,b?.close);if(!b||!(price>0))continue;const xx=px(b.ts),yy=py(price),buy=['KAUF','BUY'].includes(String(e.action).toUpperCase());x.fillStyle=buy?'#46d69a':'#ff7080';x.strokeStyle='#07101b';x.lineWidth=2;x.beginPath();if(buy){x.moveTo(xx,yy-11);x.lineTo(xx-7,yy+3);x.lineTo(xx+7,yy+3)}else{x.moveTo(xx,yy+11);x.lineTo(xx-7,yy-3);x.lineTo(xx+7,yy-3)}x.closePath();x.fill();x.stroke();x.fillStyle=buy?'#79e7b5':'#ff9aa6';x.font='700 10px system-ui, sans-serif';x.textAlign=xx>w*.72?'right':'left';x.fillText(buy?'KAUF':'VERKAUF',xx+(xx>w*.72?-10:10),buy?yy-7:yy+14)}
 x.fillStyle='#8fa3bd';x.font='10px system-ui, sans-serif';x.textAlign='left';x.fillText(new Date(t0).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}),padL,h-9);x.textAlign='right';x.fillText(new Date(t1).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}),w-padR,h-9);
 const last=prices.at(-1),first=prices[0],change=first?(last/first-1)*100:0,p=chartData.position||{};
 if($('tradeChartPill')){$('tradeChartPill').textContent=`${change>=0?'+':''}${fmt(change)}% · ${range==='1d'?'1T':range==='5d'?'5T':'1M'}`;$('tradeChartPill').className=`tag ${change>=0?'good':'bad'}`}
 if($('tradeChartSubtitle'))$('tradeChartSubtitle').textContent=`${chartData.name||chartData.symbol} · ${chartData.symbol}`;
 const pnl=p.entryPrice>0&&last>0?(last/p.entryPrice-1)*100:null;
 if($('tradeChartInfo'))$('tradeChartInfo').innerHTML=`<div><span>Letzter Kurs</span><b>${fmt(last,last<10?3:2)}</b></div><div><span>Einstieg</span><b>${p.entryPrice?fmt(p.entryPrice,p.entryPrice<10?3:2):'–'}</b></div><div><span>Seit Einstieg</span><b class="${pnl==null?'':pnl>=0?'good':'bad'}">${pnl==null?'–':`${pnl>=0?'+':''}${fmt(pnl)}%`}</b></div><div><span>Kauf/Verkauf-Punkte</span><b>${(chartData.events||[]).length}</b></div>`;
}

async function loadChart(force=false){
 if(!selected||loading)return;loading=true;try{
  const r=await fetch(`/api/position-chart?symbol=${encodeURIComponent(selected)}&range=${encodeURIComponent(range)}${force?`&t=${Date.now()}`:''}`,{cache:'no-store'});if(!r.ok){let e={};try{e=await r.json()}catch{}throw new Error(e.error||`HTTP ${r.status}`)}chartData=await r.json();draw();
 }catch(e){showEmpty(`Chart konnte nicht geladen werden: ${e.message}`)}finally{loading=false}
}

async function refresh(){
 const card=ensure();if(!card||document.hidden)return;try{const r=await fetch('/api/status',{cache:'no-store'});if(!r.ok)return;state=await r.json();renderSymbols();if(selected)await loadChart(false)}catch{}
}

function install(){installCompactStyle();ensure();refresh();setInterval(refresh,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});window.addEventListener('resize',()=>{if(chartData)draw()})}
install();
