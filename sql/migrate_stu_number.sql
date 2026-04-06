-- =============================================
-- 迁移：用 stu_number 替换 session_id 作为用户标识
-- 在 Supabase SQL Editor 中执行一次即可
-- =============================================

-- 0. 若库里没有 balance_consumptions 表则先创建（与 fix-db 一致）
CREATE TABLE IF NOT EXISTS public.balance_consumptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id VARCHAR(100) NOT NULL,
  kind VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ
);
ALTER TABLE public.balance_consumptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage balance_consumptions"
  ON public.balance_consumptions FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage balance_consumptions"
  ON public.balance_consumptions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 1. user_balances 表：添加 stu_number 列和唯一索引
ALTER TABLE public.user_balances
  ADD COLUMN IF NOT EXISTS stu_number VARCHAR(50);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_balances_stu_number
  ON public.user_balances(stu_number)
  WHERE stu_number IS NOT NULL;

-- 2. balance_transactions 表：添加 stu_number 列
ALTER TABLE public.balance_transactions
  ADD COLUMN IF NOT EXISTS stu_number VARCHAR(50);

-- 3. balance_consumptions 表：添加 stu_number 列
ALTER TABLE public.balance_consumptions
  ADD COLUMN IF NOT EXISTS stu_number VARCHAR(50);

-- 4. makeup_tasks 表：添加 stu_number 列（如果还没有）
ALTER TABLE public.makeup_tasks
  ADD COLUMN IF NOT EXISTS stu_number VARCHAR(50);

-- 5. 迁移 user_balances 现有数据（session_id -> stu_number）
-- sessions.id 可能是 UUID，session_id 是 VARCHAR，需统一类型比较
UPDATE public.user_balances ub
SET stu_number = s.stu_number
FROM public.sessions s
WHERE ub.session_id = s.id::text
  AND ub.stu_number IS NULL;

-- 6. 迁移 balance_transactions 现有数据
UPDATE public.balance_transactions bt
SET stu_number = s.stu_number
FROM public.sessions s
WHERE bt.session_id = s.id::text
  AND bt.stu_number IS NULL;

-- 7. 迁移 balance_consumptions 现有数据
UPDATE public.balance_consumptions bc
SET stu_number = s.stu_number
FROM public.sessions s
WHERE bc.session_id = s.id::text
  AND bc.stu_number IS NULL;

-- 8. 迁移 makeup_tasks 现有数据
UPDATE public.makeup_tasks mt
SET stu_number = s.stu_number
FROM public.sessions s
WHERE mt.user_id = s.id::text
  AND mt.stu_number IS NULL;

-- 9. 重建 RLS 策略（支持 stu_number 查询）
DROP POLICY IF EXISTS "Anyone can read user_balances" ON public.user_balances;
DROP POLICY IF EXISTS "Service role can manage user_balances" ON public.user_balances;
CREATE POLICY "Anyone can read user_balances" ON public.user_balances
  FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Service role can manage user_balances" ON public.user_balances
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can read balance_transactions" ON public.balance_transactions;
DROP POLICY IF EXISTS "Service role can manage balance_transactions" ON public.balance_transactions;
CREATE POLICY "Anyone can read balance_transactions" ON public.balance_transactions
  FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Service role can manage balance_transactions" ON public.balance_transactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
