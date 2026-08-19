from pathlib import Path
import re

root=Path(__file__).resolve().parents[1]

def patch(path, transform):
    p=root/path
    old=p.read_text(encoding='utf-8')
    new=transform(old)
    if new==old:
        print(f'{path}: already patched/no change')
        return False
    p.write_text(new,encoding='utf-8')
    print(f'{path}: patched')
    return True

def patch_v8(s):
    if "./request-fetch-budget.js" not in s:
        s=s.replace("import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v7.js';", "import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v7.js';\nimport {withRequestFetchBudget} from './request-fetch-budget.js';",1)
    pattern=re.compile(r"async function runWithFetchBudget\(fn\)\{.*?\n\}\n\nexport class",re.S)
    repl="async function runWithFetchBudget(fn){\n  return withRequestFetchBudget(fn,{cap:EXTERNAL_FETCH_SOFT_CAP,blockedError:'free-tier-subrequest-soft-cap',label:'market-scan'});\n}\n\nexport class"
    s,n=pattern.subn(repl,s,count=1)
    if n!=1 and 'withRequestFetchBudget(fn' not in s: raise RuntimeError('V8 budget function not found')
    return s

def patch_v9(s):
    first=re.search(r"^import .*?;",s,re.M)
    if "./request-fetch-budget.js" not in s:
        if not first: raise RuntimeError('V9 import anchor not found')
        anchor=first.group(0)
        s=s.replace(anchor,anchor+"\nimport {withRequestFetchBudget} from './request-fetch-budget.js';",1)
    pattern=re.compile(r"async function withPreopenFetchBudget\(fn\)\{.*?\n\}\n\nexport class",re.S)
    repl="async function withPreopenFetchBudget(fn){\n  return withRequestFetchBudget(fn,{cap:PREOPEN_FETCH_SOFT_CAP,blockedError:'preopen-free-tier-soft-cap',label:'preopen'});\n}\n\nexport class"
    s,n=pattern.subn(repl,s,count=1)
    if n!=1 and 'withRequestFetchBudget(fn' not in s: raise RuntimeError('V9 budget function not found')
    return s

def patch_smoke(s):
    if "const requestBudget=read('src/request-fetch-budget.js');" not in s:
        s=s.replace("const v9=read('src/compact-portfolio-v9.js');", "const v9=read('src/compact-portfolio-v9.js');\nconst requestBudget=read('src/request-fetch-budget.js');",1)
    anchor="assert.match(v8,/free-tier-subrequest-soft-cap/,'Soft-Cap muss reale Zusatzfetches blockieren');"
    extra="""\nassert.match(v8,/withRequestFetchBudget/,'Normaler Scan muss den request-lokalen Budget-Adapter verwenden');\nassert.doesNotMatch(v8,/globalThis\\.fetch\\s*=/,'V8 darf globalThis.fetch nicht mehr pro Scan austauschen');\nassert.match(requestBudget,/AsyncLocalStorage/,'Request-Budget muss AsyncLocalStorage fuer isolierte Scan-Kontexte verwenden');\nassert.match(requestBudget,/crossRequestPromiseSharing:false/,'Request-Budget darf keine Request-Promises ueber Isolates teilen');"""
    if 'V8 darf globalThis.fetch nicht mehr pro Scan austauschen' not in s:
        if anchor not in s: raise RuntimeError('V8 smoke anchor missing')
        s=s.replace(anchor,anchor+extra,1)
    anchor9="assert.match(v9,/PREOPEN_FETCH_SOFT_CAP=24/,'Pre-Open muss einen eigenen Subrequest-Softcap besitzen');"
    extra9="""\nassert.match(v9,/withRequestFetchBudget/,'Pre-Open muss den request-lokalen Budget-Adapter verwenden');\nassert.doesNotMatch(v9,/globalThis\\.fetch\\s*=/,'V9 darf globalThis.fetch nicht mehr pro Pre-Open austauschen');"""
    if 'V9 darf globalThis.fetch nicht mehr pro Pre-Open austauschen' not in s:
        if anchor9 not in s: raise RuntimeError('V9 smoke anchor missing')
        s=s.replace(anchor9,anchor9+extra9,1)
    return s

changed=[]
changed.append(patch(Path('src/compact-portfolio-v8.js'),patch_v8))
changed.append(patch(Path('src/compact-portfolio-v9.js'),patch_v9))
changed.append(patch(Path('scripts/smoke-free-tier-24h.mjs'),patch_smoke))
print('changed=',sum(changed))
