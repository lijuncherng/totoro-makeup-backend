import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tgxzonqqifaakjmbaiml.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRneHpvbnFxaWZhYWtqbWJhaW1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzk4MzYxMSwiZXhwIjoyMDg5NTU5NjExfQ.nd7Y-H0tWpIRvT8wxnrpZ-s5De6Tyq_RbW1cwNNdpyo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase
    .from('user_balances')
    .select('stu_number, balance, balance_sunrun, updated_at')
    .eq('stu_number', '202513006091')
    .single();

  if (error) {
    console.error('查询失败:', error);
    return;
  }

  if (!data) {
    console.log('学号 202513006091 在数据库中不存在');
    return;
  }

  console.log('=== 学号 202513006091 当前余额 ===');
  console.log('raw:', JSON.stringify(data, null, 2));
  console.log(`补跑次数 (TMC): ${data.balance}`);
  console.log(`阳光跑次数 (TSR): ${data.balance_sunrun}`);
  console.log(`更新时间: ${data.updated_at}`);
}

main();
