import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tgxzonqqifaakjmbaiml.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRneHpvbnFxaWZhYWtqbWJhaW1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzk4MzYxMSwiZXhwIjoyMDg5NTU5NjExfQ.nd7Y-H0tWpIRvT8wxnrpZ-s5De6Tyq_RbW1cwNNdpyo';

const supabase = createClient(supabaseUrl, supabaseKey);

const STUDENTS = ['202513008091', '202513005740'];
const SUNRUN_ADD = 30;

async function upsertSunrun(stuNumber, addTimes) {
  // 先查询现有记录
  const { data: existing, error: selectErr } = await supabase
    .from('user_balances')
    .select('stu_number, balance, balance_sunrun')
    .eq('stu_number', stuNumber)
    .single();

  if (selectErr && selectErr.code !== 'PGRST116') {
    console.error(`  [${stuNumber}] 查询失败:`, selectErr);
    return false;
  }

  if (existing) {
    // 存在记录，UPDATE
    const newSunrun = (existing.balance_sunrun ?? 0) + addTimes;
    const { error: updateErr } = await supabase
      .from('user_balances')
      .update({ balance_sunrun: newSunrun, updated_at: new Date().toISOString() })
      .eq('stu_number', stuNumber);

    if (updateErr) {
      console.error(`  [${stuNumber}] 更新失败:`, updateErr);
      return false;
    }
    console.log(`  [${stuNumber}] 更新成功: 补跑=${existing.balance ?? 0}, 阳光跑 ${existing.balance_sunrun ?? 0} -> ${newSunrun}`);
  } else {
    // 不存在，INSERT
    const { error: insertErr } = await supabase
      .from('user_balances')
      .insert({
        session_id: `admin-add-${stuNumber}`,
        stu_number: stuNumber,
        balance: 0,
        balance_sunrun: addTimes,
        updated_at: new Date().toISOString(),
      });

    if (insertErr) {
      console.error(`  [${stuNumber}] 插入失败:`, insertErr);
      return false;
    }
    console.log(`  [${stuNumber}] 新建成功: 补跑=0, 阳光跑=${addTimes}`);
  }

  return true;
}

async function main() {
  console.log(`开始给以下学号各增加 ${SUNRUN_ADD} 次阳光跑: ${STUDENTS.join(', ')}\n`);

  for (const stu of STUDENTS) {
    await upsertSunrun(stu, SUNRUN_ADD);
  }

  // 验证结果
  console.log('\n=== 验证结果 ===');
  const { data: rows, error: verifyErr } = await supabase
    .from('user_balances')
    .select('stu_number, balance, balance_sunrun, updated_at')
    .in('stu_number', STUDENTS);

  if (verifyErr) {
    console.error('验证查询失败:', verifyErr);
    return;
  }

  for (const row of rows) {
    console.log(`${row.stu_number}: 补跑=${row.balance ?? 0}, 阳光跑=${row.balance_sunrun ?? 0}, 更新时间=${row.updated_at}`);
  }

  // 检查是否有漏网之鱼
  if (rows.length < STUDENTS.length) {
    const found = new Set(rows.map(r => r.stu_number));
    const missing = STUDENTS.filter(s => !found.has(s));
    console.log(`\n⚠️ 以下学号未找到记录: ${missing.join(', ')}`);
  }
}

main().catch(console.error);
