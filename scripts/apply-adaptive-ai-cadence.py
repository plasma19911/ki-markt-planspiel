from pathlib import Path

p=Path('src/compact-portfolio-v5.js')
t=p.read_text(encoding='utf-8')
imp="import {enforceFastExecutionGuards,isLowerAiPlanCooldown} from './decision-guard.js';"
newimp=imp+"\nimport {adaptivePlanCooldownMs} from './adaptive-ai-cadence.js';"
if "from './adaptive-ai-cadence.js'" not in t:
    if t.count(imp)!=1: raise SystemExit('decision-guard import anchor unresolved')
    t=t.replace(imp,newimp)
old="if(isPlan&&now-Number(q.planAt||0)<ZERO_AI_PLAN_COOLDOWN_MS){const fast=await this.fast(prompt);return{response:JSON.stringify({summary:`KI-Wartefenster; ${fast.summary}`,actions:fast.actions})}}"
new="const planCooldownMs=isPlan?adaptivePlanCooldownMs(prompt,ZERO_AI_PLAN_COOLDOWN_MS):ZERO_AI_PLAN_COOLDOWN_MS;if(isPlan&&now-Number(q.planAt||0)<planCooldownMs){const fast=await this.fast(prompt);return{response:JSON.stringify({summary:`KI-Wartefenster ${Math.round(planCooldownMs/60000)}m; ${fast.summary}`,actions:fast.actions})}}"
if old in t:
    t=t.replace(old,new)
elif new not in t:
    raise SystemExit('AI plan cooldown anchor unresolved')
status_old="aiPlanCooldownMinutes:ZERO_AI_PLAN_COOLDOWN_MS/60000,aiNewsCooldownMinutes:ZERO_AI_NEWS_COOLDOWN_MS/60000,"
status_new="aiPlanCooldownMinutes:ZERO_AI_PLAN_COOLDOWN_MS/60000,aiPlanCooldownAdaptiveMinutes:{highCashStrongSetup:3,mediumCashStrongSetup:5,default:ZERO_AI_PLAN_COOLDOWN_MS/60000},aiNewsCooldownMinutes:ZERO_AI_NEWS_COOLDOWN_MS/60000,"
if status_old in t:
    t=t.replace(status_old,status_new)
elif status_new not in t:
    raise SystemExit('status cooldown anchor unresolved')
p.write_text(t,encoding='utf-8')
print('adaptive AI cadence integrated')
