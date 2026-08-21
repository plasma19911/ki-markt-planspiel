// V29.2/V29.3 visible changelog entries. Kept separate so the historical V27.9–V29.1 list stays untouched.
function injectV292(){
 const list=document.querySelector('#changelogOverlay .changelogList');if(!list||list.querySelector('[data-v292-changelog]'))return;
 const a=document.createElement('article');a.className='changelogEntry';a.dataset.v292Changelog='1';
 a.innerHTML='<div class="changelogTime">20.08.2026 · 22:20</div><h3>V29.2 · Score-Pipeline repariert & Vollscan vollständig bewertet</h3><ul><li>Die C#-Wide-Sweep-Aufbereitung schneidet nicht mehr nach den ersten 1.000 Aktien ab. Jeder empfangene frische Vollscan-Wert erhält jetzt einen leichten PC-Vorscore von 0–100.</li><li>Die Auswahl läuft danach über Top 400 → Deep 240 → Final 60. Erst die Finalisten und Depotpositionen bekommen die teurere Research-/Safety-Prüfung in Cloudflare.</li><li>Damit können gute Aktien außerhalb der früheren ersten 1.000 nicht mehr still verloren gehen, ohne Cloudflare mit Tausenden Tiefenprüfungen zu belasten.</li><li>Wenn gerade keine vollständigen Research-Kandidaten vorliegen, zeigt „Beste aktuelle Kandidaten“ die echten PC-Finalisten mit ihrem PC-Deep-Score statt scorelosen Depot-/Watchlist-Platzhaltern.</li><li>Depot-/Fallback-Zeilen werden zusätzlich auf vorhandene Positionsscores zurückgeführt, damit ein vorhandener Haltescore nicht mehr als „kein Score“ erscheint.</li><li>Die V29.1-Kauf-/Halte-/Verkaufsgrenzen bleiben unverändert; V29.2 repariert die Ermittlung und Übergabe der Scores.</li></ul>';
 list.prepend(a);
}
function injectV293(){
 injectV292();const list=document.querySelector('#changelogOverlay .changelogList');if(!list||list.querySelector('[data-v293-changelog]'))return;
 list.querySelector('.latest')?.classList.remove('latest');
 const a=document.createElement('article');a.className='changelogEntry latest';a.dataset.currentChangelog='1';a.dataset.v293Changelog='1';
 a.innerHTML='<div class="changelogTime">21.08.2026</div><h3>V29.3 · Sofortkauf ab 56 & stabiler DecisionScore</h3><ul><li>Für neue Positionen gilt jetzt eindeutig: DecisionScore 0–55,9 = kein Kauf; ab 56 = SOFORT BUY.</li><li>Nach Erreichen von 56 gibt es keine zusätzliche weiche Momentum-, News-, FOMO-, Coverage-, Trend- oder Mehrfachscan-Sperre mehr. Der Score selbst ist die Kaufentscheidung.</li><li>Anzeige und Handelslogik verwenden denselben stabilisierten 0–100-DecisionScore. Der alte Rohscore bleibt nur noch zur Diagnose erhalten.</li><li>Große Rohscore-Sprünge werden zeitlich geglättet. Ein datenbedingter Sprung wie 72 → 36 soll deshalb nicht mehr in einem einzigen Entscheidungsschritt als 36 erscheinen.</li><li>Aufwärtsbewegungen reagieren schneller als Abwärtsrauschen, damit eine neu erreichte 56er-Kaufgrenze nicht unnötig verzögert wird.</li></ul>';
 list.prepend(a);
}
document.addEventListener('click',e=>{if(e.target.closest('#changelogToggle'))setTimeout(injectV293,0)});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',injectV293,{once:true});else injectV293();
window.__CHANGELOG_V292__={version:29.2,fullPcPreScore:true,deepTarget:240,scoreFallbackFixed:true};
window.__CHANGELOG_V293__={version:29.3,immediateBuyMin:56,stableDecisionScore:true,noSoftBuyBlocks:true};
