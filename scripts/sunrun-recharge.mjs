/**
 * 阳光跑充值脚本
 * 用法（PowerShell / 命令提示符）：
 *   node sunrun-recharge.mjs 202513008091 30        # 单用户充值
 *   node sunrun-recharge.mjs 202513008091 30 202513005740 30  # 多用户批量充值
 *   node sunrun-recharge.mjs query 202513008091     # 查询余额
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tgxzonqqifaakjmbaiml.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRneHpvbnFxaWZhYWtqbWJhaW1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzk4MzYxMSwiZXhwIjoyMDg5NTU5NjExfQ.nd7Y-H0tWpIRvT8wxnrpZ-s5De6Tyq_RbW1cwNNdpyo';

const supabase = createClient(supabaseUrl, supabaseKey);

function cyan(...args) { console.log('\x1b[36m%s\x1b[0m', ...args); }
function green(...args) { console.log('\x1b[32m%s\x1b[0m', ...args); }
function red(...args) { console.log('\x1b[31m%s\x1b[0m', ...args); }
function gray(...args) { console.log('\x1b[90m%s\x1b[0m', ...args); }

async function queryBalance(stuNumber) {
  const { data, error } = await supabase
    .from('user_balances')
    .select('stu_number, balance, balance_sunrun, updated_at')
    .eq('stu_number', stuNumber)
    .single();

  if (error && error.code === 'PGRST116') {
    console.log(`  ${stuNumber} \u2192 补跑=0, 阳光跑=0`);
    return null;
  }
  if (error) {
    red(`  [${stuNumber}] 查询失败: ${error.message}`);
    return null;
  }
  console.log(`  ${data.stu_number} \u2192 补跑=${data.balance ?? 0}, 阳光跑=${data.balance_sunrun ?? 0}  (更新时间: ${data.updated_at})`);
  return data;
}

async function recharge(stuNumber, addTimes) {
  const { data: existing, error: selErr } = await supabase
    .from('user_balances')
    .select('stu_number, balance, balance_sunrun')
    .eq('stu_number', stuNumber)
    .single();

  if (selErr && selErr.code !== 'PGRST116') {
    red(`  [${stuNumber}] 查询失败: ${selErr.message}`);
    return false;
  }

  if (existing) {
    const newSunrun = (existing.balance_sunrun ?? 0) + addTimes;
    const { error: upErr } = await supabase
      .from('user_balances')
      .update({ balance_sunrun: newSunrun, updated_at: new Date().toISOString() })
      .eq('stu_number', stuNumber);
    if (upErr) { red(`  [${stuNumber}] 更新失败: ${upErr.message}`); return false; }
    green(`  [${stuNumber}] 充值成功: 阳光跑 ${existing.balance_sunrun ?? 0} \u2192 ${newSunrun}`);
  } else {
    const { error: insErr } = await supabase
      .from('user_balances')
      .insert({ session_id: `admin-add-${stuNumber}`, stu_number: stuNumber, balance: 0, balance_sunrun: addTimes, updated_at: new Date().toISOString() });
    if (insErr) { red(`  [${stuNumber}] 新建失败: ${insErr.message}`); return false; }
    green(`  [${stuNumber}] 新建成功: 阳光跑=${addTimes}`);
  }
  return true;
}

// 主逻辑
const args = process.argv.slice(2);

if (args.length === 0) {
  // 交互模式
  const readline = (await import('readline')).default.createInterface({ input: process.stdin, output: process.stdout });
  const prompt = q => new Promise(r => readline.question(q, r));

  console.log('\n=== 阳光跑充值脚本 ===');
  const mode = await prompt('模式: 1=单用户充值  2=批量充值  3=查询余额  请选择 (1/2/3): ');
  readline.close();

  if (mode === '1') {
    const stu = await prompt('学号: ');
    const times = parseInt(await prompt('充值次数: '), 10);
    if (!stu || isNaN(times)) { red('输入无效'); process.exit(1); }
    await recharge(stu.trim(), times);
  } else if (mode === '2') {
    const input = await prompt('学号列表（逗号分隔）: ');
    const timesInput = await prompt('每个用户充值次数: ');
    const times = parseInt(timesInput, 10);
    if (isNaN(times)) { red('次数无效'); process.exit(1); }
    const stus = input.split(',').map(s => s.trim()).filter(Boolean);
    for (const stu of stus) await recharge(stu, times);
  } else if (mode === '3') {
    const input = await prompt('学号: ');
    await queryBalance(input.trim());
  } else {
    red('未知选项');
    process.exit(1);
  }
} else if (args[0] === 'query') {
  // 命令行查询: node sunrun-recharge.mjs query 202513008091
  if (!args[1]) { red('请提供学号: node sunrun-recharge.mjs query <学号>'); process.exit(1); }
  await queryBalance(args[1]);
} else {
  // 命令行充值: node sunrun-recharge.mjs 202513008091 30 [202513005740 30 ...]
  if (args.length < 2) {
    red('用法: node sunrun-recharge.mjs <学号> <次数> [<学号> <次数> ...]');
    red('  或:  node sunrun-recharge.mjs query <学号>');
    process.exit(1);
  }
  const pairs = [];
  for (let i = 0; i < args.length - 1; i += 2) {
    pairs.push([args[i], parseInt(args[i + 1], 10)]);
  }
  for (const [stu, times] of pairs) {
    if (isNaN(times)) { red(`次数无效: ${args[i + 1]}`); continue; }
    await recharge(stu, times);
  }
}
