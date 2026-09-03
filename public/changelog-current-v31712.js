const RECENT_CHANGELOG_V31712=[
  {at:'03.09.2026 · 18:09',title:'V31.7.12 · Produktionsprüfungen an die aktuelle Architektur angepasst',items:['Dashboard-, Free-Tier- und Produktionsprüfungen prüfen jetzt die aktuelle V31.7.12-Architektur statt veralteter Dateinamen und UI-Texte.','Klickbare Aktiencharts, verlinkte News, index-v21 sowie die Delegation an die Gap-Fill-Schicht werden explizit geprüft.','Keine Kauf-/Verkaufsschwelle wurde dadurch verändert.']},
  {at:'03.09.2026 · 17:59',title:'V31.7.12 · Aktiencharts und News wirklich anklickbar',items:['Scanner-Kandidaten, Depotwerte, Katalysator- und News-Aktien öffnen einen universellen Live-Chart – auch ohne bisherigen Paper-Trade.','Charts unterstützen 1 Tag, 5 Tage und 1 Monat; nur die reine Trade-Ansicht braucht einen vorhandenen Trade.','News-Überschriften sind echte Links; ohne direkten Artikel wird auf Quellenlink oder exakte Google-News-Suche zurückgefallen.','Persistenter Outcome-Lernstatus wird nach Worker-Neustarts wieder sichtbar.','Die Kaufzone bleibt bei 60/100 mit unabhängiger Bestätigung.']},
  {at:'03.09.2026 · 13:06',title:'V31.7.11 · Paper-Depot bleibt bei Reconnect und erneutem Start erhalten',items:['Ein erneuter /api/start-Aufruf löscht bei einem laufenden Planspiel keine Positionen, History, P/L oder Snapshots mehr.','Vorhandene aktive oder gestoppte Runs werden wieder aufgenommen, ohne das Paper-Ledger neu anzulegen.','Ein neues Planspiel entsteht weiterhin nur aus einem leeren bzw. explizit zurückgesetzten Zustand.']},
  {at:'03.09.2026 · 12:55',title:'V31.7.10 · Frische Unternehmens-News werden mit der Marktreaktion bestätigt',items:['Für priorisierte Positionen und Kandidaten werden frische firmenspezifische Meldungen nachgeladen.','Positive Schlagzeilen zählen nur bei bestätigender 5m-/20m-Kursreaktion und Volumen/Impuls als Kaufbestätigung.','Positive News bei fallendem Kurs erhöhen den Score nicht; strukturell negative Katalysatoren können neue BUYs blockieren.','Bereits stark überdehnte News-Sprünge werden nicht blind hinterhergekauft.']},
  {at:'02.09.2026 · 20:05',title:'V31.7.9 · Gewinne werden bei echtem Score-/Chart-Fade früher geschützt',items:['Die alte Gewinnlogik war teilweise verkehrt herum und wurde korrigiert.','Gesunde Gewinner werden nicht mehr allein wegen steigender Scores verkauft.','Ab etwa +0,8 %, +2 % und +3,5 % lösen zunehmend kleinere gemeinsame Verschlechterungen von Score und Chart einen Profit-Fade-Schutz aus.','Ab +5 % bleibt der harte Gewinn-Lock bestehen, sofern die Bewegung nicht deutlich weiter beschleunigt.']},
  {at:'02.09.2026 · 19:55',title:'V31.7.8 · Einstieg lernt Nettoergebnis nach Kosten statt nur Kursbewegung',items:['BUY-Learning bewertet 20-Minuten-Ergebnisse nach Trade-Republic-Roundtrip-Kosten und Slippage statt nur nach Rohkurs.','Alte BUY-Samples ohne gespeicherte Kosten werden konservativ mit 0,45 % Roundtrip-Kosten nachbewertet.','Schon drei schwache BUY-Samples können DEFENSIVE auslösen.','Dynamische Einstiege brauchen positives 5m- und nicht-negatives 20m-Momentum; extreme Score-Velocity wird gedeckelt.']},
  {at:'01.09.2026 · 14:34',title:'PC-Scan-Watchdog · Online-Prozess darf keinen festhängenden Markt-Scan verdecken',items:['Heartbeat und erfolgreicher Markt-Scan werden getrennt überwacht.','Ist der PC-Agent online, aber der letzte erfolgreiche Scan älter als 95 Sekunden, führt Cloudflare einen Gap-Fill-Scan aus.','Bei vollständig offline erkanntem PC bleibt der sparsamere 5-Minuten-Fallback aktiv.']},
  {at:'01.09.2026 · 14:29',title:'Stocks-only- und Trade-Republic-Produktionsprüfungen bereinigt',items:['Validatoren wurden auf den aktuellen Stocks-only-Produktionspfad umgestellt.','Die reale Trade-Republic-Aktienuniversum-Pipeline und das Ganzaktien-/1-EUR-Kostenmodell werden geprüft.','Die Änderung betrifft Validierung und lockert keine Handelsregel.']},
  {at:'01.09.2026 · 14:20',title:'V31.7.4 · Ganzaktien-Rundung blockiert gute Käufe nicht mehr unnötig',items:['Ganzaktien-Rundung kann die Fixkostenquote nicht mehr unnötig über die unveränderte 2-%-Roundtrip-Kostengrenze drücken.','Die Allokation darf kontrolliert bis zur nächsten ganzen Aktie erhöht werden, wenn höchstens sechs Prozentpunkte zusätzlich nötig sind.','Echte teure oder nicht finanzierbare Trades bleiben blockiert.']},
  {at:'01.09.2026 · 14:16',title:'V31.7.3 · Bereits qualifizierter Fast-BUY überlebt einen weichen KI-HOLD',items:['Ein vollständig geprüfter QUALIFIED-OPPORTUNITY-BUY wird nicht mehr allein durch einen weichen generativen HOLD verworfen.','Der Handoff verlangt weiterhin starke Scores, positive Technik, mehrere Zeitebenen, unabhängige Evidenz sowie akzeptable Liquidität, Spread und FX.','Harte HOLD-Gründe bleiben nicht übersteuerbar.']},
  {at:'01.09.2026 · 14:05',title:'V31.7.2 · Kanonische BUY-Brücke und breiterer PC-Leader-Pool',items:['Die kanonische V31.7-Einstiegslogik kann gültige Kandidaten jetzt selbst bis zur finalen Prüfung bringen, statt an einem alten Legacy-Score >=68 zu verhungern.','BUY-Vorschläge brauchen weiterhin Score 60, Datenqualität 55 und mindestens eine unabhängige Volumen-/News-Bestätigung.','Teilweise aufgelöste PC-Leader werden mit Cache/Master-Fallback bis 25 ergänzt; 0 externe Leader bleiben fail-closed.','59,9-Punkte-Setups ohne orthogonale Bestätigung werden nicht erzwungen gekauft.']}
];

const escRecent=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const recentTs=text=>{const m=String(text||'').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s*[·|,-]?\s*(\d{1,2}):(\d{2}))?/);return m?Date.UTC(+m[3],+m[2]-1,+m[1],+(m[4]||0),+(m[5]||0)):0};

function patchRecentChangelog(){
  const root=document.getElementById('changelogOverlay');
  const list=root?.querySelector('.changelogList');
  if(!root||!list)return false;
  const note=root.querySelector('.changelogHead p');
  if(note)note.textContent='Aktualisiert bis 03.09.2026 · V31.7.12 · neueste zuerst.';
  root.dataset.changelogVersion='V31.7.12';
  if(!list.querySelector('[data-recent-v31712-changelog]')){
    const frag=document.createDocumentFragment();
    for(const entry of RECENT_CHANGELOG_V31712){
      const article=document.createElement('article');
      article.className='changelogEntry';
      article.dataset.recentV31712Changelog='1';
      article.innerHTML=`<div class="changelogTime">${escRecent(entry.at)}</div><h3>${escRecent(entry.title)}</h3><ul>${entry.items.map(x=>`<li>${escRecent(x)}</li>`).join('')}</ul>`;
      frag.appendChild(article);
    }
    list.insertBefore(frag,list.firstChild);
  }
  const rows=Array.from(list.children).filter(x=>x.classList.contains('changelogEntry'));
  rows.sort((a,b)=>recentTs(b.querySelector('.changelogTime')?.textContent)-recentTs(a.querySelector('.changelogTime')?.textContent));
  rows.forEach((row,i)=>{row.classList.toggle('latest',i===0);list.appendChild(row)});
  return true;
}

function ensureRecentChangelog(){
  if(patchRecentChangelog())return;
  const observer=new MutationObserver(()=>{if(patchRecentChangelog())observer.disconnect()});
  observer.observe(document.documentElement,{childList:true,subtree:true});
}

const changelogButton=document.getElementById('changelogToggle');
changelogButton?.addEventListener('click',()=>{
  patchRecentChangelog();
  queueMicrotask(patchRecentChangelog);
  setTimeout(patchRecentChangelog,0);
});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureRecentChangelog,{once:true});
else ensureRecentChangelog();
window.__CHANGELOG_RECENT_V31712__={version:'31.7.12',through:'03.09.2026',entries:RECENT_CHANGELOG_V31712.length};
