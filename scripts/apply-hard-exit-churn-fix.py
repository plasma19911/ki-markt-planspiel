from pathlib import Path
import re
# Guarded one-shot: source files are committed only after all exit/replay/core tests pass.
# Triggered after the diagnostic workflow was installed.
root=Path(__file__).resolve().parents[1]

def patch(path,fn):
 p=root/path; old=p.read_text(encoding='utf-8'); new=fn(old)
 if new==old: print(path,'no-change'); return False
 p.write_text(new,encoding='utf-8'); print(path,'patched'); return True

def fresh(s):
 if "./hard-exit-classifier.js" not in s:s="import {classifyHardExit} from './hard-exit-classifier.js';\n"+s
 s=re.sub(r"function explicitHardReason\(a=\{\}\)\{[^\n]+\}\n","",s,count=1)
 s,n=re.subn(r"function hardExit\(c=\{\},a=\{\}\)\{[^\n]+\}","function hardExit(c={},a={}){return classifyHardExit(c,a).hard}",s,count=1)
 if n!=1 and "return classifyHardExit(c,a).hard" not in s:raise RuntimeError('fresh hardExit anchor missing')
 return s

def candle(s):
 if "./hard-exit-classifier.js" not in s:s="import {classifyHardExit} from './hard-exit-classifier.js';\n"+s
 s=re.sub(r"function hardReason\(a=\{\}\)\{[^\n]+\}\n","",s,count=1)
 s=re.sub(r"function hardCandidate\(c=\{\}\)\{[^\n]+\}\n","",s,count=1)
 if "hardReason(a)||hardCandidate(c)" in s:s=s.replace("hard=hardReason(a)||hardCandidate(c)","hard=classifyHardExit(c,a).hard",1)
 if "hardCandidate(h)" in s:s=s.replace("const hard=hardCandidate(h),confirmed=", "const hard=classifyHardExit(h,{}).hard,confirmed=",1)
 s=s.replace('CANDLE-FLOW PROACTIVE HARD-SELL: harter Risiko-/Reversalzustand; Haltedauer irrelevant.','CANDLE-FLOW PROACTIVE HARD-SELL: echter harter Event-/Kursbruch; Haltedauer irrelevant.')
 if "classifyHardExit(c,a).hard" not in s or "classifyHardExit(h,{}).hard" not in s:raise RuntimeError('candle hard exit anchors missing')
 return s

changed=sum([patch(Path('src/fresh-position-churn-guard.js'),fresh),patch(Path('src/candle-flow-ai-guard.js'),candle)])
print('changed=',changed)
