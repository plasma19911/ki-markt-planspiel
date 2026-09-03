const RECENT_CHANGELOG_V31712=[
  {
    at:'03.09.2026 · 18:09',
    title:'V31.7.12 · Produktionsprüfungen an die aktuelle Architektur angepasst',
    items:[
      'Dashboard-, Free-Tier- und Produktionsprüfungen wurden an den aktuellen V31.7.12-Pfad angepasst, statt veraltete Dateinamen und UI-Texte vorauszusetzen.',
      'Die Prüfungen kontrollieren jetzt ausdrücklich die klickbaren Aktiencharts, verlinkte News, den aktuellen index-v21-Produktionsentry und dessen Delegation an die bestehende Gap-Fill-Schicht.',
      'PC-Agent-Authentifizierung und Scan-/Prefetch-Routen werden dort geprüft, wo sie tatsächlich implementiert sind. Diese Validierungsänderungen verändern keine Kauf-/Verkaufsschwellen.'
    ]
  },
  {
    at:'03.09.2026 · 17:59',
    title:'V31.7.12 · Aktiencharts und News wirklich anklickbar',
    items:[
      'Scanner-Kandidaten, Depotwerte, Katalysator-Aktien und News-Aktien öffnen jetzt einen universellen Live-Chart – auch wenn die Aktie im Planspiel noch nie gehandelt wurde.',
      'Der Chart-Endpunkt unterstützt für gültige Scanner-/News-Symbole 1 Tag, 5 Tage und 1 Monat; nur die reine Trade-Ansicht verlangt weiterhin einen vorhandenen Paper-Trade.',
      'Sichtbare News-Überschriften sind wieder echte Links. Wenn kein direkter Artikel-Link vorhanden ist, wird auf Quellenlink oder eine exakte Google-News-Suche zurückgefallen.',
      'News-Radar-Zeilen erhalten Chart-Zugriff statt optisch klickbarer, aber funktionsloser Elemente.',
      'Der persistente Outcome-Lernstatus wird nach Worker-Neustarts wiederhergestellt, damit vorhandene Kandidaten und gelernte Symbole nicht fälschlich als 0 angezeigt werden.',
      'Die Kaufzone bleibt bei 60/100 mit unabhängiger Bestätigung; für die UI-Reparatur wurden keine Kaufregeln künstlich abgesenkt.'
    ]
  },
  {
    at:'03.09.2026 · 13:06',
    title:'V31.7.11 · Paper-Depot bleibt bei Reconnect und erneutem Start erhalten',
    items:[
      'Ein erneuter /api/start-Aufruf löscht bei einem bereits laufenden Planspiel nicht mehr versehentlich Positionen, History, P/L oder Snapshots.',
      'Aktive oder gestoppte vorhandene Runs werden wieder aufgenommen, ohne das Paper-Ledger neu anzulegen.',
      'Ein wirklich neues Planspiel wird weiterhin nur aus einem tatsächlich leeren bzw. explizit zurückgesetzten Zustand gestartet.',
      'Der Status weist den neuen Persistenzschutz aus.'
    ]
  },
  {
    at:'03.09.2026 · 12:55',
    title:'V31.7.10 · Frische Unternehmens-News werden mit der echten Marktreaktion bestätigt',
    items:[
      'Für die wichtigsten gehaltenen Aktien und Kandidaten werden aktuelle firmenspezifische Meldungen mit kurzem Cache und begrenzten Abfragen nachgeladen.',
      'Yahoo Finance Search wird zuerst verwendet, Google News RSS dient als Fallback; dafür ist kein API-Key nötig.',
      'Positive Schlagzeilen zählen nur dann als Kaufbestätigung, wenn 5m-/20m-Kursreaktion und Volumen bzw. Impuls sie bestätigen. Positive News bei fallendem Kurs erhöhen den kanonischen Score nicht.',
      'Strukturell negative Katalysatoren können neue Käufe blockieren; bei gehaltenen Positionen entsteht ein SELL-Vorschlag nur bei Kursbestätigung oder unabhängig bestätigtem kritischem Ereignis.',
      'Bereits stark überdehnte News-Sprünge werden nicht mehr blind hinterhergekauft.'
    ]
  },
  {
    at:'02.09.2026 · 20:05',
    title:'V31.7.9 · Gewinne werden bei echtem Score-/Chart-Fade früher geschützt',
    items:[
      'Die alte Gewinnlogik war teilweise verkehrt herum: steigende Scores konnten Gewinner verkaufen, während eine Verschlechterung zu lange gehalten wurde. Diese Richtung wurde korrigiert.',
      'Gesunde Gewinner werden nicht mehr allein wegen eines steigenden Scores verkauft; starke Beschleunigung darf weiterlaufen.',
      'Ab etwa +0,8 %, +2 % und +3,5 % Gewinn lösen zunehmend kleinere gemeinsame Verschlechterungen von Score und Chart einen Profit-Fade-Schutz aus.',
      'Ab +5 % bleibt der harte Gewinn-Lock bestehen, solange der Kurs nicht weiterhin deutlich beschleunigt.',
      'Re-Entry-Schutz bleibt nach Profit-Fade-Verkäufen aktiv.'
    ]
  },
  {
    at:'02.09.2026 · 19:55',
    title:'V31.7.8 · Einstieg lernt Nettoergebnis nach Kosten statt nur Kursbewegung',
    items:[
      'BUY-Learning bewertet 20-Minuten-Ergebnisse nach konservativen Trade-Republic-Roundtrip-Kosten und Slippage statt nur nach der rohen Kursbewegung.',
      'Alte BUY-Samples ohne gespeicherte Kosten werden im Lernen konservativ mit 0,45 % Roundtrip-Kosten belastet.',
      'Schon drei schwache BUY-Samples können den Lernmodus auf DEFENSIVE stellen; verpasste HOLD-Chancen dürfen schlechte echte BUY-Ergebnisse nicht mehr überstimmen.',
      'Im DEFENSIVE-Modus wird der frühe Predictive-Einstieg abgeschaltet; dynamische Einstiege brauchen positives 5m- und nicht-negatives 20m-Momentum.',
      'Exploration, Forecast-Qualität und Übereinstimmung wurden angehoben; extreme Score-Geschwindigkeit wird gedeckelt, damit ein niedriger Score-Sprung nicht das Ranking dominiert.',
      'Probe-Einstiege wurden von 6 % auf 8 % angehoben, um die Wirkung fixer Orderkosten zu reduzieren; die gesamte Probe-Exposition bleibt begrenzt.'
    ]
  },
  {
    at:'01.09.2026 · 14:34',
    title:'PC-Scan-Watchdog · Online-Prozess darf keinen festhängenden Markt-Scan verdecken',
    items:[
      'Heartbeat und erfolgreicher Markt-Scan werden getrennt überwacht. Ein laufender Windows-Agent gilt nicht mehr automatisch als Beweis für frische Handelsdaten.',
      'lastScanAt, Scan-Alter und Scan-Frische werden im Status ausgewiesen.',
      'Ist der PC-Agent online, aber sein letzter erfolgreicher Scan älter als 95 Sekunden, führt Cloudflare einen gezielten Gap-Fill-Scan aus.',
      'Ist der PC komplett offline, bleibt der sparsamere bestehende 5-Minuten-Fallback aktiv.'
    ]
  },
  {
    at:'01.09.2026 · 14:29',
    title:'Stocks-only- und Trade-Republic-Produktionsprüfungen bereinigt',
    items:[
      'Veraltete Validatoren wurden auf den aktuellen Stocks-only-Produktionspfad umgestellt.',
      'Die Prüfungen erkennen jetzt die reale Trade-Republic-Aktienuniversum-Pipeline und das aktuelle Ganzaktien-/1-EUR-Kostenmodell statt historische ZERO-/ETF-Annahmen zu verlangen.',
      'Die sichtbaren Aktien-only-Merkmale der aktuellen Oberfläche werden geprüft, ohne alte Textphrasen fest zu verdrahten.',
      'Diese Änderungen betreffen die Produktionsvalidierung und lockern keine Handels- oder Sicherheitsregel.'
    ]
  },
  {
    at:'01.09.2026 · 14:20',
    title:'V31.7.4 · Ganzaktien-Rundung blockiert gute Käufe nicht mehr unnötig',
    items:[
      'Ein valider Kauf konnte durch die Ganzaktien-Rundung künstlich über die unveränderte 2-%-Roundtrip-Kostengrenze rutschen, obwohl eine minimal größere Stückzahl die Fixkostenquote wieder unter die Grenze gebracht hätte.',
      'Bei Aktien mit bekanntem Kurs darf die Allokation deshalb kontrolliert bis zur nächsten ganzen Aktie erhöht werden, wenn dafür höchstens sechs Prozentpunkte zusätzlich nötig sind.',
      'Die 2-%-Kostenobergrenze bleibt unverändert; echte teure oder nicht finanzierbare Trades werden weiterhin blockiert.',
      'Die Größenanpassung wird im Kosten-Audit ausdrücklich markiert.'
    ]
  },
  {
    at:'01.09.2026 · 14:16',
    title:'V31.7.3 · Bereits qualifizierter Fast-BUY überlebt einen weichen KI-HOLD',
    items:[
      'Ein vollständig geprüfter QUALIFIED-OPPORTUNITY-BUY wird nicht mehr allein durch einen weichen generativen HOLD verworfen.',
      'Der kontrollierte Handoff verlangt weiterhin starken Fast-/Live-Score, frische positive Technik, mindestens zwei positive Zeitebenen, mindestens zwei unabhängige Evidenzsäulen inklusive orthogonaler Bestätigung sowie akzeptable Liquidität, Spread und FX.',
      'Harte HOLD-Gründe bleiben nicht übersteuerbar.',
      'Übernommene Fast-Chancen werden für das Audit mit fastHandoffV3173 markiert.'
    ]
  },
  {
    at:'01.09.2026 · 14:05',
    title:'V31.7.2 · Kanonische BUY-Brücke und breiterer PC-Leader-Pool',
    items:[
      'Ein Architekturloch wurde geschlossen: Die V31.7-Kanonik war zwar die finale Einstiegskontrolle, aber der ältere Vorschlagslayer verlangte vorher bereits einen Legacy-Score ab 68. Dadurch konnten gültige kanonische Kandidaten nie bis zur finalen Prüfung gelangen.',
      'Trade-Republic-Kandidaten dürfen jetzt einen BUY-Vorschlag ab kanonischem Score 60, Datenqualität 55 und mindestens einer unabhängigen Volumen-/News-Bestätigung erzeugen; die nachgelagerten Lern-, Kosten- und Safety-Filter bleiben bindend.',
      'Explizite 0-Werte verdecken pcDeepScore/pcPreScore nicht mehr bei der Score-Auswahl.',
      'Teilweise aufgelöste PC-Leader werden nicht mehr komplett verworfen: frische externe Leader werden mit dem letzten guten Cache bzw. Master-Fallback bis auf 25 Werte ergänzt.',
      'Null extern aufgelöste Leader bleiben weiterhin fail-closed; 59,9-Punkte-Setups ohne orthogonale Bestätigung werden nicht erzwungen gekauft.'
    ]
  }
];

const escRecent=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const recentTs=text=>{
  const m=String(text||'').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s*[·|,-]?\s*(\d{1,2}):(\d{2}))?/);
  if(!m)return 0;
  return Date.UTC(Number(m[3]),Number(m[2])-1,Number(m[1]),Number(m[4]||0),Number(m[5]||0));
};

function sortRecentChangelog(list){
  const rows=Array.from(list.children).filter(x=>x.classList.contains('changelogEntry'));
  rows.sort((a,b)=>recentTs(b.querySelector('.changelogTime')?.textContent)-recentTs(a.querySelector('.changelogTime')?.textContent));
  rows.forEach((row,i)=>{row.classList.toggle('latest',i===0);list.appendChild(row)});
}

function injectRecentChangelog(){
  const list=document.querySelector('#changelogOverlay .changelogList');
  if(!list||list.querySelector('[data-recent-v31712-changelog]'))return false;
  const frag=document.createDocumentFragment();
  for(const entry of RECENT_CHANGELOG_V31712){
    const article=document.createElement('article');
    article.className='changelogEntry';
    article.dataset.recentV31712Changelog='1';
    article.innerHTML=`<div class="changelogTime">${escRecent(entry.at)}</div><h3>${escRecent(entry.title)}</h3><ul>${entry.items.map(x=>`<li>${escRecent(x)}</li>`).join('')}</ul>`;
    frag.appendChild(article);
  }
  list.appendChild(frag);
  sortRecentChangelog(list);
  return true;
}

function armRecentChangelog(){
  if(injectRecentChangelog())return;
  const observer=new MutationObserver(()=>{if(injectRecentChangelog())observer.disconnect()});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(()=>observer.disconnect(),15000);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',armRecentChangelog,{once:true});
else armRecentChangelog();
document.getElementById('changelogToggle')?.addEventListener('click',()=>queueMicrotask(injectRecentChangelog));

window.__CHANGELOG_RECENT_V31712__={version:'31.7.12',through:'03.09.2026',entries:RECENT_CHANGELOG_V31712.length};
