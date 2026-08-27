const CURRENT_V31_CHANGELOG=[
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
function settleCurrentV31(){injectCurrentV31();setTimeout(injectCurrentV31,120);setTimeout(injectCurrentV31,600)}
document.addEventListener('click',e=>{if(e.target.closest('#changelogToggle'))settleCurrentV31()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',settleCurrentV31,{once:true});else settleCurrentV31();
window.__CURRENT_V31_CHANGELOG__={latest:'27.08.2026 15:34',through:'V31.2',entries:CURRENT_V31_CHANGELOG.length};
