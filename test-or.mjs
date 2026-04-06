import { createClient } from '@supabase/supabase-js';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRneHpvbnFxaWZhYWtqbWJhaW1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzk4MzYxMSwiZXhwIjoyMDg5NTU5NjExfQ.nd7Y-H0tWpIRvT8wxnrpZ-s5De6Tyq_RbW1cwNNdpyo';
const sb = createClient('https://tgxzonqqifaakjmbaiml.supabase.co', KEY);

const TEST_CODE = 'TMC-7ZRF-HAK6-TWB5-74';
const STU = '202413006775';

async function fixAndTest() {
  // Step 1: Check current used_by value
  console.log('=== Step 1: Check current state ===');
  const { data: before } = await sb
    .from('recharge_cards')
    .select('code, used_by, used_at')
    .eq('code', TEST_CODE)
    .maybeSingle();
  console.log('Before:', JSON.stringify(before));

  // Step 2: Try UPDATE with .or() filter and stuNumber value (this is what our fixed code does)
  console.log('\n=== Step 2: atomicRedeemCard simulation (.or() + stuNumber) ===');
  const { data: r1, error: e1 } = await sb
    .from('recharge_cards')
    .update({ used_by: STU, used_at: new Date().toISOString() })
    .or(`used_by.is.null,used_by.eq.`)
    .eq('code', TEST_CODE)
    .select('code, used_by, used_at')
    .maybeSingle();
  console.log('Result:', JSON.stringify({ data: r1, error: e1 }));

  // Check actual state
  const { data: after1 } = await sb
    .from('recharge_cards')
    .select('code, used_by, used_at')
    .eq('code', TEST_CODE)
    .maybeSingle();
  console.log('After update:', JSON.stringify(after1));

  // Step 3: Try again - should fail
  console.log('\n=== Step 3: Try again (should be blocked) ===');
  const { data: r2, error: e2 } = await sb
    .from('recharge_cards')
    .update({ used_by: STU, used_at: new Date().toISOString() })
    .or(`used_by.is.null,used_by.eq.`)
    .eq('code', TEST_CODE)
    .select('code, used_by, used_at')
    .maybeSingle();
  console.log('Result:', JSON.stringify({ data: r2, error: e2 }));
  if (!r2) {
    console.log('STATUS: BLOCKED = GOOD (card already used, cannot redeem again)');
  } else {
    console.log('STATUS: UNBLOCKED = BAD (duplicate allowed!)');
  }

  // Cleanup
  console.log('\n=== Cleanup: reset used_by ===');
  await sb.from('recharge_cards').update({ used_by: '' }).eq('code', TEST_CODE);
  const { data: cleaned } = await sb.from('recharge_cards').select('code, used_by').eq('code', TEST_CODE).maybeSingle();
  console.log('Cleaned:', JSON.stringify(cleaned));
}

fixAndTest().catch(e => console.error('FATAL:', e.message));
