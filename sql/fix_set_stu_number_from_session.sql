-- =============================================
-- 修复：set_stu_number_from_session 误用 NEW.user_id
-- 现象：卡密给「尚无 user_balances 行」的用户充值时报
--       record "new" has no field "user_id"
-- 原因：触发器函数引用了 user_balances 表中不存在的列 user_id
-- 执行：Supabase SQL Editor 整段运行一次即可
-- =============================================

CREATE OR REPLACE FUNCTION public.set_stu_number_from_session()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_stu VARCHAR(100);
BEGIN
  -- 已带学号（例如卡密核销 atomic_redeem / 后端直接写入 stu_number）：不再改写
  IF NEW.stu_number IS NOT NULL AND BTRIM(NEW.stu_number::text) <> '' THEN
    RETURN NEW;
  END IF;

  -- 仅有 session_id 时，从 sessions 按 id 反查学号（sessions.id = user_balances.session_id）
  IF NEW.session_id IS NOT NULL AND BTRIM(NEW.session_id::text) <> '' THEN
    SELECT s.stu_number
    INTO v_stu
    FROM public.sessions s
    WHERE s.id = NEW.session_id
    LIMIT 1;

    IF v_stu IS NOT NULL THEN
      NEW.stu_number := v_stu;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_stu_number_from_session() IS
  'BEFORE INSERT on user_balances: 若未填 stu_number 则从 sessions 补全；绝不引用不存在的 user_id 列';
