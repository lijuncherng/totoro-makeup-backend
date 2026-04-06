/**
 * 数据库检查和修复脚本
 * 使用 Supabase REST API
 */
const https = require('https');

const SUPABASE_URL = 'https://tgxzonqqifaakjmbaiml.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRneHpvbnFxaWZhYWtqbWJhaW1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzk4MzYxMSwiZXhwIjoxMDg5NTU5NjExfQ.nd7Y-H0tWpIRvT8wxnrpZ-s5De6Tyq_RbW1cwNNdpyo';

function request(method, path, body, params = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SUPABASE_URL);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json',
      }
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function checkTable(tableName) {
  try {
    const r = await request('GET', `/rest/v1/${tableName}`, null, { limit: 1 });
    if (r.status === 200 || r.status === 201) {
      console.log(`  OK ${tableName} 表可访问`);
      return true;
    } else {
      console.log(`  FAIL ${tableName} 表: ${r.status}`, JSON.stringify(r.data).slice(0, 200));
      return false;
    }
  } catch (e) {
    console.log(`  ERROR ${tableName}: ${e.message}`);
    return false;
  }
}

async function checkColumn(tableName, columnName) {
  try {
    const r = await request('GET', `/rest/v1/${tableName}`, null, { select: columnName, limit: 1 });
    if (r.status === 200 || r.status === 400) {
      // 400 可能是因为列不存在，但表存在
      console.log(`  OK ${tableName}.${columnName} 列`);
      return true;
    } else {
      console.log(`  WARN ${tableName}.${columnName}: ${r.status}`);
      return false;
    }
  } catch (e) {
    console.log(`  ERROR ${tableName}.${columnName}: ${e.message}`);
    return false;
  }
}

async function checkBalance(sessionId) {
  try {
    const r = await request('GET', '/rest/v1/user_balances', null, { eq_session_id: sessionId });
    console.log(`  余额数据:`, JSON.stringify(r.data).slice(0, 500));
    return r.data;
  } catch (e) {
    console.log(`  查询余额失败: ${e.message}`);
    return null;
  }
}

async function getSessions() {
  try {
    const r = await request('GET', '/rest/v1/sessions', null, { limit: 5, order: 'created_at.desc' });
    console.log(`  最近会话:`, JSON.stringify(r.data).slice(0, 500));
    return r.data;
  } catch (e) {
    console.log(`  查询会话失败: ${e.message}`);
    return [];
  }
}

async function main() {
  console.log('=== 数据库诊断 ===\n');

  console.log('1. 检查表是否存在...');
  const tables = ['sessions', 'user_balances', 'recharge_cards', 'balance_transactions', 'balance_consumptions', 'makeup_tasks'];
  for (const t of tables) {
    await checkTable(t);
  }

  console.log('\n2. 检查 user_balances 表的列...');
  const cols = ['id', 'session_id', 'balance', 'balance_sunrun', 'updated_at', 'created_at'];
  for (const c of cols) {
    await checkColumn('user_balances', c);
  }

  console.log('\n3. 检查 recharge_cards 表的列...');
  const cardCols = ['id', 'code', 'times', 'card_kind', 'used_by', 'expires_at'];
  for (const c of cardCols) {
    await checkColumn('recharge_cards', c);
  }

  console.log('\n4. 查询最近会话...');
  const sessions = await getSessions();

  if (sessions && sessions.length > 0) {
    console.log('\n5. 查询第一个会话的余额...');
    await checkBalance(sessions[0].id);
  }

  console.log('\n=== 诊断完成 ===');
  console.log('\n请把输出发给开发者以进行进一步诊断。');
}

main().catch(console.error);
