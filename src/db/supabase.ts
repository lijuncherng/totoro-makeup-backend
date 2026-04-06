/**
 * Supabase 客户端 - Cloudflare Workers 兼容版本
 */
import { createClient } from '@supabase/supabase-js';
import type { Env } from '../types/env.js';

type AnySupabaseClient = ReturnType<typeof createClient<any, 'public', any>>;

let supabaseInstance: AnySupabaseClient | null = null;

export function getSupabase(env?: Env): AnySupabaseClient {
  // 在 Cloudflare Workers 环境中使用 env
  if (env?.SUPABASE_URL && env?.SUPABASE_SERVICE_ROLE_KEY) {
    return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  // 本地开发环境
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    if (!supabaseInstance) {
      supabaseInstance = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        }
      );
    }
    return supabaseInstance;
  }

  throw new Error('Supabase configuration missing');
}

/**
 * Express / 本地 Node 单例（与 getSupabase() 在配置齐全时为同一实例）
 * 未配置时运行时为 null（index.ts 会 exit）；类型写为非 null 以减少各路由判空
 */
export const supabase: AnySupabaseClient =
  typeof process !== 'undefined' &&
  process.env.SUPABASE_URL &&
  process.env.SUPABASE_SERVICE_ROLE_KEY
    ? getSupabase()
    : (null as unknown as AnySupabaseClient);
