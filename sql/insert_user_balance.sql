CREATE OR REPLACE FUNCTION public.insert_user_balance(
  p_stu_number    VARCHAR,
  p_balance       BIGINT,
  p_balance_sunrun BIGINT
)
RETURNS void AS $$
DECLARE
  v_sid VARCHAR(100);
BEGIN
  -- 不查 sessions，避免与会话写入争锁导致超时（见 sql/atomic_redeem_card.sql 注释）
  v_sid := 'redeem-' || p_stu_number;

  INSERT INTO public.user_balances (session_id, stu_number, balance, balance_sunrun, updated_at)
  VALUES (v_sid, p_stu_number, p_balance::INTEGER, p_balance_sunrun::INTEGER, NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.insert_user_balance(VARCHAR, BIGINT, BIGINT) TO authenticated, anon, service_role;
