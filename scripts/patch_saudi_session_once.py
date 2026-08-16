from pathlib import Path

p=Path('src/market-v3.js')
s=p.read_text(encoding='utf-8')
repls=[
(" [/\\.IS$/,'Europe/Istanbul',10*60,18*60,'Istanbul','XIST','TRY']", " [/\\.SR$/,'Asia/Riyadh',10*60,15*60,'Saudi-Arabien','XSAU','SAR'],[/\\.IS$/,'Europe/Istanbul',10*60,18*60,'Istanbul','XIST','TRY']"),
(" [new Set(['SES']),[null,'Asia/Singapore',9*60,17*60,'Singapur','XSES','SGD']]", " [new Set(['SES']),[null,'Asia/Singapore',9*60,17*60,'Singapur','XSES','SGD']],\n [new Set(['SAU']),[null,'Asia/Riyadh',10*60,15*60,'Saudi-Arabien','XSAU','SAR']]"),
("const CURRENCY_RULES={EUR:", "const CURRENCY_RULES={SAR:[null,'Asia/Riyadh',10*60,15*60,'Saudi-Arabien','XSAU','SAR'],EUR:"),
("if(weekdayIndex===0||weekdayIndex===6)return null;return fallback}", "if(code==='XSAU'){if(weekdayIndex===5||weekdayIndex===6)return null}else if(weekdayIndex===0||weekdayIndex===6)return null;return fallback}"),
]
for old,new in repls:
    if old not in s:
        raise SystemExit(f'patch target missing: {old[:80]}')
    s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
# One-shot helper cleans itself up in the same commit.
Path('.github/workflows/patch-saudi-session-once.yml').unlink(missing_ok=True)
Path(__file__).unlink(missing_ok=True)
print('Saudi session patch applied: Sunday-Thursday 10:00-15:00 Asia/Riyadh')