import { createClient } from '@supabase/supabase-js';

export function cloudClient(token = '') {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) throw new Error('Supabase 設定不完整');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      fetch: (url, options) => fetch(url, { ...options, signal: options?.signal ?? AbortSignal.timeout(20000) }) },
  });
}
