/**
 * Cloudflare Workers 环境变量类型定义
 */
export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY?: string;
  TOTORO_API_URL?: string;
  TOTORO_USER_AGENT?: string;
  ALLOWED_ORIGINS?: string;
  ENCRYPTION_KEY?: string;
}
