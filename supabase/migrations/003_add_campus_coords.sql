-- =============================================
-- 为 sessions 表增加校园坐标字段
-- 用于椭圆轨迹兜底时使用该用户学校的真实 GPS 中心点
-- 避免使用硬编码的 QJXQ 坐标导致其他学校用户补跑失败
-- =============================================

ALTER TABLE IF EXISTS public.sessions
  ADD COLUMN IF NOT EXISTS campus_center_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS campus_center_lat DOUBLE PRECISION;

-- 为已有记录填充默认值（QJXQ 坐标，仅作为占位）
UPDATE public.sessions
SET
  campus_center_lng = COALESCE(campus_center_lng, 106.6949505),
  campus_center_lat = COALESCE(campus_center_lat, 29.0353885)
WHERE campus_center_lng IS NULL OR campus_center_lat IS NULL;

COMMENT ON COLUMN public.sessions.campus_center_lng IS '用户学校的 GPS 中心经度';
COMMENT ON COLUMN public.sessions.campus_center_lat IS '用户学校的 GPS 中心纬度';
