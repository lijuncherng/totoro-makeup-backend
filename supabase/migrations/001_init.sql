-- ============================================
-- 补跑后端服务数据库配置
-- Supabase SQL Editor 中执行
-- ============================================

-- 1. 创建会话表
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  campus_id VARCHAR(50) NOT NULL,
  school_id VARCHAR(50) NOT NULL,
  stu_number VARCHAR(50) NOT NULL,
  token TEXT NOT NULL,
  phone_number VARCHAR(20),
  sex VARCHAR(10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- 会话索引
CREATE INDEX IF NOT EXISTS idx_sessions_stu_number ON sessions(stu_number);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- 2. 创建补跑任务表
CREATE TABLE IF NOT EXISTS makeup_tasks (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  route_id VARCHAR(100),
  task_id VARCHAR(100),
  custom_date DATE NOT NULL,
  custom_period VARCHAR(10) NOT NULL DEFAULT 'PM',
  mileage VARCHAR(20) NOT NULL DEFAULT '2.00',
  min_time VARCHAR(20) DEFAULT '4',
  max_time VARCHAR(20) DEFAULT '100',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

-- 任务索引
CREATE INDEX IF NOT EXISTS idx_makeup_tasks_user_id ON makeup_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_makeup_tasks_status ON makeup_tasks(status);
CREATE INDEX IF NOT EXISTS idx_makeup_tasks_created_at ON makeup_tasks(created_at DESC);

-- 3. 启用 RLS (Row Level Security)
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE makeup_tasks ENABLE ROW LEVEL SECURITY;

-- 4. 创建 RLS 策略

-- 会话表：用户只能查看和管理自己的会话
DROP POLICY IF EXISTS "Users can view own session" ON sessions;
CREATE POLICY "Users can view own session" ON sessions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert own session" ON sessions;
CREATE POLICY "Users can insert own session" ON sessions
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update own session" ON sessions;
CREATE POLICY "Users can update own session" ON sessions
  FOR UPDATE USING (true);

-- 补跑任务表：用户只能管理自己的任务
DROP POLICY IF EXISTS "Users can view own tasks" ON makeup_tasks;
CREATE POLICY "Users can view own tasks" ON makeup_tasks
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert own tasks" ON makeup_tasks;
CREATE POLICY "Users can insert own tasks" ON makeup_tasks
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update own tasks" ON makeup_tasks;
CREATE POLICY "Users can update own tasks" ON makeup_tasks
  FOR UPDATE USING (true);

-- 5. 匿名用户访问（使用 Service Role Key 时）
-- 如果使用 ANON_KEY，添加以下策略

-- 服务端点保护（推荐使用 API Gateway）
-- 6. 清理过期会话的定时任务（可选）
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- 每天凌晨3点执行清理
SELECT cron.schedule('cleanup-expired-sessions', '0 3 * * *', 'SELECT cleanup_expired_sessions()');

-- ============================================
-- 测试查询
-- ============================================

-- 查看所有会话
-- SELECT * FROM sessions;

-- 查看所有任务
-- SELECT * FROM makeup_tasks ORDER BY created_at DESC;

-- 查看用户的任务统计
-- SELECT status, COUNT(*) FROM makeup_tasks GROUP BY status;
