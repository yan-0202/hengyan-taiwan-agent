/** @returns {any} */
const $ = selector => document.querySelector(selector);
// 信箱驗證可能帶回一次性 session fragment，先移除，不存到 localStorage。
if (location.hash) { history.replaceState(null, '', '/login'); $('#auth-status').textContent = '請確認信箱驗證完成，再登入。'; }
let mode = 'login';
function choose(next) {
  mode = next; $('#login-tab').setAttribute('aria-pressed', String(mode === 'login')); $('#signup-tab').setAttribute('aria-pressed', String(mode === 'signup'));
  $('#submit').textContent = mode === 'login' ? '登入研究空間 →' : '建立帳號並寄送驗證信 →';
  $('#password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
}
$('#login-tab').onclick = () => choose('login'); $('#signup-tab').onclick = () => choose('signup');
$('#auth-form').onsubmit = async event => {
  event.preventDefault(); $('#submit').disabled = true; $('#auth-status').textContent = '處理中…';
  try {
    const r = await fetch('/api/auth/' + mode, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('#email').value, password: $('#password').value }) });
    const data = await r.json(); if (!r.ok) throw new Error((data.error || '操作失敗')+(data.errorCode?`（錯誤代碼：${data.errorCode}）`:''));
    $('#password').value = '';
    if (data.local || data.ok) location.assign('/'); else $('#auth-status').textContent = data.message;
  } catch (error) { $('#auth-status').textContent = error.message; }
  finally { $('#submit').disabled = false; }
};
