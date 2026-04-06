/**
 * 在项目内执行：清理 balance_consumptions 重复行 + 创建部分唯一索引
 *
 * 用法（在 makeup-backend 目录）：
 *   npx tsx scripts/run-cleanup-consumptions.ts
 *
 * 依赖 .env 中任一连库方式：
 *   - DATABASE_URL=postgresql://...（Supabase Dashboard -> Database -> Connection string）
 *   - 或与 scripts/fix-db.ts 相同：SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY（部分项目直连）
 */
import pg from 'pg';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

const { Pool } = pg;

function createPool(): pg.Pool {
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (dbUrl) {
    return new Pool({
      connectionString: dbUrl,
      ssl: dbUrl.includes('localhost') ? false : { rejectUnauthorized: false },
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const urlMatch = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
  const projectRef = urlMatch ? urlMatch[1] : '';
  if (!projectRef || !serviceRoleKey) {
    throw new Error(
      '请在 makeup-backend/.env 中配置 DATABASE_URL，或同时配置 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY（与 fix-db.ts 相同）'
    );
  }
  const dbHost = `${projectRef}.supabase.co`;
  return new Pool({
    host: dbHost,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: serviceRoleKey,
    ssl: { rejectUnauthorized: false },
  });
}

const DELETE_SQL = `
DELETE FROM public.balance_consumptions
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY session_id
        ORDER BY
          CASE WHEN status = 'completed' THEN 0 ELSE 1 END,
          COALESCE(completed_at, created_at) ASC
      ) AS rn
    FROM public.balance_consumptions
    WHERE status IN ('active', 'completed')
  ) ranked
  WHERE rn > 1
);
`;

const CREATE_INDEX_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_balance_consumptions_session_active_unique
ON public.balance_consumptions(session_id)
WHERE status IN ('active', 'completed');
`;

async function main() {
  const pool = createPool();
  const client = await pool.connect();
  try {
    console.log('🔍 1/4 查询重复 session_id...\n');
    const dup = await client.query(`
      SELECT session_id, COUNT(*)::int AS cnt
      FROM public.balance_consumptions
      WHERE status IN ('active', 'completed')
      GROUP BY session_id
      HAVING COUNT(*) > 1
    `);
    console.table(dup.rows);
    if (dup.rows.length === 0) {
      console.log('✅ 无重复，跳过 DELETE。\n');
    } else {
      console.log('🧹 2/4 删除重复行（每 session 保留一条）...\n');
      const del = await client.query(DELETE_SQL);
      console.log(`✅ 已删除 ${del.rowCount ?? 0} 行。\n`);
    }

    console.log('🔍 3/4 再次验证重复...\n');
    const dup2 = await client.query(`
      SELECT session_id, COUNT(*)::int AS cnt
      FROM public.balance_consumptions
      WHERE status IN ('active', 'completed')
      GROUP BY session_id
      HAVING COUNT(*) > 1
    `);
    if (dup2.rows.length > 0) {
      console.error('❌ 仍有重复，请人工检查：', dup2.rows);
      process.exit(1);
    }
    console.log('✅ 无重复。\n');

    console.log('📌 4/4 创建部分唯一索引...\n');
    await client.query(CREATE_INDEX_SQL);
    console.log('✅ idx_balance_consumptions_session_active_unique 已创建或已存在。\n');
    console.log('全部完成。');
  } catch (e: any) {
    console.error('❌ 执行失败:', e.message);
    if (e.code === '28P01' || e.message?.includes('password')) {
      console.error(
        '\n提示：若密码错误，请在 Supabase Dashboard -> Database 复制「Connection string」为 DATABASE_URL 写入 .env（不要用 service_role 当数据库密码）。'
      );
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
