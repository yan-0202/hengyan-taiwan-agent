import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildHub,summarizeMacro } from './datahub.mjs';
const wrap=value=>({value,fetchedAt:'2026-11-12T00:00:00Z'});
function fixture(){return {prices:wrap({date:'20261111',tables:[{fields:['證券代號','收盤價','證券名稱'],data:[['2330','100','測試公司'],['2454','50','第二公司'],['0050','1000','ETF']]}]}),shares:wrap({date:'20261111',selectType:'ALLBUT0999',fields:['證券代號','發行股數'],data:[['2330','1000'],['2454','200'],['0050','10000']]}),companies:wrap([{'公司代號':'2330'},{'公司代號':'2454'}]),otc:wrap([{Date:'1151111',SecuritiesCompanyCode:'5274',CompanyName:'上櫃公司',Capitals:'100',ClosePrice:'200'}])};}
test('市值依股數乘價格排序，排除 ETF，不使用成交量',()=>{const d=buildHub(fixture(),Date.parse('2026-11-12T01:00:00Z'));assert.equal(d.ranking.complete,true);assert.deepEqual(d.ranking.combined.map(x=>x.code),['2330','5274','2454']);assert.equal(d.ranking.combined[0].marketCap,100000);});
test('缺少上市公司股數或混合交易日，不產生合併排名',()=>{const f=fixture();f.shares.value.data.pop();f.shares.value.data.pop();assert.equal(buildHub(f).ranking.complete,false);const g=fixture();g.otc.value[0].Date='1151110';assert.equal(buildHub(g).ranking.combined.length,0);});
test('央行利率保留生效日及單位，缺值不轉成零',()=>{const d=summarizeMacro({meta:{title:'政策利率',units:'年息百分比率',last_updated:'2026-10-28'},data:{structure:{Table1:[{data:'重貼現'},{data:'缺值欄'}]},dataSets:[['20240322','2.0','-']]}},'rates');assert.equal(d.period,'20240322');assert.equal(d.observationKind,'利率生效日');assert.equal(d.series[1].value,null);});
