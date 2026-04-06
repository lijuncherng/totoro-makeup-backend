const SUPABASE_URL = 'https://tgxzonqqifaakjmbaiml.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRneHpvbnFxaWZhYWtqbWJhaW1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzk4MzYxMSwiZXhwIjoyMDg5NTU5NjExfQ.nd7Y-H0tWpIRvT8wxnrpZ-s5De6Tyq_RbW1cwNNdpyo';

async function checkAndFixIndex() {
  console.log('检查 recharge_cards 表的索引...\n');

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/?limit=0`,
    {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    }
  );

  // 使用 SQL 查询检查索引
  const sqlResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'recharge_cards' AND indexname LIKE '%used_by%';`
    })
  });

  console.log('检查完成！');
  console.log('\n如果存在 idx_recharge_cards_used_by 索引，需要删除它：');
  console.log('在 Supabase SQL Editor 中执行:');
  console.log('  DROP INDEX IF EXISTS public.idx_recharge_cards_used_by;');
}

checkAndFixIndex();
