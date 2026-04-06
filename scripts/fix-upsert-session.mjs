/**
 * 修复 upsert_session 函数：禁止更新 id 字段（避免外键约束冲突）
 * 用法: node scripts/fix-upsert-session.mjs
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tgxzonqqifaakjmbaiml.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRneHpvbnFxaWZhYWtqbWJhaW1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzk4MzYxMSwiZXhwIjoyMDg5NTU5NjExfQ.nd7Y-H0tWpIRvT8wxnrpZ-s5De6Tyq_RbW1cwNNdpyo';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const FIXED_SQL = `
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
  console.log('正在修复 upsert_session 函数...\n');
  const { data, error } = await supabase.rpc('exec_sql', { sql: FIXED_SQL });

  if (error) {
    // rpc exec_sql 可能不存在，尝试直接用 SQL 执行
    console.warn('rpc exec_sql 不可用，尝试 POSTGRES 端点...');
    // Supabase 直接执行 SQL 通常需要通过 pg_net 或其他方式
    // 换个方式：用 SQL 客户端连接
    console.log('请在 Supabase Dashboard -> SQL Editor 中执行以下 SQL:\n');
    console.log(FIXED_SQL);
    console.log('\n或者告诉我需要其他方式部署。');
    if (error) console.error('错误:', error);
    return;
  }

  console.log('✅ upsert_session 函数已修复！');
}

main().catch(console.error);
