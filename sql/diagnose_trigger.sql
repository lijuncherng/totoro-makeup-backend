-- =============================================
-- 诊断：user_balances 触发器 + 锁等待
-- 执行：Supabase SQL Editor -> Run
-- =============================================

-- 1. 查 user_balances 上所有触发器
SELECT
  t.tgname  AS trigger_name,
  t.tgtype  AS trigger_type,
  t.tgenabled AS enabled,
  p.proname AS function_name,
  p.prosrc  AS function_body_preview,
  pg_get_functiondef(p.oid) AS full_function_def
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE t.tgrelid = 'public.user_balances'::regclass;

-- 2. 查 sessions 上的触发器（可能互相锁）
SELECT
  t.tgname, p.proname, pg_get_functiondef(p.oid) AS full_def
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE t.tgrelid = 'public.sessions'::regclass;

-- 3. 当前所有未决锁（诊断死锁）
SELECT
  pid, state, query, wait_event_type, wait_event,
  EXTRACT(EPOCH FROM (NOW() - state_change))::int AS seconds_in_state
FROM pg_stat_activity
WHERE wait_event_type IS NOT NULL
  AND datname = current_database()
ORDER BY seconds_in_state DESC;

-- 4. atomic_redeem_card 函数的完整性（是否完整部署）
SELECT pg_get_functiondef(oid) AS definition
FROM pg_proc
WHERE proname = 'atomic_redeem_card'
  AND pronamespace = 'public'::regnamespace;
