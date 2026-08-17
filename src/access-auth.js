const enc=new TextEncoder();
function b64urlBytes(s){const x=String(s||'').replace(/-/g,'+').replace(/_/g,'/'),pad=x+'='.repeat((4-x.length%4)%4),bin=atob(pad),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out}
function b64urlJson(s){return JSON.parse(new TextDecoder().decode(b64urlBytes(s)))}
function teamDomain(v){const x=String(v||'').trim().replace(/\/+$/,'');if(!x)return'';return /^https?:\/\//i.test(x)?x:`https://${x}`}
function audOk(payload,want){const aud=payload?.aud;return Array.isArray(aud)?aud.includes(want):String(aud||'')===want}

export async function verifyCloudflareAccess(request,env){
  const enabled=String(env?.ORDER_APPROVAL_MODE||'disabled').toLowerCase()==='enabled';
  if(!enabled)return{ok:false,status:503,error:'Order-Freigabe ist vorbereitet, aber noch nicht aktiviert.'};
  const issuer=teamDomain(env?.CF_ACCESS_TEAM_DOMAIN),aud=String(env?.CF_ACCESS_AUD||'').trim();
  if(!issuer||!aud)return{ok:false,status:503,error:'Cloudflare Access ist für die Order-Freigabe noch nicht vollständig konfiguriert.'};
  const token=request.headers.get('cf-access-jwt-assertion');if(!token)return{ok:false,status:403,error:'Cloudflare-Access-Anmeldung für Order-Freigaben erforderlich.'};
  try{
    const parts=token.split('.');if(parts.length!==3)throw new Error('JWT-Format');const header=b64urlJson(parts[0]),payload=b64urlJson(parts[1]);
    if(header.alg!=='RS256'||!header.kid)throw new Error('JWT-Algorithmus');const now=Math.floor(Date.now()/1000);if(Number(payload.exp||0)<=now)throw new Error('JWT abgelaufen');if(payload.nbf&&Number(payload.nbf)>now+30)throw new Error('JWT noch nicht gültig');if(String(payload.iss||'').replace(/\/+$/,'')!==issuer)throw new Error('Issuer');if(!audOk(payload,aud))throw new Error('Audience');
    const certs=await fetch(`${issuer}/cdn-cgi/access/certs`,{headers:{accept:'application/json'}});if(!certs.ok)throw new Error(`Access certs HTTP ${certs.status}`);const jwks=await certs.json(),jwk=(jwks.keys||[]).find(k=>k.kid===header.kid);if(!jwk)throw new Error('Signaturschlüssel fehlt');
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);const signed=enc.encode(`${parts[0]}.${parts[1]}`),sig=b64urlBytes(parts[2]),valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,sig,signed);if(!valid)throw new Error('Signatur');
    const email=String(payload.email||payload.common_name||payload.sub||'authenticated-user');const allowed=String(env?.CF_ACCESS_APPROVER_EMAIL||'').trim().toLowerCase();if(allowed&&email.toLowerCase()!==allowed)return{ok:false,status:403,error:'Dieser Cloudflare-Access-Nutzer darf keine Orders freigeben.'};
    return{ok:true,user:{email,sub:payload.sub||null,exp:payload.exp}}
  }catch(e){return{ok:false,status:403,error:`Ungültige Cloudflare-Access-Freigabe: ${String(e?.message||e).slice(0,120)}`}}
}
