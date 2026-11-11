import { spawn } from 'node:child_process';
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
export async function protect(value){const serialized=Buffer.from(JSON.stringify(value),'utf8').toString('base64');return {format:'windows-dpapi-v1',payload:await crypt('protect',serialized)};}
export async function unprotect(value){if(value?.format!=='windows-dpapi-v1')throw new Error('不支援的金鑰儲存格式');const text=await crypt('unprotect',value.payload);return JSON.parse(Buffer.from(String(text),'base64').toString('utf8'));}
