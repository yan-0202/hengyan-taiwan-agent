import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
const directory=new URL('data/hub/',import.meta.url);
export const feeds={
 prices:{name:'上市全部收盤指數與行情',url:'https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?type=ALLBUT0999&response=json'},
 shares:{name:'上市發行股數',url:'https://www.twse.com.tw/rwd/zh/fund/MI_QFIIS?selectType=ALLBUT0999&response=json'},
 companies:{name:'上市公司基本資料',url:'https://openapi.twse.com.tw/v1/opendata/t187ap03_L'},
 otc:{name:'上櫃公司市值資料',url:'https://www.tpex.org.tw/openapi/v1/tpex_daily_market_value'},
 otcIndex:{name:'櫃買指數',url:'https://www.tpex.org.tw/openapi/v1/tpex_index'},
 fx:{name:'央行主要通貨匯率',url:'https://cpx.cbc.gov.tw/API/DataAPI/Get?FileName=BP01D01'},
 rates:{name:'央行政策利率',url:'https://cpx.cbc.gov.tw/API/DataAPI/Get?FileName=EG28D01'},
 money:{name:'央行貨幣總計數',url:'https://cpx.cbc.gov.tw/API/DataAPI/Get?FileName=EF15M01'},
 earnings:{name:'上市公司各產業 EPS',url:'https://openapi.twse.com.tw/v1/opendata/t187ap14_L'},
 revenue:{name:'上市公司月營收',url:'https://openapi.twse.com.tw/v1/opendata/t187ap05_L'}
};
const number=value=>{if(value==null||String(value).trim()==='')return NaN;return Number(String(value).replace(/,/g,''));};
export function dateISO(raw){const s=String(raw??'').replace(/[/\-]/g,'');if(!/^\d{7,8}$/.test(s))return null;const y=Number(s.slice(0,-4))+(s.length===7?1911:0);const out=`${y}-${s.slice(-4,-2)}-${s.slice(-2)}`;const d=new Date(out+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===out?out:null;}
export function summarizeMacro(value,id){
 const columns=value?.data?.structure?.Table1?.map(x=>x.data)??[];
 const rows=value?.data?.dataSets??[];if(!columns.length||!rows.length)throw new Error('央行資料格式已變更');
 // 部分政策利率序列僅記錄生效日，不能把最後生效日當成資料取得時間。
 const latest=[...rows].sort((a,b)=>String(a[0]).localeCompare(String(b[0]))).at(-1);
 return {id,title:value.meta.title,unit:value.meta.units,updatedAt:value.meta.last_updated,period:String(latest[0]),note:value.meta.note,series:columns.map((name,i)=>({name,value:Number.isFinite(number(latest[i+1]))?number(latest[i+1]):null})),history:rows.slice(-24),columns,observationKind:id==='rates'?'利率生效日':'資料期間'};
}
export function buildHub(cache,now=Date.now()){
 const warnings=[];const sources=Object.entries(feeds).map(([id,f])=>({id,...f,fetchedAt:cache[id]?.fetchedAt??null,error:cache[id]?.error??null,stale:!cache[id]||cache[id].stale===true||!Number.isFinite(Date.parse(cache[id].fetchedAt))||now-Date.parse(cache[id].fetchedAt)>36*3600000}));
 for(const s of sources)if(s.stale)warnings.push(`${s.name} 未下載、更新失敗或快取已超過 36 小時。`);
 const price=cache.prices?.value;const marketDate=dateISO(price?.date);const share=cache.shares?.value;const shareDate=dateISO(share?.date);
 const companySet=new Set((cache.companies?.value??[]).map(r=>String(r['公司代號'])));
 const table=price?.tables?.find(t=>t.fields?.includes('證券代號')&&t.fields.includes('收盤價'));
 const codeIndex=table?.fields.indexOf('證券代號'),closeIndex=table?.fields.indexOf('收盤價'),nameIndex=table?.fields.indexOf('證券名稱');
 const shareIndex=share?.fields?.indexOf('發行股數');const shareCode=share?.fields?.indexOf('證券代號');
 const shareMap=new Map((share?.data??[]).map(r=>[String(r[shareCode]),number(r[shareIndex])]));
 const listed=[];
 if(marketDate&&marketDate===shareDate&&companySet.size){for(const row of table?.data??[]){const code=String(row[codeIndex]);const shares=shareMap.get(code);const close=number(row[closeIndex]);if(companySet.has(code)&&shares>0&&close>0)listed.push({code,name:row[nameIndex],market:'上市',date:marketDate,close,shares,marketCap:shares*close,formula:'收盤價 × 發行股數',sources:[feeds.prices.url,feeds.shares.url,feeds.companies.url]});}}
 else warnings.push('上市收盤價、發行股數缺少同日資料或公司名冊；禁止混用日期推算上市排名。');
 const otc=(cache.otc?.value??[]).flatMap(r=>{const shares=number(r.Capitals),close=number(r.ClosePrice),date=dateISO(r.Date);return shares>0&&close>0&&date?[{code:r.SecuritiesCompanyCode,name:r.CompanyName,market:'上櫃',date,shares,close,marketCap:shares*close,formula:'收盤價 × 發行股數（來源欄 Capitals）',sources:[feeds.otc.url]}]:[];});
 const expected=(table?.data??[]).filter(r=>companySet.has(String(r[codeIndex]))&&number(r[closeIndex])>0).length;
 const coverageComplete=expected>0&&listed.length===expected&&share?.selectType==='ALLBUT0999';
 if(!coverageComplete)warnings.push(`上市資料覆蓋不完整：可比對 ${listed.length}／有收盤價普通股 ${expected} 家，或股數資料未選取全部產業。`);
 const otcDates=[...new Set(otc.map(x=>x.date))];const sameDay=coverageComplete&&otc.length>0&&otcDates.length===1&&otcDates[0]===marketDate;
 const sort=rows=>[...rows].sort((a,b)=>b.marketCap-a.marketCap).slice(0,10).map((x,i)=>({...x,rank:i+1}));
 if(!sameDay)warnings.push('上市與上櫃尚未取得同日且完整的資料；合併前十大暫不產生，僅顯示各市場排名。');
 const indices=(price?.tables??[]).filter(t=>t.fields?.[0]==='指數'||t.fields?.[0]==='報酬指數').flatMap(t=>(t.data??[]).map(row=>({name:row[0],category:t.title,date:marketDate,close:number(row[1]),changePercent:number(row[4]),source:feeds.prices.url}))).filter(x=>Number.isFinite(x.close));
 const otcIndex=[...(cache.otcIndex?.value??[])].sort((a,b)=>String(a.Date).localeCompare(String(b.Date))).at(-1);if(otcIndex){const close=number(otcIndex.Close),change=number(otcIndex.Change);if(Number.isFinite(close)&&close-change>0)indices.push({name:'櫃買指數',category:'櫃買中心',date:dateISO(otcIndex.Date),close,changePercent:change/(close-change)*100,source:feeds.otcIndex.url});}
 const macro=[];for(const id of ['fx','rates','money'])if(cache[id]?.value)try{const m=summarizeMacro(cache[id].value,id);const observationDate=dateISO(m.period);const lagDays=observationDate?Math.floor((now-Date.parse(observationDate+'T00:00:00Z'))/86400000):null;if(id==='fx'&&lagDays>7)warnings.push(`央行匯率最新觀測為 ${observationDate}，距研究時間約 ${lagDays} 日；只可作歷史比較，不是目前即期匯率。`);macro.push({...m,lagDays,source:feeds[id].url,fetchedAt:cache[id].fetchedAt});}catch(e){warnings.push(e.message);}
 const financial=Object.fromEntries(['earnings','revenue'].map(id=>[id,{rows:cache[id]?.value??[],source:feeds[id].url,fetchedAt:cache[id]?.fetchedAt,stale:sources.find(s=>s.id===id)?.stale}]));
 return {updatedAt:new Date(now).toISOString(),marketDate,ranking:{scope:'上市、上櫃普通股；不含 ETF、興櫃與特別股；依可取得的發行股數估算，非自由流通市值。',complete:sameDay,combined:sameDay?sort([...listed,...otc]):[],listed:sort(listed),otc:sort(otc),coverage:{listed:listed.length,otc:otc.length},note:'來源的股數與價格可能修訂；這是當日市值排序，不是投資評分。'},indices,macro,financial,sources,warnings};
}
export async function hubCache(){await mkdir(directory,{recursive:true});const c={};for(const id of Object.keys(feeds))try{c[id]=JSON.parse(await readFile(new URL(id+'.json',directory),'utf8'));}catch{}return c;}
let updating=null;
export async function refreshHub(){
 if(updating)return updating;
 updating=(async()=>{await mkdir(directory,{recursive:true});const cache=await hubCache();await Promise.all(Object.entries(feeds).map(async([id,f])=>{try{const r=await fetch(f.url,{signal:AbortSignal.timeout(30000),redirect:'error'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const value=await r.json();if(['prices','shares'].includes(id)&&value.stat!=='OK')throw new Error('官方回覆無資料');if(['companies','otc','otcIndex','earnings','revenue'].includes(id)&&(!Array.isArray(value)||!value.length))throw new Error('官方回覆空陣列');if(['fx','rates','money'].includes(id))summarizeMacro(value,id);cache[id]={value,fetchedAt:new Date().toISOString(),stale:false};}catch(e){cache[id]={...cache[id],stale:true,error:e.message};}const temp=new URL(id+'.tmp',directory);await writeFile(temp,JSON.stringify(cache[id]));await rename(temp,new URL(id+'.json',directory));}));return buildHub(cache);})().finally(()=>updating=null);return updating;
}
export async function readHub(){return buildHub(await hubCache());}
export async function handleHub(req,res,path){if(!path.startsWith('/api/hub/'))return false;try{if(path==='/api/hub/state'&&req.method==='GET')res.end(JSON.stringify(await readHub()));else if(path==='/api/hub/refresh'&&req.method==='POST')res.end(JSON.stringify(await refreshHub()));else{res.writeHead(404);res.end(JSON.stringify({error:'未知資料中心操作'}));}}catch(e){res.writeHead(500);res.end(JSON.stringify({error:e.message}));}return true;}
