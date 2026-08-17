import {clamp,num,nowIso} from './constants.js';

const SYMBOL_TAGS={
 defense:new Set(['LMT','RTX','NOC','GD','LHX','HII','RHM.DE','HAG.DE','BA.L','SAAB-B.ST']),
 energy:new Set(['XOM','CVX','COP','SHEL','BP','TTE','EQNR','CNQ','SU','EOG','OXY','SLB','HAL']),
 airline:new Set(['DAL','UAL','AAL','LUV','RYAAY','LHA.DE','IAG.L','AF.PA','EZJ.L']),
 semiconductor:new Set(['NVDA','AMD','AVGO','TSM','ASML','QCOM','MU','ARM','INTC','TXN','AMAT','LRCX','KLAC','NXPI','ADI','MCHP']),
 real_estate:new Set(['PLD','AMT','EQIX','O','SPG','WELL','VICI','DLR','VNA.DE','LEG.DE']),
 bank:new Set(['JPM','BAC','WFC','C','GS','MS','USB','PNC','UBS','DB','DBK.DE','BNP.PA','SAN.MC','HSBA.L','BARC.L']),
 auto:new Set(['TSLA','GM','F','TM','HMC','STLA','BMW.DE','MBG.DE','VOW3.DE','RACE','RACE.MI']),
 gold:new Set(['NEM','GOLD','AEM','KGC','AU']),
 healthcare:new Set(['LLY','JNJ','UNH','ABBV','MRK','PFE','NVS','AZN','ROG.SW']),
 utilities:new Set(['NEE','DUK','SO','D','AEP','EXC','SRE']),
 industrial:new Set(['CAT','DE','HON','GE','GEV','MMM','ETN','EMR','UPS','UNP','SIE.DE','AIR.PA']),
 growth:new Set(['NVDA','MSFT','AAPL','AMZN','META','GOOGL','GOOG','NFLX','CRM','NOW','ADBE','AMD','AVGO','TSLA','SHOP'])
};

const EVENT_LINKS={
 WAR_ESCALATION:{defense:[1,1],energy:[1,.75],gold:[1,.65],airline:[-1,.9],industrial:[-.25,.35],auto:[-.2,.25]},
 CEASEFIRE:{defense:[-1,.55],energy:[-1,.35],gold:[-1,.35],airline:[1,.8],industrial:[1,.35],auto:[1,.25]},
 SANCTIONS:{energy:[1,.3],gold:[1,.25],semiconductor:[-1,.55],industrial:[-1,.45],auto:[-1,.45],export_sensitive:[-1,.75]},
 TRADE_TARIFF:{semiconductor:[-1,.8],industrial:[-1,.65],auto:[-1,.7],export_sensitive:[-1,.85],bank:[-.1,.2]},
 ENERGY_SUPPLY:{energy:[1,1],airline:[-1,1],industrial:[-1,.55],auto:[-.2,.35],materials:[-.15,.25]},
 MONETARY_HAWKISH:{growth:[-1,.8],real_estate:[-1,1],bank:[1,.25],utilities:[-.35,.45],auto:[-.25,.35]},
 MONETARY_DOVISH:{growth:[1,.8],real_estate:[1,1],bank:[-.2,.25],utilities:[1,.35],auto:[1,.25]},
 INFLATION_HOT:{energy:[1,.5],materials:[1,.45],growth:[-1,.6],real_estate:[-1,.55],utilities:[-.25,.3]},
 INFLATION_COOL:{growth:[1,.6],real_estate:[1,.65],energy:[-.15,.25],bank:[-.15,.2]},
 GROWTH_STRONG:{industrial:[1,.8],auto:[1,.6],bank:[1,.35],growth:[1,.35],utilities:[-.15,.2]},
 GROWTH_WEAK:{industrial:[-1,.8],auto:[-1,.65],bank:[-.35,.4],healthcare:[1,.3],utilities:[1,.45],gold:[1,.25]}
};

const LABELS={
 defense:'Verteidigung',energy:'Energieproduzent',airline:'Airline',semiconductor:'Halbleiter',real_estate:'Immobilien/REIT',bank:'Bank/Finanzen',auto:'Auto/zyklisch',gold:'Goldproduzent',healthcare:'Gesundheit',utilities:'Versorger',industrial:'Industrie',growth:'Growth/Duration',materials:'Rohstoffe/Materialien',export_sensitive:'export-/lieferkettenabhängig'
};

const clean=v=>String(v||'').trim();
const low=v=>clean(v).toLowerCase();
const arr=v=>Array.isArray(v)?v:[];
const median=a=>{const x=a.filter(Number.isFinite).sort((m,n)=>m-n);if(!x.length)return null;const i=Math.floor(x.length/2);return x.length%2?x[i]:(x[i-1]+x[i])/2};

async function assetJson(env,path){
 try{const r=await env.ASSETS.fetch(new Request(`https://assets.local/${path}`));return r.ok?await r.json():null}catch{return null}
}

function addTag(map,tag,confidence,reason){
 const old=map.get(tag);if(!old||confidence>old.confidence)map.set(tag,{tag,label:LABELS[tag]||tag,confidence:clamp(confidence,0,1),reason});
}

function inferProfile(candidate,meta={}){
 const tags=new Map(),sym=String(candidate?.symbol||meta?.symbol||'').toUpperCase(),name=low(candidate?.name||meta?.name),theme=low(candidate?.theme),sector=low(meta?.sector),industry=low(meta?.industry),text=`${name} ${theme} ${sector} ${industry}`;
 const has=(...terms)=>terms.some(x=>text.includes(x));

 for(const [tag,set] of Object.entries(SYMBOL_TAGS))if(set.has(sym))addTag(tags,tag,.94,`bekannte Unternehmenszuordnung ${sym}`);
 if(has('aerospace','defense','defence','military','rüstung','ruestung'))addTag(tags,'defense',.82,'Branche/Name deutet auf Verteidigung');
 if(has('oil','gas','energy','petroleum','exploration','drilling','integrated oil'))addTag(tags,'energy',.82,'Branche/Name deutet auf Öl/Gas/Energie');
 if(has('airline','air lines','luftfahrtgesellschaft','passenger air'))addTag(tags,'airline',.86,'Branche/Name deutet auf Airline');
 if(has('semiconductor','chip','microelectronics','wafer','foundry'))addTag(tags,'semiconductor',.88,'Branche/Name deutet auf Halbleiter');
 if(has('reit','real estate','realty','properties','immobilien'))addTag(tags,'real_estate',.84,'Branche/Name deutet auf Immobilien/REIT');
 if(has('bank','banking','financial services','capital markets'))addTag(tags,'bank',.78,'Branche/Name deutet auf Finanzsektor');
 if(has('automotive','automobile','motor','auto manufacturer'))addTag(tags,'auto',.82,'Branche/Name deutet auf Automobil');
 if(has('gold','precious metals'))addTag(tags,'gold',.8,'Branche/Name deutet auf Gold/Edelmetalle');
 if(has('healthcare','pharma','biotech','medical','therapeutics'))addTag(tags,'healthcare',.78,'Branche/Name deutet auf Gesundheit');
 if(has('utilities','electric utility','power utility','versorger'))addTag(tags,'utilities',.82,'Branche/Name deutet auf Versorger');
 if(has('industrial','machinery','aerospace','engineering','railroad','transportation equipment'))addTag(tags,'industrial',.72,'Branche/Name deutet auf Industrie');
 if(has('materials','mining','metals','chemicals','steel','copper','resources'))addTag(tags,'materials',.74,'Branche/Name deutet auf Rohstoffe/Materialien');
 if(has('software','internet','cloud','technology','interactive media'))addTag(tags,'growth',.68,'Branche/Name deutet auf wachstums-/zinsensitive Bewertung');

 if(tags.has('semiconductor')||tags.has('industrial')||tags.has('auto')||has('luxury','electronics','apparel'))addTag(tags,'export_sensitive',.58,'Branche typischerweise stärker von Welthandel/Lieferketten abhängig');
 const region=clean(meta?.region),currency=clean(meta?.currency||candidate?.currency),exchange=clean(meta?.exchange);
 const confidence=tags.size?Math.max(...[...tags.values()].map(x=>x.confidence)):0;
 return{symbol:sym,name:candidate?.name||meta?.name||sym,region,currency,exchange,tags:[...tags.values()].sort((a,b)=>b.confidence-a.confidence),dataConfidence:confidence};
}

function exposureFor(profile,event){
 const links=EVENT_LINKS[event?.category];if(!links)return null;let nume=0,den=0;const matched=[];
 for(const t of profile.tags){const l=links[t.tag];if(!l)continue;const [dir,w]=l,weight=Math.abs(w)*t.confidence;nume+=dir*weight;den+=weight;matched.push({...t,direction:dir,weight})}
 if(!den)return null;const signed=clamp(nume/den,-1,1),strength=clamp(Math.abs(signed)*(0.65+0.35*profile.dataConfidence),0,1);if(strength<.18)return null;
 return{direction:signed>=0?1:-1,strength,score:Math.round(strength*100),links:matched.sort((a,b)=>b.weight-a.weight).slice(0,4)};
}

function directNewsFor(state,symbol){
 const n=arr(state?.newsRadar).find(x=>String(x.symbol||'').toUpperCase()===symbol);if(!n?.headline)return null;
 const age=n.trading_age_hours==null?999:num(n.trading_age_hours,999);if(age>18)return null;
 return{headline:n.headline,score:num(n.news_score),confidence:num(n.confidence),ageHours:age,sources:arr(n.sources)};
}

function learnedCategory(state,category){return arr(state?.macroLearning?.summary?.trustedCategories).find(x=>x.category===category)||null}

function referenceMove(event,peerDirectionalMoves=[]){
 const peer=median(peerDirectionalMoves),aligned=Math.max(0,num(event?.marketConfirmation?.alignedMovePct)),severity=clamp(num(event?.severity)/100,0,1);
 const proxy=clamp(aligned*.85+severity*.45,.2,3.5);
 return peer!=null&&peer>.05?clamp(peer*.7+proxy*.3,.15,4):proxy;
}

export async function buildExposureNetwork(env,state,{limit=14}={}){
 const universe=await assetJson(env,'universe.json'),metaMap=new Map(arr(universe?.equities).map(x=>[String(x.symbol||'').toUpperCase(),x]));
 const candidates=arr(state?.candidates).filter(x=>x?.symbol&&x.instrument_type!=='LEVERAGED_ETF').slice(0,35),events=arr(state?.macroRadar?.events).filter(e=>e?.category&&e.category!=='OTHER').slice(0,8);
 const dossierMap=new Map(arr(state?.investmentDossiers).map(x=>[String(x.symbol||'').toUpperCase(),x]));
 const profiles=candidates.map(c=>({candidate:c,profile:inferProfile(c,metaMap.get(String(c.symbol).toUpperCase())||{})}));
 const links=[];
 for(const e of events){
  for(const x of profiles){const exp=exposureFor(x.profile,e);if(exp)links.push({event:e,candidate:x.candidate,profile:x.profile,exposure:exp})}
 }
 const peers=new Map();
 for(const x of links){const k=`${x.event.id}|${x.exposure.direction}`,v=peers.get(k)||[];v.push(x.exposure.direction*num(x.candidate.day_change));peers.set(k,v)}
 const opportunities=[];
 for(const x of links){
  const c=x.candidate,e=x.event,exp=x.exposure,dir=exp.direction,confirmation=e.marketConfirmation||{},macroConfirmed=Boolean(confirmation.confirmed||num(confirmation.score)>=62),news=directNewsFor(state,x.profile.symbol),directionalDay=dir*num(c.day_change),directional5=dir*num(c.momentum5),directional20=dir*num(c.momentum20),directionalScore=dir*num(c.score);
  const ref=referenceMove(e,peers.get(`${e.id}|${dir}`)||[]),gap=ref-directionalDay,alreadyPriced=directionalDay>Math.max(.35,ref*1.25),trendAligned=directionalScore>=-.05&&(directional5>=-.08||directional20>=-.15),contradicted=directionalScore<-.45&&directional5<-.15;
  const learned=learnedCategory(state,e.category),dossier=dossierMap.get(x.profile.symbol),preNews=!news;
  let score=20+exp.strength*24+clamp(num(e.severity),0,100)*.14+clamp(num(confirmation.score),0,100)*.18+clamp(gap,0,3)*8;
  if(macroConfirmed)score+=8;if(preNews)score+=7;if(trendAligned)score+=8;if(learned?.trusted)score+=(num(learned.reliabilityScore)-50)*.12;if(alreadyPriced)score-=18;if(contradicted)score-=25;if(dossier?.overheated)score-=12;
  score=clamp(Math.round(score),0,100);
  let stateLabel='BEOBACHTEN';
  if(!macroConfirmed)stateLabel='MAKRO NOCH NICHT BESTÄTIGT';
  else if(alreadyPriced)stateLabel='MÖGLICHERWEISE BEREITS EINGEPREIST';
  else if(dir>0&&preNews&&score>=62)stateLabel='PRE-NEWS CHANCE PRÜFEN';
  else if(dir<0&&preNews&&score>=62)stateLabel='PRE-NEWS RISIKO PRÜFEN';
  else if(score>=62)stateLabel=dir>0?'NACHHOLPOTENZIAL PRÜFEN':'ABWÄRTSRISIKO PRÜFEN';
  opportunities.push({
   symbol:x.profile.symbol,name:x.profile.name,eventId:e.id,eventCategory:e.category,eventLabel:e.label,eventHeadline:e.headline,eventSources:arr(e.sources).slice(0,5),eventSeverity:num(e.severity),direction:dir>0?'POSITIV':'NEGATIV',exposureScore:exp.score,exposureTags:exp.links.map(t=>({tag:t.tag,label:t.label,confidence:t.confidence,reason:t.reason})),dataConfidence:x.profile.dataConfidence,macroConfirmationScore:num(confirmation.score),macroConfirmed,companyDayPct:num(c.day_change),companyMomentum5:num(c.momentum5),companyMomentum20:num(c.momentum20),liveScore:num(c.score),liveConfidence:num(c.confidence),referenceDirectionalMovePct:ref,notPricedGapPct:gap,notPricedInScore:score,alreadyPriced,trendAligned,contradicted,directCompanyNews:Boolean(news),directNews:news,preNewsInference:preNews,stateLabel,learnedMacro:learned?{samples:num(learned.samples),hitRate:num(learned.hitRate),reliabilityScore:num(learned.reliabilityScore),avgAlignedBasketPct:num(learned.avgAlignedBasketPct)}:null,dossier:dossier?{qualityScore:num(dossier.qualityScore),riskLevel:dossier.riskLevel,overheated:Boolean(dossier.overheated),expected3dPct:dossier.learning?.usable?num(dossier.learning?.expected3dPct):null}:null,
   explanation:`${e.label}: ${exp.links.map(t=>t.label).join(' + ')} ergibt ${dir>0?'positive':'negative'} Exposition. Aktie heute ${num(c.day_change)>=0?'+':''}${num(c.day_change).toFixed(2)}%; Makro-Referenz ${ref.toFixed(2)}% in erwarteter Richtung; Lücke ${gap.toFixed(2)}%. ${preNews?'Keine frische direkte Unternehmensnews gefunden.':'Direkte Unternehmensnews vorhanden.'}`
  })
 }
 opportunities.sort((a,b)=>b.notPricedInScore-a.notPricedInScore||b.exposureScore-a.exposureScore);
 const selected=opportunities.filter(x=>x.notPricedInScore>=45).slice(0,limit);
 return{
  version:1,updatedAt:nowIso(),profilesAnalyzed:profiles.length,taggedCompanies:profiles.filter(x=>x.profile.tags.length).length,activeEvents:events.length,activeLinks:links.length,preNewsCount:selected.filter(x=>x.preNewsInference&&x.notPricedInScore>=62).length,
  opportunities:selected,
  notice:'„Noch nicht eingepreist“ ist eine heuristische Frühindikator-Kennzahl, keine Rendite- oder Eintrittswahrscheinlichkeit. Sie kombiniert öffentliches Makroereignis, Unternehmens-Exposition, reale Marktbestätigung und relative Kursreaktion. Ohne Trendbestätigung darf sie keinen Trade allein auslösen.'
 };
}

export function exposureContext(state){
 const x=state?.exposureNetwork;if(!x)return null;
 return{updatedAt:x.updatedAt,summary:{profilesAnalyzed:num(x.profilesAnalyzed),activeLinks:num(x.activeLinks),preNewsCount:num(x.preNewsCount)},opportunities:arr(x.opportunities).filter(o=>o.notPricedInScore>=55).slice(0,8).map(o=>({symbol:o.symbol,event:o.eventLabel,direction:o.direction,exposureScore:o.exposureScore,notPricedInScore:o.notPricedInScore,notPricedGapPct:o.notPricedGapPct,preNewsInference:o.preNewsInference,directCompanyNews:o.directCompanyNews,trendAligned:o.trendAligned,macroConfirmed:o.macroConfirmed,alreadyPriced:o.alreadyPriced,tags:o.exposureTags?.map(t=>t.label),learnedMacro:o.learnedMacro,dossier:o.dossier,stateLabel:o.stateLabel})),notice:x.notice,rule:'Nur als Zusatzsignal verwenden. PRE-NEWS bedeutet Schlussfolgerung aus öffentlichen Makro-/Marktdaten, nicht Insiderwissen. Ein Symbol darf nur gehandelt werden, wenn es im aktuellen Live-Kandidatenuniversum liegt und aktuelle Kurs-/Trenddaten die Richtung bestätigen.'};
}
