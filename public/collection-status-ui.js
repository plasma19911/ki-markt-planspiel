const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dt=s=>{const t=Date.parse(String(s||''));return Number.isFinite(t)?new Date(t).toLocaleString('de-DE'):'–'};

function infoBox(title,lines=[]){return `<div class="emptyState collectionStatusBox"><b>${esc(title)}</b><span>${lines.map(esc).join('<br>')}</span></div>`}
function apply(s={}){
 const c=s.config||{},scanCount=num(c.scan_count),last=dt(c.last_scan),candidates=arr(s.candidates).length,news=arr(s.newsRadar).length,positions=arr(s.positions).length,fw=s.futureWatch||{},themes=arr(fw.activeThemes).length,forward=arr(fw.candidates).length;
 const future=document.getElementById('futureCatalystList');
 if(future&&forward===0)future.innerHTML=infoBox('Scanner & News laufen weiter.',[`Letzter Scan: ${last} · Scan #${scanCount}`,`${candidates} aktuelle Kurs-Kandidaten · ${news} News-Radar-Einträge · ${themes} aktive Weltthemen`,`Hier erscheint nur etwas, wenn ein Forward-/Katalysator-Signal stark genug ist. Leer bedeutet also: aktuell kein starkes Signal, nicht dass nichts geprüft wird.`]);
 const chips=document.getElementById('futureThemeChips');
 if(chips&&themes===0)chips.innerHTML=`<span class="themeChip">News-/Weltthemen werden geprüft · ${news} aktuelle News-Einträge</span>`;
 const newsBody=document.getElementById('newsRadarBody');
 if(newsBody&&news===0)newsBody.innerHTML=`<tr><td colspan="6">${infoBox('News-Radar sammelt weiter.',[`Letzter Scan: ${last}`,`${candidates} Kurskandidaten und ${positions} offene Positionen werden weiter auf neue Firmenmeldungen geprüft.`,`Es werden nur ausreichend relevante/aktuelle Meldungen als Zeile angezeigt.`])}</td></tr>`;
 const replay=document.getElementById('replayFocus');
 const raw=s.dayReplayLearning||s.dayReplay||s.replayLearning||{},report=raw.report||raw,processed=num(report?.processed),total=num(report?.total);
 if(replay&&processed===0&&!String(report?.status||'').includes('COMPLETE'))replay.textContent=`Replay sammelt tagsüber Kandidaten und echte Trades. Auswertung läuft später; aktuell gespeichert/überwacht: Scan #${scanCount}, ${candidates} Kandidaten, ${positions} offene Positionen.`;
}
document.addEventListener('planspiel:status',e=>e?.detail&&apply(e.detail));
