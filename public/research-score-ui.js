// Sichtbarer V28.1 Research-Fusion-Score fuer Kandidaten und aktive Positionen.
// Der Score ist ein Entry-/Chancen-Score, kein automatisches Verkaufssignal.

const norm=v=>String(v||'').toUpperCase().trim();
const num=(v,d=NaN)=>Number.isFinite(Number(v))?Number(v):d;
let latest=null;

function tier(score,blocked=false){
 if(blocked)return{cls:'blocked',label:'Block'};
 const n=num(score);
 if(!Number.isFinite(n))return{cls:'missing',label:'–'};
 if(n>=72)return{cls:'ready',label:'Kaufbereit'};
 if(n>=64)return{cls:'confirm',label:'Bestätigen'};
 if(n>=58)return{cls:'watch',label:'Watch'};
 return{cls:'weak',label:'Schwach'};
}
function breakdown(parts={}){
 const rows=[['Basis',parts.base],['Sicherheit',parts.confidence],['Momentum',parts.momentum],['Reclaim',parts.reclaim],['Volumen',parts.volume],['News',parts.news],['52W',parts.high52],['Multi-Scan',parts.multiScan],['Regime',parts.regime],['Forward',parts.forward],['Chase',parts.chase]];
 return rows.filter(([,v])=>Number.isFinite(Number(v))).map(([k,v])=>`${k} ${Number(v).toFixed(1)}`).join(' · ');
}
function badge(data,position=false){
 const score=num(data?.fusionScore),t=tier(score,Boolean(data?.hardBlocked)),shown=Number.isFinite(score)?score.toFixed(0):'–';
 const source=position&&data?.source&&data.source!=='LIVE'?' · letzter Wert':'';
 const title=Number.isFinite(score)?`Research-Fusion ${score.toFixed(1)}/100${source}. ${breakdown(data?.parts)}${position?' · Bei offenen Positionen KEIN automatisches Verkaufssignal.':''}`:`Noch kein V28.1 Research-Score vorhanden.${position?' Die Position wird weiter normal überwacht.':''}`;
 return `<span class="researchScoreBadge ${t.cls}" title="${title.replace(/"/g,'&quot;')}"><b>Research ${shown}</b><small>${t.label}</small></span>`;
}
function installStyle(){
 if(document.getElementById('research-score-style'))return;
 const s=document.createElement('style');s.id='research-score-style';s.textContent=`
 .researchScoreBadge{display:inline-flex;align-items:center;gap:6px;margin:4px 0 0 7px;padding:4px 7px;border-radius:8px;border:1px solid rgba(127,151,174,.24);background:rgba(12,27,42,.72);font-size:10px;line-height:1;white-space:nowrap;vertical-align:middle}
 .researchScoreBadge b{font-size:10px;color:#dce9f6}.researchScoreBadge small{font-size:9px;color:#90a5b8}
 .researchScoreBadge.ready{border-color:rgba(70,214,154,.38);background:rgba(70,214,154,.12)}.researchScoreBadge.ready small{color:#75e5b2}
 .researchScoreBadge.confirm{border-color:rgba(80,165,255,.35);background:rgba(80,165,255,.10)}.researchScoreBadge.confirm small{color:#9bc7ef}
 .researchScoreBadge.watch{border-color:rgba(239,190,90,.34);background:rgba(239,190,90,.10)}.researchScoreBadge.watch small{color:#e8c77b}
 .researchScoreBadge.weak,.researchScoreBadge.missing{opacity:.78}.researchScoreBadge.blocked{border-color:rgba(255,112,128,.38);background:rgba(255,112,128,.10)}.researchScoreBadge.blocked small{color:#f0a0aa}
 .researchScoreLegend{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;margin:7px 0 10px;padding:8px 10px;border:1px solid rgba(89,118,145,.18);border-radius:10px;background:rgba(10,23,37,.42);color:#91a7ba;font-size:10px;line-height:1.35}
 .researchScoreLegend strong{color:#dbe8f4}.researchScoreLegend .lg{display:inline-flex;gap:4px;align-items:center}.researchScoreLegend .dot{width:7px;height:7px;border-radius:50%;background:#70869a}.researchScoreLegend .ready .dot{background:#4bd38c}.researchScoreLegend .confirm .dot{background:#78b4ff}.researchScoreLegend .watch .dot{background:#e8bd5f}.researchScoreLegend .weak .dot{background:#70869a}
 .researchScoreLegend .scoreNote{flex-basis:100%;color:#758ca1}
 #positionCards .positionSymbol .researchScoreBadge{margin-left:8px}.positionSymbol{display:flex;flex-wrap:wrap;align-items:center}
 #positionsBody .researchScoreBadge{margin-left:0;margin-top:5px}
 @media(max-width:700px){.researchScoreLegend{font-size:9px}.researchScoreBadge{margin-left:4px;padding:3px 5px;gap:4px}.researchScoreBadge b{font-size:9px}.researchScoreBadge small{font-size:8px}}
 `;document.head.appendChild(s)
}
function legendMarkup(position=false){return `<div class="researchScoreLegend" data-research-legend="${position?'positions':'candidates'}"><strong>Research-Score 0–100</strong><span class="lg ready"><i class="dot"></i>72–100 Kaufbereit*</span><span class="lg confirm"><i class="dot"></i>64–71 Bestätigen</span><span class="lg watch"><i class="dot"></i>58–63 Watch</span><span class="lg weak"><i class="dot"></i>0–57 schwach</span><span class="scoreNote">* nur ohne Hard-Block.${position?' Bei offenen Positionen zeigt der Wert die aktuelle/zuletzt gemessene Entry-Stärke und ist kein SELL-Signal.':' Das sind die potenziellen nächsten Käufe; hohe Scores werden zuerst geprüft.'}</span></div>`}
function installLegends(){
 const help=document.querySelector('#signals .candidateHelp');if(help&&!document.querySelector('[data-research-legend="candidates"]'))help.insertAdjacentHTML('afterend',legendMarkup(false));
 const title=document.querySelector('#positions .cardTitle');if(title&&!document.querySelector('[data-research-legend="positions"]'))title.insertAdjacentHTML('afterend',legendMarkup(true));
}
function maps(status={}){
 const p=status?.researchSignalFusionPolicy||{},ranking=Array.isArray(p.ranking)?p.ranking:[],positions=Array.isArray(p.positionScores)?p.positionScores:[];
 return{ranking:new Map(ranking.map(x=>[norm(x?.symbol),x]).filter(([s])=>s)),positions:new Map(positions.map(x=>[norm(x?.symbol),x]).filter(([s])=>s))};
}
function replaceBadge(host,data,position=false){
 if(!host)return;host.querySelectorAll(':scope > .researchScoreBadge').forEach(x=>x.remove());host.insertAdjacentHTML('beforeend',badge(data,position));
}
function apply(status){
 if(!status)return;installLegends();const m=maps(status);
 document.querySelectorAll('#candidatesBody tr').forEach(tr=>{const sym=norm(tr.querySelector('.candidateSymbol')?.textContent);const host=tr.querySelector('.candidateIdentity')||tr.cells?.[0];if(sym&&host)replaceBadge(host,m.ranking.get(sym),false)});
 document.querySelectorAll('#positionCards .positionCard').forEach(card=>{const host=card.querySelector('.positionSymbol'),sym=norm(host?.childNodes?.[0]?.textContent||host?.textContent);if(sym&&host)replaceBadge(host,m.positions.get(sym),true)});
 document.querySelectorAll('#positionsBody tr').forEach(tr=>{const cell=tr.cells?.[0],sym=norm(cell?.querySelector('b')?.textContent);if(sym&&cell)replaceBadge(cell,m.positions.get(sym),true)});
}
function schedule(status){latest=status||latest;requestAnimationFrame(()=>requestAnimationFrame(()=>apply(latest)))}

installStyle();installLegends();
document.addEventListener('planspiel:status',e=>schedule(e.detail));
window.addEventListener('resize',()=>latest&&schedule(latest),{passive:true});
