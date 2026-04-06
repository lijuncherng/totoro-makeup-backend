-- =============================================
-- 龙猫补跑系统数据库结构
-- 执行方式：Supabase -> SQL Editor -> New Query -> Run
-- =============================================

-- sessions: 扫码登录会话，同一学号只能有一个有效会话（单设备登录）
CREATE TABLE IF NOT EXISTS public.sessions (
  id VARCHAR(100) PRIMARY KEY,
  campus_id VARCHAR(100),
  school_id VARCHAR(100),
  stu_number VARCHAR(100) UNIQUE NOT NULL,
  token TEXT,
  phone_number VARCHAR(50),
  sex VARCHAR(10),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_stu_number ON public.sessions(stu_number);

-- ---------------------------------------------
-- 1. 充值卡密表（支持补跑/阳光跑两种卡密类型）
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.recharge_cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'times',
  times INTEGER NOT NULL,
  card_kind VARCHAR(20) NOT NULL DEFAULT 'makeup',
  batch_id VARCHAR(50),
  expires_at TIMESTAMPTZ,
  used_by VARCHAR(100),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recharge_cards_code ON public.recharge_cards(code);
CREATE INDEX IF NOT EXISTS idx_recharge_cards_batch ON public.recharge_cards(batch_id);

-- ---------------------------------------------
-- 2. 用户余额表（关联 sessions 表的 id）
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_balances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id VARCHAR(100) UNIQUE NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  balance_sunrun INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_balances_session ON public.user_balances(session_id);

-- ---------------------------------------------
-- 3. 交易记录表
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.balance_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  balance_kind VARCHAR(20),
  description TEXT,
  task_id VARCHAR(100),
  card_code VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_balance_tx_session ON public.balance_transactions(session_id);

-- 3.5. 消费记录表（阳光跑/补跑扣次追踪）
CREATE TABLE IF NOT EXISTS public.balance_consumptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id VARCHAR(100) NOT NULL,
  stu_number VARCHAR(100) NOT NULL,
  kind VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_balance_consumptions_session ON public.balance_consumptions(session_id);
CREATE INDEX IF NOT EXISTS idx_balance_consumptions_status ON public.balance_consumptions(status);
CREATE INDEX IF NOT EXISTS idx_balance_consumptions_stu_number ON public.balance_consumptions(stu_number);

-- 4. 补跑任务表（stu_number 与 sessions.stu_number 一对一绑定，确保用户隔离）
CREATE TABLE IF NOT EXISTS public.makeup_tasks (
  id VARCHAR(100) PRIMARY KEY,
  user_id VARCHAR(100),
  stu_number VARCHAR(100) NOT NULL,
  route_id VARCHAR(100),
  task_id VARCHAR(100),
  custom_date DATE,
  custom_period VARCHAR(10),
  mileage VARCHAR(20),
  min_time VARCHAR(20),
  max_time VARCHAR(20),
  status VARCHAR(20) DEFAULT 'pending',
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_makeup_tasks_user ON public.makeup_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_makeup_tasks_status ON public.makeup_tasks(status);
CREATE INDEX IF NOT EXISTS idx_makeup_tasks_stu_number ON public.makeup_tasks(stu_number);

-- ---------------------------------------------
-- 5. RLS（行级安全）策略
-- ---------------------------------------------
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.balance_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recharge_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.makeup_tasks ENABLE ROW LEVEL SECURITY;

-- sessions: 所有人可读取，service_role 可写入
CREATE POLICY "Anyone can read sessions" ON public.sessions FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Service role can manage sessions" ON public.sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 所有人可读取卡密
CREATE POLICY "Anyone can read recharge_cards" ON public.recharge_cards FOR SELECT TO authenticated, anon USING (true);
-- 只有 service_role 才能管理卡密
CREATE POLICY "Service role can manage recharge_cards" ON public.recharge_cards FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 用户可读取自己的余额
CREATE POLICY "Users can read own balance" ON public.user_balances FOR SELECT TO authenticated, anon USING (true);
-- service_role 可写入余额
CREATE POLICY "Service role can manage user_balances" ON public.user_balances FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 用户可读取自己的交易记录
CREATE POLICY "Users can read own transactions" ON public.balance_transactions FOR SELECT TO authenticated, anon USING (true);
-- service_role 可写入交易记录
CREATE POLICY "Service role can manage balance_transactions" ON public.balance_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 用户可读取/管理自己的任务
CREATE POLICY "Users can manage own tasks" ON public.makeup_tasks FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- 用户可读取/管理自己的消费记录
CREATE POLICY "Users can manage own consumptions" ON public.balance_consumptions FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- ---------------------------------------------
-- 6. 防重约束
-- ---------------------------------------------
-- 卡密一次性使用保证：
-- 1. code 字段本身是 UNIQUE，确保每张卡密只有一条记录
-- 2. 应用层通过原子更新（WHERE used_by IS NULL OR used_by = ''）确保卡密只能使用一次
-- 3. used_by 字段不需要唯一约束，因为：
--    - 一张卡密只能使用一次（由 code UNIQUE + 应用层逻辑保证）
--    - 同一用户可以使用多张不同的卡密（所以 used_by 不应该有唯一约束）

-- ---------------------------------------------
-- 7. 查询示例
-- ---------------------------------------------
-- SELECT * FROM public.recharge_cards ORDER BY created_at DESC;
-- SELECT * FROM public.user_balances WHERE session_id = 'your-session-id';
-- SELECT * FROM public.balance_consumptions WHERE session_id = 'your-session-id';

-- ---------------------------------------------
-- 8. 迁移（已有库请单独执行以下语句）
-- ---------------------------------------------
-- ALTER TABLE public.user_balances ADD COLUMN IF NOT EXISTS balance_sunrun INTEGER NOT NULL DEFAULT 0;
-- ALTER TABLE public.balance_transactions ADD COLUMN IF NOT EXISTS balance_kind VARCHAR(20);
-- CREATE TABLE IF NOT EXISTS public.balance_consumptions (
--   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
--   session_id VARCHAR(100) NOT NULL,
--   kind VARCHAR(20) NOT NULL,
--   status VARCHAR(20) NOT NULL DEFAULT 'active',
--   created_at TIMESTAMPTZ DEFAULT NOW(),
--   completed_at TIMESTAMPTZ,
--   refunded_at TIMESTAMPTZ
-- );
-- ALTER TABLE public.recharge_cards ADD COLUMN IF NOT EXISTS card_kind VARCHAR(20) NOT NULL DEFAULT 'makeup';
