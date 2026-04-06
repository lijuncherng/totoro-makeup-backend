-- =============================================
-- 龙猫补跑系统 - 数据库修复补丁
-- 修复：user_balances 表缺失 + balance_sunrun 列缺失
-- 执行方式：Supabase SQL Editor → Run
-- =============================================

-- 1. 创建 user_balances 表（补跑+阳光跑双余额）
CREATE TABLE IF NOT EXISTS public.user_balances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id VARCHAR(100) UNIQUE NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  balance_sunrun INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_balances_session ON public.user_balances(session_id);

-- 2. 创建 balance_transactions 表（余额流水）
CREATE TABLE IF NOT EXISTS public.balance_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  balance_kind VARCHAR(20) DEFAULT 'makeup',
  description TEXT,
  task_id VARCHAR(100),
  card_code VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_balance_tx_session ON public.balance_transactions(session_id);

-- 3. 给 user_profiles 加 balance_sunrun 列（阳光跑余额，与 self-service 兼容）
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS balance_sunrun INTEGER NOT NULL DEFAULT 0;

-- 4. 给 transactions 表加 balance_kind 列（双余额支持）
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS balance_kind VARCHAR(20) DEFAULT 'makeup';

-- 5. recharge_cards 加 card_kind 列（整行复制，勿截断；末尾必须是 DEFAULT 'makeup';）
ALTER TABLE public.recharge_cards ADD COLUMN IF NOT EXISTS card_kind VARCHAR(20) NOT NULL DEFAULT 'makeup';

-- 6. 启用 RLS（如果没有）
ALTER TABLE public.user_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.balance_transactions ENABLE ROW LEVEL SECURITY;

-- 7. RLS 策略
DROP POLICY IF EXISTS "Anyone can read user_balances" ON public.user_balances;
DROP POLICY IF EXISTS "Service role can manage user_balances" ON public.user_balances;
DROP POLICY IF EXISTS "Anyone can read balance_transactions" ON public.balance_transactions;
DROP POLICY IF EXISTS "Service role can manage balance_transactions" ON public.balance_transactions;

CREATE POLICY "Anyone can read user_balances" ON public.user_balances FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Service role can manage user_balances" ON public.user_balances FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can read balance_transactions" ON public.balance_transactions FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Service role can manage balance_transactions" ON public.balance_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);
