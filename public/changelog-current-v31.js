const CURRENT_V31_CHANGELOG=[
  {
    at:'01.09.2026 · 08:12',
    title:'V31.5 · Wissenschaftliche Evidenz-Fusion statt blindem Einzelsignal',
    items:[
      'Neue Käufe werden jetzt entlang vier getrennt messbarer Säulen protokolliert: kurzfristiger Trend, relative Stärke gegenüber den übrigen Kandidaten, ungewöhnliches Volumen und frischer firmenspezifischer News-Katalysator.',
      'Der Evidenzfilter lernt zunächst ausschließlich im Shadow-Modus. Erst wenn mindestens 25 vergleichbare 60-Minuten-Ergebnisse vorliegen und schwach bestätigte Setups nach Kosten untragfähig waren, darf er solche neuen Käufe blockieren.',
      'Die Kaufsteuerung ist jetzt flexibel nach Score-Bereich: Ein reifer Bereich wird nur gehandelt, wenn seine echte 60-Minuten-Rendite die Roundtrip-Kosten deckt. Dadurch kann beispielsweise 60–64 erlaubt und ein historisch schwächeres 65–69 gleichzeitig blockiert werden.',
      'Kostenkorrektur: Ein nicht übergebener optionaler Kostenwert wurde durch JavaScript als 0 interpretiert. Die Kalibrierung verwendet jetzt wieder das vollständige Gebühren- und Slippage-Modell statt einer scheinbar kostenlosen Ausführung.',
      'Alte V31.4-Samples ohne die neuen Evidenzfelder werden nicht mehr pauschal als schwache V31.5-Evidenz gewertet. Nur tatsächlich mit V31.5 gemessene Fälle kalibrieren den neuen Vier-Säulen-Filter.',
      'Stark negative Firmennachrichten blockieren einen neuen Kauf nur bei hoher Konfidenz und Bestätigung durch mindestens zwei Quellen. Einzelne oder unklare Meldungen erhalten keine harte Entscheidungsgewalt.',
      'News-Konfidenz, Quellen, Alter und Headlines bleiben jetzt im Kandidatenzustand erhalten, damit echte Nullsignale, alte Meldungen und fehlende Daten unterscheidbar und lernbar werden.',
      'Die Statusanzeige liest Shadow-Samples und Kalibrierung direkt aus dem dauerhaften Cloudflare-Speicher; latest=null trotz laufendem Lernen wird damit beseitigt.',
      'Forschungsbasis: Boudoukh et al. zur Trennung relevanter firmenspezifischer Nachrichten, Tetlock zur Gefahr alter wiederholter Information sowie Moreira/Muir zur risikobewussten Steuerung statt maximaler starrer Exposition.',
      'Keine Gewinngarantie: V31.5 optimiert das Paper-Trading datenbasiert nach realen Folgepreisen und Kosten; neue Regeln werden nicht allein wegen historischer In-sample-Treffer scharfgeschaltet.'
    ]
  },
  {
    at:'31.08.2026 · 13:44',
    title:'V31.4 · Shadow Learning repariert Signalbasis und kalibriert neue Käufe',
    items:[
      'Unfertige Yahoo-Minutenkerzen mit Volumen 0 setzen das Volumenverhältnis nicht mehr auf 0; stattdessen wird die letzte abgeschlossene Kerze verwendet.',
      'Noch frische, bereits geprüfte Unternehmens-News werden in den nächsten Kandidatenscan übernommen, wenn der aktuelle Abruf keinen neuen Treffer liefert. Die zeitliche Abwertung bleibt aktiv.',
      'History-Texte unterscheiden jetzt ausdrücklich zwischen Rohsignal 0–10 und finalem Signal 0–100; beide Skalen werden nicht mehr gleich benannt.',
      'V31.4 misst alle verfügbaren Scan-Kandidaten als 60-Minuten-Shadow-Samples. Die Kaufschwelle wird erst mit mindestens 25 reifen Samples pro Score-Bucket datenbasiert angehoben.',
      'Live-Nachprüfung repariert: Shadow-Samples werden jetzt über die echte asynchrone Cloudflare-Durable-Object-Schnittstelle dauerhaft gespeichert; zuvor funktionierte die Speicherung nur im synchronen Test-KV.',
      'Neue Käufe erhalten einen Deckel von zwei Positionen pro Thema, drei pro Währung und 20 Minuten Mindestabstand. SELL, HOLD, Hard-Stops und die einzige Unified-Entscheidungsautorität bleiben unverändert.',
      'Der vorgeschlagene pauschale −3-Punkte-Baseline-Fix wurde bewusst nicht übernommen: Live ist der ausgeführte Einstiegsscore korrekt gespeichert; die spätere Veränderung folgt dem tatsächlichen Kurs und der bestehenden Chart-Hysterese.'
    ]
  },
  {
    at:'31.08.2026 · 08:53',
    title:'Kapitalverlauf zeigt jetzt den gesamten Planspiel-Zeitraum',
    items:[
      'Der Chart beginnt wieder beim tatsächlichen Planspiel-Start und endet beim neuesten Scan; die bisherige Beschränkung auf die letzten 60 Scanpunkte ist entfernt.',
      'Bis zu 2.000 detaillierte Kapital-Snapshots werden aus dem gespeicherten Zustand für den Verlauf berücksichtigt.',
      'Ältere Start-, Trade- und Verlaufswerte aus der vollständigen History werden mit den Scanpunkten zusammengeführt, damit auch der Anfang des laufenden Planspiels sichtbar bleibt.',
      'Für die Browseranzeige wird der Gesamtverlauf auf höchstens 360 aussagekräftige Punkte verdichtet; Tiefs, Hochs, Anfang und Ende bleiben erhalten.',
      'Der Worker überträgt dadurch keinen unnötig großen Rohdatenblock, obwohl der sichtbare Chart den vollständigen Zeitraum abbildet.'
    ]
  },
  {
    at:'31.08.2026 · 08:45',
    title:'Kapitalchart zeigt Marktpausen und echte Scanzeit korrekt',
    items:[
      'Längere Datenpausen wie ein Wochenende werden im Kapitalverlauf nicht mehr durch eine künstliche steile Verbindungslinie überbrückt.',
      'Die horizontale Position der Scanpunkte richtet sich jetzt nach den echten Zeitstempeln statt nur nach ihrer laufenden Nummer.',
      'Eine längere Unterbrechung wird sichtbar als Marktpause gekennzeichnet; getrennte Handelsphasen bleiben getrennte Liniensegmente.',
      'Die Kennzeichnung am Chart zeigt jetzt den Stand des letzten tatsächlichen Scanpunkts statt des geplanten Planspiel-Endes im Jahr 2027.',
      'Der sichtbare Rückgang am 31.08. war ein echter Kurs-Gap von 012450.KS mit anschließendem Hard-Stop und rund 72,67 EUR realisiertem Verlust; die Buchhaltung selbst blieb konsistent.'
    ]
  },
  {
    at:'27.08.2026 · 16:42',
    title:'PC-First entlastet Cloudflare und verhindert doppelte Arbeit',
    items:[
      'Der PC-Agent scannt weiterhin das vollständige Broker-Master, verdichtet Kandidaten und berechnet den Tages-Replay lokal; Cloudflare bleibt für finale Paper-Depotentscheidung, Speicherung und UI zuständig.',
      'Agent-Abfragen erhalten ihren kompakten Depot-/Kandidaten-/Historienstatus jetzt direkt, ohne zuerst den vollständigen Status samt Lern- und Auditblöcken aufzubauen.',
      'Der Browser bekommt standardmäßig eine gekürzte Dashboard-Antwort ohne die großen Auditdaten. Der vollständige Diagnose-Status bleibt gezielt über view=full verfügbar.',
      'Doppelte Minuten-Gap-Fills wurden entfernt. Der Cloudflare-Scan springt nur noch alle fünf Minuten und nur bei tatsächlich offline erkanntem PC-Agenten ein.',
      'Vorläufiger und finaler Tages-Replay laufen vorrangig auf dem PC; Cloudflare arbeitet nur als gedrosselter Ausfall-Fallback.'
    ]
  },
  {
    at:'27.08.2026 · 16:28',
    title:'V31.3 · Kapital rotiert schneller statt tagelang stillzustehen',
    items:[
      'Qualifizierte Paarrotationen aus Score-, Momentum- und Ersatzregeln bleiben jetzt SELL/BUY und werden von der äußeren Expectancy-Regel nicht mehr pauschal auf HOLD zurückgedreht.',
      'Flache, schwache Positionen werden ab 75 Minuten ausdrücklich geprüft; bei bestätigter Stagnation werden sie nach 180 Minuten freigegeben, während starke oder positiv laufende Titel weiter gehalten werden.',
      'Ein bestätigter Gewinnrücklauf darf ab +0,8% und 90 Minuten als Profit-Fade gesichert werden; der große Trailing-Mechanismus ab +2,4% bleibt für laufende Gewinner bestehen.',
      'Mindesthaltezeit sinkt von 12 auf 8 Minuten. Regulärer Re-Entry ist nach 45 statt 90 Minuten möglich; die vorhandene Anti-Churn-Sperre und der −1,2%-Hard-Stop bleiben aktiv.',
      'Ziel ist höhere Kapitalgeschwindigkeit und mehr Gewinnchancen im Planspiel; ein Gewinn wird dadurch nicht garantiert.'
    ]
  },
  {
    at:'27.08.2026 · 16:11',
    title:'Changelog wird jetzt wirklich chronologisch sortiert',
    items:[
      'Alle Changelog-Einträge werden nach ihrem sichtbaren Datum und – falls vorhanden – ihrer Uhrzeit sortiert; die neueste Änderung steht immer ganz oben.',
      'Die Reihenfolge hängt nicht mehr davon ab, welche Changelog-Datei zuletzt geladen oder welcher Eintrag per prepend eingefügt wurde.',
      'Auch später nachgeladene Einträge werden automatisch neu einsortiert. Einträge ohne Uhrzeit bleiben innerhalb ihres Datums stabil geordnet.'
    ]
  },
  {
    at:'27.08.2026 · 15:34',
    title:'Änderungs-Log wieder an den aktuellen Stand angebunden',
    items:[
      'Der sichtbare Bereich „Änderungen“ war technisch bei den alten V30.3-Changelog-Dateien stehen geblieben, obwohl die Handelslogik bereits V31.x erreicht hatte.',
      'Die bereits produktiv bestätigten Änderungen von V31.0, V31.1, V31.2, HV-Kalender und Live-News werden hier nachgetragen.',
      'Der aktuelle V31-Changelog wird als eigene Datei geladen, damit neue Änderungen wieder mit Datum und Uhrzeit oben im Änderungsverlauf erscheinen.',
      'Nur tatsächlich umgesetzte bzw. live bestätigte Funktionen werden als fertig protokolliert; laufende Arbeiten werden nicht vorzeitig als live eingetragen.'
    ]
  },
  {
    at:'27.08.2026 · 15:26',
    title:'V31.2 · Continuous Outcome Learning live bestätigt',
    items:[
      'BUY-, HOLD- und SELL-Entscheidungen werden nach 5, 20, 60 und 240 Minuten gegen die spätere echte Kursentwicklung des Planspiels ausgewertet.',
      'Verpasste Chancen, Fehlkäufe, zu frühe Verkäufe sowie Treffer fließen in Schwellen, Positionsgröße und Signalgewichte zurück.',
      'Live-Health bestätigte 17 verfolgte Titel, 41 ausgewertete 20-Minuten-Ergebnisse, 9 aktuelle Kandidaten und Lernmodus BALANCED.',
      'Der frühere Fehler mit trackedSymbols=0 ist damit beseitigt; das Lernsystem sammelt tatsächlich persistente Markterfahrungen.'
    ]
  },
  {
    at:'27.08.2026 · 14:56',
    title:'V31.1 · Predictive Learning produktiv verifiziert',
    items:[
      'Score-Verlauf, 5m-/20m-Momentum, Beschleunigung, News, Konfidenz und Chart-Richtung werden zu einer kurzfristigen Prognose kombiniert.',
      'Bestätigte frühe Bewegungen können vor der alten statischen Einstiegsschwelle einen begrenzten Starter auslösen; harte Risiko-Sperren bleiben bindend.',
      'Prognosen werden persistent gespeichert und später gegen die tatsächliche Kursentwicklung geprüft.',
      'Produktions-Deploy und Live-Health prüfen den Predictor ausdrücklich statt nur die alte V31.0-Kennung.'
    ]
  },
  {
    at:'27.08.2026 · 13:43',
    title:'Live-Aktien-News · echte Zeitstempel, 2-Stunden-Grenze und zusätzliche Quellen',
    items:[
      'Relative Angaben wie „gerade eben“ wurden durch Datum und Uhrzeit der Meldung ersetzt.',
      'Meldungen älter als zwei Stunden sowie Meldungen ohne verifizierbaren Veröffentlichungszeitpunkt werden aus dem sichtbaren Live-Feed entfernt.',
      'Der Fehler wurde behoben, bei dem ein Scan-Zeitpunkt eine alte Meldung erneut frisch erscheinen lassen konnte.',
      'Zusätzliche öffentliche Nachrichtenquellen wurden ergänzt und Feed-Abruf sowie tatsächlicher News-Scan werden getrennt ausgewiesen.'
    ]
  },
  {
    at:'27.08.2026 · 13:08',
    title:'Live-News-Ticker fest im Depot-Bereich verankert',
    items:[
      'Die zuvor anfällige nachträgliche DOM-Verschiebung wurde durch eine feste Position im Dashboard ergänzt bzw. abgesichert.',
      'Die sichtbare Reihenfolge wurde gezielt für Depot, Kapitalverlauf, Trade-Chart und News-Ticker korrigiert.',
      'Live-Prüfungen kontrollieren die ausgelieferte Seite und nicht mehr nur, ob ein Commit oder Deploy erfolgreich war.'
    ]
  },
  {
    at:'27.08.2026 · 12:35',
    title:'Wichtigste Aktien-News · Minutenfeed mit anklickbaren Live-Charts',
    items:[
      'Ein eigener priorisierter Aktien-News-Feed wurde ins Dashboard eingebaut und wird im Browser im 60-Sekunden-Takt neu abgefragt.',
      'Betroffene Aktien werden direkt an der Meldung angezeigt und können für ein 1T-/5T-/1M-Live-Chart geöffnet werden.',
      'Das Chart funktioniert auch für News-Aktien, die noch nicht im Planspiel gehandelt wurden; vorhandene Trade-Marker bleiben bei bekannten Positionen erhalten.'
    ]
  },
  {
    at:'27.08.2026 · 07:52',
    title:'HV-Kalender · tägliche Aktualisierung und Live-Freshness repariert',
    items:[
      'Der tägliche HV-Workflow wurde von einer fachfremden alten Trading-Regression entkoppelt, die erfolgreiche Kalender-Updates blockiert hatte.',
      'Der tägliche Kalender-Commit löst wieder den normalen Cloudflare-Publish aus.',
      'Die UI prüft den Kalender alle 15 Minuten mit Cache-Buster und zeigt einen sichtbaren Stand bzw. VERALTET-Hinweis.',
      'Der Live-Health-Test schlägt fehl, wenn der produktiv ausgelieferte Kalender älter als 26 Stunden ist oder ungültige Scores enthält.'
    ]
  },
  {
    at:'26.08.2026 · 09:01',
    title:'V31.0 · Unified Decision Core und Broker-Master-Reparaturen',
    items:[
      'Die finale Handelsentscheidung wurde in einer einzigen äußeren V31-Entscheidungsautorität zusammengeführt; ältere Ausführungs- und Sicherheitsbasen bleiben darunter erhalten.',
      'Der Trade-Republic-Master wird direkt aus dem offiziellen Assets-Universe aufgelöst und in manueller sowie vereinheitlichter Entscheidung genutzt.',
      'PC-Agent-Scans wurden fail-soft gemacht, damit ein einzelner interner Scanfehler den lokalen Minutenloop nicht dauerhaft beendet.',
      'Kapitalsteuerung, Expectancy-Stop/Trailing, Mindesthaltezeit, Re-Entry und Decision-Audit wurden als produktive V31-Kette überwacht.'
    ]
  }
];

const escCurrent=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function injectCurrentV31(){
  const list=document.querySelector('#changelogOverlay .changelogList');
  if(!list||list.querySelector('[data-current-v31-changelog]'))return;
  list.querySelectorAll('.changelogEntry.latest').forEach(x=>x.classList.remove('latest'));
  const frag=document.createDocumentFragment();
  CURRENT_V31_CHANGELOG.slice().reverse().forEach((entry,reverseIndex)=>{
    const a=document.createElement('article');
    a.className='changelogEntry';
    a.dataset.currentV31Changelog='1';
    a.innerHTML=`<div class="changelogTime">${escCurrent(entry.at)}</div><h3>${escCurrent(entry.title)}</h3><ul>${entry.items.map(x=>`<li>${escCurrent(x)}</li>`).join('')}</ul>`;
    frag.prepend(a);
  });
  list.prepend(frag);
  list.querySelector('.changelogEntry')?.classList.add('latest');
}
function changelogTimestamp(value){
  const match=String(value??'').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s*·\s*(\d{1,2}):(\d{2}))?/);
  if(!match)return Number.NEGATIVE_INFINITY;
  const [,day,month,year,hour='0',minute='0']=match;
  return Date.UTC(Number(year),Number(month)-1,Number(day),Number(hour),Number(minute));
}
let changelogSortQueued=false;
let changelogObserver=null;
function sortChangelogNewestFirst(){
  const list=document.querySelector('#changelogOverlay .changelogList');
  if(!list)return;
  const current=Array.from(list.children).filter(node=>node.classList.contains('changelogEntry'));
  const sorted=current.slice().sort((a,b)=>{
    const aTime=changelogTimestamp(a.querySelector('.changelogTime')?.textContent);
    const bTime=changelogTimestamp(b.querySelector('.changelogTime')?.textContent);
    return bTime-aTime;
  });
  const alreadySorted=current.every((node,index)=>node===sorted[index]);
  list.querySelectorAll('.changelogEntry.latest').forEach(node=>node.classList.remove('latest'));
  if(!alreadySorted){
    changelogObserver?.disconnect();
    const frag=document.createDocumentFragment();
    sorted.forEach(node=>frag.appendChild(node));
    list.appendChild(frag);
    changelogObserver?.observe(list,{childList:true});
  }
  list.querySelector('.changelogEntry')?.classList.add('latest');
}
function scheduleChangelogSort(){
  if(changelogSortQueued)return;
  changelogSortQueued=true;
  queueMicrotask(()=>{changelogSortQueued=false;sortChangelogNewestFirst()});
}
function observeChangelogOrder(){
  const list=document.querySelector('#changelogOverlay .changelogList');
  if(!list)return;
  if(!changelogObserver)changelogObserver=new MutationObserver(scheduleChangelogSort);
  changelogObserver.disconnect();
  changelogObserver.observe(list,{childList:true});
}
function settleCurrentV31(){
  injectCurrentV31();
  observeChangelogOrder();
  scheduleChangelogSort();
  setTimeout(()=>{injectCurrentV31();observeChangelogOrder();scheduleChangelogSort()},120);
  setTimeout(()=>{injectCurrentV31();observeChangelogOrder();scheduleChangelogSort()},600);
}
document.addEventListener('click',e=>{if(e.target.closest('#changelogToggle'))settleCurrentV31()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',settleCurrentV31,{once:true});else settleCurrentV31();
window.__CURRENT_V31_CHANGELOG__={latest:'31.08.2026 13:21',through:'V31.4-shadow-learning',entries:CURRENT_V31_CHANGELOG.length,sortedNewestFirst:true};
