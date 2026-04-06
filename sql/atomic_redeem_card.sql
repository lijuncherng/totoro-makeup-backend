-- =============================================
-- 原子兑换卡密函数（解决并发竞态条件）
-- 在 Supabase SQL Editor 中执行一次即可
-- =============================================

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

  -- ============================================
  -- 卡密唯一性保证：原子更新机制
  -- ============================================
  -- 核心原则：一张卡密只能被使用一次，无论谁使用后立即失效
  -- 
  -- 实现方式：
  -- 1. 使用 PostgreSQL 的原子 UPDATE 操作
  -- 2. WHERE 条件确保只有 used_by 为空（未使用）的卡才能被更新
  -- 3. 一旦 UPDATE 成功，used_by 和 used_at 立即写入数据库
  -- 4. 如果卡已被使用，UPDATE 不会影响任何行，函数返回 NULL
  -- 5. 并发安全：多个请求同时兑换同一张卡时，数据库行锁保证只有一个成功
  --
  -- 检查条件：
  -- - 卡密存在（code 匹配，大小写不敏感）
  -- - 未被使用（used_by IS NULL OR used_by = ''）
  -- - 未过期（expires_at IS NULL OR expires_at > NOW()）
  -- ============================================
  UPDATE public.recharge_cards
  SET used_by = v_used_by_value,
      used_at = NOW()
  WHERE UPPER(TRIM(code::text)) = UPPER(TRIM(p_code::text))
    AND (used_by IS NULL OR TRIM(COALESCE(used_by::text, '')) = '')
    AND (expires_at IS NULL OR expires_at > NOW())
  RETURNING * INTO v_card;

  -- 返回值说明：
  -- - 如果 UPDATE 成功（至少更新了一行）：返回被更新的卡密行（v_card 有值）
  -- - 如果 UPDATE 失败（0 行受影响）：v_card 为 NULL，表示卡密不存在、已被使用或已过期
  -- 
  -- 注意：一旦 UPDATE 成功，卡密立即失效，其他人不能再使用
  RETURN v_card;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- SECURITY DEFINER：使用函数定义者的权限执行（绕过 RLS）
-- 这样即使表启用了 RLS，服务端也能正常执行

-- 授予执行权限（让 anon 和 authenticated 角色都能调用）
GRANT EXECUTE ON FUNCTION public.atomic_redeem_card(VARCHAR, VARCHAR) TO authenticated, anon, service_role;
