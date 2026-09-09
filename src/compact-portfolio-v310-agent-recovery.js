import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v310-unified.js';
import {reconcilePaperExplorationExecutionV3175,PAPER_EXPLORATION_EXECUTION_RECONCILE_V3175} from './paper-exploration-execution-reconcile-v3175.js';

const cleanError=e=>String(e?.stack||e?.message||e||'Unbekannter Scanfehler').replace(/\s+/g,' ').trim().slice(0,1200);

export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);
    this.__pcAgentScanRecovery={lastError:null,lastErrorAt:null,lastOkAt:null,failures:0,recoveredResponses:0};
    this.__paperExplorationExecutionReconcile={...PAPER_EXPLORATION_EXECUTION_RECONCILE_V3175,checkedAt:null,attempted:false,executed:false,reason:'NOT_RUN'};
  }

  async scan(){
    const r=await super.scan();
    if(r?.skipped||r?.aborted||r?.ok===false)return r;
    let brokerRows=[];try{brokerRows=await this.__getBrokerRows?.()||[]}catch{}
    const rec=await reconcilePaperExplorationExecutionV3175({engine:this.engine,unified:this.unifiedDecisionCoreV310,brokerRows,baseResult:r});
    this.__paperExplorationExecutionReconcile=rec;
    if(rec?.executed===true){
      return{...r,actions:Math.max(1,Number(r?.actions)||0),equity:rec.equity??r?.equity,paperExplorationExecutionReconcile:rec};
    }
    return{...r,paperExplorationExecutionReconcile:rec};
  }

  async scanFromAgent(payload={}){
    // Heartbeat zuerst separat akzeptieren: Der PC darf im Dashboard nicht als offline
    // erscheinen, nur weil der eigentliche Handelsscan intern scheitert.
    try{await this.agentHeartbeat(payload)}catch{}
    try{
      // Wichtig: durch die vererbte Kette gehen. Dort werden PC-First- und
      // Wide-Sweep-Payloads angenommen und der persistente AGENT_SCAN_KEY
      // geschrieben. Der frühere direkte this.scan()-Aufruf übersprang beides.
      const r=await super.scanFromAgent(payload);
      if(r?.ok===false){
        const error=cleanError(r?.error||r?.scanError||'Portfolio-Scan meldete ok=false.'),at=new Date().toISOString();
        this.__pcAgentScanRecovery.lastError=error;
        this.__pcAgentScanRecovery.lastErrorAt=at;
        this.__pcAgentScanRecovery.failures++;
        this.__pcAgentScanRecovery.recoveredResponses++;
        try{await this.agentHeartbeat({...payload,lastError:`SCAN: ${error}`})}catch{}
        return{...r,ok:false,scanSource:'WINDOWS_PC_AGENT',agentTransportOk:true,scanFailed:true,scanError:error,at};
      }
      if(r?.skipped||r?.aborted)return{...r,scanSource:'WINDOWS_PC_AGENT',agentTransportOk:true};
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

  _withPcAgentRecovery(s={}){
    const persistedLastOk=this.__pcAgentScanRecovery.lastOkAt||s?.pcAgent?.lastSuccessfulAgentScanAt||s?.pcAgent?.lastScanAt||null;
    if(!this.__pcAgentScanRecovery.lastOkAt&&persistedLastOk)this.__pcAgentScanRecovery.lastOkAt=persistedLastOk;
    s.pcAgentScanRecovery={enabled:true,version:'31.7.34',mode:'fail-soft-agent-scan+explicit-ok-false-reporting+aligned-quote-time+dual-host-pc-quotes',...this.__pcAgentScanRecovery,rule:'PC-Heartbeat und Prefetch bleiben aktiv, auch wenn der interne Portfolio-Scan scheitert. Ein HTTP-200 mit ok=false wird als echter Scanfehler gespeichert und nicht mehr als Erfolg ausgegeben. Ein Scan ist nur verwendbar, wenn Kurs und Zeitstempel aus derselben Kerze stammen und die Kurszeit innerhalb des Frischelimits liegt; andernfalls übernimmt der Worker-Fallback.'};
    s.paperExplorationExecutionReconcile={...PAPER_EXPLORATION_EXECUTION_RECONCILE_V3175,...this.__paperExplorationExecutionReconcile,mode:'post-base-ledger-reconciliation',rule:'Nur ein vom UnifiedDecisionCore bereits final erzeugter controlled paperExplorationV3172 BUY darf nach actions=0 erneut gegen aktuellen gespeicherten Kandidaten, Freshness, FX, Cash und den verifizierten Trade-Republic-Master geprüft und ins Paper-Ledger geschrieben werden. Normale BUYs und harte Safety-Regeln werden nicht umgangen.'};
    if(s.pcAgent)s.pcAgent={...s.pcAgent,lastScanError:this.__pcAgentScanRecovery.lastError,lastScanErrorAt:this.__pcAgentScanRecovery.lastErrorAt,lastSuccessfulAgentScanAt:persistedLastOk};
    s.executionModel={...(s.executionModel||{}),pcAgentFailSoftScanRecoveryV3101:true,pcAgentDirectLiteStatusV313:true,paperExplorationExecutionReconcileV3175:true};
    return s;
  }

  async dashboardStatus(){return this._withPcAgentRecovery(await super.dashboardStatus())}
  async status(){return this._withPcAgentRecovery(await super.status())}
}
