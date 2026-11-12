import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir } from './storage.mjs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { handleAI } from './ai.mjs';
import { handleResearch } from './research.mjs';
import { handleWorkspace } from './workspace.mjs';
import { handleHub } from './datahub.mjs';
import { handleMonitor, startMonitoring } from './monitor.mjs';
import { cloudMode, withIdentity } from './tenancy.mjs';
import { authenticate, handleAuth, publicOrigin, validateCloudEnvironment } from './auth.mjs';

const root = new URL('./', import.meta.url);
const dataDir = new URL('data/', root);
const skillNames = ['ic-memo','morning-note','macro-rates-monitor','earnings-analysis','thesis-tracker'];
const sources = {
 indices:'https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX',
 otc:'https://www.tpex.org.tw/openapi/v1/tpex_index',
 income:'https://openapi.twse.com.tw/v1/opendata/t187ap06_L_ci',
 balance:'https://openapi.twse.com.tw/v1/opendata/t187ap07_L_ci'
};
async function download(id) {
 const url=sources[id];
 try {
  const r=await fetch(url,{signal:AbortSignal.timeout(20000)}); if(!r.ok)throw new Error(`HTTP ${r.status}`);
  const rows=await r.json(); if(!Array.isArray(rows)||!rows.length)throw new Error('無有效資料');
  const data={id,url,rows,fetchedAt:new Date().toISOString(),stale:false};
  await writeFile(new URL(`${id}.json`,dataDir),JSON.stringify(data)); return data;
 }catch(error){let data;try{data={...JSON.parse(await readFile(new URL(`${id}.json`,dataDir),'utf8')),stale:true,error:String(error)};}catch{data={id,url,rows:[],stale:true,error:String(error)};}await writeFile(new URL(`${id}.json`,dataDir),JSON.stringify(data));return data;}
}
async function cache(){const result=[];for(const id of Object.keys(sources)){try{result.push(JSON.parse(await readFile(new URL(`${id}.json`,dataDir),'utf8')));}catch{}}return result;}
const roles = [
  ['manager', '總管', '拆解任務、比對證據、裁決分歧；不可覆寫尚未解除的發布阻擋。'],
  ['market', '市場主理人', '比較五個核心指數與市場廣度；核對交易日、成交金額與市場別。'],
  ['macro', '總經主理人', '區分公布日期與資料期間；提供傳導機制及替代解釋，不把相關性當成因果。'],
  ['financial', '財報主理人', '核對合併口徑、期間、幣別、單位；使用程式計算，金融業另用專屬規則。'],
  ['risk', '風險主理人', '搜尋反證、核對引用、辨識資料缺口；以具體證據提出或解除發布阻擋。'],
];

export function publicationGate(report) {
  const reasons = [];
  if (report.mode !== 'live') reasons.push('測試模式，未執行真實 AI 分析');
  if (!report.claims?.length) reasons.push('沒有可驗證的研究結論');
  for (const claim of report.claims ?? []) {
    if (!claim.source || !claim.period) reasons.push('結論缺少來源或資料期間');
    if (!claim.verified) reasons.push('存在尚未驗證的結論');
  }
  if (report.blockers?.length) reasons.push(...report.blockers);
  return { publishable: reasons.length === 0, reasons: [...new Set(reasons)] };
}

async function runDemo() {
  const agents = await Promise.all(roles.map(async ([id, name],i) => ({
    id, name, skillVersion: '公開原文快照／未啟用', skillName:skillNames[i], source:'https://github.com/anthropics/financial-services', note:i===2?'依賴 LSEG MCP，未連接':i===3?'參考文件及報告工具尚未齊備':i===0?'私募備忘錄用途，僅作整合候選':'可用性待 AI 執行驗證', skill: await readFile(new URL(`skills/${id}/SKILL.md`, root), 'utf8'),
    model: '未設定', status: '未執行', draft: '尚未取得真實資料與 AI 輸出。',
  })));
  const report = { mode: 'demo', claims: [], blockers: ['市場資料尚未接入', 'AI 工具尚未設定'], agents };
  return { ...report, gate: publicationGate(report), createdAt: new Date().toISOString() };
}

const server = createServer(async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    const url=new URL(req.url??'/','http://localhost');
    if(url.pathname==='/healthz'&&req.method==='GET'){res.end('ok');return;}
    if(cloudMode()){
      if(req.headers.host!==new URL(publicOrigin()).host){res.writeHead(403);res.end('不接受的 Host');return;}
      if(!['GET','HEAD'].includes(req.method??'GET')&&req.headers.origin!==publicOrigin()){res.writeHead(403);res.end('拒絕跨站請求');return;}
    }
    if(await handleAuth(req,res,url.pathname))return;
    if(req.method==='GET'&&['/login','/assets/auth.mjs'].includes(url.pathname)){
      res.setHeader('Content-Type',url.pathname==='/login'?'text/html; charset=utf-8':'application/javascript; charset=utf-8');
      res.end(await readFile(new URL(url.pathname==='/login'?'login.html':'auth-ui.mjs',root),'utf8'));return;
    }
    const user=await authenticate(req);
    if(cloudMode()&&!user&&url.pathname!=='/assets/ui.css'){
      if(url.pathname.startsWith('/api/')){res.writeHead(401,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'登入已逾時，請重新登入'}));}
      else{res.writeHead(303,{Location:'/login'});res.end();}return;
    }
    await withIdentity(user,()=>serve(req,res));
  }catch{res.writeHead(503);res.end('服務暫時無法連線，請稍後重試');}
});
async function serve(req,res){
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const url=new URL(req.url??'/','http://localhost');
    if(!cloudMode()&&!['127.0.0.1:8787','localhost:8787'].includes(req.headers.host??'') && !process.env.AGENT_TEST){res.writeHead(403);res.end('不接受的 Host');return;}
    if(!cloudMode()&&req.method==='POST' && req.headers.origin && req.headers.origin!==`http://${req.headers.host}`){res.writeHead(403);res.end('拒絕跨站請求');return;}
    const assets = {'/assets/ui.css':['theme.css','text/css'], '/assets/ui.mjs':['ui.mjs','application/javascript'], '/assets/home.mjs':['home.mjs','application/javascript']};
    if(req.method==='GET' && Object.hasOwn(assets,url.pathname)){const [file,type]=assets[url.pathname];res.setHeader('Content-Type',`${type}; charset=utf-8`);res.end(await readFile(new URL(file,root)));return;}
    await mkdir(dataDir,{recursive:true});
    if(url.pathname.startsWith('/api/'))res.setHeader('Content-Type','application/json; charset=utf-8');
    if(await handleAI(req,res,url.pathname))return;
    if(await handleResearch(req,res,url.pathname))return;
    if(await handleWorkspace(req,res,url.pathname,url))return;
    if(await handleHub(req,res,url.pathname))return;
    if(await handleMonitor(req,res,url.pathname))return;
    if(url.pathname==='/data'&&req.method==='GET'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await readFile(new URL('data.html',root)));return;}
    if(url.pathname==='/workspace'&&req.method==='GET'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await readFile(new URL('workspace.html',root)));return;}
    if(url.pathname==='/research'&&req.method==='GET'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await readFile(new URL('research.html',root)));return;}
    if(url.pathname==='/ai'&&req.method==='GET'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await readFile(new URL('ai.html',root)));return;}
    if(url.pathname==='/api/refresh' && req.method==='POST'){res.end(JSON.stringify(await Promise.all(Object.keys(sources).map(download))));return;}
    if(url.pathname==='/api/cache'){res.end(JSON.stringify(await cache()));return;}
    if(url.pathname==='/api/search'){
      const q=(url.searchParams.get('q')??'').trim();const rows=[];
      if(q)for(const d of await cache())if(['income','balance'].includes(d.id))for(const row of d.rows)if(JSON.stringify(row).includes(q))rows.push({source:d.url,fetchedAt:d.fetchedAt,row});
      res.end(JSON.stringify(rows.slice(0,40)));return;
    }
    if(url.pathname==='/api/runs'&&req.method==='POST'){
      let value='';for await(const chunk of req){value+=chunk;if(value.length>10000)throw new Error('請求太大');}
      const question=String(JSON.parse(value).question??'').trim().slice(0,2000);if(!question)throw new Error('請輸入問題');
      const report={...await runDemo(),id:Date.now().toString(),question};
      await writeFile(new URL(`run-${report.id}.json`,dataDir),JSON.stringify(report));res.end(JSON.stringify(report));return;
    }
    if(url.pathname==='/api/runs'){const files=(await readdir(dataDir)).filter(x=>/^run-\d+\.json$/.test(x)).sort().reverse().slice(0,20);res.end(JSON.stringify(await Promise.all(files.map(async f=>JSON.parse(await readFile(new URL(f,dataDir),'utf8'))))));return;}
    if (url.pathname === '/api/demo' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(await runDemo()));
    } else if (url.pathname === '/' && req.method === 'GET') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(await readFile(new URL('index.html', root)));
    } else { res.writeHead(404); res.end('Not found'); }
  } catch { res.writeHead(500); res.end('無法讀取原型檔案'); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateCloudEnvironment();
  await startMonitoring();
  const port=cloudMode()?Number(process.env.PORT??10000):8787;
  server.listen(port, cloudMode()?'0.0.0.0':'127.0.0.1', () => console.log(cloudMode()?'雲端服務已啟動':'請開啟 http://127.0.0.1:8787'));
}
export { server };
