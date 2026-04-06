-- 双余额（补跑 TMC / 阳光跑 TSR）+ 消费扣次表
-- 在 Supabase SQL Editor 中整段执行一次即可

ALTER TABLE public.user_balances
  ADD COLUMN IF NOT EXISTS balance_sunrun INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.balance_transactions
  ADD COLUMN IF NOT EXISTS balance_kind VARCHAR(20);

ALTER TABLE public.recharge_cards
  ADD COLUMN IF NOT EXISTS card_kind VARCHAR(20) NOT NULL DEFAULT 'makeup';

CREATE TABLE IF NOT EXISTS public.balance_consumptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id VARCHAR(100) NOT NULL,
  kind VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_balance_consumptions_session ON public.balance_consumptions(session_id);

ALTER TABLE public.balance_consumptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role can manage balance_consumptions"
  ON public.balance_consumptions FOR ALL TO service_role USING (true) WITH CHECK (true);
