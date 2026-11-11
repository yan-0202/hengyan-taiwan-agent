import { createHash } from 'node:crypto';
export const qualityVersion=2;
const hash=value=>createHash('sha256').update(JSON.stringify(value??null)).digest('hex').slice(0,16);
const roles=['market','macro','financial'];
const text=value=>typeof value==='string'&&value.trim().length>0;
const complete=value=>text(value?.text)&&value.truncated!==true;
export function inventory(job){
 return [...(job.plan?[['plan',job.plan]]:[]),...(job.drafts??[]).map(x=>['draft',x]),...(job.peerReviews??[]).map(x=>['peer',x]),...(job.review?[['risk',job.review]]:[])].map(([stage,x])=>({artifactId:`${stage}:${x.role}:${hash(x.text)}`,stage,role:x.role,complete:complete(x)}));
}
export function calculationLedger(job){
 return (job.calculations??[]).map(c=>{
  const evidence=job.evidence.find(e=>e.type==='calculation'&&e.text===JSON.stringify(c));let expected=NaN;
  const a=c.inputs??{};
  const formulas={'毛利率':'營業毛利（毛損） ÷ 營業收入 × 100','負債占資產比率':'負債總計 ÷ 資產總計 × 100','月營收年增率':'(本期－前期) ÷ 前期 × 100','月營收月增率':'(本期－前期) ÷ 前期 × 100'};
  if(c.name==='毛利率'&&a['營業收入']>0&&Number.isFinite(a['營業毛利（毛損）']))expected=a['營業毛利（毛損）']/a['營業收入']*100;
  else if(c.name==='負債占資產比率'&&a['資產總計']>0&&Number.isFinite(a['負債總計']))expected=a['負債總計']/a['資產總計']*100;
  else if(['月營收年增率','月營收月增率'].includes(c.name)&&a.previous>0&&Number.isFinite(a.current))expected=(a.current-a.previous)/a.previous*100;
  const verified=!!evidence&&text(c.period)&&text(c.source)&&c.unit==='%'&&c.formula===formulas[c.name]&&Number.isFinite(c.value)&&Number.isFinite(expected)&&Math.abs(c.value-expected)<=1e-9;
  return {...c,calculationId:'C'+hash(c),evidenceId:evidence?.citation??null,verified,verification:verified?'已依來源欄位重算':'缺少來源對應或不支援的計算，禁止當成已驗算'};
 });
}
function date(raw){const s=String(raw??'').replaceAll('-','');if(!/^\d{7,8}$/.test(s))return null;const y=Number(s.slice(0,-4))+(s.length===7?1911:0);const iso=`${y}-${s.slice(-4,-2)}-${s.slice(-2)}`;const d=new Date(iso+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===iso?iso:null;}
export function sourceChecks(job){
 const blockers=[],dates=[];
 for(const e of job.evidence??[]){
  if(e.stale)blockers.push(`[${e.citation}] ${e.title??''} 資料快取過期或下載失敗`);
  if(e.type==='official-market'){
   let data;try{data=JSON.parse(e.text);}catch{data={};}
   const rawDates=data.selected?.map(x=>x.date)??[data.normalizedDate??data.raw?.['日期']??data.raw?.Date??data['日期']??data.Date??e.period];
   for(const raw of rawDates){const normalized=date(raw);if(normalized){dates.push(normalized);if(date(e.period)&&date(e.period)!==normalized)blockers.push(`[${e.citation}] 原始交易日與期間標籤矛盾`);}else blockers.push(`[${e.citation}] 市場交易日無法解析`);}
  }
 }
 const unique=[...new Set(dates)];if(unique.length>1)blockers.push(`市場快照交易日不同：${unique.join('、')}；請更新資料後建立新研究，不可視為同日比較`);
 const ledger=calculationLedger(job);if(ledger.some(c=>!c.verified))blockers.push('存在無法重現或缺少來源的計算紀錄');
 return {blockers:[...new Set(blockers)],marketDates:unique,calculations:ledger};
}
export function prerequisites(job,peers=false,risk=false){
 const artifacts=inventory(job),blockers=[];
 if(job.dynamicPlanning&&!complete(job.plan))blockers.push('總管分工未完成或遭截斷');
 for(const role of roles){const found=artifacts.filter(x=>x.stage==='draft'&&x.role===role);if(found.length!==1||!found[0].complete)blockers.push(`${role} 獨立初稿缺失、重複或遭截斷`);}
 if(peers&&job.scoringMode==='team')for(const role of roles){const found=artifacts.filter(x=>x.stage==='peer'&&x.role===role);if(found.length!==1||!found[0].complete)blockers.push(`${role} 交叉審查未完成或遭截斷`);}
 if(risk&&!complete(job.review))blockers.push('風險審查未完成或遭截斷');
 return {artifacts,blockers};
}
export const decisionSchema='只輸出 JSON，不加 Markdown。格式：{"decision":"暫不裁決或研究草稿","claims":[事實為{"kind":"fact","evidenceId":"E1","quote":"來源逐字原文，最多200字"}；運算為{"kind":"calculation","calculationId":"後端提供的C編號","value":數值,"unit":"%"}；推論為{"kind":"inference","text":"不含數字的待人工查核推論，不可聲稱已驗算","evidenceIds":["E1"]}],"assessments":[{"artifactId":"清單中完整的draft ID","evidenceQuality":0到5或null,"calculationReliability":0到5或null,"riskCoverage":0到5或null,"reason":"理由"}],"limitations":["未解分歧或缺口"]}。另加入comparisons陣列，每項為{"evidenceIds":["E1","E2"]}；未進行比較則為空陣列。比較需要公司、期間、幣別、單位與合併口徑皆已知且一致；未知就列缺口，不比較。先寫decision。claims最多3項；事實只逐字節錄，不改寫數字；無後端計算ID不得聲稱工具算過。assessments必須涵蓋且只涵蓋三份成功獨立初稿，每份一次；分數不是正確率。證據不足請暫不裁決。';
export function validateDecision(raw,job){
 const blockers=[];let decision;
 try{decision=JSON.parse(raw);}catch{return {valid:false,blockers:['總管未回傳完整的結構化裁決'],decision:null,text:'暫不裁決：總管裁決格式不完整。'};}
 if(!decision||typeof decision!=='object'||!['暫不裁決','研究草稿'].includes(decision.decision))blockers.push('總管裁決狀態無效');
 const claims=Array.isArray(decision?.claims)?decision.claims:[];
 if(!claims.length||claims.length>3)blockers.push('主張數量需介於 1–3');
 const comparisons=decision?.comparisons??[];
 if(!Array.isArray(comparisons))blockers.push('比較清單格式無效');
 else for(const comparison of comparisons){
  const ids=comparison?.evidenceIds;
  if(!Array.isArray(ids)||new Set(ids).size<2||ids.some(id=>!job.evidence.some(e=>e.citation===id))){blockers.push('比較缺少至少兩筆有效來源');continue;}
  const rows=ids.map(id=>job.evidence.find(e=>e.citation===id));
  const fields=['company','period','currency','unit','basis'];
  for(const field of fields)if(rows.some(e=>!text(e[field]))||new Set(rows.map(e=>e[field])).size!==1)blockers.push(`比較口徑 ${field} 缺失或不一致，禁止直接比較`);
 }
 const ledger=calculationLedger(job),rendered=[];
 for(const c of claims){
  if(!c||typeof c!=='object'){blockers.push('主張格式無效');continue;}
  if(c.kind==='fact'){
   const e=job.evidence.find(e=>e.citation===c.evidenceId);
   if(!e||!text(e.source)||!text(e.period)||!text(c.quote)||c.quote.length>200||!e.text.includes(c.quote)||c.text!==undefined)blockers.push('事實缺少來源、期間或逐字引文不符');
   else rendered.push(`來源節錄（待人工確認適用性）：${c.quote} [${e.citation}]\n期間：${e.period}；來源：${e.source}`);
  }else if(c.kind==='calculation'){
   const record=ledger.find(x=>x.calculationId===c.calculationId&&x.verified);
   if(!record||typeof c.value!=='number'||c.value!==record.value||c.unit!==record.unit||c.text!==undefined)blockers.push('運算主張缺少有效計算 ID，或數值／單位不符');
   else rendered.push(`程式驗算：${record.name} ${record.value} ${record.unit} [${record.evidenceId}]\n${record.formula}；計算紀錄：${record.calculationId}`);
  }else if(c.kind==='inference'){
   if(/比較|高於|低於|優於|落後|增加|減少/.test(c.text??'')&&(!Array.isArray(comparisons)||!comparisons.length))blockers.push('比較推論未提供比較來源與口徑');
   if(!text(c.text)||c.text.length>600||/\d|程式重算|已驗算|工具驗算/.test(c.text)||!Array.isArray(c.evidenceIds)||!c.evidenceIds.length||c.evidenceIds.some(id=>!job.evidence.some(e=>e.citation===id)))blockers.push('推論包含未綁定數字、工具宣稱或未知證據');
   else rendered.push(`待人工查核推論：${c.text} ${c.evidenceIds.map(id=>`[${id}]`).join(' ')}`);
  }else blockers.push('未知主張類型');
 }
 const available=inventory(job).filter(x=>x.stage==='draft'&&x.complete),assessments=Array.isArray(decision?.assessments)?decision.assessments:[];
 if(assessments.length!==3||available.length!==3||available.some(a=>assessments.filter(s=>s?.artifactId===a.artifactId).length!==1))blockers.push('初稿評分對象缺失、重複或不是成功的獨立初稿');
 for(const a of assessments){if(!a||!available.some(x=>x.artifactId===a.artifactId)||!text(a.reason)||['evidenceQuality','calculationReliability','riskCoverage'].some(k=>a[k]!==null&&!(Number.isInteger(a[k])&&a[k]>=0&&a[k]<=5)))blockers.push('評分欄位或成果 ID 無效');}
 if(!Array.isArray(decision?.limitations)||!decision.limitations.length||decision.limitations.some(x=>!text(x)))blockers.push('缺少研究限制');
 const valid=blockers.length===0;
 return {valid,blockers:[...new Set(blockers)],decision,text:valid?`${decision.decision}（尚未人工核對，不可直接發布）\n\n${rendered.join('\n\n')}\n\n限制：${decision.limitations.join('；')}\n\n初稿評分：\n${assessments.map(a=>`${available.find(x=>x.artifactId===a.artifactId).role}：證據 ${a.evidenceQuality??'無法評分'}／計算 ${a.calculationReliability??'無法評分'}／風險 ${a.riskCoverage??'無法評分'}；${a.reason}`).join('\n')}`:'暫不裁決：結構化查核未通過。'};
}
export function qualityView(job){
 if(job.qualityVersion===qualityVersion)return job;
 return {...job,artifactInventory:inventory(job),qualityGate:{state:'legacy-review',blockers:[...(job.qualityGate?.blockers??[]),'舊版報告未通過新版成果、計算及主張查核；保留原文供追溯']},publishable:false};
}
