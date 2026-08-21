function injectV301(){
 const list=document.querySelector('#changelogOverlay .changelogList');if(!list||list.querySelector('[data-v301-changelog]'))return;
 list.querySelectorAll('.changelogEntry.latest').forEach(x=>x.classList.remove('latest'));
 const a=document.createElement('article');a.className='changelogEntry latest';a.dataset.currentChangelog='1';a.dataset.v301Changelog='1';
 a.innerHTML='<div class="changelogTime">21.08.2026 · LIVE</div><h3>V30.1 · Einstiegsscore-Baseline repariert</h3><ul><li><b>Ausgeführter BUY-Score ist jetzt autoritativ:</b> Der finale DecisionScore, mit dem eine Paper-Order tatsächlich gekauft wurde, wird direkt nach der Ausführung als Einstiegsscore gespeichert.</li><li><b>Kein Baseline-Sprung mehr:</b> Ein älterer Scanner-Score oder späterer Score-Memory-Wert darf den echten Kaufscore nicht mehr ersetzen. Fälle wie BUY 59,8 und danach fälschlich Einstieg 45,6 werden verhindert.</li><li><b>Exit-Messung sauber:</b> Scoreänderungen seit Kauf, +10/-15-Logik und Richtungsprüfung messen damit gegen die echte Kaufentscheidung.</li><li><b>Keine Strategieregel geändert:</b> BUY ab 56, V30.0 Dip/Reclaim, maximal vier Positionen, konzentrierter Cash-Einsatz und bestehende Gewinn-/Verlustlogik bleiben unverändert.</li><li><b>Paper Trading only:</b> Keine Brokerverbindung und keine echten Orders.</li></ul>';
 list.prepend(a);
}
function settleV301(){injectV301();setTimeout(injectV301,180);setTimeout(injectV301,750)}
document.addEventListener('click',e=>{if(e.target.closest('#changelogToggle'))settleV301()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',settleV301,{once:true});else settleV301();
window.__CHANGELOG_V301__={version:30.1,live:true,executedFinalBuyScoreBaseline:true,changesTradingThresholds:false,paperTradingOnly:true};
