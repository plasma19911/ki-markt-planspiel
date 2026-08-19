const txt=v=>String(v||'').toLowerCase().replace(/\s+/g,' ').trim();
const has=(s,...xs)=>xs.some(x=>s.includes(x));

export function classifyNewsImpact(headline=''){
 const h=txt(headline);
 if(!h)return{type:'NONE',direction:0,impact:0,binary:false,structural:false};

 // Klinische Daten vor generischem "results" erkennen. Das war die MRNA-Luecke:
 // Phase-3-/Zulassungsdaten duerfen nicht als normales Earnings-/Momentum-Event enden.
 if(/phase\s*(2|ii)\b/.test(h)||/phase\s*(3|iii)\b/.test(h)||has(h,'clinical trial','klinische studie','trial meets','primary endpoint','secondary endpoint','recurrence-free survival','overall survival','vaccine trial','cancer vaccine')){
  const pos=has(h,'met primary','meets primary','met its primary','met goals','positive','significant reduction','improved','success','successful','achieved','erreicht','signifikant','verbessert');
  const neg=has(h,'failed','missed primary','did not meet','no benefit','stopped for futility','safety concern','verfehlt','gescheitert');
  return{type:'CLINICAL_TRIAL',direction:pos?1:neg?-1:0,impact:/phase\s*(3|iii)\b/.test(h)?5:4,binary:true,structural:true};
 }
 if(has(h,'fda approval','fda approves','ema approval','approved by fda','approved by ema','zulassung erteilt','regulatory approval'))return{type:'REGULATORY_APPROVAL',direction:1,impact:5,binary:true,structural:true};
 if(has(h,'complete response letter','crl','fda rejects','ema rejects','approval denied','zulassung abgelehnt'))return{type:'REGULATORY_REJECTION',direction:-1,impact:5,binary:true,structural:true};
 if(has(h,'raises guidance','raised guidance','raises outlook','hebt prognose','prognose angehoben','guidance above'))return{type:'GUIDANCE_RAISE',direction:1,impact:4,binary:false,structural:true};
 if(has(h,'cuts guidance','cut guidance','lowers guidance','senkt prognose','gewinnwarnung','profit warning'))return{type:'GUIDANCE_CUT',direction:-1,impact:5,binary:false,structural:true};
 if(has(h,'acquisition','acquire','takeover','merger','übernahme','fusion','buyout'))return{type:'M&A',direction:0,impact:4,binary:true,structural:true};
 if(has(h,'major contract','contract award','wins contract','large order','record order','großauftrag','grossauftrag','auftrag erhalten'))return{type:'MAJOR_CONTRACT',direction:1,impact:3,binary:false,structural:false};
 if(has(h,'capital increase','rights issue','secondary offering','share offering','dilution','kapitalerhöhung'))return{type:'DILUTION_FINANCING',direction:-1,impact:4,binary:false,structural:true};
 if(has(h,'fraud','accounting irregular','sec investigation','criminal investigation','bankrupt','insolven','default','recall','data breach','cyberattack'))return{type:'SEVERE_NEGATIVE',direction:-1,impact:5,binary:true,structural:true};
 if(has(h,'beats estimates','beat estimates','earnings beat','revenue beat','übertrifft erwartungen'))return{type:'EARNINGS_BEAT',direction:1,impact:3,binary:false,structural:false};
 if(has(h,'misses estimates','missed estimates','earnings miss','revenue miss','verfehlt erwartungen'))return{type:'EARNINGS_MISS',direction:-1,impact:3,binary:false,structural:false};
 if(has(h,'buyback','share repurchase','aktienrückkauf','dividend increase','dividende erhöht'))return{type:'CAPITAL_RETURN',direction:1,impact:2,binary:false,structural:false};
 if(has(h,'upgrade','price target raised','kursziel erhöht'))return{type:'ANALYST_POSITIVE',direction:1,impact:1,binary:false,structural:false};
 if(has(h,'downgrade','price target cut','kursziel gesenkt'))return{type:'ANALYST_NEGATIVE',direction:-1,impact:1,binary:false,structural:false};
 if(has(h,'earnings','quarter','quartal','results','ergebnis','eps','revenue','umsatz','profit','gewinn'))return{type:'EARNINGS',direction:0,impact:2,binary:false,structural:false};
 return{type:'OTHER',direction:0,impact:1,binary:false,structural:false};
}

export function strongestNewsImpact(rows=[]){
 let best={type:'NONE',direction:0,impact:0,binary:false,structural:false,headline:''};
 for(const row of rows||[]){
  const headline=typeof row==='string'?row:String(row?.headline||row?.title||row?.text||'');
  const x=classifyNewsImpact(headline);
  if(x.impact>best.impact||(x.impact===best.impact&&Math.abs(x.direction)>Math.abs(best.direction)))best={...x,headline};
 }
 return best;
}
