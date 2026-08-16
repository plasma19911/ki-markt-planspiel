const $=id=>document.getElementById(id);
let currency="EUR";
const fmt=(v,d=2)=>Number(v||0).toLocaleString("de-DE",{minimumFractionDigits:d,maximumFractionDigits:d});
const money=v=>`${fmt(v)} ${currency==="EUR"?"€":"$"}`;
const pct=v=>`${Number(v)>=0?"+":""}${fmt(v,2)}%`;
const dt=s=>s?new Date(s).toLocaleString("de-DE"):"–";

async function api(path, opts={}){
  const r=await fetch(path,opts);
  const j=await r.json();
  if(!r.ok) throw new Error(j.error||`HTTP ${r.status}`);
  return j;
}

function drawChart(rows){
  const c=$("chart"),ctx=c.getContext("2d"),w=c.width,h=c.height;
  ctx.clearRect(0,0,w,h);ctx.strokeStyle="#20324a";ctx.lineWidth=1;
  for(let i=1;i<5;i++){let y=i*h/5;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
  if(!rows||rows.length<2){ctx.fillStyle="#8fa3bd";ctx.font="16px sans-serif";ctx.fillText("Noch nicht genug Scans.",20,35);return}
  const vals=rows.map(x=>Number(x.equity));let min=Math.min(...vals),max=Math.max(...vals);if(min===max){min-=1;max+=1}
  const pad=(max-min)*.12;min-=pad;max+=pad;ctx.strokeStyle="#7aabff";ctx.lineWidth=3;ctx.beginPath();
  vals.forEach((v,i)=>{const x=12+i/(vals.length-1)*(w-24),y=h-15-(v-min)/(max-min)*(h-32);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();
  ctx.fillStyle="#cbd9ec";ctx.font="12px sans-serif";ctx.fillText(`${fmt(max)} – ${fmt(min)} ${currency}`,12,15);
}

function actionClass(a){return a==="KAUF"?"good":a==="VERKAUF"?"yellow":a==="FEHLER"?"bad":""}

async function load(){
  try{
    const s=await api("/api/status"),c=s.config;currency=c.currency||"EUR";
    $("statusPill").textContent=c.running?"LÄUFT · 60 SEKUNDEN":"GESTOPPT";
    $("statusPill").className="pill "+(c.running?"on":"off");
    $("equity").textContent=money(s.equity);$("cash").textContent=money(c.cash);
    $("pnl").textContent=`${s.pnl>=0?"+":""}${money(s.pnl)} · ${pct(s.pnl_pct)}`;$("pnl").className=s.pnl>=0?"good":"bad";
    $("positionCount").textContent=s.positions.length;$("scanCount").textContent=c.scan_count;$("universeCount").textContent=c.universe_count||"–";
    $("endTime").textContent=c.ends_at?`Ende ${dt(c.ends_at)}`:"–";
    $("scanInfo").textContent=`Letzter Scan: ${dt(c.last_scan)} · Universe-Stand: ${dt(c.universe_generated_at)} · GitHub aktualisiert die Top-500-Liste täglich.`;
    $("aiSummary").textContent=`KI: ${c.ai_last_summary||"noch keine Entscheidung"}`;
    if(c.last_error){$("errorBox").style.display="block";$("errorBox").textContent=`Letzter Fehler: ${c.last_error}`} else $("errorBox").style.display="none";

    $("positionsBody").innerHTML=s.positions.map(p=>{
      const value=p.invested*(p.last_price/p.entry_price),pl=value-p.invested;
      return `<tr><td><b>${p.symbol}</b><br><span class="muted">${p.name||""}</span></td><td><span class="type">${p.instrument_type}</span></td><td>${money(p.invested)}</td><td>${fmt(p.last_price,3)}</td><td class="${pl>=0?"good":"bad"}">${pl>=0?"+":""}${money(pl)}</td></tr>`
    }).join("")||'<tr><td colspan="5" class="muted">Keine offene Position.</td></tr>';

    $("candidatesBody").innerHTML=s.candidates.map(x=>`<tr>
      <td><b>${x.symbol}</b><br><span class="muted">${x.name||""}</span></td>
      <td><span class="type">${x.instrument_type}</span></td>
      <td class="${x.score>=5?"good":x.score<0?"bad":""}"><b>${fmt(x.score,2)}</b></td>
      <td>${pct(x.day_change)}</td><td>${pct(x.momentum5)}</td><td>${x.rsi==null?"–":fmt(x.rsi,1)}</td>
      <td class="${x.news_score>0?"good":x.news_score<0?"bad":""}">${fmt(x.news_score,1)}</td><td>${x.reason||""}</td>
    </tr>`).join("")||'<tr><td colspan="8" class="muted">Noch keine Kandidaten.</td></tr>';

    $("historyBody").innerHTML=s.history.map(h=>`<tr>
      <td>${dt(h.ts)}</td><td class="${actionClass(h.action)}"><b>${h.action}</b></td><td>${h.symbol||"–"}</td>
      <td class="${h.amount>0?"good":h.amount<0?"yellow":""}">${h.amount?`${h.amount>0?"+":""}${money(h.amount)}`:"–"}</td>
      <td>${money(h.cash_after)}</td><td>${money(h.equity)}</td>
      <td class="${h.total_pnl>=0?"good":"bad"}">${h.total_pnl>=0?"+":""}${money(h.total_pnl)}</td><td>${h.reason||""}</td>
    </tr>`).join("")||'<tr><td colspan="8" class="muted">Noch keine History.</td></tr>';
    drawChart(s.snapshots);
  }catch(e){$("errorBox").style.display="block";$("errorBox").textContent=e.message}
}

$("startBtn").onclick=async()=>{
  const body={
    startCapital:Number($("startCapital").value),currency:$("currency").value,
    durationValue:Number($("durationValue").value),durationUnit:$("durationUnit").value,
    riskMode:$("riskMode").value,includeEtfs:$("includeEtfs").checked,
    includeLeverage:$("includeLeverage").checked,aiEnabled:$("aiEnabled").checked
  };
  try{await api("/api/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});await load()}catch(e){alert(e.message)}
};
$("scanBtn").onclick=async()=>{try{await api("/api/scan",{method:"POST"});await load()}catch(e){alert(e.message)}};
$("stopBtn").onclick=async()=>{try{await api("/api/stop",{method:"POST"});await load()}catch(e){alert(e.message)}};
$("resetBtn").onclick=async()=>{if(confirm("Depot und komplette History löschen?")){try{await api("/api/reset",{method:"POST"});await load()}catch(e){alert(e.message)}}};

load();setInterval(load,5000);
