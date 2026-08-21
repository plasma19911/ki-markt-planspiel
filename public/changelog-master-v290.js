// Changelog order + current-version loader.
// Historical modules stay untouched; V29.2+ and the current LIVE entry are loaded here
// so the clickable "Änderungen" panel always contains the actual production changes.
function normalizeCurrentChangelog(){
 const list=document.querySelector('#changelogOverlay .changelogList');
 if(!list)return;
 const current=[...list.querySelectorAll('[data-current-changelog]')];
 list.querySelectorAll('.changelogEntry.latest').forEach(x=>x.classList.remove('latest'));
 for(let i=current.length-1;i>=0;i--)list.prepend(current[i]);
 const live=list.querySelector('[data-v301-changelog]')||list.querySelector('[data-v300-changelog]')||list.querySelector('[data-current-changelog]');
 if(live){list.prepend(live);live.classList.add('latest')}
 list.dataset.changelogMaster='v30.1';
}
function settle(){normalizeCurrentChangelog();setTimeout(normalizeCurrentChangelog,250);setTimeout(normalizeCurrentChangelog,900);setTimeout(normalizeCurrentChangelog,1700)}
async function loadCurrentHistory(){
 await Promise.allSettled([
  import('/changelog-v292.js?v=20260821-0958'),
  import('/changelog-v297.js?v=20260821-1135'),
  import('/changelog-v301.js?v=20260821-1152')
 ]);
 settle();
}
document.addEventListener('click',e=>{if(e.target.closest('#changelogToggle')){loadCurrentHistory();settle()}});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadCurrentHistory,{once:true});else loadCurrentHistory();
window.__CHANGELOG_MASTER_V290__={version:30.1,keepsLegacyHistory:true,currentAlwaysFirst:true,loadsV292ToV301:true,liveEntry:true};
