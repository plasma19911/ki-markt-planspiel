import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v310-unified.js';

const cleanError=e=>String(e?.stack||e?.message||e||'Unbekannter Scanfehler').replace(/\s+/g,' ').trim().slice(0,1200);

export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);
    this.__pcAgentScanRecovery={lastError:null,lastErrorAt:null,lastOkAt:null,failures:0,recoveredResponses:0};
  }

  async scanFromAgent(payload={}){
    // Heartbeat zuerst separat akzeptieren: Der PC darf im Dashboard nicht als offline
    // erscheinen, nur weil der eigentliche Handelsscan intern scheitert.
    try{await this.agentHeartbeat(payload)}catch{}
    try{
      const r=await this.scan();
      this.__pcAgentScanRecovery.lastError=null;
      this.__pcAgentScanRecovery.lastOkAt=new Date().toISOString();
      return{...r,ok:r?.ok!==false,scanSource:'WINDOWS_PC_AGENT',agentTransportOk:true};
    }catch(e){
      const error=cleanError(e),at=new Date().toISOString();
      this.__pcAgentScanRecovery.lastError=error;
      this.__pcAgentScanRecovery.lastErrorAt=at;
      this.__pcAgentScanRecovery.failures++;
      this.__pcAgentScanRecovery.recoveredResponses++;
      // Wichtig: 200 mit ok:false statt HTTP 500. Der Windows-Agent kann dadurch
      // im selben Minutenlauf Leader/Future-Prefetch weiter hochladen und verliert
      // nicht die komplette Datenpipeline wegen eines einzelnen Scanfehlers.
      try{await this.agentHeartbeat({...payload,lastError:`SCAN: ${error}`})}catch{}
      return{ok:false,scanSource:'WINDOWS_PC_AGENT',agentTransportOk:true,scanFailed:true,scanError:error,at};
    }
  }

  async status(){
    const s=await super.status();
    s.pcAgentScanRecovery={enabled:true,version:'31.0.1',mode:'fail-soft-agent-scan',...this.__pcAgentScanRecovery,rule:'PC-Heartbeat und Prefetch bleiben aktiv, auch wenn der interne Portfolio-Scan fehlschlaegt. Scanfehler werden sichtbar statt als undiagnostischer HTTP-500 die komplette Agent-Minute abzubrechen.'};
    if(s.pcAgent)s.pcAgent={...s.pcAgent,lastScanError:this.__pcAgentScanRecovery.lastError,lastScanErrorAt:this.__pcAgentScanRecovery.lastErrorAt,lastSuccessfulAgentScanAt:this.__pcAgentScanRecovery.lastOkAt};
    s.executionModel={...(s.executionModel||{}),pcAgentFailSoftScanRecoveryV3101:true};
    return s;
  }
}
