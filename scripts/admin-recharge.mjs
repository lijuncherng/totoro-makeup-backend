/**
 * 管理员手动充值脚本
 * 用法: node scripts/admin-recharge.mjs
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tgxzonqqifaakjmbaiml.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRneHpvbnFxaWZhYWtqbWJhaW1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzk4MzYxMSwiZXhwIjoyMDg5NTU5NjExfQ.nd7Y-H0tWpIRvT8wxnrpZ-s5De6Tyq_RbW1cwNNdpyo';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const students = [
  { stuNumber: '202413007382', times: 22, kind: 'sunrun' },
  { stuNumber: '202413007186', times: 22, kind: 'sunrun' },
];

async function adminRecharge(stuNumber, times, kind) {
  const MAX_RETRIES = 3;
  let ok = false;
  let finalMakeup = 0;
  let finalSunrun = 0;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // 查询当前余额
    const { data: currentRow, error: selectErr } = await supabase
      .from('user_balances')
      .select('id, balance, balance_sunrun')
      .eq('stu_number', stuNumber)
      .maybeSingle();

    if (selectErr) {
      console.error(`  [${stuNumber}] 查询余额失败: ${selectErr.message}`);
      continue;
    }

    const prevMakeup = currentRow?.balance ?? 0;
    const prevSunrun = (currentRow)?.balance_sunrun ?? 0;
    const newMakeup = kind === 'makeup' ? prevMakeup + times : prevMakeup;
    const newSunrun = kind === 'sunrun' ? prevSunrun + times : prevSunrun;

    if (currentRow) {
      // 乐观锁更新
      const { data: updated, error: ue } = await supabase
        .from('user_balances')
        .update({ balance: newMakeup, balance_sunrun: newSunrun, updated_at: new Date().toISOString() })
        .eq('stu_number', stuNumber)
        .eq('balance', prevMakeup)
        .select('balance, balance_sunrun')
        .single();

      if (ue === null && updated) {
        finalMakeup = newMakeup;
        finalSunrun = newSunrun;
        ok = true;
        break;
      } else if (ue) {
        console.warn(`  [${stuNumber}] attempt ${attempt} 乐观锁冲突: ${ue.message}`);
      }
    } else {
      // 插入新行
      const { error: ie } = await supabase.from('user_balances').insert({
        stu_number: stuNumber,
        balance: newMakeup,
        balance_sunrun: newSunrun,
        updated_at: new Date().toISOString(),
      });
      if (ie === null) {
        finalMakeup = newMakeup;
        finalSunrun = newSunrun;
        ok = true;
        break;
      } else {
        console.warn(`  [${stuNumber}] 插入余额行失败: ${ie.message}`);
      }
    }
  }

  if (!ok) {
    console.error(`❌ [${stuNumber}] 充值失败`);
    return false;
  }

  // 写入交易记录
  await supabase.from('balance_transactions').insert({
    stu_number: stuNumber,
    type: 'admin_recharge',
    amount: times,
    balance_after: kind === 'makeup' ? finalMakeup : finalSunrun,
    balance_kind: kind,
    description: `管理员手动充值${kind === 'makeup' ? '补跑' : '阳光跑'} ×${times}`,
  });

  const label = kind === 'makeup' ? '补跑' : '阳光跑';
  console.log(`✅ [${stuNumber}] 充值成功: +${times} 次${label}`);
  console.log(`   余额: 补跑=${finalMakeup}, 阳光跑=${finalSunrun}`);
  return true;
}

async function main() {
  console.log('=== 管理员手动充值 ===\n');
  for (const s of students) {
    await adminRecharge(s.stuNumber, s.times, s.kind);
  }
  console.log('\n全部完成！');
}

main().catch(console.error);
