import { strict as assert } from 'node:assert';
import { server, publicationGate } from './server.mjs';
process.env.AGENT_TEST='1';
assert.equal(publicationGate({mode:'demo',claims:[{source:'x',period:'2026',verified:true}]}).publishable,false);
assert.equal(publicationGate({mode:'live',claims:[{source:'x',period:'2026',verified:false}]}).publishable,false);
assert.equal(publicationGate({mode:'live',claims:[{source:'x',period:'2026',verified:true}],blockers:['數字不一致']}).publishable,false);
await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(undefined)));
try {
 const address=server.address();if(!address||typeof address==='string')throw new Error('無有效連接埠');
 const base=`http://127.0.0.1:${address.port}`;
 assert.equal((await fetch(base)).status,200);
 assert.equal((await fetch(base+'/research')).status,200);
 const research=await (await fetch(base+'/api/research/state')).json();assert.ok(research.capabilities.some(x=>x.name==='RAG 知識庫'&&x.state==='可用'));
 const state=await (await fetch(base+'/api/demo')).json();assert.equal(state.agents.length,5);assert.equal(state.gate.publishable,false);
 assert.equal((await fetch(base+'/api/runs',{method:'POST',headers:{Origin:'https://example.com'}})).status,403);
 assert.ok(Array.isArray(await (await fetch(base+'/api/search?q=2330')).json()));
 console.log('通過：發布阻擋、五角色載入、首頁、搜尋及跨站請求檢查。');
}finally{await new Promise(resolve=>server.close(()=>resolve(undefined)));}
