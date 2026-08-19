const CHANGELOG=[
  {
    at:'19.08.2026 · 12:24',
    title:'Fast-Radar auf Turbo-Profil umgestellt',
    items:[
      'Turbo-Profil auf 40 Kurs-Batches pro Minute, 8 parallele Requests und 48 Aktien pro Batch gesetzt.',
      'Ziel für den zusätzlichen Volluniversum-Scan auf ungefähr 4–6 Minuten reduziert statt rund 17 Minuten im bisherigen C#-Vollzyklus.',
      'Installer benötigt keine install-fast-radar.ps1 mehr; Download, Syntaxprüfung, Autostart und Start erfolgen direkt in einer Datei.',
      'Bei Yahoo-Drosselung bleibt die automatische Rückstufung aktiv, damit der Scanner nicht dauerhaft in Rate-Limits läuft.'
    ]
  },
  {
    at:'19.08.2026 · 12:22',
    title:'Breitscan-Funde bleiben bis zur frischen Bestätigung erhalten',
    items:[
      'Discovery-Fenster des Wide-Sweeps von 90 Sekunden auf bis zu 18 Minuten erweitert, passend zum bisherigen Vollzyklus des PC-Scanners.',
      'Ältere Breitscan-Funde dürfen nur als Hinweis weiterleben; vor einem Einstieg werden sie weiterhin mit frischen 1-Minuten-Daten neu geprüft.',
      'Neuere Treffer werden bevorzugt, gute Tail-Funde verschwinden aber nicht mehr nach 90 Sekunden aus dem Kandidatenpool.'
    ]
  },
  {
    at:'19.08.2026 · 12:13',
    title:'Early-Dip-Scanner deutlich erweitert',
    items:[
      'Breitscan von 32 auf 64 Kandidaten erweitert; 44 Plätze sind für kontrollierte Rücksetzer reserviert.',
      'Reguläre Tiefenprüfung von 6 auf 8 Aktien erweitert.',
      'Neuer Early-Dip-Pfad prüft zusätzlich bis zu 8 Breitscan-/Rebound-Werte direkt mit frischen 1-Minuten-Daten.',
      'Rebound-Radar auf 24 Kandidaten erweitert.',
      'Second-Chance-Pool auf 24 Werte und bis zu 6 frische Zweitchecks pro Scan erweitert.',
      'Einstiegsregeln reagieren früher auf nachlassenden Verkaufsdruck; harte Safety-, Reversal- und Venue-Sperren bleiben bestehen.',
      'Early-Dip-Starter bleiben kleiner, solange News/Event noch nicht im regulären Deep-Pass vollständig bestätigt wurden.'
    ]
  },
  {
    at:'19.08.2026 · 11:44',
    title:'Aktienanalyse verständlicher gemacht',
    items:[
      'Technische Roh-Scores wie „30/100 Gesamteindruck“ aus der sichtbaren Analyse entfernt.',
      'Generische Texte wie „börsennotiertes Unternehmen“ entfernt.',
      'Konkrete Firmenbeschreibungen, aktuelle Kurstreiber, Chancen und Risiken in normaler Sprache ergänzt.'
    ]
  },
  {
    at:'19.08.2026 · 11:38',
    title:'Fast-Radar-Installation überarbeitet',
    items:[
      'Windows-PowerShell-5.1-Kompatibilität des Installers verbessert.',
      'Fast-Radar als zusätzlicher Prozess vorgesehen; der bestehende C#-Hauptagent wird nicht ersetzt.',
      'Autostart nach Windows-Anmeldung vorgesehen.'
    ]
  },
  {
    at:'19.08.2026 · 11:30',
    title:'PC-Breitscan beschleunigt',
    items:[
      'Adaptives Fast-Radar-Profil mit bis zu 28 Kurs-Batches pro Minute und 6 parallelen Requests ergänzt.',
      'Automatische Drosselung bei Yahoo-Fehlern bzw. Rate-Limits ergänzt.',
      'Frische Messungen gewinnen beim Zusammenführen gegenüber älteren hohen Scores.'
    ]
  },
  {
    at:'19.08.2026 · 11:06',
    title:'Fast-Info-Entscheidungsprofil aktiviert',
    items:[
      'Mehr parallele Tiefen-, News- und Second-Chance-Prüfungen pro Scan eingeführt.',
      'Dip-First-Strategie priorisiert günstige Rücksetzer vor bereits weit gelaufenen Kursen.',
      'Cash darf auf einen besseren Einstieg warten; Kaufzwang wurde entfernt.'
    ]
  }
];

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function render(){
  let root=document.getElementById('changelogOverlay');
  if(root)return root;
  root=document.createElement('div');
  root.id='changelogOverlay';
  root.className='changelogOverlay';
  root.hidden=true;
  root.innerHTML=`
    <div class="changelogBackdrop" data-close-changelog></div>
    <section class="changelogPanel" role="dialog" aria-modal="true" aria-labelledby="changelogTitle">
      <header class="changelogHead">
        <div><span>ÄNDERUNGSVERLAUF</span><h2 id="changelogTitle">Changelog</h2><p>Änderungen mit Datum und Uhrzeit – neueste zuerst.</p></div>
        <button class="changelogClose" type="button" data-close-changelog aria-label="Changelog schließen">×</button>
      </header>
      <div class="changelogList">
        ${CHANGELOG.map((entry,i)=>`<article class="changelogEntry${i===0?' latest':''}">
          <div class="changelogTime">${esc(entry.at)}</div>
          <h3>${esc(entry.title)}</h3>
          <ul>${entry.items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
        </article>`).join('')}
      </div>
    </section>`;
  document.body.appendChild(root);
  root.addEventListener('click',e=>{if(e.target.closest('[data-close-changelog]'))close()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!root.hidden)close()});
  return root;
}
function open(){const root=render();root.hidden=false;document.body.classList.add('changelogOpen');root.querySelector('.changelogClose')?.focus()}
function close(){const root=document.getElementById('changelogOverlay');if(root)root.hidden=true;document.body.classList.remove('changelogOpen');document.getElementById('changelogToggle')?.focus()}

document.getElementById('changelogToggle')?.addEventListener('click',open);