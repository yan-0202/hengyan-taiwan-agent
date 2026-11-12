import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { analyzeText, queryPlan, searchNews, semanticNLP, contains } from './nlp.mjs';
import { rank } from './workspace.mjs';
const watchlist=[{code:'2330',name:'台積電',keyword:'TSMC'},{code:'2317',name:'鴻海',keyword:'Foxconn'}];
test('公司實體、事件、語氣與數值擷取保留原文；英文邊界避免子字誤配',()=>{
 const r=analyzeText('台積電營收成長 20%，預估投資 100 億元',watchlist);
 assert.equal(r.entities[0].code,'2330');assert.equal(r.tone,'不確定');assert.ok(r.topics.some(t=>t.topic==='財報與營收'));assert.equal(r.quantities[0].quote,'20%');
 assert.equal(analyzeText('營收年減 -20%').quantities[0].quote,'-20%');
 assert.equal(contains('profitability','profit'),false);assert.equal(analyzeText('TSMC revenue growth',watchlist).tone,'正向');assert.equal(analyzeText('no growth expected').tone,'不確定');
});
test('自然語言辨識期間公司主題，檢索使用日期與匹配證據，不假裝全網搜尋',()=>{
 const articles=[{title:'TSMC revenue growth',url:'https://one.example/1',indexedAt:'2026-11-12T01:00:00Z',publisher:'one.example'},{title:'Foxconn revenue growth',url:'https://two.example/2',indexedAt:'2026-11-12T01:00:00Z',publisher:'two.example'},{title:'TSMC semiconductor outlook',url:'https://one.example/3',indexedAt:'2026-11-10T01:00:00Z',publisher:'one.example'}];
 const state={watchlist,articles,fetchedAt:'2026-11-12',stale:false},now=Date.parse('2026-11-12T06:00:00Z');
 const r=searchNews(state,'台積電最近三天的營收新聞',now);assert.equal(r.results.length,1);assert.equal(r.plan.days,3);assert.equal(r.results[0].nlp.entities[0].code,'2330');
 assert.equal(queryPlan('台積電最近七天新聞',watchlist).days,7);
 assert.ok(searchNews(state,'台積電最近7天新聞',now).warnings.some(w=>w.includes('不完整')));
 assert.equal(queryPlan('今天台積電新聞',watchlist).days,1);
});
test('近似標題分組不當成獨立證據；金融語詞擴展可查英文財報',()=>{
 const title='TSMC revenue growth in semiconductor market';
 const r=searchNews({watchlist,articles:[{title,url:'https://one.example/1'},{title:title+'!',url:'https://two.example/2'}],stale:false},'台積電營收');
 assert.equal(r.results.length,1);assert.equal(r.results[0].related.length,1);
 const rows=rank('現金流',[{id:'doc',title:'report',period:'2026',source:'test',chunks:[{page:8,text:'Cash flow improved while debt remained stable.'}]}]);assert.equal(rows.length,1);assert.equal(rows[0].page,8);
});
test('AI NLP 必須逐字引文、全數 ID、合法語氣，截斷與偽造引文拒絕',async()=>{
 const records=[{text:'TSMC revenue growth',source:'https://one.example/1'}];
 const runner=async()=>({text:JSON.stringify({items:[{id:'N1',tone:'正向',topic:'營收',quote:'revenue growth'}]}),truncated:false,model:'test'});
 const r=await semanticNLP(records,runner);assert.equal(r.items[0].source,records[0].source);
 await assert.rejects(semanticNLP(records,async()=>({text:'{}',truncated:true})),/截斷/);
 await assert.rejects(semanticNLP(records,async()=>({text:JSON.stringify({items:[{id:'N1',tone:'正向',topic:'營收',quote:'fake profit'}]})})),/引文/);
 await assert.rejects(semanticNLP(records,async()=>({text:JSON.stringify({items:[]})})),/ID/);
});
