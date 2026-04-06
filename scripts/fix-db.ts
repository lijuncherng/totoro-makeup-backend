import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

const supabaseUrl = process.env.SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Parse the Supabase URL to build a direct PostgreSQL connection string
// Supabase URL format: https://xxxx.supabase.co
const urlMatch = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
const projectRef = urlMatch ? urlMatch[1] : '';
const dbHost = `${projectRef}.supabase.co`;

const pool = new Pool({
  host: dbHost,
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: serviceRoleKey,
  ssl: { rejectUnauthorized: false },
});

async function fix() {
  const client = await pool.connect();
  try {
    console.log('🔧 开始修复数据库表结构...\n');

    // 1. 创建 user_balances 表（如果不存在）
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.user_balances (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        session_id VARCHAR(100) UNIQUE NOT NULL,
        balance INTEGER NOT NULL DEFAULT 0,
        balance_sunrun INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ user_balances 表已创建/已存在');

    // 2. 添加 balance_sunrun 列（如果不存在）
    try {
      await client.query(`ALTER TABLE public.user_balances ADD COLUMN IF NOT EXISTS balance_sunrun INTEGER NOT NULL DEFAULT 0;`);
      console.log('✅ balance_sunrun 列已添加');
    } catch (e: any) {
      if (e.code !== '42701') console.warn('⚠️ balance_sunrun 列添加失败:', e.message);
      else console.log('ℹ️ balance_sunrun 列已存在');
    }

    // 3. 创建 balance_transactions 表
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.balance_transactions (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        session_id VARCHAR(100) NOT NULL,
        type VARCHAR(20) NOT NULL,
        amount INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        balance_kind VARCHAR(20),
        description TEXT,
        task_id VARCHAR(100),
        card_code VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ balance_transactions 表已创建/已存在');

    // 4. 添加 balance_kind 列
    try {
      await client.query(`ALTER TABLE public.balance_transactions ADD COLUMN IF NOT EXISTS balance_kind VARCHAR(20);`);
      console.log('✅ balance_kind 列已添加');
    } catch (e: any) {
      if (e.code !== '42701') console.warn('⚠️ balance_kind 列添加失败:', e.message);
      else console.log('ℹ️ balance_kind 列已存在');
    }

    // 5. 创建 balance_consumptions 表
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.balance_consumptions (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        session_id VARCHAR(100) NOT NULL,
        kind VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        refunded_at TIMESTAMPTZ
      );
    `);
    console.log('✅ balance_consumptions 表已创建/已存在');

    // 6. 创建 sessions 表
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.sessions (
        id VARCHAR(100) PRIMARY KEY,
        campus_id VARCHAR(100),
        school_id VARCHAR(100),
        stu_number VARCHAR(100),
        token TEXT,
        phone_number VARCHAR(50),
        sex VARCHAR(10),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ
      );
    `);
    console.log('✅ sessions 表已创建/已存在');

    // 7. 创建 recharge_cards 表
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.recharge_cards (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        type VARCHAR(20) NOT NULL DEFAULT 'times',
        times INTEGER NOT NULL,
        card_kind VARCHAR(20) NOT NULL DEFAULT 'makeup',
        batch_id VARCHAR(50),
        expires_at TIMESTAMPTZ,
        used_by VARCHAR(100),
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ recharge_cards 表已创建/已存在');

    // 8. 添加 card_kind 列
    try {
      await client.query(`ALTER TABLE public.recharge_cards ADD COLUMN IF NOT EXISTS card_kind VARCHAR(20) NOT NULL DEFAULT 'makeup';`);
      console.log('✅ card_kind 列已添加');
    } catch (e: any) {
      if (e.code !== '42701') console.warn('⚠️ card_kind 列添加失败:', e.message);
      else console.log('ℹ️ card_kind 列已存在');
    }

    // 9. 添加 used_by 列
    try {
      await client.query(`ALTER TABLE public.recharge_cards ADD COLUMN IF NOT EXISTS used_by VARCHAR(100);`);
      console.log('✅ used_by 列已添加');
    } catch (e: any) {
      if (e.code !== '42701') console.warn('⚠️ used_by 列添加失败:', e.message);
      else console.log('ℹ️ used_by 列已存在');
    }

    // 10. 删除错误的 used_by 唯一索引（如果存在）
    // 注意：不需要 used_by 的唯一索引，因为：
    // 1. code 字段本身是 UNIQUE，确保每张卡密只有一条记录
    // 2. 应用层通过原子更新（WHERE used_by IS NULL OR used_by = ''）确保卡密只能使用一次
    // 3. 一张卡密只能使用一次（无论谁使用），使用后立即失效
    // 4. 同一用户可以使用多张不同的卡密，所以 used_by 不应该有唯一约束
    try {
      await client.query(`DROP INDEX IF EXISTS public.idx_recharge_cards_used_by;`);
      console.log('✅ 已删除错误的 used_by 唯一索引');
    } catch (e: any) {
      if (e.code !== '42P01') console.warn('⚠️ 删除索引失败:', e.message);
      else console.log('ℹ️ 索引不存在（已删除或从未创建）');
    }

    // 11. 启用 RLS（如未启用）
    await client.query(`ALTER TABLE public.user_balances ENABLE ROW LEVEL SECURITY;`);
    await client.query(`ALTER TABLE public.balance_transactions ENABLE ROW LEVEL SECURITY;`);
    await client.query(`ALTER TABLE public.recharge_cards ENABLE ROW LEVEL SECURITY;`);
    await client.query(`ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;`);
    await client.query(`ALTER TABLE public.balance_consumptions ENABLE ROW LEVEL SECURITY;`);
    console.log('✅ RLS 已启用');

    // 12. 创建 RLS 策略
    // user_balances
    await client.query(`DROP POLICY IF EXISTS "Anyone can read user_balances" ON public.user_balances;`);
    await client.query(`DROP POLICY IF EXISTS "Service role can manage user_balances" ON public.user_balances;`);
    await client.query(`CREATE POLICY "Anyone can read user_balances" ON public.user_balances FOR SELECT TO authenticated, anon USING (true);`);
    await client.query(`CREATE POLICY "Service role can manage user_balances" ON public.user_balances FOR ALL TO service_role USING (true) WITH CHECK (true);`);

    // balance_transactions
    await client.query(`DROP POLICY IF EXISTS "Anyone can read balance_transactions" ON public.balance_transactions;`);
    await client.query(`DROP POLICY IF EXISTS "Service role can manage balance_transactions" ON public.balance_transactions;`);
    await client.query(`CREATE POLICY "Anyone can read balance_transactions" ON public.balance_transactions FOR SELECT TO authenticated, anon USING (true);`);
    await client.query(`CREATE POLICY "Service role can manage balance_transactions" ON public.balance_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);`);

    // recharge_cards
    await client.query(`DROP POLICY IF EXISTS "Anyone can read recharge_cards" ON public.recharge_cards;`);
    await client.query(`DROP POLICY IF EXISTS "Service role can manage recharge_cards" ON public.recharge_cards;`);
    await client.query(`CREATE POLICY "Anyone can read recharge_cards" ON public.recharge_cards FOR SELECT TO authenticated, anon USING (true);`);
    await client.query(`CREATE POLICY "Service role can manage recharge_cards" ON public.recharge_cards FOR ALL TO service_role USING (true) WITH CHECK (true);`);

    // sessions
    await client.query(`DROP POLICY IF EXISTS "Anyone can read sessions" ON public.sessions;`);
    await client.query(`DROP POLICY IF EXISTS "Service role can manage sessions" ON public.sessions;`);
    await client.query(`CREATE POLICY "Anyone can read sessions" ON public.sessions FOR SELECT TO authenticated, anon USING (true);`);
    await client.query(`CREATE POLICY "Service role can manage sessions" ON public.sessions FOR ALL TO service_role USING (true) WITH CHECK (true);`);

    // balance_consumptions
    await client.query(`DROP POLICY IF EXISTS "Anyone can manage balance_consumptions" ON public.balance_consumptions;`);
    await client.query(`DROP POLICY IF EXISTS "Service role can manage balance_consumptions" ON public.balance_consumptions;`);
    await client.query(`CREATE POLICY "Anyone can manage balance_consumptions" ON public.balance_consumptions FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);`);
    await client.query(`CREATE POLICY "Service role can manage balance_consumptions" ON public.balance_consumptions FOR ALL TO service_role USING (true) WITH CHECK (true);`);
    console.log('✅ RLS 策略已创建');

    // 13. 验证
    const { rows } = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('user_balances', 'balance_transactions', 'recharge_cards', 'sessions', 'balance_consumptions')
      ORDER BY table_name
    `);
    console.log('\n✅ 数据库中的表:', rows.map(r => r.table_name).join(', '));

    // 14. 验证 balance_sunrun 列
    const { rows: colRows } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user_balances'
      ORDER BY column_name
    `);
    console.log('✅ user_balances 列:', colRows.map(r => r.column_name).join(', '));

    console.log('\n🎉 数据库修复完成！');
    console.log('\n请重启 makeup-backend 服务使更改生效。');
  } catch (err) {
    console.error('\n❌ 修复失败:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

fix();
