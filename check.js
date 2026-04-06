const SUPABASE_URL = 'https://tgxzonqqifaakjmbaiml.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRneHpvbnFxaWZhYWtqbWJhaW1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzk4MzYxMSwiZXhwIjoyMDg5NTU5NjExfQ.nd7Y-H0tWpIRvT8wxnrpZ-s5De6Tyq_RbW1cwNNdpyo';

async function check() {
  // 1. 查询所有已使用卡密的用户
  const cardRes = await fetch(`${SUPABASE_URL}/rest/v1/recharge_cards?select=used_by,card_kind,times&used_by=not.is.null`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
    }
  });
  const cards = await cardRes.json();
  
  // 统计每个用户使用的卡密
  const usage = {};
  cards.forEach(c => {
    if (!usage[c.used_by]) {
      usage[c.used_by] = { makeup: 0, sunrun: 0 };
    }
    if (c.card_kind === 'makeup') {
      usage[c.used_by].makeup += c.times;
    } else {
      usage[c.used_by].sunrun += c.times;
    }
  });
  
  console.log('=== 已使用卡密的用户统计 ===');
  console.log('学号\t\t补跑\t阳光跑');
  for (const [stu, counts] of Object.entries(usage)) {
    console.log(`${stu}\t${counts.makeup}\t${counts.sunrun}`);
  }
  
  // 2. 查询有余额的用户
  const balanceRes = await fetch(`${SUPABASE_URL}/rest/v1/user_balances?select=stu_number,balance,balance_sunrun`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
    }
  });
  const balances = await balanceRes.json();
  
  console.log('\n=== 有余额的用户 ===');
  balances.forEach(b => {
    console.log(`${b.stu_number}: 补跑=${b.balance}, 阳光跑=${b.balance_sunrun}`);
  });
  
  // 3. 对比：找出使用了卡密但没有余额的用户
  console.log('\n=== 问题用户（使用了卡密但没有余额）===');
  for (const stu of Object.keys(usage)) {
    const hasBalance = balances.find(b => b.stu_number === stu);
    if (!hasBalance) {
      console.log(`${stu}: 补跑=${usage[stu].makeup}, 阳光跑=${usage[stu].sunrun}`);
    }
  }
}

check();
