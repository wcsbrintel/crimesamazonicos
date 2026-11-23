#!/usr/bin/env python3
"""Non-sensitive schema probe for official IBAMA CSV downloads. Never logs people or narrative values."""
import csv, io, json, urllib.request, zipfile, re, collections, tempfile, os, itertools, unicodedata
ROOT="https://stibamadadosabertosprd.blob.core.windows.net/dados-abertos/dados/"
SOURCES={
 "auto_zip":ROOT+"SIFISC/auto_infracao/auto_infracao/auto_infracao_csv.zip",
 "auto_enquadramento":ROOT+"SIFISC/auto_infracao/enquadramento/enquadramento_csv.zip",
 "auto_especime":ROOT+"SIFISC/auto_infracao/especime/especime.csv",
 "termo":ROOT+"FISCALIZACAO/TERMO_APREENSAO/termo_de_apreensao.csv",
 "bem":ROOT+"TERMOS/TERMO_APREENSAO_BEM_APREENDIDO/termo_de_apreensao_bem_apreendido.csv",
 "termo_especime_zip":"https://dadosabertos.ibama.gov.br/dados/SIFISC/termo_apreensao/especime/especime_csv.zip"
}
def norm(s):
 s=unicodedata.normalize("NFKD",str(s or ""));s="".join(c for c in s if not unicodedata.combining(c)).upper()
 return re.sub("[^A-Z0-9]+","_",s).strip("_")
def begin_csv(file):
 text=io.TextIOWrapper(file,encoding="utf-8-sig",errors="replace",newline="")
 line=text.readline(); delimiter=";" if line.count(";")>=line.count(",") else ","
 return csv.DictReader(itertools.chain([line],text),delimiter=delimiter),text
def probe_text(url):
 try:
  req=urllib.request.Request(url,headers={"Range":"bytes=0-32767","User-Agent":"WCSBrasil-2025-schema-inspection"})
  with urllib.request.urlopen(req,timeout=90) as r:
   raw=r.read(32768)
  s=raw.decode("utf-8-sig",errors="replace")
  line=s.splitlines()[0] if s else ""
  delim=";" if line.count(";")>=line.count(",") else ","
  cols=next(csv.reader([line],delimiter=delim))
  return {"headers":cols,"range_preview_bytes":len(raw)}
 except Exception as exc:return {"error":str(exc)[:160]}
for name,url in SOURCES.items():
 if name=="auto_zip" or name=="termo_especime_zip":
  with tempfile.NamedTemporaryFile(suffix=".zip",delete=False) as f:
   path=f.name
   with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"WCSBrasil-2025-schema-inspection"}),timeout=120) as resp:
    while True:
     data=resp.read(1048576)
     if not data:break
     f.write(data)
  try:
   with zipfile.ZipFile(path) as z:
    name2025=next((s for s in z.namelist() if re.search(r"2025[^/]*\.csv$",s,re.I)),None)
    if not name2025: print(json.dumps({"source":name,"files":z.namelist()[:40]})); continue
    with z.open(name2025) as raw:
     reader,txt=begin_csv(raw);headers=reader.fieldnames
     print(json.dumps({"source":name,"file":name2025,"headers":headers},ensure_ascii=False),flush=True)
     counts=collections.Counter(); keys=collections.defaultdict(collections.Counter)
     for row in reader:
      counts["total"]+=1; r={norm(k):v for k,v in row.items() if k}
      if norm(r.get("UF")) not in {"AC","AM","AP","MA","MT","PA","RO","RR","TO"}:continue
      counts["amazon_uf"]+=1
      for k in ("TIPO_INFRACAO","TIPO_INF","COD_INFRACAO","COD_INF","TIPO_AUTO","DES_INF","DES_INFRACAO"):
       v=str(r.get(k,"")).strip()
       if v:
        counts["filled_"+k]+=1
        if k not in ("DES_INF","DES_INFRACAO"):keys[k][v[:70]]+=1
      for k in r:
       if any(v in k for v in ["MINER","GARIM","ARTIGO","INFRACAO","BIOMA","DESCRICAO","ESPEC","QUANT","PESCA","PROCESSO","AUTO","OPERACAO","ENQUADRAMENTO","NUMERO"]):
        counts["field_with_"+k]+=bool(str(r[k]).strip())
     print(json.dumps({"source":name+"_2025_amazon_uf","counts":dict(counts),"top_types":{k:v.most_common(20) for k,v in keys.items()}},ensure_ascii=False),flush=True)
  finally:os.unlink(path)
 else:
  print(json.dumps({"source":name,"url":url,**probe_text(url)},ensure_ascii=False),flush=True)
