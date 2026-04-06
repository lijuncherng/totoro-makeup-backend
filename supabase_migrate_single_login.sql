-- =============================================
-- 迁移：为 sessions 表加 stu_number UNIQUE 约束（单设备登录）
-- 为 balance_consumptions / makeup_tasks 表加 stu_number 列（余额与用户一对一绑定）
-- 执行方式：Supabase SQL Editor -> Run
-- =============================================

-- 1. 给 sessions.stu_number 加唯一约束
-- 如果已有重复数据，先清理（保留最新一条）
WITH duplicates AS (
  SELECT stu_number, id, created_at,
         ROW_NUMBER() OVER (PARTITION BY stu_number ORDER BY created_at DESC) as rn
  FROM public.sessions
  WHERE stu_number IS NOT NULL AND stu_number != ''
)
DELETE FROM public.sessions
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

ALTER TABLE public.sessions
  ALTER COLUMN stu_number SET NOT NULL,
  ADD CONSTRAINT sessions_stu_number_unique UNIQUE (stu_number);

-- 2. 给 balance_consumptions 加 stu_number 列（如果还没有）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'balance_consumptions' AND column_name = 'stu_number'
  ) THEN
    ALTER TABLE public.balance_consumptions
      ADD COLUMN stu_number VARCHAR(100);
  END IF;
END $$;

-- 3. 填充已有的 balance_consumptions 记录（通过 session_id 反查 stu_number）
UPDATE public.balance_consumptions bc
SET stu_number = s.stu_number
FROM public.sessions s
WHERE bc.session_id::text = s.id::text
  AND (bc.stu_number IS NULL OR bc.stu_number = '');

-- 4. 给 balance_consumptions 的 stu_number 加索引
CREATE INDEX IF NOT EXISTS idx_balance_consumptions_stu_number ON public.balance_consumptions(stu_number);

-- 5. 给 balance_transactions 加 stu_number 索引（如果还没有）
CREATE INDEX IF NOT EXISTS idx_balance_tx_stu_number ON public.balance_transactions(stu_number);

-- 6. 如果 balance_transactions / balance_consumptions 表没有 stu_number 列，加上去
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'balance_transactions' AND column_name = 'stu_number'
  ) THEN
    ALTER TABLE public.balance_transactions ADD COLUMN stu_number VARCHAR(100);
  END IF;
END $$;

-- 7. 给 makeup_tasks 加 stu_number 列（如果还没有）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'makeup_tasks' AND column_name = 'stu_number'
  ) THEN
    ALTER TABLE public.makeup_tasks ADD COLUMN stu_number VARCHAR(100) NOT NULL DEFAULT '';
  END IF;
END $$;

-- 8. 填充已有的 makeup_tasks 记录（通过 user_id 查 sessions 的 stu_number）
UPDATE public.makeup_tasks mt
SET stu_number = COALESCE(
    (SELECT s.stu_number FROM public.sessions s WHERE s.id::text = mt.user_id::text LIMIT 1),
    mt.stu_number
  )
WHERE mt.stu_number = '' OR mt.stu_number IS NULL;

-- 9. 给 makeup_tasks 的 stu_number 加索引
CREATE INDEX IF NOT EXISTS idx_makeup_tasks_stu_number ON public.makeup_tasks(stu_number);
