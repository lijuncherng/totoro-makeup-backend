-- =============================================
-- 诊断 + 修复：user_balances 触发器导致的锁等待超时
-- 执行：Supabase SQL Editor -> Run
-- =============================================

-- ============================================================
-- 第一部分：诊断（先看有哪些触发器/锁）
-- ============================================================

-- 1. user_balances 上的触发器
SELECT '=== user_balances 触发器 ===' AS info;
SELECT
  t.tgname  AS trigger_name,
  p.proname AS function_name,
  CASE WHEN p.prosrc LIKE '%user_id%' THEN '⚠️ 包含 user_id（会报错）' ELSE 'OK' END AS note,
  pg_get_functiondef(p.oid) AS full_def
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE t.tgrelid = 'public.user_balances'::regclass
  AND NOT t.tgisinternal;  -- 排除内置触发器

-- 2. 当前阻塞的锁
SELECT '=== 当前未决锁 ===' AS info;
SELECT
  pid, state, query, wait_event_type, wait_event,
  EXTRACT(EPOCH FROM (NOW() - state_change))::int AS wait_seconds
FROM pg_stat_activity
WHERE wait_event_type IS NOT NULL
ORDER BY wait_seconds DESC;

-- ============================================================
-- 第二部分：修复
-- ============================================================

-- 3. 删除有问题/不需要的触发器
--    set_stu_number_from_session 触发器会导致：
--    a) BEFORE INSERT 时读 sessions 表，触发锁等待
--    b) 若函数内写了 user_id（user_balances 表无此列）→ 报错
--    卡密流程 atomic_redeem_card 会显式传入 stu_number，无需触发器补全
DO $$
DECLARE
  t_record RECORD;
BEGIN
  FOR t_record IN
    SELECT t.tgname, p.proname
    FROM pg_trigger t
    JOIN pg_proc p ON t.tgfoid = p.oid
    WHERE t.tgrelid = 'public.user_balances'::regclass
      AND NOT t.tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.user_balances', t_record.tgname);
    RAISE NOTICE '已删除触发器: %', t_record.tgname;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 4. 删除旧版函数（避免残留）
-- 先删除依赖该函数的触发器，再删除函数
DO $$
DECLARE
  t_record RECORD;
BEGIN
  FOR t_record IN
    SELECT t.tgname, t.tgrelid::regclass::text AS table_name
    FROM pg_trigger t
    JOIN pg_proc p ON t.tgfoid = p.oid
    WHERE p.proname = 'set_stu_number_from_session'
      AND NOT t.tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t_record.tgname, t_record.table_name);
    RAISE NOTICE '已删除触发器: % ON %', t_record.tgname, t_record.table_name;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS public.set_stu_number_from_session();

SELECT '=== 修复完成 ===' AS info;
