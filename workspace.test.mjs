import { test } from 'node:test';import { strict as assert } from 'node:assert';
import { chunks,rank,execute,checkCitations } from './workspace.mjs';
import { inventory } from './quality.mjs';
import { mkdir,unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

function finalText(job,prompt,otherwise){
 if(!prompt.includes('只輸出 JSON，不加 Markdown'))return otherwise;
 return JSON.stringify({decision:'研究草稿',claims:[{kind:'fact',evidenceId:'E1',quote:job.evidence[0].text}],assessments:inventory(job).filter(x=>x.stage==='draft').map(x=>({artifactId:x.artifactId,evidenceQuality:null,calculationReliability:null,riskCoverage:null,reason:'需人工核對'})),limitations:['沒有足夠資料'],comparisons:[]});
}
test('檢索保留來源頁碼，沒有匹配不硬塞證據',()=>{
 const docs=[{id:'x',title:'財報',period:'2026 Q3',source:'official',chunks:chunks(['現金流增加，營收成長。','負債下降。'])}];
 const r=rank('現金流',docs);assert.equal(r[0].page,1);assert.equal(r[0].source,'official');assert.equal(r[0].citation,'E1');assert.equal(rank('zzzzzz',docs).length,0);
});
test('團隊初稿彼此隔離，風險與總管可讀取初稿',async()=>{
 await mkdir(new URL('data/workspace/',import.meta.url),{recursive:true});const id=randomUUID();const seen=[];
 const job={id,question:'現金流',evidence:[{citation:'E1',source:'official-test',period:'2026 Q3',text:'現金流增加'}],drafts:[],errors:[],review:null,summary:null,status:'running',stage:'',citationCheck:null,finishedAt:null};
 try{await execute(job,async(role,prompt)=>{seen.push({role,prompt});return {role,text:finalText(job,prompt,role+'獨立回答 [E1]'),model:'mock',usage:null,skillHash:null,connectionName:'mock',finishReason:'stop',truncated:false,elapsedMs:1};});
 assert.equal(seen.length,5);assert.ok(!seen[1].prompt.includes('market獨立回答'));assert.ok(seen[3].prompt.includes('market獨立回答'));assert.ok(seen[4].prompt.includes('risk獨立回答'));assert.equal(job.status,'completed');assert.equal(job.citationCheck.unknown.length,0);
 }finally{await unlink(new URL(`data/workspace/job-${id}.json`,import.meta.url));}
});
test('總管失敗續跑不重複呼叫已完成的角色',async()=>{
 await mkdir(new URL('data/workspace/',import.meta.url),{recursive:true});const id=randomUUID();const calls=[];
 const job={id,question:'驗收',evidence:[{citation:'E1',source:'official-test',period:'2026 Q3',text:'資料'}],drafts:['market','macro','financial'].map(role=>({role,text:'既有初稿'})),review:{role:'risk',text:'既有審查'},errors:[],summary:null,status:'running',stage:'',citationCheck:null,finishedAt:null};
 try{await execute(job,async (role,prompt)=>{calls.push(role);return {role,text:finalText(job,prompt,'完成 [E1]'),model:'mock',usage:null,skillHash:null,connectionName:'mock',finishReason:'stop',truncated:false,elapsedMs:1};});assert.deepEqual(calls,['manager']);assert.equal(job.status,'completed');}finally{await unlink(new URL(`data/workspace/job-${id}.json`,import.meta.url));}
});
test('引用清單與範圍可驗證；未知編號與缺少引用不會通過',()=>{const evidence=[{citation:'E1'},{citation:'E2'}];assert.deepEqual(checkCitations('敘述 [E1, E2] [E1–E3]',evidence).unknown,['E3']);assert.equal(checkCitations('沒有來源',evidence).missing,true);assert.equal(checkCitations('[E1-9999]',evidence).malformed.length,1);});
test('總管先分派、初稿獨立、完整模式互評後再裁決',async()=>{
 await mkdir(new URL('data/workspace/',import.meta.url),{recursive:true});const id=randomUUID(),seen=[];
 const job={id,question:'市場研究',dynamicPlanning:true,scoringMode:'team',evidence:[{citation:'E1',source:'official-test',period:'2026 Q3',text:'證據'}],drafts:[],errors:[],review:null,summary:null,status:'running',stage:'',citationCheck:null,finishedAt:null};
 try{await execute(job,async(role,prompt)=>{seen.push({role,prompt});return {role,text:finalText(job,prompt,seen.length===1?JSON.stringify({market:'檢查交易日',macro:'檢查政策期間',financial:'檢查財務口徑'}):role+'分析與評分 [E1]'),model:'mock',usage:null,skillHash:null,connectionName:'mock',finishReason:'stop',truncated:false,elapsedMs:1};});assert.equal(seen.length,9);assert.ok(seen[1].prompt.includes('檢查交易日'));assert.ok(!seen[2].prompt.includes('market分析與評分'));assert.ok(seen[4].prompt.includes('market分析與評分'));assert.ok(seen[8].prompt.includes('各主理人互評'));assert.equal(job.status,'completed');}finally{await unlink(new URL(`data/workspace/job-${id}.json`,import.meta.url));}
});
test('續跑補齊初稿時，舊互評及風險審查失效，必須重新審查',async()=>{
 await mkdir(new URL('data/workspace/',import.meta.url),{recursive:true});const id=randomUUID(),seen=[];
 const job={id,question:'續跑',scoringMode:'team',evidence:[{citation:'E1',source:'official-test',period:'2026 Q3',text:'證據'}],drafts:[{role:'market',text:'初稿一'},{role:'macro',text:'初稿二'}],peerReviews:[{role:'market',text:'過時互評'}],review:{role:'risk',text:'過時審查'},summary:{role:'manager',text:'過時裁決'},errors:[],status:'running',stage:'',citationCheck:null,finishedAt:null};
 try{await execute(job,async(role,prompt)=>{seen.push(role);return {role,text:finalText(job,prompt,'新結果 [E1]'),model:'mock',usage:null,skillHash:null,connectionName:'mock',finishReason:'stop',truncated:false,elapsedMs:1};});assert.deepEqual(seen,['financial','market','macro','financial','risk','manager']);assert.ok(job.peerReviews.every(x=>x.text!=='過時互評'));assert.equal(job.review.text,'新結果 [E1]');assert.equal(job.previousRounds[0].review.text,'過時審查');}finally{await unlink(new URL(`data/workspace/job-${id}.json`,import.meta.url));}
});
