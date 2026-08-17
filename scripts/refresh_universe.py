#!/usr/bin/env python3
from __future__ import annotations
import json, math, re, unicodedata
from datetime import datetime, timezone
from pathlib import Path
import yfinance as yf

OUT=Path(__file__).resolve().parents[1]/"public"/"universe.json"
REGIONS=["us","ca","gb","de","fr","ch","nl","se","dk","no","fi","it","es","be","at","jp","hk","cn","tw","kr","in","au","sg","br","mx","za"]
PRIMARY_EXCHANGES={"us":{"NMS","NYQ","NGM","NCM","ASE","PCX"},"ca":{"TOR","VAN","NEO"},"gb":{"LSE"},"de":{"GER"},"fr":{"PAR"},"ch":{"EBS"},"nl":{"AMS"},"se":{"STO"},"dk":{"CPH"},"no":{"OSL"},"fi":{"HEL"},"it":{"MIL"},"es":{"MCE"},"be":{"BRU"},"at":{"VIE"},"jp":{"JPX","TYO"},"hk":{"HKG"},"cn":{"SHH","SHZ"},"tw":{"TAI","TWO"},"kr":{"KSC","KOE"},"in":{"NSI","BSE"},"au":{"ASX"},"sg":{"SES"},"br":{"SAO"},"mx":{"MEX"},"za":{"JNB"}}
LISTING_WORDS={"INC","INCORPORATED","CORP","CORPORATION","CO","COMPANY","LTD","LIMITED","PLC","AG","SE","NV","SA","SPA","HOLDING","HOLDINGS","GROUP","ORD","ORDINARY","SHARE","SHARES","SHS","REGISTERED","REG","R","ADR","GDR","CDR","DRN","BDR","ED","HEDGED","HEDGE","ADS","UNIT","UNITS","STOCK","CLASS","CL","SERIES","THE","AND","A","B","C","D","I","II","III"}
GENERIC_WORDS={"UNITED","GLOBAL","INTERNATIONAL","TECHNOLOGY","TECHNOLOGIES","INDUSTRIES","INDUSTRIAL","ENERGY","SYSTEMS","FINANCIAL","SERVICES","HOLDING","HOLDINGS","GROUP","COMPANY","BANK","BANCO","BANKING"}
MAX_PLAUSIBLE_MCAP_USD=10_000_000_000_000.0
TARGET_COUNT=8_600
ZERO_ADVERTISED_STOCKS=8_500
REGION_PAGE_OFFSETS=range(0,1250,250)
BROAD_PAGE_OFFSETS=range(0,15000,250)

def scalar(v,default=0):
    if isinstance(v,dict):
        for k in ("raw","value"):
            if k in v:return scalar(v[k],default)
    try:return float(v)
    except Exception:return default

def one_region(region,offset=0):
    q=yf.EquityQuery("and",[yf.EquityQuery("eq",["region",region]),yf.EquityQuery("gt",["intradaymarketcap",0])])
    return yf.screen(q,offset=offset,size=250,sortField="intradaymarketcap",sortAsc=False).get("quotes",[])

def broad_fallback(offset):
    q=yf.EquityQuery("gt",["intradaymarketcap",0])
    return yf.screen(q,offset=offset,size=250,sortField="intradaymarketcap",sortAsc=False).get("quotes",[])

def last_fx(symbol):
    try:
        h=yf.Ticker(symbol).history(period="5d",interval="1d",auto_adjust=False)
        if h is None or h.empty or "Close" not in h:return 0.0
        s=h["Close"].dropna();return float(s.iloc[-1]) if len(s) else 0.0
    except Exception:return 0.0

def build_fx_map(currencies):
    fx={"USD":1.0};fail=[]
    for raw in sorted(set(c for c in currencies if c)):
        c=str(raw).strip()
        if not c or c=="USD":continue
        if c.lower() in ("gbp","gbp."):c="GBP"
        if c=="GBp":
            r=last_fx("GBPUSD=X")
            if r>0:fx[raw]=r/100.0
            else:fail.append(raw)
            continue
        d=last_fx(f"{c}USD=X")
        if d>0:fx[raw]=d;continue
        inv=last_fx(f"USD{c}=X")
        if inv>0:fx[raw]=1.0/inv;continue
        fail.append(raw)
    return fx,fail

def raw_tokens(name):
    text=unicodedata.normalize("NFKD",str(name or "")).encode("ascii","ignore").decode("ascii").upper();text=re.sub(r"[^A-Z0-9]+"," ",text)
    return [t for t in text.split() if t]

def meaningful_tokens(name):
    out=[]
    for t in raw_tokens(name):
        if t in LISTING_WORDS or t in {"USD","EUR","CAD","CHF","GBP","BRL","MXN"} or len(t)<=1:continue
        s=t[:9] if len(t)>9 else t
        if not out or out[-1]!=s:out.append(s)
    return out

def company_key(name,symbol):
    t=meaningful_tokens(name);return " ".join(t[:7]) if t else re.sub(r"[^A-Z0-9]","",symbol.split(".")[0])

def alpha_root(symbol):return re.sub(r"[^A-Z]","",str(symbol or "").split('.')[0].upper())

def representative_score(item):
    region=str(item.get("region") or "").lower();ex=str(item.get("exchange") or "").upper();name=str(item.get("name") or "").upper();sym=str(item.get("symbol") or "");primary=1 if ex in PRIMARY_EXCHANGES.get(region,set()) else 0;dep=1 if re.search(r"\b(ADR|GDR|CDR|DRN|BDR|ADS)\b",name) else 0;vol=max(0.0,scalar(item.get("avgVolume"),0))
    return(primary,-dep,math.log10(vol+1.0),-len(sym),item.get("marketCapUSD",0.0))

def fuzzy_same_company(a,b):
    ca,cb=float(a.get("marketCapUSD") or 0),float(b.get("marketCapUSD") or 0)
    if ca<=0 or cb<=0 or abs(ca-cb)/max(ca,cb)>0.04:return False
    ta,tb=set(meaningful_tokens(a.get("name"))),set(meaningful_tokens(b.get("name")))
    da={x for x in ta if x not in GENERIC_WORDS and len(x)>=4};db={x for x in tb if x not in GENERIC_WORDS and len(x)>=4}
    if da&db:return True
    ra,rb=alpha_root(a.get("symbol")),alpha_root(b.get("symbol"));common=0
    for x,y in zip(ra,rb):
        if x!=y:break
        common+=1
    if common>=4:return True
    u=ta|tb;i=ta&tb;j=len(i)/len(u) if u else 0
    return common>=3 and j>=0.20

def second_pass_dedupe(items):
    rows=sorted(items,key=lambda x:float(x.get("marketCapUSD") or 0),reverse=True);out=[];collapsed=0
    for item in rows:
        match=None
        for old in reversed(out[-180:]):
            oc,ic=float(old.get("marketCapUSD") or 0),float(item.get("marketCapUSD") or 0)
            if oc and ic and abs(oc-ic)/max(oc,ic)>0.04:continue
            if fuzzy_same_company(item,old):match=old;break
        if match is None:out.append(item)
        else:
            collapsed+=1
            if representative_score(item)>representative_score(match):out[out.index(match)]=item
    return out,collapsed

def main():
    rows=[];failures=[]
    for region in REGIONS:
        for off in REGION_PAGE_OFFSETS:
            try:
                batch=one_region(region,off);rows.extend(batch)
                if len(batch)<250:break
            except Exception as e:
                failures.append(f"{region}-{off}: {e}");break
    for off in BROAD_PAGE_OFFSETS:
        try:
            batch=broad_fallback(off);rows.extend(batch)
            if len(batch)<250:break
        except Exception as e:
            failures.append(f"broad-{off}: {e}");break
    raw=[];curr=[]
    for q in rows:
        sym=str(q.get("symbol") or "").strip().upper();qt=str(q.get("quoteType") or "EQUITY").upper();mcap=scalar(q.get("marketCap"),scalar(q.get("intradaymarketcap"),0))
        if not sym or qt not in ("EQUITY","") or mcap<=0:continue
        cur=str(q.get("currency") or "USD").strip() or "USD";curr.append(cur);raw.append((q,sym,mcap,cur))
    fx,fx_fail=build_fx_map(curr)
    if fx_fail:failures.append("FX missing: "+", ".join(sorted(set(fx_fail))))
    by_symbol={};outliers=receipts=0
    for q,sym,mcap,cur in raw:
        rate=fx.get(cur)
        if not rate or rate<=0:continue
        musd=mcap*rate;name=q.get("longName") or q.get("shortName") or q.get("displayName") or sym;avgvol=scalar(q.get("averageDailyVolume3Month"),scalar(q.get("averageDailyVolume10Day"),0))
        if musd<=0 or musd>MAX_PLAUSIBLE_MCAP_USD:outliers+=1;continue
        if re.search(r"\b(CDR|DRN|BDR)\b",str(name).upper()) or re.search(r"(?:34|35)\.SA$",sym):receipts+=1;continue
        item={"symbol":sym,"name":name,"marketCap":mcap,"marketCapUSD":musd,"region":q.get("region"),"exchange":q.get("exchange"),"currency":cur,"sector":q.get("sector") or q.get("sectorDisp"),"industry":q.get("industry") or q.get("industryDisp"),"avgVolume":avgvol,"brokerTarget":"finanzen.net ZERO","venueTarget":"gettex","brokerCatalogCandidate":True,"brokerVerified":False};item["companyKey"]=company_key(name,sym)
        old=by_symbol.get(sym)
        if old is None or representative_score(item)>representative_score(old):by_symbol[sym]=item
    by_company={};exact=0
    for item in by_symbol.values():
        k=item["companyKey"];old=by_company.get(k)
        if old is None:by_company[k]=item
        else:
            exact+=1
            if representative_score(item)>representative_score(old):by_company[k]=item
    unique,fuzzy=second_pass_dedupe(list(by_company.values()));top=sorted(unique,key=lambda x:(x["marketCapUSD"],x.get("avgVolume",0)),reverse=True)[:TARGET_COUNT]
    if len(top)<3000:raise RuntimeError(f"Only {len(top)} broad unique companies found; refusing overwrite. Failures: {failures[:5]}")
    payload={"generated_at":datetime.now(timezone.utc).isoformat().replace("+00:00","Z"),"source":"yfinance Yahoo EquityQuery; broker-sized ZERO/gettex candidate master pool; FX-normalized representative listings; exact+fuzzy cross-listing dedupe","broker_target":"finanzen.net ZERO","venue_target":"gettex","exact_broker_catalog":False,"broker_verification_required_before_live_order":True,"zero_advertised_stocks":ZERO_ADVERTISED_STOCKS,"gettex_published_stocks_2026_07":8600,"selection_note":"Master-Pool ist bewusst etwa so groß wie das aktuelle ZERO/gettex-Aktienangebot. Er ist kein behaupteter exakter ZERO-Katalog: konkrete ISIN/Handelbarkeit wird vor jeder spaeteren echten Order ueber den offiziell erlaubten Broker-/Partnerweg erneut verifiziert.","target_count":TARGET_COUNT,"count":len(top),"coverage_vs_zero_advertised_pct":round(min(100.0,len(top)/ZERO_ADVERTISED_STOCKS*100),2),"unique_companies":len(top),"raw_unique_symbols":len(by_symbol),"duplicate_listings_collapsed":exact+fuzzy,"exact_duplicates_collapsed":exact,"fuzzy_duplicates_collapsed":fuzzy,"rejected_implausible_market_caps":outliers,"rejected_secondary_receipts":receipts,"equities":top}
    OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8");print(f"Wrote {len(top)} ZERO-scale stock candidates; exact={exact}, fuzzy={fuzzy}, outliers={outliers}")
    if failures:print("Warnings:",failures)

if __name__=="__main__":main()
