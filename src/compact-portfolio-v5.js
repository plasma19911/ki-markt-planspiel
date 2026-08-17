import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v4.js';
import {ZERO_BROKER,zeroExecutionNote} from './zero-broker.js';

class ZeroBrokerAiGuard{
  constructor(base){this.base=base}
  async run(model,input){
    const prompt=String(input?.messages?.map(x=>x?.content||'').join('\n')||'');
    const isPlan=prompt.includes('JSON-only')&&prompt.includes('Kandidaten=');
    if(!isPlan)return this.base.run(model,input);
    const extra={role:'user',content:`Zieldepot für spätere praktische Umsetzung: finanzen.net ZERO über gettex. Das bleibt PAPER-TRADING; keine echten Brokerorders. Berücksichtige nur die vom Scanner angebotenen liquiden Aktien und normalen europäischen UCITS-ETF-Kandidaten. US-domiciled Analyse-Proxys wie SPY/QQQ dürfen Marktinformationen liefern, sind aber keine kaufbaren ETF-Kandidaten. Bevorzuge liquide Werte und vermeide dünne/exotische Notierungen. Bei kleinen oder fraktionalen Orders konservativ 1 EUR Zuschlag plus Spread/Slippage annehmen. Broker-Verfügbarkeit kann sich ändern und ist keine Kaufaussage.`};
    return this.base.run(model,{...input,messages:[...(input.messages||[]),extra]});
  }
}

export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);
    const guarded=this.engine?.env?.AI;
    if(guarded?.run)this.engine.env.AI=new ZeroBrokerAiGuard(guarded);
  }

  async status(){
    const s=await super.status();
    s.brokerTarget={
      ...ZERO_BROKER,
      currentScannerUniverse:Number(s?.config?.universe_count||0),
      executionNote:zeroExecutionNote(Number(s?.config?.cash||0),{fractional:true}),
      paperTradingOnly:true,
      liveBrokerConnection:false
    };
    if(s.executionModel)s.executionModel={...s.executionModel,targetBroker:ZERO_BROKER.name,venue:ZERO_BROKER.venue,zeroConservativeModel:true};
    return s;
  }
}
