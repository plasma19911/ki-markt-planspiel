import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v5.js';
import {queueOrderApprovals,listOrderApprovals,approveOrderApproval,rejectOrderApproval,clearOrderApprovals,orderApprovalCapabilities} from './order-approval.js';

function responseText(r){return String(r?.response||r?.result?.response||'')}
function parseActions(r){
  const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return[];
  try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j.actions:[]}catch{return[]}
}

class ApprovalCaptureAiGuard{
  constructor(base,storage){this.base=base;this.storage=storage}
  async run(model,input){
    const prompt=String(input?.messages?.map(x=>x?.content||'').join('\n')||''),isPlan=prompt.includes('JSON-only')&&prompt.includes('Kandidaten=');
    const r=await this.base.run(model,input);
    if(isPlan){
      try{const actions=parseActions(r);if(actions.length)queueOrderApprovals(this.storage,actions,prompt,null,'GUARDED_PLAN')}
      catch(e){console.error('Order approval capture failed',e)}
    }
    return r;
  }
}

export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);
    this.ctx=ctx;this.env=env;
    const guarded=this.engine?.env?.AI;if(guarded?.run)this.engine.env.AI=new ApprovalCaptureAiGuard(guarded,ctx.storage);
  }

  async status(){
    const s=await super.status(),caps=orderApprovalCapabilities(this.env),active=listOrderApprovals(this.ctx.storage);
    s.orderApproval={...caps,pending:active.filter(x=>x.status==='PENDING').length,locallyApproved:active.filter(x=>x.status==='APPROVED_LOCAL').length,notice:'Vorbereitung für spätere echte Broker-Anbindung. Aktuell werden niemals Brokerorders gesendet.'};
    return s;
  }
  orderApprovalStatus(){const active=listOrderApprovals(this.ctx.storage);return{...orderApprovalCapabilities(this.env),pending:active.filter(x=>x.status==='PENDING').length,locallyApproved:active.filter(x=>x.status==='APPROVED_LOCAL').length}}
  orderApprovals(){return{ok:true,orders:listOrderApprovals(this.ctx.storage,{includeClosed:true}),capabilities:orderApprovalCapabilities(this.env)}}
  approveOrder(id,user){return approveOrderApproval(this.ctx.storage,String(id||''),user)}
  rejectOrder(id,user){return rejectOrderApproval(this.ctx.storage,String(id||''),user)}
  async reset(){const r=await super.reset();clearOrderApprovals(this.ctx.storage);return r}
}
