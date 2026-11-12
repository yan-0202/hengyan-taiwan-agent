import { cloudClient } from './cloud-client.mjs';
import { cloudMode } from './tenancy.mjs';

const attempts = new Map();
const cookieName = '__Host-hengyan';
export function publicOrigin() {
  const raw = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;
  if (!raw) throw new Error('缺少公開網址');
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('公開網址必須是 HTTPS origin');
  return url.origin;
}
export function validateCloudEnvironment() {
  if (!cloudMode()) return;
  publicOrigin(); cloudClient();
  if (!/^[a-f0-9]{64}$/i.test(process.env.AGENT_MASTER_KEY ?? '')) throw new Error('AGENT_MASTER_KEY 必須是 32 bytes 的十六進位金鑰');
}
function sessionCookie(token, age) {
  return `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
}
export function readToken(req) {
  const raw = String(req.headers.cookie ?? '').split(';').map(x => x.trim()).find(x => x.startsWith(cookieName + '='));
  try { return raw ? decodeURIComponent(raw.slice(cookieName.length + 1)) : ''; } catch { return ''; }
}
export async function authenticate(req) {
  if (!cloudMode()) return null;
  const token = readToken(req); if (!token || token.length > 8192) return null;
  const { data, error } = await cloudClient().auth.getUser(token);
  if (error || !data.user?.email_confirmed_at) return null;
  return { id: data.user.id, email: data.user.email, token };
}
function rateLimit(key) {
  const now = Date.now(); for (const [k, value] of attempts) if (value.until < now) attempts.delete(k);
  const value = attempts.get(key) ?? { count: 0, until: now + 60000 };
  if (++value.count > 10 || attempts.size > 10000) throw new Error('登入操作過於頻繁，請稍後再試');
  attempts.set(key, value);
}
async function body(req) {
  let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 6000) throw new Error('請求過大'); }
  return JSON.parse(raw || '{}');
}
export async function handleAuth(req, res, path) {
  if (!path.startsWith('/api/auth/')) return false;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!cloudMode()) { res.end(JSON.stringify({ local: true })); return true; }
  try {
    if (path === '/api/auth/me' && req.method === 'GET') {
      const user = await authenticate(req); res.end(JSON.stringify({ local: false, user: user ? { email: user.email } : null })); return true;
    }
    if (req.method !== 'POST' || req.headers.origin !== publicOrigin() || !String(req.headers['content-type']).startsWith('application/json')) {
      res.writeHead(403); res.end(JSON.stringify({ error: '拒絕跨站或無效請求' })); return true;
    }
    const token = readToken(req);
    if (path === '/api/auth/logout') {
      if (token) {
        const r = await fetch(process.env.SUPABASE_URL + '/auth/v1/logout?scope=local', {
          method: 'POST', headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
        });
        if (!r.ok && r.status !== 401 && r.status !== 403) throw new Error('登出服務暫時無法連線');
      }
      res.setHeader('Set-Cookie', sessionCookie('', 0)); res.end(JSON.stringify({ ok: true })); return true;
    }
    if (!['/api/auth/login', '/api/auth/signup'].includes(path)) throw new Error('未知帳號操作');
    const input = await body(req); const email = String(input.email ?? '').trim().toLowerCase(); const password = String(input.password ?? '');
    rateLimit('global'); rateLimit(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 12 || password.length > 128) throw new Error('請填有效 Email，密碼需 12–128 字元');
    const client = cloudClient();
    if (path.endsWith('/signup')) {
      const { error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: publicOrigin() + '/login' } });
      if (error) throw new Error('註冊未完成，請檢查資料或稍後再試');
      res.end(JSON.stringify({ message: '如可註冊，驗證信將寄到你的信箱。請完成驗證後登入。' })); return true;
    }
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user?.email_confirmed_at) throw new Error('登入失敗，請檢查帳密並完成信箱驗證');
    // 僅保存短期 access token；不將長期 refresh token 或密碼存到瀏覽器。
    res.setHeader('Set-Cookie', sessionCookie(data.session.access_token, Math.min(data.session.expires_in, 3600)));
    res.end(JSON.stringify({ ok: true }));
  } catch (error) {
    res.writeHead(400); res.end(JSON.stringify({ error: error.message }));
  }
  return true;
}
