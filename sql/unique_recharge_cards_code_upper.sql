-- =============================================
-- 防止「同一逻辑卡密」因大小写不同插入两行，导致可兑换两次
-- 执行前请先检查重复：SELECT upper(trim(code)) AS k, count(*) FROM recharge_cards GROUP BY 1 HAVING count(*) > 1;
-- 若有重复，需人工合并/删除多余行后再建唯一索引
-- =============================================

-- CREATE UNIQUE INDEX IF NOT EXISTS idx_recharge_cards_code_upper
--   ON public.recharge_cards (upper(trim(code::text)));

-- 若 PostgreSQL 版本支持，也可用 generated column 存规范化 code
