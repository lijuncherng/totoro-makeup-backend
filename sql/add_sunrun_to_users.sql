-- =============================================
-- 为指定学号增加阳光跑次数（每人 +30）
-- 若用户不存在则自动创建
-- =============================================

-- 学号列表
DO $$
DECLARE
  v_stu VARCHAR(20);
  v_stu_arr VARCHAR(20)[] := ARRAY[
    '202413008513',
    '202413005727',
    '202413005011',
    '202413005191'
  ];
  v_session_id VARCHAR(100);
  v_existing BOOLEAN;
  v_curr_makeup INTEGER;
  v_curr_sunrun INTEGER;
  v_new_makeup INTEGER;
  v_new_sunrun INTEGER;
BEGIN

  FOREACH v_stu IN ARRAY v_stu_arr LOOP
    RAISE NOTICE '处理学号: %', v_stu;

    -- 检查是否已存在记录
    SELECT EXISTS (
      SELECT 1 FROM public.user_balances WHERE stu_number = v_stu
    ) INTO v_existing;

    IF v_existing THEN
      -- 已存在：读取当前余额，再 +30 阳光跑
      SELECT balance, COALESCE(balance_sunrun, 0)
        INTO v_curr_makeup, v_curr_sunrun
      FROM public.user_balances
      WHERE stu_number = v_stu;

      v_new_makeup := v_curr_makeup;
      v_new_sunrun := v_curr_sunrun + 30;

      UPDATE public.user_balances
      SET balance         = v_new_makeup,
          balance_sunrun  = v_new_sunrun,
          updated_at      = NOW()
      WHERE stu_number = v_stu;

      RAISE NOTICE '  -> 更新成功: makeup=%, sunrun=% -> %', v_curr_makeup, v_curr_sunrun, v_new_sunrun;

    ELSE
      -- 不存在：新建记录，补跑=0，阳光跑=30
      v_session_id := 'admin-add-' || v_stu;

      INSERT INTO public.user_balances (session_id, stu_number, balance, balance_sunrun, updated_at)
      VALUES (v_session_id, v_stu, 0, 30, NOW())
      ON CONFLICT (session_id) DO NOTHING;

      RAISE NOTICE '  -> 新建成功: makeup=0, sunrun=30';

    END IF;

  END LOOP;

END $$;

-- 验证结果
SELECT stu_number, balance AS makeup, COALESCE(balance_sunrun, 0) AS sunrun, updated_at
FROM public.user_balances
WHERE stu_number IN ('202413008513', '202413005727', '202413005011', '202413005191')
ORDER BY stu_number;
