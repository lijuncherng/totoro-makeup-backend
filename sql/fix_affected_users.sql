-- =============================================
-- 批量修复受影响用户的余额
-- =============================================

-- 统计每个受影响用户应该有的余额
WITH user_stats AS (
  SELECT 
    used_by,
    SUM(CASE WHEN card_kind = 'makeup' THEN times ELSE 0 END) as total_makeup,
    SUM(CASE WHEN card_kind = 'sunrun' THEN times ELSE 0 END) as total_sunrun
  FROM public.recharge_cards
  WHERE used_by IS NOT NULL AND TRIM(used_by::text) <> ''
  GROUP BY used_by
),
existing_balances AS (
  SELECT stu_number FROM public.user_balances
)
INSERT INTO public.user_balances (stu_number, balance, balance_sunrun, updated_at)
SELECT 
  us.used_by,
  COALESCE(eb.balance, 0) + us.total_makeup,
  COALESCE(eb.balance_sunrun, 0) + us.total_sunrun,
  NOW()
FROM user_stats us
LEFT JOIN public.user_balances eb ON us.used_by = eb.stu_number
WHERE NOT EXISTS (SELECT 1 FROM existing_balances eb2 WHERE eb2.stu_number = us.used_by);

-- 验证
SELECT 
  ub.stu_number,
  ub.balance,
  ub.balance_sunrun,
  us.total_makeup,
  us.total_sunrun
FROM public.user_balances ub
LEFT JOIN (
  SELECT 
    used_by,
    SUM(CASE WHEN card_kind = 'makeup' THEN times ELSE 0 END) as total_makeup,
    SUM(CASE WHEN card_kind = 'sunrun' THEN times ELSE 0 END) as total_sunrun
  FROM public.recharge_cards
  WHERE used_by IS NOT NULL
  GROUP BY used_by
) us ON ub.stu_number = us.used_by
ORDER BY ub.stu_number;
