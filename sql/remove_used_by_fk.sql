-- =============================================
-- 删除 recharge_cards.used_by 的外键约束
-- 原因：used_by 应该存储学号（VARCHAR），不应该有外键约束
-- =============================================

-- 1. 删除外键约束（如果存在）
ALTER TABLE public.recharge_cards 
  DROP CONSTRAINT IF EXISTS recharge_cards_used_by_fkey;

-- 2. 验证：检查是否还有其他约束
-- SELECT 
--   conname AS constraint_name,
--   contype AS constraint_type,
--   pg_get_constraintdef(oid) AS constraint_definition
-- FROM pg_constraint
-- WHERE conrelid = 'public.recharge_cards'::regclass
--   AND conname LIKE '%used_by%';
