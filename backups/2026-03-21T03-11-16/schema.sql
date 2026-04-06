-- =============================================
-- 龙猫补跑系统数据库备份
-- 备份时间: 2026-03-21T03:11:16.686Z
-- 项目: https://tgxzonqqifaakjmbaiml.supabase.co
-- =============================================

-- =============================================
-- 龙猫补跑系统数据库结构
-- 执行方式：Supabase -> SQL Editor -> New Query -> Run
-- =============================================

-- ---------------------------------------------
-- 0. sessions 表（扫码登录后存储会话）
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.sessions (
  id VARCHAR(100) PRIMARY KEY,
  campus_id VARCHAR(100),
  school_id VARCHAR(100),
  stu_number VARCHAR(100),
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

-- ---------------------------------------------
-- 3.5. 消费记录表（阳光跑/补跑扣次追踪）
-- ---------------------------------------------
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
CREATE INDEX IF NOT EXISTS idx_balance_consumptions_status ON public.balance_consumptions(status);

-- ---------------------------------------------
-- 4. 补跑任务表
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.makeup_tasks (
  id VARCHAR(100) PRIMARY KEY,
  user_id VARCHAR(100),
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


-- =============================================
-- 数据（可选择性导入）
-- =============================================

-- sessions: 12 条

INSERT INTO public.sessions (id, campus_id, school_id, stu_number, token, phone_number, sex, created_at, expires_at) VALUES ('235cee44-a73c-4a6b-b371-e4f2ee4ab314', 'QJXQ', 'cqifs', '202413006775', 'APPxEWwxY69dq3HzjE+F8cKWWtMMBBE/o/KattOXq+EARh/sdhhH6Ba2zXF/pRbeKAMlXco43EWgXh6GXIHSVo230liY4kB7F4i', '13038323154', '男', '2026-03-20T17:01:09.142142+00:00', '2026-04-19T17:01:08.117+00:00');
INSERT INTO public.sessions (id, campus_id, school_id, stu_number, token, phone_number, sex, created_at, expires_at) VALUES ('e4c74798-b9d3-4102-a7ca-349de6abfaff', 'QJXQ', 'cqifs', '202413006775', 'APPBEHWMvZDYxiZ8XuLj+rQ8SEim/dMOFgOuSYvINln8iSt+KhdKQE5lMT2lLLfHqs7r/Ujxp7huCpFr+qt45YmSqxTD2D1M+Lv', '13038323154', '男', '2026-03-20T17:40:13.936772+00:00', '2026-04-19T17:40:13.513+00:00');
INSERT INTO public.sessions (id, campus_id, school_id, stu_number, token, phone_number, sex, created_at, expires_at) VALUES ('b8f28e32-fb1c-4b69-986e-45b599c28b2e', 'QJXQ', 'cqifs', '202413006775', 'APP//LkVkYhh3X/fzNOFmU92fK3dxmPzo6ta5+yOxl5x80o67wgq0RAo9wN8/IvXPh6xNFWIKGZ58UkMndolIrGlakquQIvw5y4', '13038323154', '男', '2026-03-20T19:28:39.903923+00:00', '2026-04-19T19:28:38.569+00:00');
INSERT INTO public.sessions (id, campus_id, school_id, stu_number, token, phone_number, sex, created_at, expires_at) VALUES ('8b179ea7-5fa0-4f8d-819f-48b3f82f5c93', 'QJXQ', 'cqifs', '202413006775', 'APPpmSITPFnJaVrm3l1iwHHAJhK4xf27C8K5CjFvrj79VxZPCPwnnMBAK/OVHmJ7aIacIwuxRo4XQZeI23g18XJjLEEAZPCdtlp', '13038323154', '男', '2026-03-20T22:21:50.826174+00:00', '2026-04-19T22:21:50.296+00:00');
INSERT INTO public.sessions (id, campus_id, school_id, stu_number, token, phone_number, sex, created_at, expires_at) VALUES ('025f70a4-e134-4636-bc69-ad55d8bf36c7', 'QJXQ', 'cqifs', '202413006775', 'APPE/RFGbC8gsJPpCVbWxLZV2Wwj1NewYiFiDXXBhe2mhOHxFKMx0yAhuTnVZVnmI+yIu8en2mKvkfg15b2trVzhh9cD1XkwlJi', '13038323154', '男', '2026-03-20T23:11:07.821537+00:00', '2026-04-19T23:11:08.484+00:00');
INSERT INTO public.sessions (id, campus_id, school_id, stu_number, token, phone_number, sex, created_at, expires_at) VALUES ('dbe99d2d-8ee6-4c6e-b578-852034238d55', 'QJXQ', 'cqifs', '202413006775', 'APP00cEVcnUZgCMhprL+CujjEmtlNmlGTsVVqifBGYLx1b2urVUf+37iYegMQWKsWRb3A9UKDgutQcYDNHjwXbhPR9cD1XkwlJi', '13038323154', '男', '2026-03-21T00:17:13.04977+00:00', '2026-04-20T00:17:12.122+00:00');
INSERT INTO public.sessions (id, campus_id, school_id, stu_number, token, phone_number, sex, created_at, expires_at) VALUES ('adad157a-de63-4aa3-a1a6-a3d4b2009c62', 'QJXQ', 'cqifs', '202413006775', 'APPt6Sg/i5KG7Q8QdEKgjkNaO9QS52LZX6WJJlzvumIClono6aa2ilCFLqzbibbNu5u9kaGmeKlrzmBbZfNywDPd3bKvNXaigvv', '13038323154', '男', '2026-03-21T00:50:41.89886+00:00', '2026-04-20T00:50:37.443+00:00');
INSERT INTO public.sessions (id, campus_id, school_id, stu_number, token, phone_number, sex, created_at, expires_at) VALUES ('7cb30c56-7eba-4dcb-80b0-08f8ed2f5578', 'QJXQ', 'cqifs', '202413006775', 'APPt6Sg/i5KG7Q8QdEKgjkNaO9QS52LZX6WJJlzvumIClono6aa2ilCFLqzbibbNu5u9kaGmeKlrzmBbZfNywDPd3bKvNXaigvv', '13038323154', '男', '2026-03-21T01:11:28.954865+00:00', '2026-04-20T01:11:24.61+00:00');
INSERT INTO public.sessions (id, campus_id, school_id, stu_number, token, phone_number, sex, created_at, expires_at) VALUES ('6829cb32-4a34-4265-9ecb-df10cefccb97', 'QJXQ', 'cqifs', '202413006775', 'APPt6Sg/i5KG7Q8QdEKgjkNaO9QS52LZX6WJJlzvumIClono6aa2ilCFLqzbibbNu5u9kaGmeKlrzmBbZfNywDPd3bKvNXaigvv', '13038323154', '男', '2026-03-21T01:11:31.083152+00:00', '2026-04-20T01:11:27.174+00:00');
INSERT INTO public.sessions (id, campus_id, school_id, stu_number, token, phone_number, sex, created_at, expires_at) VALUES ('205f8de3-d599-4442-8f55-2d582c79ba41', 'QJXQ', 'cqifs', '202413006775', 'APPt6Sg/i5KG7Q8QdEKgjkNaO9QS52LZX6WJJlzvumIClono6aa2ilCFLqzbibbNu5u9kaGmeKlrzmBbZfNywDPd3bKvNXaigvv', '13038323154', '男', '2026-03-21T01:12:47.814657+00:00', '2026-04-20T01:12:43.512+00:00');
INSERT INTO public.sessions (id, campus_id, school_id, stu_number, token, phone_number, sex, created_at, expires_at) VALUES ('9bde535a-228b-42c5-baad-6cb982a17ad9', 'QJXQ', 'cqifs', '202413006775', 'APPt6Sg/i5KG7Q8QdEKgjkNaO9QS52LZX6WJJlzvumIClono6aa2ilCFLqzbibbNu5u9kaGmeKlrzmBbZfNywDPd3bKvNXaigvv', '13038323154', '男', '2026-03-21T01:12:48.55637+00:00', '2026-04-20T01:12:44.233+00:00');
INSERT INTO public.sessions (id, campus_id, school_id, stu_number, token, phone_number, sex, created_at, expires_at) VALUES ('0f5674a4-1160-4517-87b3-79cce0e44200', 'QJXQ', 'cqifs', '202413006775', 'APPt6Sg/i5KG7Q8QdEKgjkNaO9QS52LZX6WJJlzvumIClono6aa2ilCFLqzbibbNu5u9kaGmeKlrzmBbZfNywDPd3bKvNXaigvv', '13038323154', '男', '2026-03-21T01:12:50.048415+00:00', '2026-04-20T01:12:46.156+00:00');

-- recharge_cards: 81 条

INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('4523410a-e172-447a-88c9-1740fa08f511', 'TMC-E4NP-M8U6-VPF5-51', 'times', 5, '2027-03-20T14:36:30.767+00:00', 'MMZ05FAN-8DC', NULL, NULL, '2026-03-20T14:36:32.082758+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('ab727412-fa90-4321-b6cf-b70fab3c72e1', 'TMC-LM57-SVFP-QMDF-1C', 'times', 5, '2027-03-20T14:36:47.588+00:00', 'MMZ05S9W-8QF', NULL, NULL, '2026-03-20T14:36:48.115457+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('2589fa71-0007-4983-b787-f6f8ed50f2a4', 'TMC-87RT-D2JN-PUTN-C5', 'times', 5, '2027-03-20T14:39:04.802+00:00', 'MMZ08Q5E-HSC', NULL, NULL, '2026-03-20T14:39:05.527736+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('3c8cc029-7fdd-4047-9e23-956f1e4a9b54', 'TMC-TLXJ-THLU-HU6P-43', 'times', 5, '2027-03-20T16:00:53.007+00:00', 'MMZ35XCF-HSC', NULL, NULL, '2026-03-20T16:00:53.854385+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('cd933c70-9c76-4fa9-912f-8a93f5ea1ed7', 'TMC-WJWC-X8YP-HASY-14', 'times', 5, '2027-03-20T16:15:59.532+00:00', 'MMZ3PCTN-Y87', NULL, NULL, '2026-03-20T16:16:00.586725+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('d43d50af-491a-4078-9533-ca744c3a51fa', 'TSR-JW4T-ZWHE-3BQ2-BB', 'times', 5, '2027-03-20T16:16:01.505+00:00', 'MMZ3PECH-FT8', NULL, NULL, '2026-03-20T16:16:01.178962+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('f1cee2f6-6832-4199-beef-1f4943a892a3', 'TSR-S35J-VRAB-LA9X-FF', 'once', 1, '2027-03-20T17:27:29.155+00:00', 'MMZ69APV-Q5A', NULL, NULL, '2026-03-20T17:27:30.001345+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('3417d44a-ae15-4b39-8b19-a474f05ad569', 'TSR-TCF3-CP5R-J2F5-23', 'times', 5, '2027-03-20T17:42:39.619+00:00', 'MMZ6ST8J-E4U', NULL, NULL, '2026-03-20T17:42:40.06127+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('0f46acab-d03e-4bb2-830e-5ae8da14d693', 'TSR-EWNQ-GZXU-6874-5F', 'times', 5, '2027-03-20T17:42:39.619+00:00', 'MMZ6ST8J-E4U', NULL, NULL, '2026-03-20T17:42:40.06127+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('a70855f3-674f-4ee4-8e65-34f7dbe46234', 'TSR-2FBS-ZBJR-K7TZ-5D', 'times', 5, '2027-03-20T17:42:39.619+00:00', 'MMZ6ST8J-E4U', NULL, NULL, '2026-03-20T17:42:40.06127+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('77090028-8a05-4241-be15-5f3edaf53e4b', 'TSR-GXET-QF5J-84ER-72', 'times', 5, '2027-03-20T17:42:39.619+00:00', 'MMZ6ST8J-E4U', NULL, NULL, '2026-03-20T17:42:40.06127+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('c8e98b57-0fb2-4b2c-919a-35625bff33b6', 'TSR-64EH-RUMS-M2F2-D3', 'times', 5, '2027-03-20T17:42:39.619+00:00', 'MMZ6ST8J-E4U', NULL, NULL, '2026-03-20T17:42:40.06127+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('c431418c-fda8-45ba-9a84-456bbe5f1a8b', 'TMC-N35L-RSBA-MA9A-80', 'times', 5, '2027-03-20T17:42:53.057+00:00', 'MMZ6T3LT-NES', NULL, NULL, '2026-03-20T17:42:53.067328+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('68a3326c-93d9-4ef5-8546-e0f5201a35c3', 'TMC-R3HN-LAUH-NWBD-ED', 'times', 5, '2027-03-20T17:42:53.057+00:00', 'MMZ6T3LT-NES', NULL, NULL, '2026-03-20T17:42:53.067328+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('949e6753-f97a-4ebc-81e8-01554a9bba93', 'TMC-DHAR-JVLF-SB6U-11', 'times', 5, '2027-03-20T17:42:53.057+00:00', 'MMZ6T3LT-NES', NULL, NULL, '2026-03-20T17:42:53.067328+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('41ee0f61-8494-4d65-babc-92463d718690', 'TMC-TKD9-R7HY-L4H2-57', 'times', 5, '2027-03-20T17:42:53.057+00:00', 'MMZ6T3LT-NES', NULL, NULL, '2026-03-20T17:42:53.067328+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('b1ea5f8c-10b9-4290-853b-95c2f18992aa', 'TMC-BTUM-6UP9-CEJP-D7', 'times', 5, '2027-03-20T17:42:53.057+00:00', 'MMZ6T3LT-NES', NULL, NULL, '2026-03-20T17:42:53.067328+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('b43ce955-b2cd-45cc-b3da-0f42f28cb09a', 'TMC-MPY2-996L-3NEM-13', 'times', 3, NULL, 'TEST01', NULL, NULL, '2026-03-20T18:09:39.002063+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('e65a8d69-5537-46f5-9229-c18c85c8306e', 'TMC-BCLC-QK3Y-9AYH-59', 'times', 5, NULL, 'TEST01', NULL, NULL, '2026-03-20T18:09:39.002063+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('a5f04772-547c-44df-a8f5-2ddb4338efb0', 'TMC-7ZRF-HAK6-TWB5-74', 'times', 10, NULL, 'TEST01', NULL, NULL, '2026-03-20T18:09:39.002063+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('d06266d8-583f-46bb-8b0a-9c9d7063fa4b', 'TSR-Y7L6-7P7Z-ZNUJ-63', 'times', 3, NULL, 'TEST02', NULL, NULL, '2026-03-20T18:09:39.002063+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('de0f1356-4a65-4e88-ba18-b4d0ece1fa04', 'TSR-F93R-B2ZS-AMAC-30', 'times', 5, NULL, 'TEST02', NULL, NULL, '2026-03-20T18:09:39.002063+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('0869a564-bd91-4670-a13f-9a7358ccc006', 'TSR-JZC5-BV7D-MKB7-1E', 'times', 10, NULL, 'TEST02', NULL, NULL, '2026-03-20T18:09:39.002063+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('f6af85f8-0253-4db1-bf1a-c746a849eeed', 'TMC-VP47-UWMC-WMVT-D3', 'once', 1, NULL, 'TEST-BATCH-001', NULL, NULL, '2026-03-20T22:10:05.710936+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('7510f5e5-ab92-4d24-b20b-c335bf895768', 'TMC-TCRJ-TEUU-LU5R-1C', 'once', 1, NULL, 'TEST-BATCH-001', NULL, NULL, '2026-03-20T22:10:05.710936+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('24454e80-264c-4482-8584-e71770af7362', 'TMC-VXMU-9ZS5-RN2U-2C', 'once', 1, NULL, 'TEST-BATCH-001', NULL, NULL, '2026-03-20T22:10:05.710936+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('a29862e8-716a-4163-9fd7-ef3310aa174e', 'TMC-KGXT-EHJD-C8TK-2B', 'once', 1, NULL, 'TEST-BATCH-001', NULL, NULL, '2026-03-20T22:10:05.710936+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('47fd8dc6-dad0-4210-9aa9-6948e9c8d53d', 'TMC-6VWX-2C5P-4A9Z-C4', 'once', 1, NULL, 'TEST-BATCH-001', NULL, NULL, '2026-03-20T22:10:05.710936+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('d3c9dc2e-39d9-4b83-aa14-f26128dd1c9e', 'TSR-BTFD-56WA-3DWM-37', 'once', 1, NULL, 'TEST-BATCH-002', NULL, NULL, '2026-03-20T22:10:05.710936+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('be541b12-62f3-4977-a5af-b0d7bd04a3a0', 'TSR-A7MW-8X4Q-P9J4-CC', 'once', 1, NULL, 'TEST-BATCH-002', NULL, NULL, '2026-03-20T22:10:05.710936+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('2c96fb41-33aa-4bb8-8086-5966c2a846ad', 'TSR-V36R-T7FK-K43C-90', 'once', 1, NULL, 'TEST-BATCH-002', NULL, NULL, '2026-03-20T22:10:05.710936+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('058df857-dd02-42ae-a802-39b51e3be689', 'TSR-3VL6-3FH8-8HKU-64', 'once', 1, NULL, 'TEST-BATCH-002', NULL, NULL, '2026-03-20T22:10:05.710936+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('01f1e788-d483-4c5c-bf2d-08e71fbb148d', 'TSR-R6GF-FF8Z-VWWS-B3', 'once', 1, NULL, 'TEST-BATCH-002', NULL, NULL, '2026-03-20T22:10:05.710936+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('d5acd30a-4498-4c75-a2be-59a1208ab4ca', 'TMC-JT5H-ZSPB-QFMN-07', 'once', 1, NULL, 'TEST-BATCH-003', NULL, NULL, '2026-03-20T22:17:39.958158+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('f048a1fc-86a2-4a4d-b37c-95d587178720', 'TMC-RZ9E-KKRL-VX8P-E5', 'once', 1, NULL, 'TEST-BATCH-003', NULL, NULL, '2026-03-20T22:17:39.958158+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('ee7f2c1b-4be5-4cd5-a8ee-1eb4ac77ef69', 'TMC-NMKQ-ZVUV-2DZU-32', 'times', 5, '2027-03-20T13:55:54.366057+00:00', 'manual-batch-1', NULL, NULL, '2026-03-20T13:55:54.366057+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('6d55dee1-2f8a-4832-aa4f-e4672958e12b', 'TMC-L2F3-M83X-53P2-D6', 'once', 1, '2027-03-20T22:50:35.934+00:00', 'MMZHSTNI-Y3D', NULL, NULL, '2026-03-20T22:50:35.283562+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('5ad0f320-698c-4693-aae0-3556461799ca', 'TMC-ZP2N-E6G9-3LU9-E9', 'once', 1, '2027-03-20T22:50:35.934+00:00', 'MMZHSTNI-Y3D', NULL, NULL, '2026-03-20T22:50:35.283562+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('a2027f7e-986f-4d48-9eab-74b07892c722', 'TMC-ENKA-H534-EPLN-9C', 'once', 1, '2027-03-20T22:50:35.934+00:00', 'MMZHSTNI-Y3D', NULL, NULL, '2026-03-20T22:50:35.283562+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('add48a24-e62e-4cba-aaaf-289e0ca59480', 'TMC-2ZBL-ZXMZ-T4R3-EC', 'once', 1, '2027-03-20T22:50:35.934+00:00', 'MMZHSTNI-Y3D', NULL, NULL, '2026-03-20T22:50:35.283562+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('eb200f6f-f1f8-4bf1-9989-0f9650854aa1', 'TMC-UW38-K2VE-8K7N-95', 'once', 1, '2027-03-20T22:50:35.934+00:00', 'MMZHSTNI-Y3D', NULL, NULL, '2026-03-20T22:50:35.283562+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('7cc73c94-1ca2-4ca2-91cf-68a2a2c1265a', 'TMC-P6WH-BJX6-R7NC-3F', 'once', 1, '2027-03-20T22:50:35.934+00:00', 'MMZHSTNI-Y3D', NULL, NULL, '2026-03-20T22:50:35.283562+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('c678851b-ba60-4865-abe6-998d7f79ae8e', 'TMC-QXHM-HMSD-UFZU-D6', 'once', 1, '2027-03-20T22:50:35.934+00:00', 'MMZHSTNI-Y3D', NULL, NULL, '2026-03-20T22:50:35.283562+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('9f979e24-7109-46d2-a53e-e8e4536c3b0e', 'TMC-F3N3-Z3X7-YDYR-E9', 'once', 1, '2027-03-20T22:50:35.934+00:00', 'MMZHSTNI-Y3D', NULL, NULL, '2026-03-20T22:50:35.283562+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('f5d0736a-8533-440b-a3fd-a864409c2867', 'TMC-2Q78-E6HC-6DH9-85', 'once', 1, '2027-03-20T22:50:35.934+00:00', 'MMZHSTNI-Y3D', NULL, NULL, '2026-03-20T22:50:35.283562+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('f88c3b03-2c7d-47e2-b4a4-df6b5531a2bd', 'TMC-C4J4-VY7Z-AJUP-D5', 'once', 1, '2027-03-20T22:50:35.934+00:00', 'MMZHSTNI-Y3D', NULL, NULL, '2026-03-20T22:50:35.283562+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('c0eece5a-150c-4103-9049-c1de6737346c', 'TMC-RQCQ-FWA4-AX5N-24', 'once', 1, NULL, 'TEST-BATCH-003', '202413006775', '2026-03-20T23:10:44.873028+00:00', '2026-03-20T22:17:39.958158+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('beed396d-aabe-4aee-8fe0-3f8174a516d6', 'TMC-HMBT-DVMK-8QCL-22', 'once', 1, NULL, 'TEST-BATCH-003', '202413006775', '2026-03-20T23:36:13.203401+00:00', '2026-03-20T22:17:39.958158+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('c90d9795-ea81-418c-a430-cb09f5b7a1c9', 'TMC-8BME-WU3E-6AS7-52', 'once', 1, NULL, 'TEST-BATCH-003', '202413006775', '2026-03-20T23:12:32.5117+00:00', '2026-03-20T22:17:39.958158+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('6a02dccf-368a-48d2-abd5-d4dd0ae10386', 'TSR-MRRL-R3UW-NK8U-61', 'once', 1, NULL, 'TEST-BATCH-004', '202413006775', '2026-03-21T02:48:52.174414+00:00', '2026-03-20T22:17:39.958158+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('7bab122a-1095-4c77-84bf-3bc8d6e1002c', 'TSR-J7K5-6ZHC-Z9DE-0E', 'once', 1, NULL, 'TEST-BATCH-004', '202413006775', '2026-03-20T23:39:57.485901+00:00', '2026-03-20T22:17:39.958158+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('058510db-ed67-49d7-95a4-ed9e554d13df', 'TSR-4SEP-45YW-24M9-3D', 'once', 1, NULL, 'TEST-BATCH-004', '202413006775', '2026-03-21T00:17:59.947742+00:00', '2026-03-20T22:17:39.958158+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('d7750b43-918e-45f1-ac1b-71f9d4049ba9', 'TSR-M9AS-TNHT-UAAH-00', 'once', 1, NULL, 'TEST-BATCH-004', '202413006775', '2026-03-20T23:25:54.589188+00:00', '2026-03-20T22:17:39.958158+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('091c0031-6e18-47a5-b65a-1356c5e84cb3', 'TMC-YX5M-KBXR-7BXQ-BE', 'once', 1, '2027-03-21T00:47:36.367+00:00', 'MMZLZANJ-JWP', NULL, NULL, '2026-03-21T00:47:42.224871+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('73d75f99-0bc7-4557-8e21-25988dc3bfce', 'TMC-7JEF-RBAF-VSR8-C0', 'once', 1, '2027-03-21T00:47:36.367+00:00', 'MMZLZANJ-JWP', NULL, NULL, '2026-03-21T00:47:42.224871+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('ac494b50-aba7-476b-951d-ef786aed4354', 'TMC-MSNV-RKTR-9UE6-01', 'once', 1, '2027-03-21T00:47:36.367+00:00', 'MMZLZANJ-JWP', NULL, NULL, '2026-03-21T00:47:42.224871+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('7b5c4fef-c032-4d16-b38d-d0a7a704bac2', 'TMC-G7U5-CFUX-MRHA-72', 'once', 1, '2027-03-21T00:47:36.367+00:00', 'MMZLZANJ-JWP', NULL, NULL, '2026-03-21T00:47:42.224871+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('22bbf4b3-e0c6-4203-a8fc-ba2d9bee7d69', 'TMC-5KV6-WCV3-FSFK-B7', 'once', 1, '2027-03-21T00:47:36.367+00:00', 'MMZLZANJ-JWP', NULL, NULL, '2026-03-21T00:47:42.224871+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('4c622e32-4406-43e8-9279-094ef9fc0049', 'TSR-CEPS-5PY5-BJWN-1D', 'once', 1, '2027-03-21T00:47:38.811+00:00', 'MMZLZCJF-YJS', NULL, NULL, '2026-03-21T00:47:42.723178+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('5098bca7-2888-4cea-a983-f669e42c806f', 'TSR-8HE3-4NK8-5MJ7-B7', 'once', 1, '2027-03-21T00:47:38.811+00:00', 'MMZLZCJF-YJS', NULL, NULL, '2026-03-21T00:47:42.723178+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('8a34fb04-caa1-4441-8957-9701158b31ab', 'TSR-RG8L-YHCS-N8AP-67', 'once', 1, '2027-03-21T00:47:38.811+00:00', 'MMZLZCJF-YJS', NULL, NULL, '2026-03-21T00:47:42.723178+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('32ea352e-2618-4bd2-873e-28570fb176c7', 'TSR-4MS2-TRKQ-B4B2-47', 'once', 1, '2027-03-21T00:47:38.811+00:00', 'MMZLZCJF-YJS', NULL, NULL, '2026-03-21T00:47:42.723178+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('8d034822-f60f-41a9-8e34-89e1a4636c05', 'TSR-S2EZ-PSFA-CZW8-9F', 'once', 1, NULL, 'TEST-BATCH-004', '202413006775', '2026-03-21T02:49:15.493828+00:00', '2026-03-20T22:17:39.958158+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('48e58882-7aaf-47b3-96bd-e4602d5c68f9', 'TSR-X779-KD5F-H3NC-7F', 'once', 1, '2027-03-21T00:47:38.811+00:00', 'MMZLZCJF-YJS', NULL, NULL, '2026-03-21T00:47:42.723178+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('9ad09574-4a4d-495f-9817-fbcb2645f1df', 'TMC-4922-NVAA-RW99-13', 'once', 1, '2027-03-21T00:48:21.278+00:00', 'MMZM09B2-K57', NULL, NULL, '2026-03-21T00:48:26.002275+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('471de38e-1992-4bbb-8614-f3cf53623617', 'TMC-KG35-43FW-4V2X-DA', 'once', 1, '2027-03-21T00:48:21.278+00:00', 'MMZM09B2-K57', NULL, NULL, '2026-03-21T00:48:26.002275+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('ef061241-e13f-4aa9-979d-6080c3b8ade8', 'TMC-D87Y-YRAW-UUUR-38', 'once', 1, '2027-03-21T00:48:21.278+00:00', 'MMZM09B2-K57', NULL, NULL, '2026-03-21T00:48:26.002275+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('866ba0b5-6b7e-4643-b33f-40cfd42d4252', 'TSR-CQ78-PWHJ-USYT-55', 'once', 1, '2027-03-21T00:48:28.633+00:00', 'MMZM0EZD-BLT', NULL, NULL, '2026-03-21T00:48:33.300682+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('387ed673-4811-413b-ab86-a157e78361b9', 'TSR-YF3N-3ZTM-95U4-C6', 'once', 1, '2027-03-21T00:48:28.633+00:00', 'MMZM0EZD-BLT', NULL, NULL, '2026-03-21T00:48:33.300682+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('5373a9b6-b2df-467d-89dc-d1a65779796c', 'TSR-NX2F-69WW-4AMP-5F', 'once', 1, '2027-03-21T00:48:28.633+00:00', 'MMZM0EZD-BLT', NULL, NULL, '2026-03-21T00:48:33.300682+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('bfac2a8a-a4c9-413d-bba2-d5aea8c0c6d7', 'TSR-W58D-BHQW-SGJK-83', 'once', 1, '2027-03-21T00:48:28.633+00:00', 'MMZM0EZD-BLT', NULL, NULL, '2026-03-21T00:48:33.300682+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('63fa4196-27ce-4a90-bb46-b614a827cff7', 'TSR-ULFV-BT36-7XCU-63', 'once', 1, '2027-03-21T00:48:28.633+00:00', 'MMZM0EZD-BLT', NULL, NULL, '2026-03-21T00:48:33.300682+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('e94cff26-fd0c-4d52-bed4-973c1ec3eeb4', 'TMC-L6KK-A4VL-G4HN-75', 'once', 1, '2027-03-21T00:48:21.278+00:00', 'MMZM09B2-K57', '202413006775', '2026-03-21T00:51:00.123325+00:00', '2026-03-21T00:48:26.002275+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('1a2d9510-1e07-4061-bfa5-395464e360cb', 'TMC-N427-3RWE-3B6J-78', 'once', 1, '2027-03-21T00:48:21.278+00:00', 'MMZM09B2-K57', '202413006775', '2026-03-21T00:51:14.38991+00:00', '2026-03-21T00:48:26.002275+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('004194d5-4e21-4444-86b9-f7fbfb9e7cf3', 'TSR-ZRBU-78HF-QJMR-50', 'times', 99999, '2036-03-18T01:08:56.835+00:00', 'MMZMQQO3-Y77', NULL, NULL, '2026-03-21T01:09:01.545861+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('62bf3128-ceb7-47d3-ac69-382e50c835d7', 'TMC-VNX9-PMY4-RV9T-5F', 'times', 99999, '2036-03-18T01:08:47.65+00:00', 'MMZMQJKY-LJS', '202413006775', '2026-03-21T01:09:20.795279+00:00', '2026-03-21T01:08:52.547246+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('d9789772-b263-4dff-81d8-14f9a854c0d7', 'TMC-FZC7-8WXL-A8VW-44', 'times', 99999, '2036-03-18T01:21:39.688+00:00', 'MMZN73AG-VFU', NULL, NULL, '2026-03-21T01:21:44.594937+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('c2aff2ea-7006-4603-9c52-da52eeeb5510', 'TSR-Z2QP-T83A-QWBS-10', 'times', 99999, '2036-03-18T01:21:41.19+00:00', 'MMZN74G6-UCM', NULL, NULL, '2026-03-21T01:21:45.105379+00:00', 'sunrun');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('f8f430d8-8890-47db-8a1b-6e64e64758b1', 'TMC-NMU6-H487-M5HV-5D', 'times', 99999, '2036-03-18T01:22:20.627+00:00', 'MMZN7YVN-JYR', NULL, NULL, '2026-03-21T01:22:24.966076+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('52566148-03f3-4243-91ee-68da0047aba4', 'TMC-DRL7-5S59-EBPK-31', 'times', 99999, '2036-03-18T01:22:37.245+00:00', 'MMZN8BP9-DNS', NULL, NULL, '2026-03-21T01:22:41.54322+00:00', 'makeup');
INSERT INTO public.recharge_cards (id, code, type, times, expires_at, batch_id, used_by, used_at, created_at, card_kind) VALUES ('b60260eb-13b9-49dd-af16-8e6d6ab0febd', 'TSR-STWS-99RG-D5V3-27', 'times', 99999, '2036-03-18T01:22:38.189+00:00', 'MMZN8CFH-6QJ', NULL, NULL, '2026-03-21T01:22:42.091411+00:00', 'sunrun');

-- user_balances: 1 条

INSERT INTO public.user_balances (id, session_id, balance, balance_sunrun, updated_at, created_at, stu_number) VALUES ('b8ec4d0e-da98-4fcb-9fbf-ae8e7a27478c', '0f5674a4-1160-4517-87b3-79cce0e44200', 99986, 11, '2026-03-21T03:02:53.556+00:00', '2026-03-20T18:09:58.441345+00:00', '202413006775');

-- balance_transactions: 29 条

INSERT INTO public.balance_transactions (id, session_id, type, amount, balance_after, balance_kind, description, task_id, card_code, created_at, stu_number) VALUES ('0b9474d6-4141-411b-8fb6-9e9839c7a6e1', 'adad157a-de63-4aa3-a1a6-a3d4b2009c62', 'recharge', 1, 1, 'makeup', '补跑卡密充值: TMC-L6KK-A4VL-G4HN-75', NULL, 'TMC-L6KK-A4VL-G4HN-75', '2026-03-21T00:51:03.08843+00:00', '202413006775');
INSERT INTO public.balance_transactions (id, session_id, type, amount, balance_after, balance_kind, description, task_id, card_code, created_at, stu_number) VALUES ('a2cb3ef3-28f5-4439-b784-88e27c7cf510', 'adad157a-de63-4aa3-a1a6-a3d4b2009c62', 'recharge', 1, 2, 'makeup', '补跑卡密充值: TMC-N427-3RWE-3B6J-78', NULL, 'TMC-N427-3RWE-3B6J-78', '2026-03-21T00:51:17.886407+00:00', '202413006775');
INSERT INTO public.balance_transactions (id, session_id, type, amount, balance_after, balance_kind, description, task_id, card_code, created_at, stu_number) VALUES ('8c08cb1f-3498-4e78-a3f1-1a2c27fa20bd', 'adad157a-de63-4aa3-a1a6-a3d4b2009c62', 'recharge', 99999, 99999, 'makeup', '补跑卡密充值: TMC-VNX9-PMY4-RV9T-5F', NULL, 'TMC-VNX9-PMY4-RV9T-5F', '2026-03-21T01:09:23.929096+00:00', '202413006775');
INSERT INTO public.balance_transactions (id, session_id, type, amount, balance_after, balance_kind, description, task_id, card_code, created_at, stu_number) VALUES ('4d695828-ef8e-4d36-81ae-f662b0ab4c49', '0f5674a4-1160-4517-87b3-79cce0e44200', 'deduct', -1, 12, 'sunrun', '阳光跑扣次 (-1)', 'd3446aad-f2fa-4e88-874c-4a7955bb5a63', NULL, '2026-03-21T01:18:02.874617+00:00', '202413006775');
INSERT INTO public.balance_transactions (id, session_id, type, amount, balance_after, balance_kind, description, task_id, card_code, created_at, stu_number) VALUES ('5393cc07-5bc2-4713-b9b2-0048aae027df', '0f5674a4-1160-4517-87b3-79cce0e44200', 'recharge', 1, 13, 'sunrun', '阳光跑卡密充值: TSR-MRRL-R3UW-NK8U-61', NULL, 'TSR-MRRL-R3UW-NK8U-61', '2026-03-21T02:48:55.55195+00:00', '202413006775');
INSERT INTO public.balance_transactions (id, session_id, type, amount, balance_after, balance_kind, description, task_id, card_code, created_at, stu_number) VALUES ('7ffe2a79-87cf-4b0a-8ff3-3721e3cc4a88', '0f5674a4-1160-4517-87b3-79cce0e44200', 'recharge', 1, 14, 'sunrun', '阳光跑卡密充值: TSR-S2EZ-PSFA-CZW8-9F', NULL, 'TSR-S2EZ-PSFA-CZW8-9F', '2026-03-21T02:49:18.760321+00:00', '202413006775');
INSERT INTO public.balance_transactions (id, session_id, type, amount, balance_after, balance_kind, description, task_id, card_code, created_at, stu_number) VALUES ('8981b9e3-f3b8-478c-87d4-4a9273cd03ff', '0f5674a4-1160-4517-87b3-79cce0e44200', 'deduct', -1, 13, 'sunrun', '阳光跑扣次 (-1)', 'd951fc94-dc84-49a4-9ade-9e22cfc5382e', NULL, '2026-03-21T02:51:09.822348+00:00', '202413006775');
INSERT INTO public.balance_transactions (id, session_id, type, amount, balance_after, balance_kind, description, task_id, card_code, created_at, stu_number) VALUES ('c7b54def-05fd-4e82-b8c9-53b7dbfe059e', '0f5674a4-1160-4517-87b3-79cce0e44200', 'deduct', -1, 12, 'sunrun', '阳光跑扣次 (-1)', '2644f0cb-364e-4f0f-955b-e36a51245949', NULL, '2026-03-21T02:51:26.123956+00:00', '202413006775');
INSERT INTO public.balance_transactions (id, session_id, type, amount, balance_after, balance_kind, description, task_id, card_code, created_at, stu_number) VALUES ('268f48cc-feac-4ea8-afb3-a35b65b64939', '0f5674a4-1160-4517-87b3-79cce0e44200', 'deduct', -1, 11, 'sunrun', '阳光跑扣次 (-1)', 'a7411aab-2691-4d81-823b-fec456253f81', NULL, '2026-03-21T02:59:16.090641+00:00', '202413006775');
INSERT INTO public.balance_transactions (id, session_id, type, amount, balance_after, balance_kind, description, task_id, card_code, created_at, stu_number) VALUES ('bd688494-9a89-4c1d-8872-ad4064215874', 'e4c74798-b9d3-4102-a7ca-349de6abfaff', 'recharge', 3, 6, 'makeup', '补跑卡密充值: TMC-MPY2-996L-3NEM-13', NULL, 'TMC-MPY2-996L-3NEM-13', '2026-03-20T18:32:50.420052+00:00', '202413006775');
INSERT INTO public.balance_transactions (id, session_id, type, amount, balance_after, balance_kind, description, task_id, card_code, created_at, stu_number) VALUES ('8e70fa81-afdb-442a-80f3-29c356fbfe94', 'e4c74798-b9d3-4102-a7ca-349de6abfaff', 'recharge', 3, 6, 'sunrun', '阳光跑卡密充值: TSR-Y7L6-7P7Z-ZNUJ-63', NULL, 'TSR-Y7L6-7P7Z-ZNUJ-63', '2026-03-20T18:32:31.479291+00:00', '202413006775');
INSERT INTO public.balance_transactions (id, session_id, type, amount, balance_after, balance_kind, description, task_id, card_code, created_at, stu_number) VALUES ('25146372-9f7b-4ff0-863a-0782ec2b70b2', 'e4c74798-b9d3-4102-a7ca-349de6abfaff', 'recharge', 3, 3, 'sunrun', '阳光跑卡密充值: TSR-Y7L6-7P7Z-ZNUJ-63', NULL, 'TSR-Y7L6-7P7Z-ZNUJ-63', '2026-03-20T18:10:14.047395+00:00', '202413006775');
INSERT INTO public.balance_transactions (id, session_id, type, amount, balance_after, balance_kind, description, task_id, card_code, created_at, stu_number) VALUES ('18613d4c-fc9a-431a-9871-9b587a0c7411', 'e4c74798-b9d3-4102-a7ca-349de6abfaff', 'recharge', 3, 3, 'makeup', '补跑卡密充值: TMC-MPY2-996L-3NEM-13', NULL, 'TMC-MPY2-996L-3NEM-13', '2026-03-20T18:09:58.853109+00:00', '202413006775');
INSERT INTO public.balance_transactions (id, session_id, type, amount, balance_after, balance_kind, description, task_id, card_code, created_at, stu_number) VALUES ('9751d96b-0dc5-42ec-8485-2403dcb0b53d', 'b8f28e32-fb1c-4b69-986e-45b599c28b2e', 'deduct', -1, 5, 'sunrun', '阳光跑扣次 (-1)', '88d37cc5-533f-4993-9e99-dae402df8b20', NULL, '2026-03-20T22:10:51.879229+00:00', '202413006775');
INSERT INTO public.balance_transactions (id, session_id, type, amount, balance_after, balance_kind, description, task_id, card_code, created_at, stu_number) VALUES ('e78eec28-2033-49fa-b18a-fa71b835bab4', 'b8f28e32-fb1c-4b69-986e-45b599c28b2e', 'deduct', -1, 4, 'sunrun', '阳光跑扣次 (-1)', '3047b566-9fd1-46ef-8876-c73b97c3fed4', NULL, '2026-03-20T22:14:10.117263+00:00', '202413006775');
INSERT INTO public.balance_transactions (id, session_id, type, amount, balance_after, balance_kind, description, task_id, card_code, created_at, stu_number) VALUES ('40d77e21-77dc-441a-8b86-9c14ad8ccf63', '8b179ea7-5fa0-4f8d-819f-48b3f82f5c93', 'recharge', 1, 5, 'sunrun', '阳光跑卡密充值: TSR-MRRL-R3UW-NK8U-61', NULL, 'TSR-MRRL-R3UW-NK8U-61', '2026-03-20T22:33:41.954103+00:00', '202413006775');
INSERT INTO public.balance_transactions (id, session_id, type, amount, balance_after, balance_kind, description, task_id, card_code, created_at, stu_number) VALUES ('f4f5a6dc-8fd0-46bc-bc7b-2ee0f9cdbefc', '8b179ea7-5fa0-4f8d-819f-48b3f82f5c93', 'recharge', 1, 6, 'makeup', '补跑卡密充值: TMC-HMBT-DVMK-8QCL-22', NULL, 'TMC-HMBT-DVMK-8QCL-22', '2026-03-20T22:33:59.637695+00:00', '202413006775');
INSERT INTO public.balance_transactions (id, session_id, type, amount, balance_after, balance_kind, description, task_id, card_code, created_at, stu_number) VALUES ('4abc6f85-bf27-4bb2-b43c-fc984de99ee2', '8b179ea7-5fa0-4f8d-819f-48b3f82f5c93', 'recharge', 1, 1, 'makeup', '补跑卡密充值: TMC-RQCQ-FWA4-AX5N-24', NULL, 'TMC-RQCQ-FWA4-AX5N-24', '2026-03-20T23:10:47.447886+00:00', '202413006775');
INSERT INTO public.balance_transactions (id, session_id, type, amount, balance_after, balance_kind, description, task_id, card_code, created_at, stu_number) VALUES ('e8d8976e-485f-47ad-8ae5-175aef6a48af', '025f70a4-e134-4636-bc69-ad55d8bf36c7', 'recharge', 1, 1, 'makeup', '补跑卡密充值: TMC-HMBT-DVMK-8QCL-22', NULL, 'TMC-HMBT-DVMK-8QCL-22', '2026-03-20T23:12:22.477614+00:00', '202413006775');
INSERT INTO public.balance_transactions (id, session_id, type, amount, balance_after, balance_kind, description, task_id, card_code, created_at, stu_number) VALUES ('94b88a16-3c61-4126-915b-402a52d713da', '025f70a4-e134-4636-bc69-ad55d8bf36c7', 'recharge', 1, 2, 'makeup', '补跑卡密充值: TMC-8BME-WU3E-6AS7-52', NULL, 'TMC-8BME-WU3E-6AS7-52', '2026-03-20T23:12:36.202821+00:00', '202413006775');
INSERT INTO public.balance_transactions (id, session_id, type, amount, balance_after, balance_kind, description, task_id, card_code, created_at, stu_number) VALUES ('5b8374d0-b4b5-4f7c-a524-696854467a24', '025f70a4-e134-4636-bc69-ad55d8bf36c7', 'recharge', 1, 6, 'sunrun', '阳光跑卡密充值: TSR-M9AS-TNHT-UAAH-00', NULL, 'TSR-M9AS-TNHT-UAAH-00', '2026-03-20T23:22:07.488699+00:00', '202413006775');
INSERT INTO public.balance_transactions (id, session_id, type, amount, balance_after, balance_kind, description, task_id, card_code, created_at, stu_number) VALUES ('9185d981-5162-49bb-a298-deb4a7fd8268', '025f70a4-e134-4636-bc69-ad55d8bf36c7', 'recharge', 1, 7, 'sunrun', '阳光跑卡密充值: TSR-M9AS-TNHT-UAAH-00', NULL, 'TSR-M9AS-TNHT-UAAH-00', '2026-03-20T23:25:57.619814+00:00', '202413006775');
INSERT INTO public.balance_transactions (id, session_id, type, amount, balance_after, balance_kind, description, task_id, card_code, created_at, stu_number) VALUES ('9b162ee9-4dc5-4dab-8846-1e3948402866', '025f70a4-e134-4636-bc69-ad55d8bf36c7', 'recharge', 1, 8, 'sunrun', '阳光跑卡密充值: TSR-M9AS-TNHT-UAAH-00', NULL, 'TSR-M9AS-TNHT-UAAH-00', '2026-03-20T23:26:08.502297+00:00', '202413006775');
INSERT INTO public.balance_transactions (id, session_id, type, amount, balance_after, balance_kind, description, task_id, card_code, created_at, stu_number) VALUES ('ee3c9c22-a86e-423e-b2cd-f13b7bbcd21f', '025f70a4-e134-4636-bc69-ad55d8bf36c7', 'recharge', 1, 9, 'sunrun', '阳光跑卡密充值: TSR-M9AS-TNHT-UAAH-00', NULL, 'TSR-M9AS-TNHT-UAAH-00', '2026-03-20T23:27:58.033687+00:00', '202413006775');
INSERT INTO public.balance_transactions (id, session_id, type, amount, balance_after, balance_kind, description, task_id, card_code, created_at, stu_number) VALUES ('1cbcdb65-00ba-4b90-9912-ec995995b17d', '025f70a4-e134-4636-bc69-ad55d8bf36c7', 'recharge', 1, 10, 'sunrun', '阳光跑卡密充值: TSR-M9AS-TNHT-UAAH-00', NULL, 'TSR-M9AS-TNHT-UAAH-00', '2026-03-20T23:31:23.446434+00:00', '202413006775');
INSERT INTO public.balance_transactions (id, session_id, type, amount, balance_after, balance_kind, description, task_id, card_code, created_at, stu_number) VALUES ('89eda363-2665-4091-b576-4de9dd2bd88a', '025f70a4-e134-4636-bc69-ad55d8bf36c7', 'recharge', 1, 11, 'sunrun', '阳光跑卡密充值: TSR-M9AS-TNHT-UAAH-00', NULL, 'TSR-M9AS-TNHT-UAAH-00', '2026-03-20T23:31:33.116934+00:00', '202413006775');
INSERT INTO public.balance_transactions (id, session_id, type, amount, balance_after, balance_kind, description, task_id, card_code, created_at, stu_number) VALUES ('9ac0ac38-3561-4ec6-8555-59989d7618d5', '025f70a4-e134-4636-bc69-ad55d8bf36c7', 'recharge', 1, 3, 'makeup', '补跑卡密充值: TMC-HMBT-DVMK-8QCL-22', NULL, 'TMC-HMBT-DVMK-8QCL-22', '2026-03-20T23:36:16.684227+00:00', '202413006775');
INSERT INTO public.balance_transactions (id, session_id, type, amount, balance_after, balance_kind, description, task_id, card_code, created_at, stu_number) VALUES ('7c786e7a-8161-48b4-8ab0-0271c90e6117', '025f70a4-e134-4636-bc69-ad55d8bf36c7', 'recharge', 1, 12, 'sunrun', '阳光跑卡密充值: TSR-J7K5-6ZHC-Z9DE-0E', NULL, 'TSR-J7K5-6ZHC-Z9DE-0E', '2026-03-20T23:40:00.743135+00:00', '202413006775');
INSERT INTO public.balance_transactions (id, session_id, type, amount, balance_after, balance_kind, description, task_id, card_code, created_at, stu_number) VALUES ('5b5a97d6-0e52-4cd2-9aae-baecf24e16f9', 'dbe99d2d-8ee6-4c6e-b578-852034238d55', 'recharge', 1, 13, 'sunrun', '阳光跑卡密充值: TSR-4SEP-45YW-24M9-3D', NULL, 'TSR-4SEP-45YW-24M9-3D', '2026-03-21T00:18:03.285379+00:00', '202413006775');

-- balance_consumptions: 5 条

INSERT INTO public.balance_consumptions (id, session_id, kind, status, created_at, completed_at, refunded_at, stu_number) VALUES ('88d37cc5-533f-4993-9e99-dae402df8b20', 'b8f28e32-fb1c-4b69-986e-45b599c28b2e', 'sunrun', 'completed', '2026-03-20T22:10:51.406284+00:00', '2026-03-20T22:10:54.245+00:00', NULL, '202413006775');
INSERT INTO public.balance_consumptions (id, session_id, kind, status, created_at, completed_at, refunded_at, stu_number) VALUES ('d3446aad-f2fa-4e88-874c-4a7955bb5a63', '0f5674a4-1160-4517-87b3-79cce0e44200', 'sunrun', 'completed', '2026-03-21T01:18:02.416318+00:00', '2026-03-21T01:18:00.295+00:00', NULL, '202413006775');
INSERT INTO public.balance_consumptions (id, session_id, kind, status, created_at, completed_at, refunded_at, stu_number) VALUES ('d951fc94-dc84-49a4-9ade-9e22cfc5382e', '0f5674a4-1160-4517-87b3-79cce0e44200', 'sunrun', 'completed', '2026-03-21T02:51:09.437682+00:00', '2026-03-21T02:51:07.275+00:00', NULL, '202413006775');
INSERT INTO public.balance_consumptions (id, session_id, kind, status, created_at, completed_at, refunded_at, stu_number) VALUES ('2644f0cb-364e-4f0f-955b-e36a51245949', '0f5674a4-1160-4517-87b3-79cce0e44200', 'sunrun', 'completed', '2026-03-21T02:51:25.698812+00:00', '2026-03-21T02:51:23.449+00:00', NULL, '202413006775');
INSERT INTO public.balance_consumptions (id, session_id, kind, status, created_at, completed_at, refunded_at, stu_number) VALUES ('a7411aab-2691-4d81-823b-fec456253f81', '0f5674a4-1160-4517-87b3-79cce0e44200', 'sunrun', 'completed', '2026-03-21T02:59:15.690081+00:00', '2026-03-21T02:59:13.467+00:00', NULL, '202413006775');

-- makeup_tasks: 无数据

