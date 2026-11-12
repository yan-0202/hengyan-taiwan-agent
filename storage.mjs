// 本機保持原路徑；雲端私有資料只使用已驗證使用者的 JWT，並由 Storage RLS 再次檢查。
import * as fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { relative, isAbsolute } from 'node:path';
import { cloudMode, identity } from './tenancy.mjs';
import { cloudClient } from './cloud-client.mjs';

const root = fileURLToPath(new URL('./', import.meta.url));
export function objectPath(path) {
  if (!cloudMode()) return null;
  const name = relative(root, path instanceof URL ? fileURLToPath(path) : path).replaceAll('\\', '/');
  if (name.startsWith('../') || isAbsolute(name)) throw new Error('不接受儲存範圍外的路徑');
  // 僅官方快取可共用，私有 API 紀錄／研究／知識庫不可落到此分支。
  if (name.startsWith('data/hub/') || /^data\/(indices|otc|income|balance)\.json$/.test(name)) return null;
  if (!/^(data|private)(\/|$)/.test(name)) return null;
  return `${identity().id}/${name}`;
}
function bucket() { return cloudClient(identity().token).storage.from(process.env.SUPABASE_STORAGE_BUCKET ?? 'hengyan-private'); }
function failure(error) {
  if (['404', '400'].includes(String(error.statusCode)) && /not found/i.test(error.message)) return Object.assign(new Error('找不到資料'), { code: 'ENOENT' });
  return new Error('雲端儲存失敗，請檢查登入、容量及存取政策');
}
/** @overload @param {URL|string} path @param {BufferEncoding|{encoding: BufferEncoding}} options @returns {Promise<string>} */
/** @overload @param {URL|string} path @param {undefined} [options] @returns {Promise<Buffer>} */
/** @param {URL|string} path @param {any} [options] */
export async function readFile(path, options) {
  const key = objectPath(path); if (!key) return fs.readFile(path, options);
  const { data, error } = await bucket().download(key); if (error) throw failure(error);
  const bytes = Buffer.from(await data.arrayBuffer());
  const encoding = typeof options === 'string' ? options : options?.encoding;
  return encoding ? bytes.toString(encoding) : bytes;
}
export async function writeFile(path, value, options) {
  const key = objectPath(path); if (!key) return fs.writeFile(path, value, options);
  const bytes = typeof value === 'string' ? Buffer.from(value) : value;
  if (bytes.byteLength > 16_000_000) throw new Error('單筆資料超過 16 MB 上限');
  const { error } = await bucket().upload(key, bytes, { upsert: true, contentType: 'application/json', cacheControl: '0' });
  if (error) throw failure(error);
}
export async function mkdir(path, options) { if (!objectPath(path)) return fs.mkdir(path, options); }
export async function readdir(path) {
  const key = objectPath(path); if (!key) return fs.readdir(path);
  const names = []; let offset = 0;
  for (;;) {
    const { data, error } = await bucket().list(key.replace(/\/$/, ''), { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw failure(error);
    names.push(...data.filter(x => x.id).map(x => x.name));
    if (data.length < 100) return names;
    offset += 100; if (offset > 1000) throw new Error('資料筆數超過測試站上限');
  }
}
export async function unlink(path) {
  const key = objectPath(path); if (!key) return fs.unlink(path);
  const { error } = await bucket().remove([key]); if (error) throw failure(error);
}
export async function rename(from, to) {
  if (!objectPath(from) && !objectPath(to)) return fs.rename(from, to);
  // 單一 object upload 是完整替換；先成功保存目標，再刪除暫存。
  const bytes = await readFile(from, undefined); await writeFile(to, bytes, undefined); await unlink(from);
}
