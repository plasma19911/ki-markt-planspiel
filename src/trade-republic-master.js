const arr=v=>Array.isArray(v)?v:[];

export function tradeRepublicMasterRows(data){
  if(Array.isArray(data))return data;
  for(const k of ['equities','assets','items','data']){
    if(Array.isArray(data?.[k]))return data[k];
  }
  return [];
}

export function isExactTradeRepublicRow(r){
  return r?.brokerVerified===true
    && String(r?.assetClass||r?.type||'EQUITY').toUpperCase()==='EQUITY'
    && String(r?.brokerMatchMode||'').toUpperCase()==='EXACT_NORMALIZED_NAME'
    && /Trade Republic/i.test(String(r?.brokerVerificationSource||''))
    && /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(String(r?.isin||''));
}

export async function loadTradeRepublicMaster(env,{legacyLoader=null}={}){
  let assetError='';
  try{
    if(env?.ASSETS?.fetch){
      const r=await env.ASSETS.fetch(new Request('https://assets.local/universe.json',{headers:{accept:'application/json'}}));
      if(r?.ok){
        const data=await r.json();
        const rows=tradeRepublicMasterRows(data).filter(isExactTradeRepublicRow);
        if(rows.length)return{rows,source:'env.ASSETS:/universe.json',generatedAt:data?.generated_at||null,error:null};
        assetError='universe.json contains no exact Trade Republic rows';
      }else assetError=`ASSETS HTTP ${r?.status||0}`;
    }else assetError='env.ASSETS binding unavailable';
  }catch(e){assetError=String(e?.message||e).slice(0,220)}

  try{
    if(typeof legacyLoader==='function'){
      const data=await legacyLoader();
      const rows=tradeRepublicMasterRows(data).filter(isExactTradeRepublicRow);
      if(rows.length)return{rows,source:'legacy-zero-assets',generatedAt:data?.generated_at||null,error:assetError||null};
    }
  }catch(e){
    const legacyError=String(e?.message||e).slice(0,220);
    return{rows:[],source:'none',generatedAt:null,error:[assetError,legacyError].filter(Boolean).join(' · ')};
  }
  return{rows:[],source:'none',generatedAt:null,error:assetError||'Trade Republic master unavailable'};
}
