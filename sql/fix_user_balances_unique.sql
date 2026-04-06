-- 修复 user_balances 表：给 stu_number 添加唯一约束
-- 原因：atomic_redeem_card 函数使用了 ON CONFLICT (stu_number)

-- 1. 首先检查是否有重复的 stu_number（保留最早的那条）
DELETE FROM public.user_balances
WHERE id NOT IN (
  SELECT MIN(id)
  FROM public.user_balances
  WHERE stu_number IS NOT NULL
  GROUP BY stu_number
)
AND stu_number IS NOT NULL;

-- 2. 添加唯一约束（如果 stu_number 为 NULL 则自动忽略）
ALTER TABLE public.user_balances
ADD CONSTRAINT idx_user_balances_stu_number UNIQUE (stu_number);

-- 3. 验证
SELECT 
  indexname, 
  indexdef 
FROM pg_indexes 
WHERE tablename = 'user_balances' 
  AND indexname LIKE '%stu%';
