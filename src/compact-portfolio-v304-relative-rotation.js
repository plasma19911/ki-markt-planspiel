import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v303-system-validation.js';
import {RelativeRotationGuardV304,RELATIVE_ROTATION_V304} from './relative-rotation-v304.js';
import {HeldCashDeploymentGuardV304} from './held-cash-deployment-v304.js';

export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    const getState=()=>{try{return this._actualState?.()||{}}catch{return{}}};
    let ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__relativeRotationV304){const wrapped=new RelativeRotationGuardV304(ai,{getState,storage:this.ctx?.storage});wrapped.__relativeRotationV304=true;this.relativeRotationV304=wrapped;ai=wrapped;this.engine.env.AI=ai}
    if(ai?.run&&!ai.__heldCashDeploymentV304){const wrapped=new HeldCashDeploymentGuardV304(ai,{getState});wrapped.__heldCashDeploymentV304=true;this.heldCashDeploymentV304=wrapped;this.engine.env.AI=wrapped}
  }
  async status(){
    const s=await super.status(),policy=this.relativeRotationV304?.status?.()||{enabled:true,version:30.4,...RELATIVE_ROTATION_V304},cashPolicy=this.heldCashDeploymentV304?.status?.()||{enabled:true,version:'30.4-cash',targetDeploymentPct:98,maxSinglePositionPct:25};
    s.relativeRotationPolicy=policy;s.heldCashDeploymentPolicy=cashPolicy;
    s.canonicalScorePolicy={...(s.canonicalScorePolicy||{}),relativeRotation:true,relativeRotationVersion:30.4,rotateMinScoreGap:8,targetDeploymentPctWhenFourBuys:98,heldCashTopup:true,targetDeploymentPctWithFourHeld:98};
    if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,relativeRotation:true,relativeRotationVersion:30.4,heldCashTopup:true,rule:`${String(s.finalDecisionPolicy.rule||'').slice(0,380)} V30.4: Vier Slots sind keine Besitzgarantie. Ein exakt Trade-Republic-verifizierter Kandidat ab 64/100 darf das schwaechste Depotglied bei mindestens 8 Scorepunkten Vorsprung ersetzen. Sind bereits vier gute Titel im Depot, darf freies Cash bis 98% Zieldeployment in die staerksten davon aufgestockt werden, max. 25% je Titel und kein blindes Average-down.`};
    if(s?.executionModel)s.executionModel={...s.executionModel,relativeRotationV304:true,heldCashDeploymentV304:true,maxOpenPositions:4,maxSinglePositionPctOfEquity:25,targetDeploymentPctWhenFourBuys:98,targetDeploymentPctWithFourHeld:98};
    return s;
  }
}
