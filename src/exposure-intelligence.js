import {clamp,num,nowIso} from './constants.js';

const FACTORS={
 WAR_ESCALATION:{DEFENSE:1,DEFENSE_TECH:1,SPACE_DEFENSE:.8,ENERGY:.65,AIRLINES:-.9,CYCLICAL:-.35,TECH_SEMI:-.2},
 CEASEFIRE:{DEFENSE:-.55,DEFENSE_TECH:-.45,SPACE_DEFENSE:-.4,ENERGY:-.25,AIRLINES:.9,CYCLICAL:.55,TECH_SEMI:.2},
 SANCTIONS:{ENERGY:.35,TECH_SEMI:-.55,TECH_HARDWARE:-.45,TECH_COMMERCE:-.35,GLOBAL_EXPORT:-.55,LOCAL_SUPPLY:.5},
 TRADE_TARIFF:{TECH_SEMI:-.75,TECH_HARDWARE:-.6,TECH_COMMERCE:-.45,GLOBAL_EXPORT:-.65,INDUSTRIAL:-.45,LOCAL_SUPPLY:.55},
 ENERGY_SUPPLY:{ENERGY:1,AIRLINES:-1,INDUSTRIAL:-.5,CHEMICALS:-.55,TRANSPORT:-.55},
 MONETARY_HAWKISH:{RATE_SENSITIVE:-.75,REAL_ESTATE:-1,TECH_GROWTH:-.7,FINANCIALS:.25},
 MONETARY_DOVISH:{RATE_SENSITIVE:.75,REAL_ESTATE:1,TECH_GROWTH:.7,FINANCIALS:-.15},
 INFLATION_HOT:{RATE_SENSITIVE:-.65,REAL_ESTATE:-.65,TECH_GROWTH:-.6,ENERGY:.35,MATERIALS:.3},
 INFLATION_COOL:{RATE_SENSITIVE:.65,REAL_ESTATE:.7,TECH_GROWTH:.6,ENERGY:-.15},
 GROWTH_STRONG:{CYCLICAL:.7,INDUSTRIAL:.7,TECH_GROWTH:.25,FINANCIALS:.35,DEFENSIVE:-.15},
 GROWTH_WEAK:{CYCLICAL:-.75,INDUSTRIAL:-.7,TECH_GROWTH:-.35,FINANCIALS:-.35,DEFENSIVE:.45}
};

const PROXY_BY_FACTOR={
 DEFENSE:'ITA',DEFENSE_TECH:'ITA',SPACE_DEFENSE:'ITA',ENERGY:'XLE',AIRLINES:'JETS',INDUSTRIAL:'XLI',CYCLICAL:'ACWI',
 TECH_SEMI:'SMH',TECH_HARDWARE:'SMH',TECH_GROWTH:'QQQ',RATE_SENSITIVE:'QQQ',REAL_ESTATE:'XLRE',FINANCIALS:'ACWI',
 MATERIALS:'ACWI',CHEMICALS:'XLI',TRANSPORT:'XLI',GLOBAL_EXPORT:'ACWI',LOCAL_SUPPLY:'ACWI',DEFENSIVE:'ACWI'
};

const clean=v=>String(v||'').toUpperCase();
const uniq=a=>[...new Set(a.filter(Boolean))];

function profile(row){
 const theme=clean(row.theme),name=clean(row.name),symbol=clean(row.symbol),text=`${theme} ${name} ${symbol}`;
 const f=[];
 const add=(x,cond=true)=>{if(cond)f.push(x)};
 add('DEFENSE',/DEFENSE|AEROSPACE|ARMAMENT|SHIPBUILD|RHEINMETALL|LOCKHEED|NORTHROP|GENERAL DYNAMICS|BAE SYSTEMS|LEONARDO|THALES|SAAB|HENSOLDT|RENK/.test(text));
 add('DEFENSE_TECH',/DEFENSE_TECH|PALANTIR|CYBER.*DEFENSE/.test(text));
 add('SPACE_DEFENSE',/SPACE_DEFENSE|SPACE_TECH|ROCKET|SPACE/.test(text));
 add('TECH_SEMI',/TECH_SEMI|SEMICONDUCT|MICRON|NVIDIA|AMD|BROADCOM|ASML|INFINEON|TSMC|SAMSUNG ELECTRONICS|SK HYNIX/.test(text));
 add('TECH_HARDWARE',/TECH_HARDWARE|HARDWARE|DELL|HEWLETT|SUPER MICRO|SONY/.test(text));
 add('TECH_GROWTH',/^TECH_|SOFTWARE|CLOUD|AI|CYBER|DATA|PLATFORM|FINTECH/.test(theme));
 add('RATE_SENSITIVE',/^TECH_|SOFTWARE|CLOUD|AI|REAL ESTATE|REIT/.test(text));
 add('REAL_ESTATE',/REAL ESTATE|REIT|PROPERTY|IMMOBILI/.test(text));
 add('ENERGY',/ENERGY|OIL|PETROLEUM|SHELL|EXXON|CHEVRON|TOTALENERG|BP PLC|EQUINOR|CONOCOPHILLIPS/.test(text));
 add('AIRLINES',/AIRLINE|AIR LINES|LUFTHANSA|RYANAIR|EASYJET|IAG|UNITED AIRLINES|DELTA AIR|SOUTHWEST AIR/.test(text));
 add('TRANSPORT',/LOGISTICS|SHIPPING|TRANSPORT|FREIGHT/.test(text));
 add('CHEMICALS',/CHEMICAL|BASF|DOW INC|LYONDELL/.test(text));
 add('INDUSTRIAL',/INDUSTR|MACHIN|ENGINEER|CATERPILLAR|SIEMENS|HONEYWELL|3M/.test(text));
 add('FINANCIALS',/BANK|FINANCIAL|INSURANCE|CAPITAL|VISA|MASTERCARD/.test(text));
 add('MATERIALS',/MINING|MATERIAL|STEEL|COPPER|ALUMIN|GOLD|LITHIUM/.test(text));
 add('GLOBAL_EXPORT',/TECH_SEMI|TECH_HARDWARE|INDUSTRIAL|AUTOMOTIVE|COMMERCE/.test(text));
 add('LOCAL_SUPPLY',/UTILITY|TELECOM|DOMESTIC/.test(text));
 add('CYCLICAL',/INDUSTRIAL|AIRLINES|TRANSPORT|AUTOMOTIVE|COMMERCE|MATERIALS/.test(f.join(' ')));
 add('DEFENSIVE',/UTILITY|HEALTH|CONSUMER STAP|PHARMA/.test(text));
 return{theme:row.theme||null,factors:uniq(f),region:row.region||'',currency:row.currency||'',exchange:row.exchange||''};
}

function proxyMove(event,factor){
 const sym=PROXY_BY_FACTOR[factor];if(!sym)return null;
 const r=(event?.marketConfirmation?.readings||[]).find(x=>clean(x.symbol)===sym);return r?num(r.movePct):null;
}

function eventImpact(row,event){
 const weights=FACTORS[event.category]||{},p=profile(row),hits=[];let signed=0,abs=0,expected=0,den=0;
 for(const factor of p.factors){const w=num(weights[factor]);if(!w)continue;const pm=proxyMove(event,factor);hits.push({factor,weight:w,proxy:PROXY_BY_FACTOR[factor]||null,proxyMovePct:pm});signed+=w;abs+=Math.abs(w);if(Number.isFinite(pm)){expected+=Math.abs(w)*Math.abs(pm)*Math.sign(w);den+=Math.abs(w)}}
 if(!hits.length)return null;
 const direction=signed>=0?1:-1,relevance=clamp(abs/Math.max(1,hits.length),0,1),expectedMovePct=den?expected/den:direction*num(event?.marketConfirmation?.alignedMovePct,.25);
 const actual=num(row.day_change),signedActual=actual*direction,signedExpected=Math.abs(expectedMovePct),lagPct=signedExpected-signedActual;
 const directNews=Math.abs(num(row.news_score))>=.12||String(row.event_text||'').trim().length>8;
 const overheated=direction>0&&(actual>=5||num(row.rsi)>=73);
 const trendConfirm=direction>0?(num(row.score)>0?1:0):(num(row.score)<0?1:0);
 let quality=relevance*34+num(event.severity)*.18+num(event?.marketConfirmation?.score)*.24+clamp(lagPct,0,3)*8+trendConfirm*8;
 if(directNews)quality-=10;if(overheated)quality-=14;
 quality=clamp(Math.round(quality),0,100);
 const preNews=!directNews;
 const underreacted=lagPct>=.25&&relevance>=.4&&num(event?.marketConfirmation?.score)>=58;
 return{eventId:event.id,eventCategory:event.category,eventLabel:event.label,eventHeadline:event.headline,eventSeverity:num(event.severity),marketConfirmation:num(event?.marketConfirmation?.score),marketConfirmed:Boolean(event?.marketConfirmation?.confirmed),direction:direction>0?'POSITIVE':'NEGATIVE',relevance:+relevance.toFixed(2),expectedMovePct:+expectedMovePct.toFixed(2),actualDayPct:+actual.toFixed(2),underreactionPct:+lagPct.toFixed(2),underreacted,preNews,directNews,overheated,qualityScore:quality,factors:hits.slice(0,5)};
}

export function updateExposureIntelligence(state){
 const events=(state?.macroRadar?.events||[]).filter(e=>num(e.severity)>=40&&num(e?.marketConfirmation?.score)>=50).slice(0,8);
 const rows=(state?.candidates||[]).filter(x=>x?.symbol&&x.instrument_type!=='LEVERAGED_ETF').slice(0,35);
 const ideas=[];
 for(const row of rows){
  const p=profile(row);for(const e of events){const impact=eventImpact(row,e);if(!impact)continue;if(impact.qualityScore<42)continue;ideas.push({symbol:row.symbol,name:row.name||row.symbol,instrumentType:row.instrument_type||'EQUITY',theme:row.theme||null,profile:p,live:{score:num(row.score),confidence:num(row.confidence),dayPct:num(row.day_change),newsScore:num(row.news_score),rsi:row.rsi==null?null:num(row.rsi)},...impact,stance:impact.direction==='POSITIVE'?(impact.underreacted?'BUY_WATCH':'POSITIVE_WATCH'):(impact.underreacted?'SELL_RISK':'NEGATIVE_WATCH'),reason:impact.direction==='POSITIVE'?`Welt-/Makroereignis passt zum Unternehmensprofil; erwartete positive Proxy-Wirkung liegt rund ${Math.max(0,impact.underreactionPct).toFixed(2)} Prozentpunkte vor der bisherigen Tagesreaktion.`:`Welt-/Makroereignis belastet das Unternehmensprofil; negative Proxy-Wirkung könnte im Kurs noch nicht vollständig sichtbar sein.`})}}
 ideas.sort((a,b)=>(Number(b.preNews)-Number(a.preNews))||(Number(b.underreacted)-Number(a.underreacted))||b.qualityScore-a.qualityScore);
 const top=ideas.slice(0,14);
 state.exposureIntelligence={version:1,updatedAt:nowIso(),method:'Ereignis → wirtschaftlicher Faktor → Unternehmensprofil → bestätigter Markt-Proxy → relative Kursreaktion',ideas:top,summary:{scannedCandidates:rows.length,relevantEvents:events.length,preNewsIdeas:top.filter(x=>x.preNews).length,underreactionIdeas:top.filter(x=>x.underreacted).length},notice:'„Noch nicht eingepreist“ ist eine modellbasierte Underreaction-Schätzung, keine Gewissheit. Ein Signal wird nur als Zusatzkontext verwendet und benötigt Kurs-/Trendbestätigung.'};
 return state.exposureIntelligence;
}

export function exposureContext(state){
 const x=state?.exposureIntelligence;if(!x?.ideas?.length)return null;
 return{updatedAt:x.updatedAt,method:x.method,ideas:x.ideas.slice(0,8).map(i=>({symbol:i.symbol,stance:i.stance,quality:i.qualityScore,preNews:i.preNews,underreacted:i.underreacted,underreactionPct:i.underreactionPct,event:i.eventLabel,direction:i.direction,relevance:i.relevance,factors:i.factors.map(f=>f.factor),reason:i.reason})),notice:x.notice};
}
