import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v303-system-validation.js';
import {RelativeRotationGuardV304,RELATIVE_ROTATION_V304} from './relative-rotation-v304.js';

export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    const ai=this.engine?.env?.AI;
    if(ai?.run&&!ai.__relativeRotationV304){
      const getState=()=>{try{return this._actualState?.()||{}}catch{return{}}};
      const wrapped=new RelativeRotationGuardV304(ai,{getState,storage:this.ctx?.storage});
      wrapped.__relativeRotationV304=true;this.relativeRotationV304=wrapped;this.engine.env.AI=wrapped;
    }
  }
  async status(){
    const s=await super.status(),policy=this.relativeRotationV304?.status?.()||{enabled:true,version:30.4,...RELATIVE_ROTATION_V304};
    s.relativeRotationPolicy=policy;
    s.canonicalScorePolicy={...(s.canonicalScorePolicy||{}),relativeRotation:true,relativeRotationVersion:30.4,rotateMinScoreGap:RELATIVE_ROTATION_V304.rotateMinScoreGap,targetDeploymentPctWhenFourBuys:RELATIVE_ROTATION_V304.targetDeploymentPctWhenFourBuys};
    if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,relativeRotation:true,relativeRotationVersion:30.4,rule:`${String(s.finalDecisionPolicy.rule||'').slice(0,420)} V30.4: Vier Slots sind keine Besitzgarantie. Ein exakt Trade-Republic-verifizierter Kandidat ab 64/100 darf das schwaechste Depotglied bei mindestens 8 Scorepunkten Vorsprung ersetzen, sofern dessen kurzfristige Struktur nicht mehr klar staerker ist. Vier qualifizierte neue BUYs werden auf 98% Zieldeployment hochskaliert, max. 25% je Position.`};
    if(s?.executionModel)s.executionModel={...s.executionModel,relativeRotationV304:true,maxOpenPositions:4,maxSinglePositionPctOfEquity:25,targetDeploymentPctWhenFourBuys:98};
    return s;
  }
}
