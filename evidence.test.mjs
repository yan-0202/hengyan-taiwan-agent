import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildSnapshot,normalizeDate } from './evidence.mjs';
test('民國與西元日期正規化，拒絕無效日期',()=>{assert.equal(normalizeDate('1151110'),'2026-11-10');assert.equal(normalizeDate('20261111'),'2026-11-11');assert.equal(normalizeDate('20260230'),null);});
test('指定公司財務資料與程式計算同源，保留期間且不夾帶其他公司',()=>{
 const rows=[{'公司代號':'2330','公司名稱':'測試公司','年度':'115','季別':'3','營業收入':'120','營業毛利（毛損）':'42'},{'公司代號':'9999','公司名稱':'別家公司','年度':'115','季別':'3','營業收入':'100','營業毛利（毛損）':'80'}];
 const r=buildSnapshot([{id:'income',rows,url:'https://official.example',fetchedAt:'2026-11-12T00:00:00Z'}],'2330',Date.parse('2026-11-12T01:00:00Z'));
 assert.equal(r.calculations[0].value,35);assert.equal(r.calculations[0].source,'https://official.example');assert.ok(r.calculations[0].period.includes('115'));assert.ok(!JSON.stringify(r.evidence).includes('9999'));assert.ok(r.warnings.some(x=>x.includes('現金流量表')));
});
test('舊快取與未涵蓋公司明確警示，不捏造財務計算',()=>{
 const r=buildSnapshot([{id:'income',rows:[],url:'x',fetchedAt:'2020-01-01'}],'2330',Date.parse('2026-11-12'));
 assert.equal(r.calculations.length,0);assert.ok(r.warnings.some(x=>x.includes('過期')));assert.ok(r.warnings.some(x=>x.includes('找不到')));
});
