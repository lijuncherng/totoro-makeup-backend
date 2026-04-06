const SUPABASE_URL = 'https://tgxzonqqifaakjmbaiml.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRneHpvbnFxaWZhYWtqbWJhaW1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzk4MzYxMSwiZXhwIjoyMDg5NTU5NjExfQ.nd7Y-H0tWpIRvT8wxnrpZ-s5De6Tyq_RbW1cwNNdpyo';

const cards = [
  { code: 'TMC-JT5H-ZSPB-QFMN-07', type: 'once', card_kind: 'makeup', times: 1, batch_id: 'TEST-BATCH-003' },
  { code: 'TMC-RZ9E-KKRL-VX8P-E5', type: 'once', card_kind: 'makeup', times: 1, batch_id: 'TEST-BATCH-003' },
  { code: 'TMC-RQCQ-FWA4-AX5N-24', type: 'once', card_kind: 'makeup', times: 1, batch_id: 'TEST-BATCH-003' },
  { code: 'TMC-8BME-WU3E-6AS7-52', type: 'once', card_kind: 'makeup', times: 1, batch_id: 'TEST-BATCH-003' },
  { code: 'TMC-HMBT-DVMK-8QCL-22', type: 'once', card_kind: 'makeup', times: 1, batch_id: 'TEST-BATCH-003' },
  { code: 'TSR-J7K5-6ZHC-Z9DE-0E', type: 'once', card_kind: 'sunrun', times: 1, batch_id: 'TEST-BATCH-004' },
  { code: 'TSR-4SEP-45YW-24M9-3D', type: 'once', card_kind: 'sunrun', times: 1, batch_id: 'TEST-BATCH-004' },
  { code: 'TSR-S2EZ-PSFA-CZW8-9F', type: 'once', card_kind: 'sunrun', times: 1, batch_id: 'TEST-BATCH-004' },
  { code: 'TSR-MRRL-R3UW-NK8U-61', type: 'once', card_kind: 'sunrun', times: 1, batch_id: 'TEST-BATCH-004' },
  { code: 'TSR-M9AS-TNHT-UAAH-00', type: 'once', card_kind: 'sunrun', times: 1, batch_id: 'TEST-BATCH-004' },
];

async function insertCards() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/recharge_cards`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(cards),
  });
  const data = await response.json();
  if (response.ok) {
    console.log('✅ 成功插入 ' + data.length + ' 张测试卡密！\n');
    console.log('【补跑卡密 (TMC)】');
    data.filter(c => c.card_kind === 'makeup').forEach(c => console.log('  ' + c.code));
    console.log('\n【阳光跑卡密 (TSR)】');
    data.filter(c => c.card_kind === 'sunrun').forEach(c => console.log('  ' + c.code));
  } else {
    console.error('❌ 插入失败:', data);
  }
}

insertCards();
