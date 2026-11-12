import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parsePrices, analyzePrices } from './chart.mjs';
test('走勢解析拒絕缺資料與無效日期，不用空值代替價格',()=>{
 assert.throws(()=>parsePrices({stat:'no data'}));
 const rows=parsePrices({stat:'OK',fields:['日期','收盤價'],data:[['115/11/10','1,000'],['115/02/30','10'],['115/11/11','--']]});
 assert.deepEqual(rows,[{date:'2026-11-10',close:1000}]);assert.throws(()=>analyzePrices(rows));
});
test('均線、首尾漲跌與極值可重算，資料不足不產生二十日均線',()=>{
 const points=Array.from({length:5},(_,i)=>({date:'2026-11-'+String(i+1).padStart(2,'0'),close:100+i*10}));
 const a=analyzePrices(points);assert.equal(a.changePercent,40);assert.equal(a.ma5,120);assert.equal(a.ma20,null);assert.equal(a.minimum,100);assert.equal(a.maximum,140);assert.match(a.limitation,/未還原權息/);
});
