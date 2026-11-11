import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strict as assert } from 'node:assert';
const temp=await mkdtemp(join(tmpdir(),'taiwan-agent-test-'));
process.env.AGENT_CONFIG_DIRECTORY=temp;process.env.AGENT_TEST='1';
const {server}=await import('./server.mjs');
const nativeFetch=globalThis.fetch;let called=false;let recordId;
globalThis.fetch=async(input,options)=>{
 if(String(input)==='https://example.com/v1/models')return new Response(JSON.stringify({data:[{id:'available-model'}]}));
 if(String(input).startsWith('https://example.com/')){const payload=JSON.parse(String(options.body));assert.equal(payload.model,'role-model');assert.ok(payload.messages[0].content.includes('Thesis Tracker'));called=true;return new Response(JSON.stringify({choices:[{message:{content:'模擬回答，不是真實分析'}}],usage:{total_tokens:12}}));}
 return nativeFetch(input,options);
};
await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(undefined)));
try{
 const address=server.address();if(!address||typeof address==='string')throw new Error('無連接埠');const base=`http://127.0.0.1:${address.port}`;
 const call=async(path,body)=>{const r=await fetch(base+'/api/ai/'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});assert.equal(r.status,200);return r.json();};
 let config=await call('connections',{name:'測試用',provider:'compatible',baseUrl:'https://example.com/v1',model:'default',apiKey:'do-not-return-this'});
 assert.ok(!JSON.stringify(config).includes('do-not-return-this'));const id=config.connections[0].id;
 const models=await call('models',{id,name:'模型清單',provider:'compatible',baseUrl:'https://example.com/v1'});assert.equal(models.models[0].id,'available-model');
 await call('roles',{role:'risk',connectionId:id,model:'role-model',maxTokens:256,includeSkill:true});
 const result=await call('run',{role:'risk',question:'測試獨立角色'});recordId=result.id;assert.ok(called);assert.ok(result.skillHash);assert.equal(result.publishable,false);assert.ok(!JSON.stringify(result).includes('do-not-return-this'));
 config=await call('delete',{id});assert.equal(config.connections.length,0);assert.equal(config.roles.risk,undefined);
 assert.equal((await fetch(base+'/ai')).status,200);
 console.log('通過：連線新增、金鑰遮蔽、角色模型綁定、Skill 實際注入、單角色執行、紀錄及刪除解除綁定。外部 API 使用模擬。');
}finally{
 globalThis.fetch=nativeFetch;await new Promise(resolve=>server.close(()=>resolve(undefined)));
 if(recordId)await rm(new URL(`data/ai-${recordId}.json`,import.meta.url),{force:true});await rm(temp,{recursive:true,force:true});
}
