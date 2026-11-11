import { readFile } from 'node:fs/promises';
import { calculate } from './research.mjs';
import { readHub } from './datahub.mjs';
const dir=new URL('data/',import.meta.url);
const indexNames=new Set(['發行量加權股價指數','電子工業類指數','金融保險類指數','未含金融電子指數']);
export function normalizeDate(raw){
 const s=String(raw??'');if(!/^\d{7,8}$/.test(s))return null;const year=Number(s.slice(0,s.length-4))+(s.length===7?1911:0);const month=s.slice(-4,-2),day=s.slice(-2);const iso=`${year}-${month}-${day}`;const date=new Date(iso+'T00:00:00Z');return Number.isFinite(date.valueOf())&&date.toISOString().slice(0,10)===iso?iso:null;
}
export function buildSnapshot(datasets,company='',now=Date.now()){
 const evidence=[];const warnings=[];const calculations=[];
 for(const d of datasets){
  const age=now-Date.parse(d.fetchedAt);const old=d.stale||!Number.isFinite(age)||age>36*3600000;
  if(old)warnings.push(`${d.id} 快取可能過期，請先更新官方資料；不能當成即時數據。`);
  if(['indices','otc'].includes(d.id)){
   const rows=d.id==='indices'?d.rows.filter(r=>indexNames.has(r['指數'])):[...d.rows].sort((a,b)=>String(a.Date).localeCompare(String(b.Date))).slice(-1);
   for(const row of rows){const normalizedDate=normalizeDate(row['日期']??row.Date);evidence.push({title:d.id==='otc'?'櫃買指數':row['指數'],period:normalizedDate??'無法解析日期',source:d.url,page:null,text:JSON.stringify({normalizedDate,raw:row}),type:'official-market',fetchedAt:d.fetchedAt,stale:old});}
  }
  if(company&&['income','balance'].includes(d.id))for(const row of d.rows.filter(r=>String(r['公司代號'])===company)){
   const base={title:`${row['公司代號']} ${row['公司名稱']} ${d.id==='income'?'綜合損益表':'資產負債表'}`,period:`民國${row['年度']}年第${row['季別']}季（原表口徑）`,source:d.url,page:null,type:'official-financial',fetchedAt:d.fetchedAt,stale:old};
   evidence.push({...base,text:JSON.stringify(row)});
   const num=k=>{const raw=row[k];return typeof raw==='string'&&raw.trim()!==''?Number(raw.replace(/,/g,'')):NaN;};
   const pairs=d.id==='income'?[['毛利率','營業收入','營業毛利（毛損）']]:[['負債占資產比率','資產總計','負債總計']];
   for(const [name,denominator,numerator] of pairs){const a=num(denominator),b=num(numerator);if(a>0&&Number.isFinite(b)){const r=calculate({kind:'margin',previous:a,current:b});const computation={name,value:r.value,unit:'%',formula:`${numerator} ÷ ${denominator} × 100`,inputs:{[denominator]:a,[numerator]:b},period:base.period,source:d.url,note:'直接依同列欄位計算；不推定單季或累計。'};calculations.push(computation);evidence.push({...base,title:base.title+'｜'+name,text:JSON.stringify(computation),type:'calculation'});}}
  }
 }
 if(company&&!evidence.some(e=>e.type==='official-financial'))warnings.push(`快取內找不到 ${company} 的一般業財務資料；不代表公司沒有財報，金融業等尚未涵蓋。`);
 const dates=[...new Set(evidence.filter(e=>e.type==='official-market').map(e=>e.period))];if(dates.length>1)warnings.push(`市場快照不是同一交易日：${dates.join('、')}。這不只是日期格式差異，不可當成同日市場比較。`);
 warnings.push('一般業財務快取沒有完整現金流量表與歷史財報序列；不能據此計算跨期成長或證實現金流變化。');
 return {evidence,calculations,warnings};
}
export async function cachedSnapshot(company=''){
 const datasets=[];for(const id of ['indices','otc','income','balance'])try{const d=JSON.parse(await readFile(new URL(`${id}.json`,dir),'utf8'));if(Array.isArray(d.rows))datasets.push(d);}catch{}
 const hub=await readHub();const canonical=hub.indices?.length>0;const result=buildSnapshot(canonical?datasets.filter(d=>!['indices','otc'].includes(d.id)):datasets,company);if(!datasets.length)result.warnings.unshift('尚無官方財務快取，請回首頁更新。');
 result.warnings.push(...hub.warnings);
 if(canonical)for(const x of hub.indices.filter(x=>indexNames.has(x.name)||x.name==='櫃買指數'))result.evidence.push({title:x.name,period:x.date,source:x.source,page:null,text:JSON.stringify(x),type:'official-market',unit:'點',basis:'收盤指數',fetchedAt:hub.sources.find(s=>s.id===(x.name==='櫃買指數'?'otcIndex':'prices'))?.fetchedAt,stale:hub.sources.find(s=>s.id===(x.name==='櫃買指數'?'otcIndex':'prices'))?.stale});
 const targets=new Set(company?[company]:hub.ranking.combined.map(x=>x.code));
 for(const [id,d] of Object.entries(hub.financial)){
  const selected=d.rows.filter(r=>targets.has(String(r['公司代號'])));
  for(const row of selected){const period=id==='revenue'?`民國${row['資料年月']}（月營收）`:`民國${row['年度']}年第${row['季別']}季（原表口徑）`;result.evidence.push({title:`${row['公司代號']} ${row['公司名稱']} ${id==='revenue'?'月營收':'各產業 EPS'}`,period,source:d.source,page:null,text:JSON.stringify(row),type:'official-financial-summary',fetchedAt:d.fetchedAt,stale:d.stale});
   if(id==='revenue'){for(const [name,key] of [['月營收年增率','營業收入-去年當月營收'],['月營收月增率','營業收入-上月營收']]){const previous=Number(row[key]),current=Number(row['營業收入-當月營收']);if(previous>0&&Number.isFinite(current)){const computed=calculate({kind:'growth',previous,current});const calc={name,company:String(row['公司代號']),...computed,period,source:d.source,note:'僅依同列月營收欄位計算，單位沿用官方原表。'};result.calculations.push(calc);result.evidence.push({title:`${row['公司代號']} ${name}`,period,source:d.source,page:null,text:JSON.stringify(calc),type:'calculation',fetchedAt:d.fetchedAt,stale:d.stale});}}}
  }
  if(company&&!selected.length)result.warnings.push(`${company} 未出現在已下載的${id==='revenue'?'月營收':'各產業 EPS'}最新資料；不可視為未申報或數值為零。`);
 }
 for(const m of hub.macro)result.evidence.push({title:m.title,period:m.period,source:m.source,page:null,text:JSON.stringify(m),type:'official-macro',fetchedAt:m.fetchedAt,stale:hub.sources.find(s=>s.id===m.id)?.stale});
 if(hub.ranking.combined.length)result.evidence.push({title:'上市上櫃同日市值前十大',period:hub.marketDate,source:'TWSE + TPEx，個別來源列於資料中',page:null,text:JSON.stringify(hub.ranking),type:'official-ranking',fetchedAt:hub.updatedAt,stale:hub.sources.filter(s=>['prices','shares','companies','otc'].includes(s.id)).some(s=>s.stale)});
 // 完整指數表依交易日保存；獨立於舊版五大指數快取，不冒充盤中資料。
 if(hub.indices.length)result.evidence.push({title:'官方收盤指數節錄（完整表在資料中心）',period:hub.marketDate,source:hub.indices[0].source,page:null,text:JSON.stringify({total:hub.indices.length,selected:hub.indices.slice(0,56),note:'為控制費用，模型本次僅收到這些指數；不得聲稱分析未提供的其他指數。'}),type:'official-market',fetchedAt:hub.sources.find(s=>s.id==='prices')?.fetchedAt,stale:hub.sources.find(s=>s.id==='prices')?.stale});
 return result;
}
