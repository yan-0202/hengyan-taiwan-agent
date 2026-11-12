import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { newsURL, normalizeNews, fetchNews, newsEvidence, validateWatchlist } from './news.mjs';
import { invoke, validateConnection } from './ai.mjs';
const watches=[{code:'2330',name:'台積電',keyword:'TSMC'}];
test('新聞端點固定、追蹤資料驗證、無憑證與查詢注入',async()=>{
 const u=newsURL(watches);assert.equal(u.hostname,'api.gdeltproject.org');assert.equal(u.searchParams.get('query'),'("TSMC")');
 assert.throws(()=>validateWatchlist([{...watches[0],keyword:'TSMC" OR secret'}]));assert.throws(()=>validateWatchlist([...watches,...watches]));
 let sent;await fetchNews(watches,async(url,options)=>{sent={url:String(url),options};return new Response('{"articles":[]}');});
 assert.deepEqual(sent.options.headers,{Accept:'application/json'});assert.equal(sent.options.redirect,'error');
 assert.ok(!JSON.stringify(sent).includes('apiKey'));
});
test('新聞去重、拒絕危險連結、保留收錄時間並標示全文未讀',()=>{
 const rows=normalizeNews({articles:[{title:'test headline',url:'https://news.example/article?utm_source=x',seendate:'20261112T020000Z'},{title:'duplicate',url:'https://news.example/article'},{title:'bad',url:'javascript:alert(1)'},{title:'bad',url:'https://user:pass@news.example/'}]});
 assert.equal(rows.length,1);assert.equal(rows[0].publishedAt,null);assert.equal(rows[0].indexedAt,'2026-11-12T02:00:00Z');assert.equal(rows[0].contentScope,'headline-only');
 const ev=newsEvidence({stale:false,articles:rows,fetchedAt:'2026-11-12T03:00:00Z'});assert.equal(ev[0].type,'news-headline');assert.match(ev[0].text,/未讀全文/);
 assert.throws(()=>newsEvidence({stale:true}));
});
test('新聞 API 失敗不偽造結果、不回傳供應商原始錯誤',async()=>{
 await assert.rejects(fetchNews(watches,async()=>new Response('secret upstream',{status:503})),/HTTP 503/);
 await assert.rejects(fetchNews(watches,async()=>new Response('not json')),/格式錯誤/);
 await assert.rejects(fetchNews(watches,async()=>new Response(JSON.stringify({articles:'changed'}))),/有效資料/);
});
test('AI 供應商錯誤與回答不得回傳目前連線金鑰',async()=>{
 const c=validateConnection({provider:'gemini',name:'test',model:'test',apiKey:'test-secret-never-publish'});
 await assert.rejects(invoke(c,{system:'',prompt:'test'},async()=>new Response(JSON.stringify({error:{message:c.apiKey}}),{status:400})),e=>e instanceof Error&&!e.message.includes(c.apiKey)&&e.message.includes('HTTP 400'));
 const r=await invoke(c,{system:'',prompt:'test'},async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:c.apiKey}]}}],usageMetadata:{totalTokenCount:1,secret:c.apiKey}})));
 assert.ok(!JSON.stringify(r).includes(c.apiKey));
});
