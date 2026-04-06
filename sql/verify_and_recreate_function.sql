-- =============================================
-- 验证并重新创建 atomic_redeem_card 函数
-- 确保函数定义与当前数据库 schema 匹配
-- =============================================

-- 1. 检查函数是否存在
SELECT 
    routine_name,
    routine_type,
    data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'atomic_redeem_card';

-- 2. 删除旧函数（如果存在）
DROP FUNCTION IF EXISTS public.atomic_redeem_card(VARCHAR, VARCHAR);

-- 3. 重新创建函数
CREATE OR REPLACE FUNCTION public.atomic_redeem_card(
  p_code VARCHAR,
  p_used_by VARCHAR
)
RETURNS recharge_cards AS $$
DECLARE
  v_card recharge_cards%ROWTYPE;
  v_used_by_value TEXT;
BEGIN
  -- 参数验证：p_used_by 不能为空
  IF p_used_by IS NULL OR TRIM(p_used_by) = '' THEN
    RAISE EXCEPTION 'used_by 参数不能为空';
  END IF;

  -- 确保 used_by 是 TEXT 类型（兼容 VARCHAR）
  v_used_by_value := TRIM(p_used_by)::TEXT;

  -- 在单个事务内完成检查+更新，保证原子性
  -- 检查条件：卡密存在 + 未被使用 + 未过期
  -- 注意：过期检查通过 PostgreSQL 的时间比较实现
  -- 使用显式类型转换确保类型匹配
  UPDATE public.recharge_cards
  SET used_by = v_used_by_value,
      used_at = NOW()
  WHERE UPPER(TRIM(code::text)) = UPPER(TRIM(p_code::text))
    AND (used_by IS NULL OR TRIM(COALESCE(used_by::text, '')) = '')
    AND (expires_at IS NULL OR expires_at > NOW())
  RETURNING * INTO v_card;

  -- 如果没有更新任何行（返回 NULL），说明卡密不存在、已被使用或已过期
  RETURN v_card;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. 授予执行权限
GRANT EXECUTE ON FUNCTION public.atomic_redeem_card(VARCHAR, VARCHAR) TO authenticated, anon, service_role;

-- 5. 验证函数创建成功
SELECT 
    routine_name,
    routine_type,
    data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'atomic_redeem_card';

-- 6. 测试函数（可选，使用一个测试卡密）
-- SELECT public.atomic_redeem_card('TEST-CODE', '202413006775');
