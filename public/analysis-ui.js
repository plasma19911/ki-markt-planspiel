const byId=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=2)=>Number(v||0).toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d});
const eur=v=>`${fmt(v)} €`;
const pct=v=>`${Number(v)>=0?'+':''}${fmt(v)}%`;
const date=v=>v?new Date(`${v}T12:00:00Z`).toLocaleDateString('de-DE'):'–';
let cache=null;

function assetType(t){return t==='ETF'?'ETF':'Aktie'}
function kpi(label,value,cls=''){return `<div class="mini ${cls}"><span>${esc(label)}</span><b>${esc(value)}</b></div>`}
function tradeRows(trades){
  if(!trades?.length)return '<tr><td colspan="7">Keine abgeschlossenen Trades in dieser Rekonstruktion.</td></tr>';
  return trades.map((t,i)=>`<tr>
    <td>${i+1}</td>
    <td><b>${esc(t.symbol)}</b><br><span class="muted">${esc(t.name||'')} · ${assetType(t.type)}</span></td>
    <td>${date(t.buyAt)}</td>
    <td>${date(t.sellAt)}</td>
    <td>${eur((Number(t.buyFee)||0)+(Number(t.sellFee)||0))}</td>
    <td class="${Number(t.pnl)>=0?'good':'bad'}">${Number(t.pnl)>=0?'+':''}${eur(t.pnl)}<br><span class="muted">${pct(t.returnPct)}</span></td>
    <td>${eur(t.capitalAfter)}</td>
  </tr>`).join('');
}

function resultCard(title,badge,r,noteExtra=''){
  const good=Number(r.profit)>=0;
  return `<section class="card compareResult">
    <div class="cardTitle"><h2>${esc(title)}</h2><span class="tag">${esc(badge)}</span></div>
    <div class="compareKpis">
      ${kpi('Start',eur(r.startCapital))}
      ${kpi('Endkapital',eur(r.endCapital),good?'good':'bad')}
      ${kpi('Gewinn',`${good?'+':''}${eur(r.profit)}`,good?'good':'bad')}
      ${kpi('Rendite',pct(r.returnPct),good?'good':'bad')}
      ${kpi('Trades',String(r.trades?.length||0))}
    </div>
    <div class="trendSummary">${esc(r.note||'')} ${esc(noteExtra)}</div>
    <div class="tableWrap weekActions"><table><thead><tr><th>#</th><th>Wert</th><th>Kauf</th><th>Verkauf</th><th>Gebühren</th><th>Trade P/L</th><th>Kapital danach</th></tr></thead><tbody>${tradeRows(r.trades)}</tbody></table></div>
  </section>`;
}

function render(data){
  cache=data;
  const style=byId('analysisStyle')?.value||byId('riskMode')?.value||'offensiv';
  const walk=data.walkForward?.[style]||data.walkForward?.offensiv;
  const p=data.perfect;
  byId('analysisMeta').innerHTML=`Zeitraum <b>${date(data.period?.from)} – ${date(data.period?.to)}</b> · ${Number(data.usableSymbols||0)} nutzbare Werte · ${Number(data.universe?.equities||0)} Aktien + ${Number(data.universe?.etfs||0)} ETFs · <b>keine Hebelprodukte</b> · Datenstand ${data.generatedAt?new Date(data.generatedAt).toLocaleString('de-DE'):'–'}`;
  byId('perfectResult').innerHTML=resultCard('Perfekter Rückblick','mit Zukunftswissen',p,'Das ist die theoretische Messlatte innerhalb des verwendeten Tagesdaten-Modells.');
  byId('walkResult').innerHTML=resultCard('KI hätte damals gemacht',`Walk-Forward · ${style}`,walk,'Die Strategie kennt an jedem Tag nur Daten bis zu diesem Tag. Historische News werden nicht nachträglich erfunden.');
  byId('analysisCompare').innerHTML=`<b>Abstand zur theoretischen Messlatte:</b> ${eur(Number(p.endCapital)-Number(walk.endCapital))} · KI-Rekonstruktion erreichte ${p.endCapital?fmt(Number(walk.endCapital)/Number(p.endCapital)*100,1):'0,0'}% des perfekten Endkapitals.`;
}

async function loadAnalysis(force=false){
  const btn=byId('analysisRunBtn');
  if(btn){btn.disabled=true;btn.textContent='2026-Daten werden geladen …'}
  byId('analysisError').textContent='';
  try{
    const r=await fetch(`/analysis-2026.json${force?`?t=${Date.now()}`:''}`,{cache:'no-store'});
    if(!r.ok)throw new Error(`2026-Auswertung noch nicht verfügbar (HTTP ${r.status}). Die tägliche GitHub-Berechnung läuft möglicherweise noch.`);
    const j=await r.json();
    if(!j?.perfect||!j?.walkForward)throw new Error('2026-Auswertung ist unvollständig.');
    render(j);
  }catch(e){
    byId('analysisError').textContent=String(e?.message||e);
    byId('perfectResult').innerHTML='';byId('walkResult').innerHTML='';
  }finally{
    if(btn){btn.disabled=false;btn.textContent='2026-Auswertung neu laden'}
  }
}

function install(){
  const panel=byId('weekPanel');
  if(!panel)return;
  panel.innerHTML=`
    <section class="card">
      <div class="cardTitle"><h2>2026 · 100-€-Analyse</h2><span class="tag">Aktien + ETFs</span></div>
      <div class="notice"><b>Zwei getrennte Sichtweisen:</b> <b>Perfekter Rückblick</b> kennt den gesamten Zeitraum und zeigt die theoretische Messlatte. <b>KI hätte damals gemacht</b> läuft chronologisch vorwärts und darf pro Tag nur bis dahin bekannte Markt-/Volumendaten verwenden. Beide starten am 01.01.2026 mit 100 € aus EUR-Sicht. Normale Aktien und ETFs sind erlaubt; Hebel-/Inverse-Produkte sind vollständig ausgeschlossen.</div>
      <div class="analysisControls"><label>KI-Handelsstil für Walk-Forward<select id="analysisStyle"><option value="vorsichtig">Vorsichtig</option><option value="ausgewogen">Ausgewogen</option><option value="offensiv">Offensiv</option></select></label><button id="analysisRunBtn" type="button">2026-Auswertung laden</button></div>
      <div id="analysisMeta" class="muted"></div><div id="analysisError" class="error"></div>
    </section>
    <div id="analysisCompare" class="trendSummary"></div>
    <div id="perfectResult"></div>
    <div id="walkResult"></div>`;

  const style=byId('riskMode')?.value||'offensiv';byId('analysisStyle').value=style;
  byId('analysisStyle').onchange=()=>cache&&render(cache);
  byId('analysisRunBtn').onclick=()=>loadAnalysis(true);
  byId('weekTabBtn')?.addEventListener('click',()=>{if(!cache)loadAnalysis(false)});

  // Alte Hebel-Beschriftungen aus dem Live-Frontend entfernen. App.js aktualisiert einige Texte periodisch,
  // daher sorgen MutationObserver dafuer, dass die produktive Anzeige konsistent bleibt.
  const replacements=[
    ['executionInfo','Aktien und normale ETFs sind immer aktiv · keine Hebel-/Inverse-Produkte · keine künstliche Mindestorder, Positionszahl oder Haltedauer.'],
    ['riskBox','Budget-only-Modus: Aktien + normale ETFs. Keine Hebel-/Inverse-Produkte und keine harte Positionszahl, Haltedauer-, Branchen-, Reserve- oder Cooldown-Grenze.']
  ];
  for(const [id,text] of replacements){const el=byId(id);if(!el)continue;const apply=()=>{if(el.textContent!==text)el.textContent=text};new MutationObserver(apply).observe(el,{childList:true,subtree:true,characterData:true});apply()}

  document.querySelectorAll('header p,.notice,.cardTitle .tag').forEach(el=>{
    el.textContent=el.textContent.replace(/\s*·?\s*Hebel\/Inverse/gi,'').replace(/\s*\+\s*Hebel-\/Inverse-ETFs/gi,'').replace(/Aktien\s*\+\s*normale ETFs\s*\+\s*Hebel-\/Inverse-ETFs/gi,'Aktien + normale ETFs').replace(/Aktien\s*·\s*ETFs\s*·\s*Hebel/gi,'Aktien · ETFs');
  });
}

install();
