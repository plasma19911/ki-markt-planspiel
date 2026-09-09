// Ausschließlich wirkungslose Probe-Pfade verwenden: Ein fehlgeschlagener
// Sicherheitstest darf niemals selbst Stop, Scan oder Handel auslösen.
const base=process.env.LIVE_BASE_URL||'https://ki-markt-planspiel.orkimperium.workers.dev';
const checks=[];

async function checkAgentToken(){
 const r=await fetch(`${base}/api/agent/auth-probe`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
 if(r.status===503)return{name:'PC_AGENT_TOKEN',ok:false,status:r.status,error:'Secret fehlt in Cloudflare.'};
 if(r.status===401)return{name:'PC_AGENT_TOKEN',ok:true,status:r.status,note:'gesetzt; unautorisierte Agent-Aufrufe werden abgewiesen'};
 return{name:'PC_AGENT_TOKEN',ok:false,status:r.status,error:`Unerwarteter Status ${r.status}; erwartet 401.`};
}

async function checkControlSurface(){
 const r=await fetch(`${base}/api/control-guard-probe`,{method:'POST'});
 if(r.status===409)return{name:'control-surface',ok:true,status:r.status,note:'externe Steuer-POSTs benötigen Bestätigung'};
 return{name:'control-surface',ok:false,status:r.status,error:`Guard-Probe lieferte ${r.status}; erwartet 409. Es wurde keine reale Steueraktion aufgerufen.`};
}

for(const fn of [checkAgentToken,checkControlSurface])try{checks.push(await fn())}catch(e){checks.push({name:fn.name,ok:false,error:String(e?.message||e)})}
const ok=checks.every(x=>x.ok);console.log(JSON.stringify({ok,base,checks},null,2));if(!ok)process.exit(1);
