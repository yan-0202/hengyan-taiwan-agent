import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { refreshHub } from './datahub.mjs';
const dir=new URL('data/monitor/',import.meta.url);const defaults={enabled:false,intervalMinutes:360,indexThreshold:3};let timer;let active=null;
async function read(name,fallback){try{return JSON.parse(await readFile(new URL(name+'.json',dir),'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
async function save(name,value){await mkdir(dir,{recursive:true});const temp=new URL(name+'.tmp',dir);await writeFile(temp,JSON.stringify(value));await rename(temp,new URL(name+'.json',dir));}
export function detectEvents(hub,previous={},threshold=3){
 const events=[];
 for(const x of hub.indices){if(['發行量加權股價指數','電子類指數','電子工業類指數','金融保險類指數','未含金融電子指數','櫃買指數'].includes(x.name)&&Math.abs(x.changePercent)>=threshold&&!hub.sources.find(s=>s.id==='prices')?.stale)events.push({id:`index:${x.name}:${x.date}`,kind:'index',title:`${x.name} 收盤變動 ${x.changePercent}%`,period:x.date,source:x.source,note:`超過設定的 ±${threshold}% 門檻；收盤觀測，不是即時交易訊號。`});}
 const rate=hub.macro.find(x=>x.id==='rates');if(rate&&previous.rates&&rate.period!==previous.rates&&!hub.sources.find(s=>s.id==='rates')?.stale)events.push({id:'rates:'+rate.period,kind:'rates',title:'央行利率資料出現不同生效日',period:rate.period,source:rate.source,note:'需人工確認利率內容與修訂原因；不能僅由日期推定升息或降息。'});
 return events;
}
export async function checkMonitor(){if(active)return active;active=(async()=>{const config={...defaults,...await read('config',{})};const previous=await read('observed',{});const hub=await refreshHub();const rows=await read('events',[]);const fresh=detectEvents(hub,previous,config.indexThreshold).filter(e=>!rows.some(r=>r.id===e.id)).map(e=>({...e,createdAt:new Date().toISOString()}));await save('events',[...fresh,...rows].slice(0,200));const rate=hub.macro.find(x=>x.id==='rates');await save('observed',{...previous,...(rate&&!hub.sources.find(s=>s.id==='rates')?.stale?{rates:rate.period}:{}),lastCheckedAt:new Date().toISOString(),warnings:hub.warnings});return {newEvents:fresh,lastCheckedAt:new Date().toISOString(),warnings:hub.warnings};})().finally(()=>active=null);return active;}
export async function startMonitoring(){if(timer)clearInterval(timer);const config={...defaults,...await read('config',{})};if(config.enabled){timer=setInterval(()=>checkMonitor().catch(()=>{}),config.intervalMinutes*60000);timer.unref();}}
async function body(req){let s='';for await(const c of req){s+=c;if(s.length>4000)throw new Error('設定過大');}return JSON.parse(s||'{}');}
export async function handleMonitor(req,res,path){if(!path.startsWith('/api/monitor/'))return false;try{let result;
 if(path==='/api/monitor/state'&&req.method==='GET')result={config:{...defaults,...await read('config',{})},observed:await read('observed',{}),events:await read('events',[])};
 else if(path==='/api/monitor/config'&&req.method==='POST'){const p=await body(req);const intervalMinutes=Number(p.intervalMinutes),indexThreshold=Number(p.indexThreshold);if(!Number.isInteger(intervalMinutes)||intervalMinutes<15||intervalMinutes>10080||!Number.isFinite(indexThreshold)||indexThreshold<0.1||indexThreshold>30)throw new Error('更新頻率需 15–10080 分鐘；指數門檻需 0.1–30%');const config={enabled:p.enabled===true,intervalMinutes,indexThreshold};await save('config',config);await startMonitoring();result=config;}
 else if(path==='/api/monitor/check'&&req.method==='POST')result=await checkMonitor();
 else throw new Error('未知觀測操作');res.end(JSON.stringify(result));
 }catch(e){res.writeHead(400);res.end(JSON.stringify({error:e.message}));}return true;}
