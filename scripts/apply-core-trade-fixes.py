from pathlib import Path


def replace_once(path: str, old: str, new: str) -> bool:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if new in text:
        return False
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected exactly one patch anchor, got {count}")
    p.write_text(text.replace(old, new), encoding="utf-8")
    return True


def patch_r2() -> bool:
    changed = False
    changed |= replace_once(
        "src/r2-portfolio.js",
        "const a=am.get(p.symbol);let why=null;if(q.momentumSellSignal==='STRONG'&&num(q.momentumExhaustionScore)>=3&&num(q.momentum5)<0)why=`Momentum-Risk-Exit: starker Lauf kippt (${num(q.momentumExhaustionScore).toFixed(1)}), 5m ${num(q.momentum5).toFixed(2)}%, Rücklauf vom 20m-Hoch ${num(q.drawdownFrom20mHighPct).toFixed(2)}%`;else if(a?.action==='SELL'&&a.confidence>=.5)why=`KI SELL ${Math.round(a.confidence*100)}%: ${a.reason}`;else if(fallback&&num(q.score)<=-1.5)why=`Signal-Fallback wegen nicht verfügbarer KI: Score ${num(q.score).toFixed(2)}`;if(why&&closePosition",
        "const a=am.get(p.symbol);let why=null;const hardEvent=String(q.eventRisk||q.event_risk||'NONE').toUpperCase()==='HIGH';if(hardEvent)why=`HARD-EVENT-EXIT: ${q.eventText||q.event_text||'Event-Risiko HIGH'}`;else if(a?.action==='SELL'&&a.confidence>=.5)why=`KI SELL ${Math.round(a.confidence*100)}%: ${a.reason}`;if(why&&closePosition",
    )
    changed |= replace_once(
        "src/r2-portfolio.js",
        "if(!buys.length&&fallback){const top=candidates.filter(x=>x.fresh&&x.confidence>=.55&&x.momentumSellSignal!=='STRONG'&&!existingKeys.has(entityKey(x))).sort((a,b)=>(num(b.score)+num(b.confidence))-(num(a.score)+num(a.confidence)))[0];if(top)buys.push({cand:top,a:{allocation_pct:100,confidence:top.confidence,reason:`stärkstes verfügbares Fallback-Signal ${top.score.toFixed(2)}`},k:top.score+top.confidence})}",
        "if(!buys.length&&fallback){/* KI-/Validierungsfehler: kein unvalidierter Ersatzkauf; Cash bleibt frei. */}",
    )

    p = Path("src/r2-portfolio.js")
    text = p.read_text(encoding="utf-8")
    old_global = "const nativeFetch=globalThis.fetch;let m;globalThis.fetch=async(input,init)=>{try{const raw=typeof input==='string'||input instanceof URL?String(input):input?.url;if(raw&&new URL(raw).hostname==='news.google.com')return new Response(EMPTY_RSS,{status:200,headers:{'content-type':'application/rss+xml;charset=utf-8'}})}catch{}return nativeFetch(input,init)};try{m=await scanMarket(this.env,{...cfg,include_etfs:1,include_leverage:0},s.positions.map(p=>p.symbol))}finally{globalThis.fetch=nativeFetch}"
    bad_partial = "const m=await scanMarket(this.env,{...cfg,include_etfs:1,include_leverage:0,disable_google_news:1},s.positions.map(p=>p.symbol))const candidates="
    good_prefix = "const m=await scanMarket(this.env,{...cfg,include_etfs:1,include_leverage:0,disable_google_news:1},s.positions.map(p=>p.symbol));const candidates="
    if bad_partial in text:
        text = text.replace(bad_partial, good_prefix)
        p.write_text(text, encoding="utf-8")
        changed = True
    elif good_prefix not in text:
        if text.count(old_global) != 1:
            raise RuntimeError("src/r2-portfolio.js: scanMarket/global-fetch patch state unresolved")
        text = text.replace(
            old_global,
            "const m=await scanMarket(this.env,{...cfg,include_etfs:1,include_leverage:0,disable_google_news:1},s.positions.map(p=>p.symbol));",
        )
        p.write_text(text, encoding="utf-8")
        changed = True
    return changed


def patch_market() -> bool:
    p = Path("src/market-v3-base.js")
    text = p.read_text(encoding="utf-8")
    original = text
    radar = "function rotatingRadar(items){const minute=Math.floor(Date.now()/60000),priority=items.filter(x=>x.priority),regular=items.filter(x=>!x.priority),a=Math.min(Math.ceil(NEWS_RADAR_BATCH/2),priority.length),b=NEWS_RADAR_BATCH-a;return[...rotate(priority,a,minute),...rotate(regular,b,minute+17)]}"
    helpers = radar + "\nfunction newsPriorityTargets(items,limit){const shock=[...items].filter(x=>Math.abs(num(x?.dayChange))>=4||Math.abs(num(x?.momentum20))>=2).sort((a,b)=>Math.abs(num(b?.dayChange))-Math.abs(num(a?.dayChange))||Math.abs(num(b?.momentum20))-Math.abs(num(a?.momentum20))),out=[];for(const c of [...shock,...items]){if(c&&!out.some(x=>x.symbol===c.symbol)){out.push(c);if(out.length>=limit)break}}return out}\nfunction newsSearchName(c){const words=companyWords(c),full=String(c?.name||c?.symbol||'').replace(/\"/g,'').trim(),core=words.slice(0,3).join(' ');return core.length>=5?core:full}"
    if "function newsPriorityTargets(items,limit)" not in text:
        if text.count(radar) != 1:
            raise RuntimeError("src/market-v3-base.js: rotatingRadar anchor unresolved")
        text = text.replace(radar, helpers)
    text = text.replace(
        "const deepNewsTargets=deep.slice(0,NEWS_LIMIT);",
        "const deepNewsTargets=newsPriorityTargets(deep,NEWS_LIMIT);",
    )
    old_enhanced = "const enhanced=[];for(const c of (newsOnly?radarTargets.slice(0,4):[...deep.slice(0,2),...radarTargets.filter(x=>x.priority).slice(0,2)]))"
    prioritized_enhanced = "const enhanced=[];for(const c of (newsOnly?radarTargets.slice(0,4):[...newsPriorityTargets(deep,2),...radarTargets.filter(x=>x.priority).slice(0,2)]))"
    disabled_enhanced = "const enhanced=[];for(const c of (cfg?.disable_google_news?[]:(newsOnly?radarTargets.slice(0,4):[...newsPriorityTargets(deep,2),...radarTargets.filter(x=>x.priority).slice(0,2)])))"
    text = text.replace(old_enhanced, prioritized_enhanced)
    text = text.replace(prioritized_enhanced, disabled_enhanced)
    text = text.replace(
        "u.searchParams.set('q',`\"${String(c.name||c.symbol).replace(/\"/g,'')}\" when:2d`);",
        "u.searchParams.set('q',`\"${newsSearchName(c)}\" when:2d`);",
    )
    required = (
        "newsPriorityTargets(deep,NEWS_LIMIT)",
        "newsPriorityTargets(deep,2)",
        "newsSearchName(c)",
        "cfg?.disable_google_news?[]",
    )
    if not all(x in text for x in required):
        raise RuntimeError("src/market-v3-base.js: news patch incomplete")
    if text != original:
        p.write_text(text, encoding="utf-8")
        return True
    return False


def main() -> None:
    changed = patch_r2() | patch_market()
    print("core trade fixes applied" if changed else "core trade fixes already present")


if __name__ == "__main__":
    main()
