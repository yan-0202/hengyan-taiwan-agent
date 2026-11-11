import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { invoke, publicConfig, validateConnection, validateModel, validateProviderModel } from './ai.mjs';

test('模型欄攔下 CLI 工具名稱及角色名稱',()=>{
 assert.throws(()=>validateModel('gemini CLI'));
 assert.throws(()=>validateModel('市場主理人'));
 assert.doesNotThrow(()=>validateModel('',true));
 assert.doesNotThrow(()=>validateModel('gemini-2.5-flash'));
 assert.throws(()=>validateProviderModel('gemini','projects/123456'),/專案路徑/);
 assert.doesNotThrow(()=>validateProviderModel('compatible','org/model'));
});
test('503 回傳可重試狀態且不自動重送',async()=>{
 let calls=0;
 const connection=validateConnection({name:'test',provider:'gemini',model:'test',apiKey:'secret'});
 await assert.rejects(invoke(connection,{system:'',prompt:'test'},async()=>{calls++;return new Response('{}',{status:503});}),error=>error instanceof Error&&error.message.includes('暫時忙碌')&&error['retryable']===true&&error['upstreamStatus']===503);
 assert.equal(calls,1);
});

test('金鑰不出現在設定回傳，留白編輯保留金鑰',()=>{
 const c=validateConnection({name:'測試',provider:'gemini',model:'test-model',apiKey:'secret-for-test'});
 assert.equal(JSON.stringify(publicConfig({connections:[c],roles:{}})).includes('secret-for-test'),false);
 assert.equal(validateConnection({...c,apiKey:''},c).apiKey,c.apiKey);
 assert.throws(()=>validateConnection({name:'x',provider:'compatible',model:'x',apiKey:'x',baseUrl:'http://localhost/v1'}));
 assert.throws(()=>validateConnection({name:'x',provider:'gemini',model:'test',apiKey:'這是說明文字'}),/API Key/);
});
test('不同角色可用不同模型且請求沒有共用對話',async()=>{
 const requests=[];
 const transport=async(url,options)=>{requests.push({url,payload:JSON.parse(options.body),headers:options.headers});return new Response(JSON.stringify({choices:[{message:{content:'測試回答'}}],usage:{total_tokens:20}}));};
 const c=validateConnection({name:'相容',provider:'compatible',model:'default',apiKey:'secret',baseUrl:'https://example.com/v1'});
 await invoke(c,{system:'市場角色獨立初稿',prompt:'問題甲',model:'market-model'},transport);
 await invoke(c,{system:'財報角色獨立初稿',prompt:'問題乙',model:'finance-model'},transport);
 assert.equal(requests[0].payload.model,'market-model');assert.equal(requests[1].payload.model,'finance-model');
 assert.equal(requests[1].payload.messages.length,2);assert.equal(JSON.stringify(requests[1].payload).includes('問題甲'),false);
 assert.equal(requests[0].headers.Authorization,'Bearer secret');
});
test('Gemini 與 Anthropic 協定及安全錯誤處理',async()=>{
 for(const provider of ['gemini','anthropic']){
  const c=validateConnection({name:'x',provider,model:'test',apiKey:'secret'});
  const fake=async(url,opts)=>{const payload=JSON.parse(opts.body);assert.ok(provider==='gemini'?payload.systemInstruction:payload.system);return new Response(JSON.stringify(provider==='gemini'?{candidates:[{content:{parts:[{text:'答案'}]}}]}:{content:[{type:'text',text:'答案'}]}));};
  assert.equal((await invoke(c,{system:'角色規則',prompt:'問題'},fake)).text,'答案');
  await assert.rejects(invoke(c,{system:'',prompt:''},async()=>new Response('secret',{status:401})),error=>error instanceof Error&&!error.message.includes('secret')&&error.message.includes('401'));
 }
});
