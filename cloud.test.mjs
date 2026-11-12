import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { request } from 'node:http';
import { withIdentity } from './tenancy.mjs';
import { objectPath } from './storage.mjs';
import { protect, unprotect } from './secrets.mjs';
import { validateConnection } from './ai.mjs';
import { server } from './server.mjs';

const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const root = new URL('./', import.meta.url);

test('雲端：兩帳號的 API、文件、偏好與金鑰隔離；匿名及跨站拒絕', async () => {
  const original = { ...process.env }; const originalFetch = globalThis.fetch;
  const objects = new Map(); const trace = [];
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  process.env.AGENT_MODE = 'cloud'; process.env.PUBLIC_URL = 'https://app.example';
  process.env.SUPABASE_URL = 'https://testproject.supabase.co'; process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
  process.env.AGENT_MASTER_KEY = randomBytes(32).toString('hex');
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    if(['api.gdeltproject.org','www.twse.com.tw'].includes(url.hostname)){
      const headers=new Headers(options.headers);assert.equal(headers.get('Authorization'),null);assert.equal(headers.get('x-goog-api-key'),null);
      if(url.hostname==='api.gdeltproject.org')return json({articles:[{title:'TEST ONLY TSMC headline',url:'https://news.example/test',seendate:'20261112T020000Z'}]});
      return json({stat:'OK',fields:['日期','收盤價'],data:[['115/11/10','100'],['115/11/11','101']]});
    }
    if (url.hostname !== 'testproject.supabase.co') return originalFetch(input, options);
    const headers = new Headers(options.headers); const id = headers.get('Authorization')?.replace(/^Bearer /, '');
    if (url.pathname === '/auth/v1/user') return [a, b].includes(id) ? json({ id, email: id + '@test.example', email_confirmed_at: '2026-01-01T00:00:00Z' }) : json({ message: 'Invalid token' }, 401);
    if(url.pathname==='/auth/v1/token')return json({access_token:a,refresh_token:'never-persist-this-refresh-token',token_type:'bearer',expires_in:3600,user:{id:a,email:'test@example.com',email_confirmed_at:'2026-01-01T00:00:00Z'}});
    if(url.pathname==='/auth/v1/signup')return json({id:a,email:'test@example.com'});
    if (url.pathname === '/auth/v1/logout') return json({});
    const prefix = '/storage/v1/object/'; assert.ok(url.pathname.startsWith(prefix));
    const parts = url.pathname.slice(prefix.length).split('/');
    const method = options.method ?? 'GET'; let key;
    const bodyText = async () => typeof options.body === 'string' ? options.body : options.body instanceof Blob ? await options.body.text() : Buffer.from(/** @type {any} */(options.body)).toString();
    if (parts[0] === 'list') {
      const query = JSON.parse(await bodyText()); assert.ok(query.prefix.startsWith(id + '/'));
      const names = [...objects.keys()].filter(x => x.startsWith(query.prefix + '/') && !x.slice(query.prefix.length + 1).includes('/')).map(x => ({ name: x.slice(query.prefix.length + 1), id: x }));
      return json(names.sort((x, y) => x.name.localeCompare(y.name)).slice(query.offset, query.offset + query.limit));
    }
    if (method === 'DELETE') {
      const { prefixes } = JSON.parse(await bodyText()); for (const path of prefixes) { assert.ok(path.startsWith(id + '/')); objects.delete(path); }
      return json([]);
    }
    key = (parts[0] === 'authenticated' ? parts.slice(2) : parts.slice(1)).map(decodeURIComponent).join('/');
    assert.ok(key.startsWith(id + '/'), 'mock RLS 拒絕其他帳號前綴'); trace.push({ id, key, method });
    if (method === 'GET') return objects.has(key) ? json(JSON.parse(objects.get(key))) : json({ statusCode: '404', error: 'not_found', message: 'Object not found' }, 404);
    objects.set(key, await bodyText()); return json({ Key: 'hengyan-private/' + key, Id: key });
  };
  try {
    assert.throws(() => objectPath(new URL('data/workspace/doc-x.json', root)), /登入/);
    await Promise.all([a, b].map(id => withIdentity({ id, token: id }, async () => {
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(objectPath(new URL('data/research/profile.json', root)), id + '/data/research/profile.json');
    })));
    const sealed = await withIdentity({ id: a, token: a }, () => protect({ apiKey: 'test-only' }));
    assert.equal((await withIdentity({ id: a, token: a }, () => unprotect(sealed))).apiKey, 'test-only');
    await assert.rejects(withIdentity({ id: b, token: b }, () => unprotect(sealed)));
    await assert.rejects(withIdentity({ id: a, token: a }, () => unprotect({ ...sealed, payload: Buffer.from('tampered').toString('base64') })));
    assert.throws(() => validateConnection({ provider: 'compatible', name: 'bad', model: 'test', apiKey: 'test', baseUrl: 'https://evil.example/v1' }), /官方端點/);
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); if (typeof address === 'string' || !address) throw new Error('No test port');
    const port=address.port;
    async function call(path, id = '', value = undefined, origin = 'https://app.example') {
      return new Promise((resolve,reject)=>{
        const req=request({hostname:'127.0.0.1',port,path:encodeURI(path),method:value===undefined?'GET':'POST',headers:{Host:'app.example',...(id?{Cookie:'__Host-hengyan='+id}:{}),...(value===undefined?{}:{Origin:origin,'Content-Type':'application/json'})}},res=>{
          let text='';res.setEncoding('utf8');res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,text,headers:new Headers(Object.entries(res.headers).flatMap(([key,value])=>Array.isArray(value)?value.map(x=>[key,x]):value===undefined?[]:[[key,value]]))}));
        });req.on('error',reject);req.end(value===undefined?undefined:JSON.stringify(value));
      });
    }
    assert.equal((await call('/api/workspace/documents')).status, 401);
    assert.equal((await call('/')).status, 303); assert.equal((await call('/login')).status, 200);
    const login=await call('/api/auth/login','',{email:'test@example.com',password:'long-test-password'});
    assert.equal(login.status,200,login.text);assert.ok(!login.text.includes(a));assert.ok(!login.text.includes('never-persist'));
    for(const flag of ['__Host-hengyan=','HttpOnly','Secure','SameSite=Lax','Max-Age=3600'])assert.ok(login.headers.get('set-cookie').includes(flag));
    assert.ok(!login.headers.get('set-cookie').includes('never-persist'));
    assert.equal((await call('/api/research/profile', a, { consent: true }, 'https://evil.example')).status, 403);
    const uploaded = await call('/api/workspace/documents', a, { title: 'A 的私人文件', period: '2026', text: '機密營收與現金流資料' });
    assert.equal(uploaded.status, 200, uploaded.text); const docId = JSON.parse(uploaded.text).id;
    assert.equal(JSON.parse((await call('/api/workspace/documents', b)).text).length, 0);
    assert.equal(JSON.parse((await call('/api/workspace/search?q=機密', b)).text).length, 0);
    assert.equal((await call('/api/workspace/delete', b, { id: docId })).status, 200);
    assert.equal(JSON.parse((await call('/api/workspace/documents', a)).text).length, 1, 'B 刪除同 ID 不會刪掉 A 文件');
    assert.equal((await call('/api/workspace/report?id='+docId,b)).status,400,'B 無法用 A 的 ID 取得報告');
    assert.equal((await call('/api/research/profile', a, { consent: true, focus: 'A_PRIVATE_FOCUS' })).status, 200);
    assert.equal(JSON.parse((await call('/api/research/state', b)).text).profile, null);
    const saved = await call('/api/ai/connections', a, { provider: 'gemini', name: 'A連線', model: 'test', apiKey: 'test-secret-credential' });
    assert.equal(saved.status, 200, saved.text); assert.ok(!saved.text.includes('test-secret-credential'));
    assert.equal(JSON.parse((await call('/api/ai/config', b)).text).connections.length, 0);
    assert.equal(JSON.parse((await call('/api/ai/config', a)).text).connections.length, 1);
    assert.ok(!objects.get(a + '/private/connections.json').includes('test-secret-credential'));
    assert.equal((await call('/api/news/state')).status,401);
    assert.equal((await call('/api/chart?code=2330')).status,401);
    assert.equal((await call('/news',a)).status,200);
    assert.equal((await call('/api/news/watchlist',a,{watchlist:[{code:'2330',name:'台積電',keyword:'TSMC'}]})).status,200);
    assert.equal(JSON.parse((await call('/api/news/state',b)).text).watchlist.length,0);
    const news=await call('/api/news/refresh',a,{});assert.equal(news.status,200,news.text);assert.equal(JSON.parse(news.text).articles.length,1);
    assert.ok(!news.text.includes('test-secret-credential'));
    assert.equal(JSON.parse((await call('/api/news/state',b)).text).articles.length,0);
    const chart=await call('/api/chart?code=2330',a,{});assert.equal(chart.status,200,chart.text);
    assert.equal((await call('/api/chart?code=2330',b)).status,400);
    assert.equal((await call('/api/news/watchlist',a,{watchlist:[]})).status,200);
    assert.equal(JSON.parse((await call('/api/news/state',a)).text).articles.length,0,'修改追蹤清單後不混入舊結果');
    const logout = await call('/api/auth/logout', a, {}); assert.equal(logout.status, 200);
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=0']) assert.ok(logout.headers.get('set-cookie').includes(flag));
    assert.ok(trace.some(x => x.id === b && x.key.startsWith(b + '/')));
  } finally {
    globalThis.fetch = originalFetch; if (server.listening) await new Promise(resolve => server.close(resolve));
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
  }
});
