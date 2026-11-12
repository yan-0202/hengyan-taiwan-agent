import { readFile, writeFile, mkdir, rename } from './storage.mjs';
import { randomUUID } from 'node:crypto';
const dir = new URL('data/news/', import.meta.url);
const file = name => new URL(name + '.json', dir);
export const newsLimit = '新聞索引僅提供標題與連結，未讀全文；收錄時間不是發布時間，不能據此證實事件或財務數字。轉載與重複報導不是獨立證據。';
export function validateWatchlist(input) {
  if (!Array.isArray(input) || input.length > 10) throw new Error('最多追蹤 10 檔股票');
  const rows = input.map(x => {
    const code = String(x.code ?? '').trim(), name = String(x.name ?? '').trim(), keyword = String(x.keyword ?? '').trim();
    if (!/^\d{4,6}$/.test(code) || !name || name.length > 40 || !/^[a-zA-Z][a-zA-Z0-9 .-]{1,59}$/.test(keyword)) throw new Error('請填台股代號、公司名稱與英文新聞關鍵字（2–60 字，例如 TSMC）');
    return { code, name, keyword };
  });
  if (new Set(rows.map(x => x.code)).size !== rows.length) throw new Error('股票代號不可重複');
  return rows;
}
async function load(name, fallback) { try { return JSON.parse(await readFile(file(name), 'utf8')); } catch (e) { if (e.code === 'ENOENT') return fallback; throw new Error('新聞追蹤資料讀取失敗，請檢查登入與儲存服務'); } }
async function save(name, value) { await mkdir(dir, { recursive: true }); const temp = new URL(randomUUID() + '.tmp', dir); await writeFile(temp, JSON.stringify(value)); await rename(temp, file(name)); }
export function newsURL(watchlist) {
  const rows = validateWatchlist(watchlist); if (!rows.length) throw new Error('請先加入追蹤股票');
  const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  url.search = new URLSearchParams({ query: '(' + rows.map(x => '"' + x.keyword + '"').join(' OR ') + ')', mode: 'artlist', format: 'json', sort: 'datedesc', timespan: '3d', maxrecords: '50' }).toString();
  return url;
}
export function normalizeNews(data) {
  if (!data || !Array.isArray(data.articles)) throw new Error('新聞服務未提供有效資料；請稍後再試');
  const seen = new Set();
  return data.articles.slice(0, 100).flatMap(x => {
    try {
      const url = new URL(x.url);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !x.title || String(x.title).length > 500) return [];
      url.hash = ''; for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
      if (seen.has(url.href)) return []; seen.add(url.href);
      const raw = String(x.seendate ?? ''), iso = /^\d{8}T\d{6}Z$/.test(raw) ? raw.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z') : null;
      const indexedAt = iso && Number.isFinite(Date.parse(iso)) ? iso : null;
      return [{ title: String(x.title), url: url.href, publisher: url.hostname, indexedAt, publishedAt: null, language: String(x.language ?? '').slice(0, 40), contentScope: 'headline-only' }];
    } catch { return []; }
  }).slice(0, 50);
}
export async function fetchNews(watchlist, transport = fetch) {
  // 固定公開 API；不接受任意端點、不帶 AI 金鑰、不追蹤新聞連結、不執行 HTML。
  const response = await transport(newsURL(watchlist), { signal: AbortSignal.timeout(30000), redirect: 'error', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`新聞服務 HTTP ${response.status}，請稍後再試`);
  const reader = response.body.getReader(); const chunks = []; let length = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.byteLength; if (length > 1_000_000) throw new Error('新聞回應超過容量限制'); chunks.push(value); } } finally { await reader.cancel(); }
  let data; try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('新聞服務回覆格式錯誤或暫時限流，請稍後再試'); }
  return normalizeNews(data);
}
export async function newsState() { const watchlist = await load('watchlist', []), cache = await load('cache', null); const matches = JSON.stringify(cache?.watchlist) === JSON.stringify(watchlist); return { watchlist, articles: matches ? cache.articles : [], fetchedAt: matches ? cache.fetchedAt : null, stale: !matches || !cache?.fetchedAt || Date.now() - Date.parse(cache.fetchedAt) > 24 * 3600000, limitation: newsLimit }; }
let nextRequest = 0;
export async function refreshNews() {
  const watchlist = validateWatchlist(await load('watchlist', [])); newsURL(watchlist);
  if (Date.now() < nextRequest) throw new Error('新聞服務冷卻中，請稍後再更新');
  nextRequest = Date.now() + 60000;
  const articles = await fetchNews(watchlist); await save('cache', { watchlist, articles, fetchedAt: new Date().toISOString() }); return newsState();
}
export function newsEvidence(state) {
  if (state.stale) throw new Error('新聞尚未更新、追蹤清單已變更或快取超過一天；請先更新新聞再研究');
  if (!state.articles.length) throw new Error('本次沒有可用新聞，不代表沒有重大事件');
  return state.articles.slice(0, 12).map(x => ({ title: x.title, source: x.url, period: x.indexedAt ?? '收錄時間未知；發布時間未知', fetchedAt: state.fetchedAt, type: 'news-headline', stale: false, page: null, text: JSON.stringify({ headline: x.title, publisher: x.publisher, indexedAt: x.indexedAt, publishedAt: null, limitation: newsLimit }) }));
}
export async function handleNews(req, res, path) {
  if (!path.startsWith('/api/news/')) return false;
  try {
    let result;
    if (path === '/api/news/state' && req.method === 'GET') result = await newsState();
    else if (path === '/api/news/watchlist' && req.method === 'POST') {
      if (!String(req.headers['content-type']).startsWith('application/json')) throw new Error('請使用 JSON');
      let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 10000) throw new Error('追蹤清單過大'); }
      const list = validateWatchlist(JSON.parse(raw).watchlist); await save('watchlist', list); result = await newsState();
    } else if (path === '/api/news/refresh' && req.method === 'POST') result = await refreshNews();
    else { res.writeHead(404); res.end(JSON.stringify({ error: '未知新聞操作' })); return true; }
    res.end(JSON.stringify(result));
  } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })); } return true;
}
