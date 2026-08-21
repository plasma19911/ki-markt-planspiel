// Changelog order + current-version loader.
// Historical modules stay untouched; current production entries are loaded here
// so the clickable "Änderungen" panel always shows the actual LIVE version first.
function normalizeCurrentChangelog(){
 const list=document.querySelector('#changelogOverlay .changelogList');
 if(!list)return;
 const current=[...list.querySelectorAll('[data-current-changelog]')];
 list.querySelectorAll('.changelogEntry.latest').forEach(x=>x.classList.remove('latest'));
 for(let i=current.length-1;i>=0;i--)list.prepend(current[i]);
 const live=list.querySelector('[data-v303-changelog]')||list.querySelector('[data-v302-changelog]')||list.querySelector('[data-v301-changelog]')||list.querySelector('[data-v300-changelog]')||list.querySelector('[data-current-changelog]');
 if(live){list.prepend(live);live.classList.add('latest')}
 list.dataset.changelogMaster='v30.3';
}
function settle(){normalizeCurrentChangelog();setTimeout(normalizeCurrentChangelog,250);setTimeout(normalizeCurrentChangelog,900);setTimeout(normalizeCurrentChangelog,1700)}
async function loadCurrentHistory(){
 await Promise.allSettled([
  import('/changelog-v292.js?v=20260821-0958'),
  import('/changelog-v297.js?v=20260821-1135'),
  import('/changelog-v301.js?v=20260821-1205'),
  import('/changelog-v302.js?v=20260821-1222'),
  import('/changelog-v303.js?v=20260821-1250')
 ]);
 settle();
}
document.addEventListener('click',e=>{if(e.target.closest('#changelogToggle')){loadCurrentHistory();settle()}});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadCurrentHistory,{once:true});else loadCurrentHistory();
window.__CHANGELOG_MASTER_V290__={version:30.3,keepsLegacyHistory:true,currentAlwaysFirst:true,loadsV292ToV303:true,liveEntry:true};
