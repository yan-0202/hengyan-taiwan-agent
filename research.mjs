import { readFile, writeFile, mkdir, readdir } from './storage.mjs';
import { randomUUID } from 'node:crypto';
const storage=new URL('data/research/',import.meta.url);
const profileFile=new URL('profile.json',storage);
export const capabilities=[
 {name:'任務規劃',state:'可用',detail:'控制中心可免費建立規則式計畫；團隊研究由總管模型分派三位專業主理人的子任務。'},
 {name:'計算工具',state:'可用',detail:'結構化輸入計算成長率、毛利率與百分點變化，保存輸入及公式。'},
 {name:'偏好記憶',state:'可用',detail:'使用者主動保存、可清除的本機偏好；每次研究需另行勾選才會傳給模型。'},
 {name:'證據與發布',state:'部分完成',detail:'規劃中列出來源、期間與驗證要求；沒有自動證實結論正確。'},
 {name:'多主理人',state:'部分完成',detail:'五角色獨立配置模型及 Skill；總管分工、獨立初稿、交叉評分、風險審查與裁決已接通。工具由後端受控執行。'},
 {name:'RAG 知識庫',state:'可用',detail:'PDF／XLSX／文字入庫，保留頁碼或工作表列號；關鍵字檢索、去重與證據注入。無 OCR 或語意向量庫。'},
 {name:'多模態',state:'部分完成',detail:'支援文字 PDF 與 XLSX 表格擷取；圖像辨識、OCR、錄音與影片尚未接入。'},
 {name:'事件警示',state:'本機可用',detail:'可設定本機定時更新與指數門檻、利率日期變動事件，預設關閉；需後端持續運作，無手機推播。'},
 {name:'市場與總經 API',state:'收盤可用',detail:'官方全部可取得收盤指數、同日市值前十大、央行匯率／利率／貨幣總計數，以及月營收、EPS 摘要；非盤中報價。'},
 {name:'完整歷史財報與 CLI',state:'未完成',detail:'尚無完整歷史財報 PDF 自動下載、Gemini CLI／Antigravity 執行；API 模式可獨立運作。'},
];
export function calculate(input){
 for(const key of ['previous','current'])if(!['number','string'].includes(typeof input[key])||String(input[key]).trim()==='')throw new Error('請輸入有效數值');
 const a=Number(input.previous),b=Number(input.current);if(!Number.isFinite(a)||!Number.isFinite(b)||input.previous===''||input.current==='')throw new Error('請輸入兩個有限數值');
 if(input.kind==='growth'){if(a<=0)throw new Error('前期數值須大於零；虧損轉盈或負基期不能套用一般成長率');return {value:(b-a)/a*100,unit:'%',formula:'(本期－前期) ÷ 前期 × 100',inputs:{previous:a,current:b}};}
 if(input.kind==='margin'){if(a<=0)throw new Error('營收須大於零');return {value:b/a*100,unit:'%',formula:'毛利 ÷ 營收 × 100',inputs:{revenue:a,grossProfit:b}};}
 if(input.kind==='percentagePoints')return {value:b-a,unit:'個百分點',formula:'本期百分比－前期百分比',inputs:{previous:a,current:b}};
 throw new Error('未知計算類型');
}
export function createPlan(question){
 if(typeof question!=='string'||!question.trim())throw new Error('請輸入研究問題');
 return {id:randomUUID(),question:question.trim().slice(0,4000),createdAt:new Date().toISOString(),type:'規則式研究計畫／尚未執行',steps:[
 {role:'總管',task:'確認公司、期間、比較對象與研究截止日',needs:['公司代號','會計期間','研究用途'],status:'待確認'},
 {role:'市場主理人',task:'取得同一交易日的指數與市場廣度',needs:['來源網址','交易日','取得時間'],status:'待執行'},
 {role:'總經主理人',task:'檢查經濟數據與可能傳導機制',needs:['公布日','資料期間','修訂版本'],status:'待執行'},
 {role:'財報主理人',task:'取得原始財報、核對口徑並計算',needs:['文件及頁碼','幣別與單位','合併或個體','公式與輸入'],status:'待執行'},
 {role:'風險主理人',task:'檢查反證、缺漏與資料時間穿越',needs:['可重現計算','未支持的主張','反方情境'],status:'待執行'},
 {role:'總管',task:'彙整結論與分歧，列出失效條件',needs:['支持結論的證據','未解阻擋','人工核對'],status:'待執行'},
 ],publishable:false,limitations:['此計畫未呼叫模型或工具','不自動交易或調整資產','不保證零錯誤','需人員確認資料與結論']};
}
async function body(req){let s='';for await(const chunk of req){s+=chunk;if(s.length>16000)throw new Error('輸入過大');}return JSON.parse(s||'{}');}
export async function handleResearch(req,res,path){
 if(!path.startsWith('/api/research/'))return false;
 try{
 await mkdir(storage,{recursive:true});
 if(req.method==='POST'&&!String(req.headers['content-type']).startsWith('application/json'))throw new Error('請使用 JSON 請求');
 let result;
 if(path==='/api/research/state'){
  let profile=null;try{profile=JSON.parse(await readFile(profileFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  result={capabilities,profile};
 }else if(path==='/api/research/profile'&&req.method==='POST'){
  const p=await body(req);if(p.clear){await writeFile(profileFile,'null');result={profile:null};}
  else {if(p.consent!==true)throw new Error('請先勾選保存偏好的同意選項');const profile={market:String(p.market??'台股').slice(0,80),horizon:String(p.horizon??'').slice(0,80),focus:String(p.focus??'').slice(0,500),consent:true,updatedAt:new Date().toISOString()};await writeFile(profileFile,JSON.stringify(profile));result={profile};}
 }else if(path==='/api/research/plan'&&req.method==='POST'){
  const p=createPlan((await body(req)).question);await writeFile(new URL(`plan-${p.id}.json`,storage),JSON.stringify(p));result=p;
 }else if(path==='/api/research/plans'){
  const files=(await readdir(storage)).filter(x=>/^plan-[a-f0-9-]+\.json$/.test(x)).sort().slice(-20);result=await Promise.all(files.map(async f=>JSON.parse(await readFile(new URL(f,storage),'utf8'))));result.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 }else if(path==='/api/research/calculate'&&req.method==='POST'){
  result={...calculate(await body(req)),createdAt:new Date().toISOString(),id:randomUUID()};await writeFile(new URL(`calculation-${result.id}.json`,storage),JSON.stringify(result));
 }else{res.writeHead(404);res.end(JSON.stringify({error:'未知研究路徑'}));return true;}
 res.end(JSON.stringify(result));
 }catch(e){res.writeHead(400);res.end(JSON.stringify({error:e.message}));}return true;
}
