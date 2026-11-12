import { readFile, writeFile, mkdir } from './storage.mjs';
const dir = new URL('data/charts/', import.meta.url);
export function parsePrices(data) {
  if (data?.stat !== 'OK' || !Array.isArray(data.data) || !Array.isArray(data.fields)) throw new Error('交易所沒有回傳上市個股日行情；請確認股票市場與代號');
  const di=data.fields.indexOf('日期'),ci=data.fields.indexOf('收盤價');
  if(di<0||ci<0)throw new Error('行情欄位已變更');
  return data.data.flatMap(row=>{
    const m=String(row[di]).match(/^(\d{3})\/(\d{2})\/(\d{2})$/);if(!m)return [];
    const date=`${Number(m[1])+1911}-${m[2]}-${m[3]}`, close=Number(String(row[ci]).replaceAll(',',''));
    const d=new Date(date+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===date&&close>0&&Number.isFinite(close)?[{date,close}]:[];
  });
}
export function analyzePrices(points) {
  if(points.length<2)throw new Error('有效行情不足兩日，無法分析走勢');
  const first=points[0],last=points.at(-1),values=points.map(x=>x.close),change=(last.close-first.close)/first.close*100;
  const mean=n=>values.length>=n?values.slice(-n).reduce((a,b)=>a+b,0)/n:null;
  const ma5=mean(5),ma20=mean(20);
  return {firstDate:first.date,lastDate:last.date,observations:points.length,firstClose:first.close,lastClose:last.close,changePercent:change,minimum:Math.min(...values),maximum:Math.max(...values),ma5,ma20,
    commentary:`這段期間收盤價${change>0?'上升':change<0?'下降':'持平'} ${Math.abs(change).toFixed(2)}%。`+(ma5?` 最新收盤${last.close>=ma5?'位於':'低於'}近五個交易觀測均價。`:' 觀測不足五筆，暫不計算五日均線。')+(ma20?` 最新收盤${last.close>=ma20?'位於':'低於'}近二十個交易觀測均價。`:' 觀測不足二十筆，暫不計算二十日均線。'),
    limitation:'僅分析未還原權息收盤價；除權息、分割與減資可能造成表面跳動。不含盤中價格、K線、成交量驗證或預測，不構成買賣訊號。'};
}
export async function chartSnapshot(code) {
  if(!/^\d{4,6}$/.test(code))throw new Error('請填有效股票代號');
  let value;try{value=JSON.parse(await readFile(new URL(code+'.json',dir),'utf8'));}catch{throw new Error('尚無這檔股票走勢，請先在新聞追蹤頁下載');}
  return {...value,stale:!Number.isFinite(Date.parse(value.fetchedAt))||Date.now()-Date.parse(value.fetchedAt)>24*3600000||Date.now()-Date.parse(value.analysis.lastDate+'T00:00:00Z')>7*86400000};
}
let nextDownload=0;
export async function downloadChart(code, transport=fetch) {
  if(!/^\d{4,6}$/.test(code))throw new Error('請填有效上市股票代號');
  if(Date.now()<nextDownload)throw new Error('行情下載冷卻中，請稍後重試');nextDownload=Date.now()+15000;
  const now=new Date(),taipei=new Date(now.getTime()+8*3600000),year=taipei.getUTCFullYear(),month=taipei.getUTCMonth();
  const sources=[],rows=[];
  for(const offset of [-1,0]){
    const d=new Date(Date.UTC(year,month+offset,1));const date=`${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}01`;
    const url=new URL('https://www.twse.com.tw/exchangeReport/STOCK_DAY');url.search=new URLSearchParams({response:'json',date,stockNo:code}).toString();
    const r=await transport(url,{signal:AbortSignal.timeout(20000),redirect:'error'});if(!r.ok)throw new Error(`交易所行情 HTTP ${r.status}`);
    const text=await r.text();if(text.length>500000)throw new Error('行情回應過大');let data;try{data=JSON.parse(text);}catch{throw new Error('交易所沒有回傳有效行情格式');}
    // 月初當月可能尚無交易資料；上個月必須取得有效資料。
    if(offset===0&&data.stat!=='OK')continue;
    rows.push(...parsePrices(data));sources.push(url.href);
  }
  const points=[...new Map(rows.map(x=>[x.date,x])).values()].sort((a,b)=>a.date.localeCompare(b.date));
  const result={code,points,analysis:analyzePrices(points),sources,fetchedAt:now.toISOString(),stale:false};
  await mkdir(dir,{recursive:true});await writeFile(new URL(code+'.json',dir),JSON.stringify(result));return chartSnapshot(code);
}
export async function handleChart(req,res,path,url){
  if(path!=='/api/chart')return false;
  try{const code=url.searchParams.get('code')??'';let result;if(req.method==='POST')result=await downloadChart(code);else if(req.method==='GET')result=await chartSnapshot(code);else throw new Error('不支援此操作');res.end(JSON.stringify(result));}catch(e){res.writeHead(400);res.end(JSON.stringify({error:e.message}));}return true;
}
