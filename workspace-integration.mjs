import { strict as assert } from 'node:assert';
process.env.AGENT_TEST='1';const {server}=await import('./server.mjs');
await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(undefined)));const address=server.address();if(!address||typeof address==='string')throw new Error('埠無效');const base=`http://127.0.0.1:${address.port}/api/workspace/`;const ids=[];
async function post(path,payload){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;}
try{
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 const stream='BT /F1 12 Tf 50 750 Td (cashflowtestxyz revenue increased) Tj ET';objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
 let pdf='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(x=>String(x).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 const result=await post('documents',{title:'自動測試文件',period:'測試',source:'本機合成 PDF，不是真實財報',pdf:Buffer.from(pdf).toString('base64')});ids.push(result.id);assert.ok(result.chunks>0);
 const matches=await (await fetch(base+'search?q=cashflowtestxyz')).json();assert.ok(matches.some(x=>x.documentId===result.id&&x.page===1));
 assert.equal((await fetch(`http://127.0.0.1:${address.port}/workspace`)).status,200);
 console.log('通過：真實 PDF 解析、入庫、按頁檢索與知識庫頁面。未呼叫 AI。');
}finally{for(const id of ids)await post('delete',{id});await new Promise(resolve=>server.close(()=>resolve(undefined)));}
