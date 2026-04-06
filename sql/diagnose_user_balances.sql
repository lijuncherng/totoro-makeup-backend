-- =============================================
-- 诊断：查看 user_balances 表的 RLS 策略详情
-- =============================================

-- 1. 查看 user_balances 表的所有约束和触发器
SELECT 
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.user_balances'::regclass;

-- 2. 查看 user_balances 表的触发器
SELECT 
  tgname AS trigger_name,
  pg_get_triggerdef(oid) AS trigger_definition
FROM pg_trigger
WHERE tgrelid = 'public.user_balances'::regclass;

-- 3. 查看 user_balances 表的 RLS 策略
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policy
WHERE polrelid = 'public.user_balances'::regclass;

-- 4. 查看表的所有列
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'user_balances'
ORDER BY ordinal_position;
