const $=id=>document.getElementById(id);
let currency="EUR",initialized=false;
const fmt=(v,d=2)=>Number(v||0).toLocaleString("de-DE",{minimumFractionDigits:d,maximumFractionDigits:d});
const money=v=>`${fmt(v)} ${currency==="EUR"?"€":"$"}`;
const pct=v=>`${Number(v)>=0?"+":""}${fmt(v,2)}%`;
const dt=s=>s?new Date(s).toLocaleString("de-DE"):"–";

async function api(path,opts={}){
  const r=await fetch(path,opts),j=await r.json();
  if(!r.ok) throw new Error(j.error||`HTTP ${r.status}`);
  return j;
}

function drawChart(rows){
  const c=$("chart"),ctx=c.getContext("2d"),w=c.width,h=c.height;
  ctx.clearRect(0,0,w,h);ctx.strokeStyle="#20324a";ctx.lineWidth=1;
  for(let i=1;i<5;i++){const y=i*h/5;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
  if(!rows||rows.length<2){ctx.fillStyle="#8fa3bd";ctx.font="16px sans-serif";ctx.fillText("Noch nicht genug Scans.",20,35);return}
  const vals=rows.map(x=>Number(x.equity));let min=Math.min(...vals),max=Math.max(...vals);
  if(min===max){min-=1;max+=1}
  const pad=(max-min)*.12;min-=pad;max+=pad;ctx.strokeStyle="#7aabff";ctx.lineWidth=3;ctx.beginPath();
  vals.forEach((v,i)=>{const x=12+i/(vals.length-1)*(w-24),y=h-15-(v-min)/(max-min)*(h-32);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});
  ctx.stroke();ctx.fillStyle="#cbd9ec";ctx.font="12px sans-serif";ctx.fillText(`${fmt(max)} – ${fmt(min)} ${currency}`,12,15);
}

function pieColor(i){
  const hue=(i*137.508+205)%360;
  return `hsl(${hue} 68% 62%)`;
}

function drawAllocation(positions,cash){
  const c=$("allocationChart"),ctx=c.getContext("2d"),w=c.width,h=c.height;
  ctx.clearRect(0,0,w,h);
  const items=(positions||[]).map(p=>({
    name:p.symbol,
    detail:p.name||p.symbol,
    value:Number(p.invested)*(Number(p.last_price)/Number(p.entry_price))
  })).filter(x=>x.value>0);
  if(Number(cash)>0) items.push({name:"CASH",detail:"Nicht investiert",value:Number(cash)});
  const total=items.reduce((s,x)=>s+x.value,0);
  if(total<=0){
    ctx.fillStyle="#8fa3bd";ctx.font="16px sans-serif";ctx.textAlign="center";ctx.fillText("Noch keine Depotaufteilung.",w/2,h/2);ctx.textAlign="start";
    $("allocationLegend").innerHTML="";
    return;
  }

  const cx=w/2,cy=h/2-5,r=Math.min(w,h)*.33,inner=r*.52;
  let start=-Math.PI/2;
  items.forEach((item,i)=>{
    const a=(item.value/total)*Math.PI*2,end=start+a;
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,start,end);ctx.closePath();ctx.fillStyle=pieColor(i);ctx.fill();
    start=end;
  });
  ctx.globalCompositeOperation="destination-out";ctx.beginPath();ctx.arc(cx,cy,inner,0,Math.PI*2);ctx.fill();ctx.globalCompositeOperation="source-over";
  ctx.textAlign="center";ctx.fillStyle="#eef5ff";ctx.font="700 24px sans-serif";ctx.fillText(money(total),cx,cy-2);
  ctx.fillStyle="#8fa3bd";ctx.font="12px sans-serif";ctx.fillText("aktuelle Aufteilung",cx,cy+20);ctx.textAlign="start";

  $("allocationLegend").innerHTML=items.map((item,i)=>{
    const share=item.value/total*100;
    return `<div class="legendItem"><span class="legendDot" style="background:${pieColor(i)}"></span><span class="legendName"><b>${item.name}</b> · ${fmt(share,1)}%</span><span class="legendValue">${money(item.value)}</span></div>`;
  }).join("");
}

function actionClass(a){return a==="KAUF"?"good":a==="VERKAUF"?"yellow":a==="FEHLER"?"bad":""}
function trendClass(label){return label==="BULLISH"?"bullish":label==="BEARISH"?"bearish":"neutral"}
function historyTime(h){
  if(h.action==="HALTEN"){
    const n=Math.max(1,Number(h.event_count)||1);
    const scanText=n>1?`Scan 1–${n} · `:`Scan 1 · `;
    return `${scanText}von ${dt(h.ts)}<br>bis ${dt(h.end_ts||h.ts)}`;
  }
  return dt(h.ts);
}

async function load(){
  try{
    const s=await api("/api/status"),c=s.config;currency=c.currency||"EUR";
    $("statusPill").textContent=c.running?"LÄUFT · 60 SEKUNDEN":"GESTOPPT";
    $("statusPill").className="pill "+(c.running?"on":"off");
    $("equity").textContent=money(s.equity);$("cash").textContent=money(c.cash);
    $("feesTotal").textContent=money(c.total_fees||0);
    $("pnl").textContent=`${s.pnl>=0?"+":""}${money(s.pnl)} · ${pct(s.pnl_pct)}`;$("pnl").className=s.pnl>=0?"good":"bad";
    $("positionCount").textContent=s.positions.length;$("universeCount").textContent=c.universe_count||"–";
    $("endTime").textContent=c.ends_at?`Ende ${dt(c.ends_at)}`:"–";
    $("scanInfo").textContent=`Scans: ${c.scan_count||0} · Letzter Scan: ${dt(c.last_scan)} · Universe-Stand: ${dt(c.universe_generated_at)} · News-Radar: ${dt(c.news_radar_updated_at)}`;
    $("aiSummary").textContent=`KI: ${c.ai_last_summary||"noch keine Marktentscheidung"}`;
    if(c.last_error){$("errorBox").style.display="block";$("errorBox").textContent=`Letzter Fehler: ${c.last_error}`}else $("errorBox").style.display="none";

    if(!initialized){
      $("startCapital").value=c.start_capital||100;
      $("currency").value=c.currency||"EUR";
      $("riskMode").value=c.risk_mode||"offensiv";
      $("includeEtfs").checked=Boolean(c.include_etfs);
      $("includeLeverage").checked=Boolean(c.include_leverage);
      $("aiEnabled").checked=Boolean(c.ai_enabled);
      const oldDefaultFees=!c.running&&Number(c.fee_fixed??1)===1&&Number(c.fee_percent??0)===0;
      $("feeFixed").value=Number(oldDefaultFees?3.70:(c.fee_fixed??3.70)).toFixed(2);
      $("feePercent").value=Number(oldDefaultFees?0.08:(c.fee_percent??0.08)).toFixed(2);
      initialized=true;
    }

    $("positionsBody").innerHTML=s.positions.map(p=>{
      const value=p.invested*(p.last_price/p.entry_price),pl=value-p.invested-(p.entry_fee||0);
      return `<tr><td><b>${p.symbol}</b><br><span class="muted">${p.name||""}</span></td><td><span class="type">${p.instrument_type}</span></td><td>${money(p.invested)}</td><td>${money(p.entry_fee||0)}</td><td>${fmt(p.last_price,3)}</td><td class="${pl>=0?"good":"bad"}">${pl>=0?"+":""}${money(pl)}</td></tr>`;
    }).join("")||'<tr><td colspan="6" class="muted">Keine offene Position.</td></tr>';

    $("candidatesBody").innerHTML=s.candidates.map(x=>`<tr>
      <td><b>${x.symbol}</b><br><span class="muted">${x.name||""}</span></td>
      <td><span class="type">${x.instrument_type}</span></td>
      <td class="${x.score>=5?"good":x.score<0?"bad":""}"><b>${fmt(x.score,2)}</b></td>
      <td>${pct(x.day_change)}</td><td>${pct(x.momentum5)}</td><td>${x.rsi==null?"–":fmt(x.rsi,1)}</td>
      <td class="${x.news_score>0?"good":x.news_score<0?"bad":""}">${fmt(x.news_score,1)}</td><td>${x.reason||""}</td>
    </tr>`).join("")||'<tr><td colspan="8" class="muted">Keine frischen Kurssignale. Der News-Radar läuft trotzdem weiter.</td></tr>';

    const trend=c.news_tendency_label||"NEUTRAL";
    $("newsTrendPill").textContent=`${trend} · ${fmt(c.news_tendency_score||0,2)}`;
    $("newsTrendPill").className=`trend ${trendClass(trend)}`;
    $("newsTrendSummary").textContent=c.news_tendency_summary||"Noch keine ausreichende Nachrichtenbasis.";
    $("newsRadarInfo").textContent=`Letzte Radar-Aktualisierung: ${dt(c.news_radar_updated_at)} · Der Radar prüft rotierend auch bei geschlossenem Markt.`;
    $("newsRadarBody").innerHTML=(s.newsRadar||[]).map(n=>`<tr>
      <td><b>${n.symbol}</b><br><span class="muted">${n.name||""}</span></td>
      <td><span class="trend ${trendClass(n.tendency)}">${n.tendency}</span></td>
      <td class="${n.news_score>0?"good":n.news_score<0?"bad":""}">${n.news_score>=0?"+":""}${fmt(n.news_score,2)}</td>
      <td>${n.headline||""}<br><span class="muted">${n.news_at?dt(n.news_at):""}</span></td>
    </tr>`).join("")||'<tr><td colspan="4" class="muted">Der News-Radar sammelt noch Daten.</td></tr>';

    $("historyBody").innerHTML=s.history.map(h=>`<tr>
      <td>${historyTime(h)}</td>
      <td class="${actionClass(h.action)}"><b>${h.action}</b></td>
      <td>${h.symbol||"–"}</td>
      <td class="${h.amount>0?"good":h.amount<0?"yellow":""}">${h.amount?`${h.amount>0?"+":""}${money(h.amount)}`:"–"}</td>
      <td>${h.fee?money(h.fee):"–"}</td>
      <td>${money(h.cash_after)}</td><td>${money(h.equity)}</td>
      <td class="${h.total_pnl>=0?"good":"bad"}">${h.total_pnl>=0?"+":""}${money(h.total_pnl)}</td><td>${h.reason||""}</td>
    </tr>`).join("")||'<tr><td colspan="9" class="muted">Noch keine History.</td></tr>';

    drawChart(s.snapshots);
    drawAllocation(s.positions,Number(c.cash));
  }catch(e){$("errorBox").style.display="block";$("errorBox").textContent=e.message}
}

$("startBtn").onclick=async()=>{
  const body={
    startCapital:Number($("startCapital").value),currency:$("currency").value,
    durationValue:Number($("durationValue").value),durationUnit:$("durationUnit").value,
    riskMode:$("riskMode").value,includeEtfs:$("includeEtfs").checked,
    includeLeverage:$("includeLeverage").checked,aiEnabled:$("aiEnabled").checked,
    feeFixed:Number($("feeFixed").value),feePercent:Number($("feePercent").value)
  };
  try{await api("/api/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});await load()}catch(e){alert(e.message)}
};
$("scanBtn").onclick=async()=>{try{await api("/api/scan",{method:"POST"});await load()}catch(e){alert(e.message)}};
$("stopBtn").onclick=async()=>{try{await api("/api/stop",{method:"POST"});await load()}catch(e){alert(e.message)}};
$("resetBtn").onclick=async()=>{if(confirm("Depot und komplette History löschen?")){try{await api("/api/reset",{method:"POST"});initialized=false;await load()}catch(e){alert(e.message)}}};

load();setInterval(load,5000);