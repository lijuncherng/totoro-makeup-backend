-- =============================================
-- 检查并修复 recharge_cards.used_by 字段类型
-- 如果字段是 UUID 类型，需要改为 VARCHAR
-- =============================================

-- 1. 检查当前字段类型
SELECT 
    column_name,
    data_type,
    character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'recharge_cards'
  AND column_name = 'used_by';

-- 2. 如果字段是 UUID 类型，需要先清理数据，然后修改类型
-- 注意：执行前请备份数据！

-- 2.1 如果 used_by 是 UUID 类型，先将其转换为 VARCHAR
-- 如果字段已经是 VARCHAR，这个操作不会执行
DO $$
BEGIN
    -- 检查字段类型
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'recharge_cards'
          AND column_name = 'used_by'
          AND data_type = 'uuid'
    ) THEN
        -- 字段是 UUID 类型，需要修改
        -- 先清空所有 used_by 值（因为 UUID 不能直接转换为学号）
        UPDATE public.recharge_cards SET used_by = NULL WHERE used_by IS NOT NULL;
        
        -- 修改字段类型为 VARCHAR(100)
        ALTER TABLE public.recharge_cards 
        ALTER COLUMN used_by TYPE VARCHAR(100) USING used_by::TEXT;
        
        RAISE NOTICE '已修改 used_by 字段类型为 VARCHAR(100)';
    ELSE
        RAISE NOTICE 'used_by 字段类型正确，无需修改';
    END IF;
END $$;

-- 3. 验证修改结果
SELECT 
    column_name,
    data_type,
    character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'recharge_cards'
  AND column_name = 'used_by';
