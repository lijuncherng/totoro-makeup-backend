-- =============================================
-- 清理重复的消费记录（同一 session_id 多条 active/completed）
-- =============================================
-- 执行前请先备份数据！
-- =============================================

-- 步骤 1：查看所有重复记录（确认要删除哪些）
SELECT 
  id,
  session_id,
  kind,
  status,
  created_at,
  completed_at,
  stu_number
FROM public.balance_consumptions
WHERE session_id IN (
  SELECT session_id
  FROM public.balance_consumptions
  WHERE status IN ('active', 'completed')
  GROUP BY session_id
  HAVING COUNT(*) > 1
)
AND status IN ('active', 'completed')
ORDER BY session_id, created_at;

-- =============================================
-- 步骤 2：删除重复记录（保留最早的一条）
-- =============================================
-- 策略：对每个 session_id，保留 created_at 最早的那条，删除其他的
-- 如果两条都是 completed，保留 completed_at 最早的那条
-- =============================================

-- 方法 1：使用窗口函数删除重复（推荐）
-- 保留每个 session_id 中 created_at 最早的那条记录
DELETE FROM public.balance_consumptions
WHERE id IN (
  SELECT id
  FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY session_id 
        ORDER BY 
          CASE WHEN status = 'completed' THEN 0 ELSE 1 END,  -- completed 优先
          COALESCE(completed_at, created_at) ASC  -- 按完成时间或创建时间排序
      ) as rn
    FROM public.balance_consumptions
    WHERE status IN ('active', 'completed')
  ) ranked
  WHERE rn > 1  -- 只保留第一条，删除其余的
);

-- =============================================
-- 步骤 3：验证清理结果（应该返回 0 行）
-- =============================================
SELECT session_id, COUNT(*) as cnt
FROM public.balance_consumptions
WHERE status IN ('active', 'completed')
GROUP BY session_id
HAVING COUNT(*) > 1;

-- =============================================
-- 步骤 4：清理完成后，执行 prevent_duplicate_consumptions.sql 创建唯一索引
-- =============================================
