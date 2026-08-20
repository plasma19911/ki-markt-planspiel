// V29.2: If the expensive Research candidate list is temporarily empty, show the
// real PC-first finalists instead of scoreless depot/watchlist placeholders.
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=NaN)=>Number.isFinite(Number(v))?Number(v):d;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderPcFinalists(status={}){
  if(arr(status?.candidates).length)return;
  const policy=status?.pcFirstScannerPolicy||{},rows=arr(policy?.topPcCandidates).filter(x=>x?.symbol).slice(0,12),body=document.getElementById('candidatesBody');
  if(!body||!rows.length)return;
  const fresh=policy?.pcDataFresh!==false;
  body.innerHTML=rows.map(x=>{
    const day=num(x?.day,x?.dayPct),conf=num(x?.confidence),deep=num(x?.pcDeepScore,x?.pcPreScore),stale=Boolean(x?.stale)||!fresh;
    const dayText=Number.isFinite(day)?`${day>=0?'+':''}${day.toFixed(2)} %`:'–';
    const confText=Number.isFinite(conf)?`${Math.round(conf*100)} %`:'–';
    return `<tr class="pcScanCandidate" data-pc-score="${Number.isFinite(deep)?deep:''}">
      <td class="candidateIdentity"><b class="candidateName">${esc(x?.name||x.symbol)}</b><span class="candidateSymbol">${esc(x.symbol)}</span><span class="candidateState pc-vorscan">PC-FINALIST</span></td>
      <td><span class="v292ScorePlaceholder">PC ${Number.isFinite(deep)?Math.round(deep):'–'}</span></td>
      <td class="${Number.isFinite(day)?(day>=0?'good':'bad'):''}"><b>${dayText}</b></td>
      <td><b>${confText}</b></td>
      <td><span class="eventPill ${stale?'medium':'low'}">${stale?'Kurs prüfen':'Vorscan OK'}</span></td>
      <td class="plainCell">PC-Vollscan-Finalist · Vorscore ${Number.isFinite(num(x?.pcPreScore))?Math.round(num(x.pcPreScore)):'–'}/100</td>
      <td class="plainCell influenceCell">Deep-Score ${Number.isFinite(deep)?deep.toFixed(1):'–'}/100 · vollständiger Research-/Safety-Check folgt vor einem Trade.</td>
    </tr>`;
  }).join('');
  const tag=document.querySelector('#signals .cardTitle .tag'),help=document.querySelector('#signals .candidateHelp');
  if(tag)tag.textContent='PC-Finalisten';
  if(help)help.innerHTML=`<b>PC-Vollscan aktiv.</b> ${Math.round(num(policy.preScoredCount,policy.prescannedCount)||0).toLocaleString('de-DE')} Werte vorscored → Top ${Math.round(num(policy.stage2Count,400)||400)} → Deep ${Math.round(num(policy.deepCount,240)||240)} → ${Math.round(num(policy.finalistCount,rows.length)||rows.length)} Finalisten. Der PC-Deep-Score ist eine breite Vorbewertung; Research/Safety entscheidet erst danach über Kauf oder Verkauf.`;
}
document.addEventListener('planspiel:status',e=>renderPcFinalists(e.detail));
window.__PC_CANDIDATE_FALLBACK_V292__={version:29.2,pcFinalistsWhenResearchEmpty:true,scorelessFallbackFixed:true};
