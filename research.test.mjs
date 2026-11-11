import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { calculate, createPlan } from './research.mjs';
test('財務計算與負基期保護',()=>{
 assert.equal(calculate({kind:'growth',previous:100,current:120}).value,20);
 assert.equal(calculate({kind:'margin',previous:120,current:42}).value,35);
 assert.equal(calculate({kind:'percentagePoints',previous:40,current:35}).value,-5);
 assert.throws(()=>calculate({kind:'growth',previous:-10,current:5}));
 assert.throws(()=>calculate({kind:'margin',previous:0,current:5}));
 assert.throws(()=>calculate({kind:'growth',previous:'',current:5}));
});
test('規劃不宣稱已執行或可發布',()=>{
 const plan=createPlan('比較兩期財報');assert.equal(plan.publishable,false);assert.ok(plan.steps.every(x=>x.status!=='已完成'));assert.ok(plan.type.includes('規則式'));assert.throws(()=>createPlan(''));
});
