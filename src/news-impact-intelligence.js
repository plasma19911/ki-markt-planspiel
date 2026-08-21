const txt=v=>String(v||'').toLowerCase().replace(/\s+/g,' ').trim();
const has=(s,...xs)=>xs.some(x=>s.includes(x));

export function detectNewsLanguageV298(text=''){
 const s=String(text||'');
 if(/[\u3040-\u30ff]/u.test(s))return'ja';
 if(/[\uac00-\ud7af]/u.test(s))return'ko';
 if(/[\u4e00-\u9fff]/u.test(s))return'zh';
 if(/[\u0900-\u097f]/u.test(s))return'hi';
 if(/[\u0400-\u04ff]/u.test(s))return/[іїєґ]/iu.test(s)?'uk':'ru';
 const h=txt(s);
 if(/\b(el|la|los|las|una|para|previsi[oó]n|beneficio|ingresos)\b/i.test(h))return'es';
 if(/\b(le|les|une|pour|prévisions|chiffre d.affaires|bénéfice)\b/i.test(h))return'fr';
 if(/\b(il|gli|una|previsioni|utile|ricavi)\b/i.test(h))return'it';
 if(/\b(uma|para|previs[aã]o|lucro|receita)\b/i.test(h))return'pt';
 if(/\b(een|voor|verwachting|winst|omzet)\b/i.test(h))return'nl';
 if(/\b(spółk|prognoz|zysk|przychod)\b/i.test(h))return'pl';
 if(/\b(şirket|tahmin|kâr|gelir)\b/i.test(h))return'tr';
 if(/[äöüß]/i.test(s)||/\b(gewinn|umsatz|prognose|auftrag|übernahme)\b/i.test(h))return'de';
 return'en';
}

function semanticV298(headline=''){
 const h=txt(headline),tags=[];
 const add=(tag,re)=>{if(re.test(h))tags.push(tag)};
 // Guidance / outlook in major market languages.
 add(' raises guidance ',/(rel[eè]ve|rehausse).*(prévision|objectif)|eleva.*previsi[oó]n|alza.*prevision|eleva.*previs[aã]o|verhoogt.*(prognose|verwachting)|podnosi.*prognoz|tahmin.*yükselt|повысил[аи]?.*прогноз|підвищил[аи]?.*прогноз|業績予想.*上方修正|見通し.*引き上げ|실적.*전망.*상향|전망.*상향|上调.*(业绩|盈利|收入).*预期|提高.*业绩.*预期|अनुमान.*बढ़|मार्गदर्शन.*बढ़/u);
 add(' cuts guidance ',/(abaisse|réduit).*(prévision|objectif)|recorta.*previsi[oó]n|riduce.*prevision|reduz.*previs[aã]o|verlaagt.*(prognose|verwachting)|obniża.*prognoz|tahmin.*düşür|понизил[аи]?.*прогноз|знизил[аи]?.*прогноз|業績予想.*下方修正|見通し.*引き下げ|실적.*전망.*하향|전망.*하향|下调.*(业绩|盈利|收入).*预期|降低.*业绩.*预期|अनुमान.*घट|मार्गदर्शन.*घट/u);
 // Corporate actions / contracts.
 add(' acquisition takeover merger ',/acquisition|rachat|fusion|adquisici[oó]n|fusi[oó]n|acquisizione|fusione|aquisi[cç][aã]o|fus[aã]o|overname|przejęci|fuzj|satın alma|birleşme|поглощени|слияни|придбанн|злитт|買収|合併|인수|합병|收购|并购|अधिग्रहण|विलय/u);
 add(' major contract contract award wins contract ',/grand contrat|contrat majeur|contrato importante|gran contrato|contratto importante|grande contrato|groot contract|duży kontrakt|büyük sözleşme|крупн.*контракт|великий.*контракт|大型受注|大型契約|대형.*계약|重大合同|大额订单|बड़ा अनुबंध/u);
 add(' capital increase dilution share offering ',/augmentation de capital|ampliaci[oó]n de capital|aumento di capitale|aumento de capital|kapitaalverhoging|podwyższeni.*kapita|sermaye artır|увеличени.*капитал|збільшенн.*капітал|増資|유상증자|增发|增资|पूंजी वृद्धि/u);
 // Severe negative / insolvency / fraud.
 add(' bankrupt insolvency fraud accounting irregular cyberattack ',/faillite|insolvabil|fraude|fraud|quiebra|insolvencia|fallimento|insolvenza|fal[eê]ncia|fraude|faillissement|upadłoś|oszustw|iflas|dolandırıc|банкрот|мошеннич|банкрут|шахрай|破産|不正会計|粉飾|サイバー攻撃|파산|회계부정|사기|破产|财务造假|欺诈|दिवालिया|धोखाधड़ी|साइबर हमला/u);
 // Earnings / estimates.
 add(' beats estimates revenue beat earnings beat ',/(dépasse|supérieur).*(attente|prévision)|supera.*(estimaci|previsi)|supera.*attese|supera.*estimativ|overtreft.*verwachting|powyżej.*oczekiwa|beklent.*aş|превысил.*ожидан|перевищил.*очікуван|予想.*上回|市場予想.*上回|예상.*상회|预期.*以上|超出.*预期|अनुमान.*से अधिक/u);
 add(' misses estimates revenue miss earnings miss ',/(inférieur|manque).*(attente|prévision)|no alcanza.*(estimaci|previsi)|sotto.*attese|abaixo.*estimativ|onder.*verwachting|poniżej.*oczekiwa|beklent.*alt|ниже.*ожидан|нижче.*очікуван|予想.*下回|市場予想.*下回|예상.*하회|低于.*预期|不及.*预期|अनुमान.*से कम/u);
 // Capital returns.
 add(' buyback share repurchase dividend increase ',/rachat d.actions|dividende.*hausse|recompra de acciones|dividendo.*aument|riacquisto.*azioni|dividendo.*aument|recompra.*a[cç][oõ]es|dividendo.*aument|inkoop.*eigen aandelen|dividend.*verhoog|skup.*akcji|dywidend.*podwyż|hisse geri alım|temettü.*art|выкуп.*акци|дивиденд.*повыш|викуп.*акці|дивіденд.*підвищ|自社株買い|増配|자사주.*매입|배당.*인상|回购.*股份|提高.*股息|शेयर बायबैक|लाभांश.*बढ़/u);
 // Regulatory approval / rejection.
 add(' regulatory approval approved by regulator ',/autorisation.*(réglement|mise sur le marché)|aprobaci[oó]n regulatoria|approvazione regolatoria|aprova[cç][aã]o regulat[oó]ria|goedkeuring.*toezichthouder|zgoda.*regulator|düzenleyici.*onay|регулятор.*одобр|регулятор.*схвал|承認取得|当局.*承認|규제.*승인|监管.*批准|获批|नियामक.*मंजूरी/u);
 add(' regulatory rejection approval denied ',/refus.*autorisation|rechazo regulatorio|rigetto regolatorio|rejei[cç][aã]o regulat[oó]ria|afwijzing.*toezichthouder|odmow.*regulator|düzenleyici.*ret|регулятор.*отклони|регулятор.*відхил|承認.*却下|不承認|규제.*거부|未获批准|监管.*拒绝|नियामक.*अस्वीक/u);
 return `${h}${tags.join('')}`;
}

export function classifyNewsImpact(headline=''){
 const original=txt(headline),h=semanticV298(headline);
 if(!h)return{type:'NONE',direction:0,impact:0,binary:false,structural:false,language:detectNewsLanguageV298(headline)};
 const language=detectNewsLanguageV298(headline),withLang=x=>({...x,language});

 if(/phase\s*(2|ii)\b/.test(h)||/phase\s*(3|iii)\b/.test(h)||has(h,'clinical trial','klinische studie','trial meets','primary endpoint','secondary endpoint','recurrence-free survival','overall survival','vaccine trial','cancer vaccine')){
  const pos=has(h,'met primary','meets primary','met its primary','met goals','positive','significant reduction','improved','success','successful','achieved','erreicht','signifikant','verbessert','cuts recurrence','reduces recurrence','reduced recurrence','reduced risk','risk reduction','lower risk','durable benefit','sustained benefit','met key endpoint');
  const neg=has(h,'failed','missed primary','did not meet','no benefit','stopped for futility','safety concern','verfehlt','gescheitert');
  return withLang({type:'CLINICAL_TRIAL',direction:pos?1:neg?-1:0,impact:/phase\s*(3|iii)\b/.test(h)?5:4,binary:true,structural:true});
 }
 if(has(h,'fda approval','fda approves','ema approval','approved by fda','approved by ema','zulassung erteilt','regulatory approval','approved by regulator'))return withLang({type:'REGULATORY_APPROVAL',direction:1,impact:5,binary:true,structural:true});
 if(has(h,'complete response letter','crl','fda rejects','ema rejects','approval denied','zulassung abgelehnt','regulatory rejection'))return withLang({type:'REGULATORY_REJECTION',direction:-1,impact:5,binary:true,structural:true});
 if(has(h,'raises guidance','raised guidance','raises outlook','hebt prognose','prognose angehoben','guidance above','raises full-year forecast','raises sales forecast','forecast raised'))return withLang({type:'GUIDANCE_RAISE',direction:1,impact:4,binary:false,structural:true});
 if(has(h,'cuts guidance','cut guidance','lowers guidance','senkt prognose','gewinnwarnung','profit warning','lowers full-year forecast'))return withLang({type:'GUIDANCE_CUT',direction:-1,impact:5,binary:false,structural:true});
 if(has(h,'strategic investment','strategic stake','takes a stake','takes stake','take a stake','equity investment','invests in','investment in')||(/warrant/.test(h)&&has(h,'purchase shares','buy shares','acquire shares','stake','equity')))return withLang({type:'STRATEGIC_STAKE',direction:1,impact:4,binary:false,structural:true});
 if(has(h,'acquisition','acquire','takeover','merger','übernahme','fusion','buyout'))return withLang({type:'M&A',direction:0,impact:4,binary:true,structural:true});
 if(has(h,'major contract','contract award','wins contract','large order','record order','großauftrag','grossauftrag','auftrag erhalten','multi-year agreement','multiyear agreement'))return withLang({type:'MAJOR_CONTRACT',direction:1,impact:3,binary:false,structural:false});
 if(has(h,'capital increase','rights issue','secondary offering','share offering','dilution','kapitalerhöhung'))return withLang({type:'DILUTION_FINANCING',direction:-1,impact:4,binary:false,structural:true});
 if(has(h,'fraud','accounting irregular','sec investigation','criminal investigation','bankrupt','insolven','default','recall','data breach','cyberattack'))return withLang({type:'SEVERE_NEGATIVE',direction:-1,impact:5,binary:true,structural:true});
 if(has(h,'beats estimates','beat estimates','earnings beat','revenue beat','übertrifft erwartungen'))return withLang({type:'EARNINGS_BEAT',direction:1,impact:3,binary:false,structural:false});
 if(has(h,'misses estimates','missed estimates','earnings miss','revenue miss','verfehlt erwartungen'))return withLang({type:'EARNINGS_MISS',direction:-1,impact:3,binary:false,structural:false});
 if(has(h,'buyback','share repurchase','aktienrückkauf','dividend increase','dividende erhöht'))return withLang({type:'CAPITAL_RETURN',direction:1,impact:2,binary:false,structural:false});
 if(has(h,'upgrade','price target raised','kursziel erhöht'))return withLang({type:'ANALYST_POSITIVE',direction:1,impact:1,binary:false,structural:false});
 if(has(h,'downgrade','price target cut','kursziel gesenkt'))return withLang({type:'ANALYST_NEGATIVE',direction:-1,impact:1,binary:false,structural:false});
 if(has(h,'earnings','quarter','quartal','results','ergebnis','eps','revenue','umsatz','profit','gewinn'))return withLang({type:'EARNINGS',direction:0,impact:2,binary:false,structural:false});
 return withLang({type:'OTHER',direction:0,impact:1,binary:false,structural:false,original});
}

export function strongestNewsImpact(rows=[]){
 let best={type:'NONE',direction:0,impact:0,binary:false,structural:false,headline:'',language:'en'};
 for(const row of rows||[]){
  const headline=typeof row==='string'?row:String(row?.headline||row?.title||row?.text||'');
  const x=classifyNewsImpact(headline);
  if(x.impact>best.impact||(x.impact===best.impact&&Math.abs(x.direction)>Math.abs(best.direction)))best={...x,headline};
 }
 return best;
}
