-- =============================================
-- 防止同一 session_id 重复创建消费记录
-- =============================================
-- 问题：同一 session_id 可以创建多条 balance_consumptions 记录（active/completed），导致重复扣次
-- 解决：使用部分唯一索引，确保同一 session_id 只能有一条 active 或 completed 状态的记录
-- =============================================

-- 1. 先检查是否已存在重复记录（需要人工处理）
-- 执行以下查询，如果有结果，需要先合并/删除重复记录：
-- SELECT session_id, COUNT(*) as cnt
-- FROM public.balance_consumptions
-- WHERE status IN ('active', 'completed')
-- GROUP BY session_id
-- HAVING COUNT(*) > 1;

-- 2. 创建部分唯一索引（只对 active 和 completed 状态生效）
-- 注意：如果上面查询有重复记录，需要先处理后再执行此索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_balance_consumptions_session_active_unique
ON public.balance_consumptions(session_id)
WHERE status IN ('active', 'completed');

-- 3. 验证索引已创建
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'balance_consumptions'
-- AND indexname = 'idx_balance_consumptions_session_active_unique';

-- =============================================
-- 说明：
-- - 此索引确保同一 session_id 只能有一条 active 或 completed 记录
-- - refunded 状态的记录不受此约束（允许退款后再次消费）
-- - 如果插入时违反此约束，数据库会抛出唯一约束违反错误
-- =============================================
