-- =============================================
-- 创建原子 upsert 会话函数（解决 delete+insert 竞态问题）
-- 同一学号只会有一条记录，新登录自动替换旧会话
-- =============================================
CREATE OR REPLACE FUNCTION public.upsert_session(
  p_id UUID,
  p_campus_id VARCHAR(100),
  p_school_id VARCHAR(100),
  p_stu_number VARCHAR(100),
  p_token TEXT,
  p_phone_number VARCHAR(50),
  p_sex VARCHAR(10),
  p_expires_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 写入/更新会话，同一学号只保留最新一条
  -- campus_center_lng/lat 来自 getCampusPaper 返回的真实坐标（首次登录为 NULL，后续补跑成功后更新）
  INSERT INTO public.sessions (id, campus_id, school_id, stu_number, token, phone_number, sex, expires_at, campus_center_lng, campus_center_lat)
  VALUES (p_id, p_campus_id, p_school_id, p_stu_number, p_token, p_phone_number, p_sex, p_expires_at, NULL, NULL)
  ON CONFLICT (stu_number) DO UPDATE SET
    -- 注意：禁止更新 id！sessions.id 是 makeup_tasks.user_id 的外键主键，
    -- 任何 UPDATE sessions SET id = ... 都会触发外键约束冲突。
    campus_id = EXCLUDED.campus_id,
    school_id = EXCLUDED.school_id,
    token = EXCLUDED.token,
    phone_number = EXCLUDED.phone_number,
    sex = EXCLUDED.sex,
    expires_at = EXCLUDED.expires_at,
    -- 已有坐标时保留真实值（不为 NULL 且不为 0），首次登录保持 NULL
    campus_center_lng = COALESCE(NULLIF(sessions.campus_center_lng, 0), NULLIF(EXCLUDED.campus_center_lng, 0)),
    campus_center_lat = COALESCE(NULLIF(sessions.campus_center_lat, 0), NULLIF(EXCLUDED.campus_center_lat, 0)),
    created_at = NOW();

  -- 自动建档：扫码登录时确保 user_balances 记录存在（已有余额不覆盖）
  INSERT INTO public.user_balances (stu_number, session_id, balance, balance_sunrun)
  VALUES (p_stu_number, p_id, 0, 0)
  ON CONFLICT (stu_number) DO NOTHING;
END;
$$;
