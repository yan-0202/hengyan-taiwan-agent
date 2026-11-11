import { parentPort, workerData } from 'node:worker_threads';
import readXlsxFile from 'read-excel-file/node';
try{
 const sheets=await readXlsxFile(Buffer.from(workerData));if(sheets.length>30)throw new Error('最多 30 個工作表');let cells=0,total=0;
 const pages=sheets.map(s=>{if(s.data.length>20000)throw new Error('單表最多 20000 列');const text=`工作表：${s.sheet}\n注意：僅讀取儲存的儲存格值，不重新計算公式；單位及合併表頭需人工確認。\n`+s.data.map((row,i)=>{cells+=row.length;if(cells>200000||row.length>200)throw new Error('超出表格解析上限');return `第 ${i+1} 列：`+row.map(v=>v instanceof Date?v.toISOString():String(v??'')).join('\t');}).join('\n');total+=text.length;if(total>4000000)throw new Error('解析文字超過 400 萬字元');return text;});
 parentPort.postMessage({pages,sheetNames:sheets.map(s=>s.sheet)});
}catch{parentPort.postMessage({error:'Excel 無法解析或超過上限；請使用有效 XLSX，最多 30 表、每表 2 萬列、總計 20 萬格。'});}
