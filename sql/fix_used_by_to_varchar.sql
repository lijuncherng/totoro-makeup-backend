-- =============================================
-- 修复 recharge_cards.used_by 字段类型为 VARCHAR
-- 如果字段是 UUID 类型，将其改为 VARCHAR(100)
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

-- 2. 如果字段是 UUID 类型，修改为 VARCHAR(100)
-- 注意：这会清空所有已使用的卡密记录（因为 UUID 无法转换为学号）
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
        RAISE NOTICE '检测到 used_by 字段是 UUID 类型，开始修复...';
        
        -- 先清空所有 used_by 值（因为 UUID 无法直接转换为学号字符串）
        UPDATE public.recharge_cards 
        SET used_by = NULL, used_at = NULL 
        WHERE used_by IS NOT NULL;
        
        -- 修改字段类型为 VARCHAR(100)
        ALTER TABLE public.recharge_cards 
        ALTER COLUMN used_by TYPE VARCHAR(100) USING NULL;
        
        -- 如果字段有 NOT NULL 约束，需要先删除
        ALTER TABLE public.recharge_cards 
        ALTER COLUMN used_by DROP NOT NULL;
        
        RAISE NOTICE '✅ 已成功修改 used_by 字段类型为 VARCHAR(100)';
    ELSE
        RAISE NOTICE '✅ used_by 字段类型正确（VARCHAR），无需修改';
    END IF;
END $$;

-- 3. 验证修改结果
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'recharge_cards'
  AND column_name = 'used_by';

-- 4. 重新创建 atomic_redeem_card 函数（确保函数定义正确）
-- 注意：这个函数应该在 fix_used_by_to_varchar.sql 执行后执行
-- 或者直接执行 atomic_redeem_card.sql
