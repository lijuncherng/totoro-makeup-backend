/**
 * 使用 pg 直连 Supabase 并修复 upsert_session 函数
 * 用法: node scripts/fix-upsert-session-pg.mjs
 */
import pg from 'pg';
const { Client } = pg;

const SUPABASE_HOST = 'aws-0-ap-northeast-1.pooler.supabase.com';
const SUPABASE_PORT = 6543;
const SUPABASE_USER = 'postgres';
const SUPABASE_DB = 'postgres';
// 从 SUPABASE_SERVICE_ROLE_KEY 中提取 project ref 作为密码
const SUPABASE_PROJECT_REF = 'tgxzonqqifaakjmbaiml';

const FIXED_SQL = `
-- =============================================
-- 创建原子 upsert 会话函数（解决 delete+insert 竞态问题）
-- 同一学号只会有一条记录，新登录自动替换旧会话
-- =============================================
-- 修复：禁止更新 id 字段（sessions.id 是 makeup_tasks.user_id 的外键主键）
-- =============================================
CREATE OR REPLACE FUNCTION public.upsert_session(
  p_id UUID,
  p_campus_id VARCHAR(100),
  p_school_id VARCHAR(100),
  p_stu_number VARCHAR(100),
  p_token TEXT,
  p_phone_number VARCHAR(50),
  p_sex VARCHAR(10),
  p_expires_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 写入/更新会话，同一学号只保留最新一条
  INSERT INTO public.sessions (id, campus_id, school_id, stu_number, token, phone_number, sex, expires_at)
  VALUES (p_id, p_campus_id, p_school_id, p_stu_number, p_token, p_phone_number, p_sex, p_expires_at)
  ON CONFLICT (stu_number) DO UPDATE SET
    -- 注意：禁止更新 id！sessions.id 是 makeup_tasks.user_id 的外键主键，
    -- 任何 UPDATE sessions SET id = ... 都会触发外键约束冲突。
    campus_id = EXCLUDED.campus_id,
    school_id = EXCLUDED.school_id,
    token = EXCLUDED.token,
    phone_number = EXCLUDED.phone_number,
    sex = EXCLUDED.sex,
    expires_at = EXCLUDED.expires_at,
    created_at = NOW();

  -- 自动建档：扫码登录时确保 user_balances 记录存在（已有余额不覆盖）
  INSERT INTO public.user_balances (stu_number, session_id, balance, balance_sunrun)
  VALUES (p_stu_number, p_id, 0, 0)
  ON CONFLICT (stu_number) DO NOTHING;
END;
$$;
`;

async function main() {
  // Try to get password from environment or .env file
  let password = process.env.SUPABASE_DB_PASSWORD;
  if (!password) {
    try {
      const fs = await import('fs');
      const env = fs.default.readFileSync('.env', 'utf8');
      const m = env.match(/SUPABASE_DB_PASSWORD\s*=\s*(.+)/m);
      if (m) password = m[1].trim();
    } catch {}
  }

  // Supabase 连接使用特殊的连接池格式
  // 格式: postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
  const connectionString = `postgresql://postgres.${SUPABASE_PROJECT_REF}:${password || ''}@${SUPABASE_HOST}:${SUPABASE_PORT}/${SUPABASE_DB}`;

  console.log('正在连接 Supabase PostgreSQL...\n');
  console.log(`Host: ${SUPABASE_HOST}:${SUPABASE_PORT}`);
  console.log(`Database: ${SUPABASE_DB}`);

  if (!password) {
    console.error('\n❌ 未找到数据库密码。请在 .env 文件中添加 SUPABASE_DB_PASSWORD 配置。');
    console.error('   或者手动在 Supabase Dashboard -> SQL Editor 中执行以下 SQL:\n');
    console.log(FIXED_SQL);
    return;
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    console.log('✅ 连接成功！\n');
    console.log('正在修复 upsert_session 函数...\n');
    await client.query(FIXED_SQL);
    console.log('✅ upsert_session 函数已修复！\n');

    // 验证函数内容
    const { rows } = await client.query(`
      SELECT pg_get_functiondef(oid) as definition
      FROM pg_proc
      WHERE proname = 'upsert_session'
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    `);
    if (rows[0]) {
      const def = rows[0].definition;
      if (def.includes('id = EXCLUDED.id')) {
        console.error('❌ 函数仍包含 id = EXCLUDED.id，修复可能未生效！');
      } else if (def.includes('-- 注意：禁止更新 id')) {
        console.log('✅ 函数验证通过：id 字段未被更新。');
      }
    }
  } catch (err) {
    console.error('❌ 执行失败:', err.message);
    console.error('\n请手动在 Supabase Dashboard -> SQL Editor 中执行以下 SQL:\n');
    console.log(FIXED_SQL);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
