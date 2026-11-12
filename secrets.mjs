import { spawn } from 'node:child_process';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { cloudMode, tenantId } from './tenancy.mjs';
// 固定程式碼；金鑰／設定只經 stdin 傳送，絕不插入命令列或錯誤訊息。
const scripts={
 protect:"$ErrorActionPreference='Stop'; [void][Reflection.Assembly]::Load('System.Security, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a'); $v=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $r=[Security.Cryptography.ProtectedData]::Protect($v,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))",
 unprotect:"$ErrorActionPreference='Stop'; [void][Reflection.Assembly]::Load('System.Security, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a'); $v=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $r=[Security.Cryptography.ProtectedData]::Unprotect($v,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))"
};
function crypt(mode,input){
 if(process.platform!=='win32')throw new Error('金鑰保護目前需 Windows DPAPI；其他系統需另接 OS 金鑰庫。');
 return new Promise((resolve,reject)=>{const encoded=Buffer.from(scripts[mode],'utf16le').toString('base64');const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',encoded],{windowsHide:true,stdio:['pipe','pipe','pipe']});let output='';let settled=false;
 const done=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(new Error('Windows 金鑰保護失敗；請用建立設定的 Windows 帳號啟動，原檔不會被刪除。'));else resolve(value);};
 const timer=setTimeout(()=>{child.kill();done(true,null);},20000);child.stdout.setEncoding('utf8');child.stdout.on('data',v=>{output+=v;if(output.length>2000000){child.kill();done(true,null);}});child.stderr.resume();child.on('error',()=>done(true,null));child.stdin.on('error',()=>done(true,null));child.on('close',code=>done(code!==0,output.trim()));child.stdin.end(input);
 });
}
function masterKey(){const raw=process.env.AGENT_MASTER_KEY??'';if(!/^[a-f0-9]{64}$/i.test(raw))throw new Error('缺少有效雲端加密金鑰');return Buffer.from(raw,'hex');}
export async function protect(value){
 if(cloudMode()){
  const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',masterKey(),iv);cipher.setAAD(Buffer.from(tenantId()));
  const payload=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return {format:'aes-gcm-tenant-v1',iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),payload:payload.toString('base64')};
 }
 const serialized=Buffer.from(JSON.stringify(value),'utf8').toString('base64');return {format:'windows-dpapi-v1',payload:await crypt('protect',serialized)};
}
export async function unprotect(value){
 if(cloudMode()){
  if(value?.format!=='aes-gcm-tenant-v1')throw new Error('不支援的雲端金鑰格式');
  const decipher=createDecipheriv('aes-256-gcm',masterKey(),Buffer.from(value.iv,'base64'));decipher.setAAD(Buffer.from(tenantId()));decipher.setAuthTag(Buffer.from(value.tag,'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.payload,'base64')),decipher.final()]).toString('utf8'));
 }
 if(value?.format!=='windows-dpapi-v1')throw new Error('不支援的金鑰儲存格式');const text=await crypt('unprotect',value.payload);return JSON.parse(Buffer.from(String(text),'base64').toString('utf8'));
}
