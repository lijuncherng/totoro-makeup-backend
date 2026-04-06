-- ================================================================
-- 迁移脚本：阳光跑 / 补跑分离余额
-- 执行方式：Supabase -> SQL Editor -> New Query -> Run
-- ================================================================

-- 1. 给 user_balances 新增 balance_sunrun 列（已有记录不受影响）
ALTER TABLE public.user_balances
  ADD COLUMN IF NOT EXISTS balance_sunrun INTEGER NOT NULL DEFAULT 0;

-- 2. 给 recharge_cards 新增 card_kind 列（已有记录默认补跑）
ALTER TABLE public.recharge_cards
  ADD COLUMN IF NOT EXISTS card_kind VARCHAR(20) NOT NULL DEFAULT 'makeup';

-- 3. 给 balance_transactions 新增 balance_kind 列（已有记录默认补跑）
ALTER TABLE public.balance_transactions
  ADD COLUMN IF NOT EXISTS balance_kind VARCHAR(20) NOT NULL DEFAULT 'makeup';

-- 4. 新增消费流水表（记录阳光跑扣次 reserve/refund）
CREATE TABLE IF NOT EXISTS public.balance_consumptions (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id  VARCHAR(100) NOT NULL,
  kind        VARCHAR(20) NOT NULL DEFAULT 'makeup',  -- makeup | sunrun
  status      VARCHAR(20) NOT NULL DEFAULT 'active',  -- active | completed | refunded
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  refunded_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_consumptions_session ON public.balance_consumptions(session_id);
CREATE INDEX IF NOT EXISTS idx_consumptions_status  ON public.balance_consumptions(status);

-- 5. RLS（行级安全）
ALTER TABLE public.balance_consumptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read consumptions" ON public.balance_consumptions
  FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Service role manages consumptions" ON public.balance_consumptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ================================================================
-- 验证
-- ================================================================
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'user_balances' ORDER BY ordinal_position;
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'recharge_cards' ORDER BY ordinal_position;
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'balance_transactions' ORDER BY ordinal_position;
