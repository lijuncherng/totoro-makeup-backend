const SUPABASE_URL = 'https://tgxzonqqifaakjmbaiml.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRneHpvbnFxaWZhYWtqbWJhaW1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzk4MzYxMSwiZXhwIjoyMDg5NTU5NjExfQ.nd7Y-H0tWpIRvT8wxnrpZ-s5De6Tyq_RbW1cwNNdpyo';

async function test() {
  // 先找一张未使用的卡密
  const cardRes = await fetch(`${SUPABASE_URL}/rest/v1/recharge_cards?used_by=is.null&limit=5`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
    }
  });
  const cards = await cardRes.json();
  console.log('未使用的卡密:', cards.length > 0 ? cards[0].code : '无');

  if (cards.length === 0) return;

  const testCode = cards[0].code;
  const testStu = 'NEW-USER-TEST-' + Date.now();

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/atomic_redeem_card`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_code: testCode,
      p_used_by: testStu,
      p_card_kind: cards[0].card_kind,
      p_redeem_times: cards[0].times
    })
  });
  const data = await res.json();
  console.log('\n=== 充值结果 ===');
  console.log(JSON.stringify(data, null, 2));

  // 验证余额
  const verifyRes = await fetch(`${SUPABASE_URL}/rest/v1/user_balances?stu_number=eq.${testStu}`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
    }
  });
  const balance = await verifyRes.json();
  console.log('\n=== 余额验证 ===');
  console.log(JSON.stringify(balance, null, 2));
}

test();
