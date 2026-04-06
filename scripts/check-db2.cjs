const https = require('https');
const SUPABASE_URL = 'https://tgxzonqqifaakjmbaiml.supabase.co';
const ANON_KEY = 'sb_publishable_eLI1rnSsbkWZkIr1dzj6Lw_m47Co_SY';
function req(method, path) {
  return new Promise(function(resolve, reject) {
    var url = new URL(path, SUPABASE_URL);
    var opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'apikey': ANON_KEY,
        'Authorization': 'Bearer ' + ANON_KEY,
        'Content-Type': 'application/json'
      }
    };
    var r = https.request(opts, function(res) {
      var data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data: data.slice(0, 2000) }); }
      });
    });
    r.on('error', reject);
    r.end();
  });
}
async function main() {
  console.log('=== 余额追踪 ===');
  var b = await req('GET', '/rest/v1/user_balances');
  console.log('1. 余额记录:');
  if (b.status === 200 && b.data) {
    b.data.forEach(function(row) {
      console.log('   session: ' + row.session_id + ' | 补跑余额: ' + row.balance + ' | 阳光跑余额: ' + row.balance_sunrun + ' | 更新: ' + row.updated_at);
    });
  }
  var tx = await req('GET', '/rest/v1/balance_transactions');
  console.log('2. 交易记录:');
  if (tx.status === 200 && tx.data) {
    tx.data.forEach(function(t) {
      console.log('   ' + t.type + ' | 金额: ' + t.amount + ' | 余额: ' + t.balance_after + ' | 描述: ' + t.description);
    });
  }
  var cards = await req('GET', '/rest/v1/recharge_cards');
  console.log('3. 卡密:');
  if (cards.status === 200 && cards.data) {
    var used = 0, unused = 0;
    cards.data.forEach(function(c) { if (c.used_by) used++; else unused++; });
    console.log('   总计: ' + cards.data.length + ' | 已使用: ' + used + ' | 未使用: ' + unused);
    cards.data.slice(0, 3).forEach(function(c) {
      console.log('   - ' + c.code + ' | ' + c.card_kind + ' | ' + c.times + '次 | ' + (c.used_by ? '已用: ' + c.used_by.slice(0, 8) : '未使用'));
    });
  }
  var s = await req('GET', '/rest/v1/sessions');
  console.log('4. 会话:');
  if (s.status === 200 && s.data) {
    s.data.forEach(function(sess) {
      console.log('   ' + sess.id.slice(0, 8) + ' | 学号: ' + sess.stu_number + ' | ' + sess.created_at);
    });
  }
  var tasks = await req('GET', '/rest/v1/makeup_tasks');
  console.log('5. 补跑任务:');
  if (tasks.status === 200 && tasks.data) {
    console.log('   总计: ' + tasks.data.length + '条');
    tasks.data.forEach(function(t) {
      console.log('   - ' + (t.custom_date || '无日期') + ' | ' + t.status + ' | ' + (t.error_message || '无错误'));
    });
  } else {
    console.log('   错误或为空');
  }
  console.log('=== 完成 ===');
}
main().catch(console.error);
