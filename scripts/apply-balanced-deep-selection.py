from pathlib import Path

p=Path('src/market-v3-base.js')
t=p.read_text(encoding='utf-8')
imp="import {PRIORITY_EQUITIES} from './priority-equities.js';"
newimp=imp+"\nimport {selectBalancedDeepCandidates} from './deep-candidate-selection.js';"
if "selectBalancedDeepCandidates" not in t:
    if t.count(imp)!=1:
        raise SystemExit('priority import anchor unresolved')
    t=t.replace(imp,newimp)

old="const tradable=coarse.filter(x=>!x.benchmark),freshTradable=tradable.filter(x=>x.fresh),regularRank=[...freshTradable].sort((a,b)=>b.preScore-a.preScore),selected=regularRank.slice(0,Math.max(1,DEEP_LIMIT-MOMENTUM_BREAKOUT_RESERVE)),breakoutRank=[...freshTradable].filter(x=>x.breakoutPre).sort((a,b)=>b.breakoutPreScore-a.breakoutPreScore);for(const x of breakoutRank){if(selected.length>=DEEP_LIMIT)break;if(!selected.some(y=>y.symbol===x.symbol))selected.push(x)}for(const x of regularRank){if(selected.length>=DEEP_LIMIT)break;if(!selected.some(y=>y.symbol===x.symbol))selected.push(x)}"
new="const tradable=coarse.filter(x=>!x.benchmark),freshTradable=tradable.filter(x=>x.fresh),selected=selectBalancedDeepCandidates(freshTradable,DEEP_LIMIT,MOMENTUM_BREAKOUT_RESERVE)"
if old in t:
    t=t.replace(old,new)
elif new not in t:
    raise SystemExit('deep selection anchor unresolved')

p.write_text(t,encoding='utf-8')
print('balanced deep selection present')
