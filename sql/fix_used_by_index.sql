-- =============================================
-- 删除 recharge_cards.used_by 的唯一索引
-- 目的：确保卡密一次性使用机制正确工作
-- =============================================
-- 
-- 核心原则：
-- 1. 一张卡密只能被使用一次（无论谁使用）
-- 2. 使用后立即失效，其他人也不能再使用
-- 3. 同一用户可以使用多张不同的卡密
--
-- 实现方式：
-- 1. code 字段本身是 UNIQUE，确保每张卡密只有一条记录
-- 2. 应用层通过原子更新（WHERE used_by IS NULL OR used_by = ''）确保卡密只能使用一次
-- 3. used_by 字段不需要唯一约束，因为：
--    - 一张卡密只能使用一次（由 code UNIQUE + 应用层逻辑保证）
--    - 同一用户可以使用多张不同的卡密（所以 used_by 不应该有唯一约束）
--
-- =============================================

-- 删除错误的唯一索引（如果存在）
DROP INDEX IF EXISTS public.idx_recharge_cards_used_by;

-- 验证：检查是否还有其他相关约束
-- SELECT 
--   indexname, 
--   indexdef 
-- FROM pg_indexes 
-- WHERE tablename = 'recharge_cards' 
--   AND indexname LIKE '%used_by%';
