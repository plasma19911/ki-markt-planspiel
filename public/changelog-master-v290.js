// V29.1 changelog order hardening.
// Legacy changelog modules are intentionally kept for historical entries, but several
// of them used delayed prepend()+latest behavior. This normalizer makes the current
// product entries authoritative at the top without deleting any older history.
function normalizeCurrentChangelog(){
 const list=document.querySelector('#changelogOverlay .changelogList');
 if(!list)return;
 const current=[...list.querySelectorAll('[data-current-changelog]')];
 if(!current.length)return;
 list.querySelectorAll('.changelogEntry.latest').forEach(x=>x.classList.remove('latest'));
 for(let i=current.length-1;i>=0;i--)list.prepend(current[i]);
 current[0]?.classList.add('latest');
 list.dataset.changelogMaster='v29.1';
}
function settle(){normalizeCurrentChangelog();setTimeout(normalizeCurrentChangelog,250);setTimeout(normalizeCurrentChangelog,1100);setTimeout(normalizeCurrentChangelog,1700)}
document.addEventListener('click',e=>{if(e.target.closest('#changelogToggle'))settle()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',settle,{once:true});else settle();
window.__CHANGELOG_MASTER_V290__={version:29.1,keepsLegacyHistory:true,currentAlwaysFirst:true};
