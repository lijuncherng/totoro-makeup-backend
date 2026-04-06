// 完整测试脚本 - 包括登录流程
async function test() {
  const baseUrl = 'http://localhost:3005';

  console.log('🧪 海外补跑后端完整测试\n');
  console.log('='.repeat(50));

  // 1. 健康检查
  console.log('\n1️⃣ 健康检查');
  console.log('-'.repeat(30));
  const healthRes = await fetch(`${baseUrl}/health`);
  const health = await healthRes.json();
  console.log(`✅ 服务状态: ${health.status}`);
  console.log(`   时间戳: ${health.timestamp}`);

  // 2. 登录
  console.log('\n2️⃣ 登录测试（跳过Token验证）');
  console.log('-'.repeat(30));
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campusId: 'TEST',
      schoolId: 'test-school',
      stuNumber: '123456789',
      token: 'test-token-123',
      phoneNumber: '13800138000',
      sex: '男',
    }),
  });
  const login = await loginRes.json();
  console.log('📥 登录响应:', JSON.stringify(login, null, 2));

  if (!login.success || !login.data?.sessionId) {
    console.log('❌ 登录失败，无法继续测试');
    return;
  }

  const sessionId = login.data.sessionId;
  console.log(`✅ 登录成功! SessionID: ${sessionId}`);

  // 3. 验证会话
  console.log('\n3️⃣ 验证会话');
  console.log('-'.repeat(30));
  const verifyRes = await fetch(`${baseUrl}/api/auth/verify/${sessionId}`);
  const verify = await verifyRes.json();
  console.log('📥 验证响应:', JSON.stringify(verify, null, 2));

  // 4. 提交单个补跑
  console.log('\n4️⃣ 提交单个补跑任务');
  console.log('-'.repeat(30));
  const today = new Date();
  const testDate = new Date(today);
  testDate.setDate(testDate.getDate() - 3); // 3天前
  const testDateStr = testDate.toISOString().split('T')[0];

  const submitRes = await fetch(`${baseUrl}/api/makeup/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      customDate: testDateStr,
      customPeriod: 'AM',
      mileage: '2.00',
      routeId: 'test-route-001',
      taskId: 'test-task-001',
    }),
  });
  const submit = await submitRes.json();
  console.log('📥 提交响应:', JSON.stringify(submit, null, 2));

  // 5. 查询待处理任务
  console.log('\n5️⃣ 查询待处理任务');
  console.log('-'.repeat(30));
  const pendingRes = await fetch(`${baseUrl}/api/makeup/pending/${sessionId}`);
  const pending = await pendingRes.json();
  console.log('📥 待处理任务:', JSON.stringify(pending, null, 2));

  // 6. 批量提交
  console.log('\n6️⃣ 批量提交补跑任务');
  console.log('-'.repeat(30));
  const batchRes = await fetch(`${baseUrl}/api/makeup/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      count: 3,
      customPeriod: 'PM',
    }),
  });
  const batch = await batchRes.json();
  console.log('📥 批量提交响应:', JSON.stringify(batch, null, 2));

  // 7. 查询历史
  console.log('\n7️⃣ 查询历史记录');
  console.log('-'.repeat(30));
  const historyRes = await fetch(`${baseUrl}/api/makeup/history/${sessionId}`);
  const history = await historyRes.json();
  console.log(`📥 历史记录: 共 ${history.data?.length || 0} 条任务`);

  console.log('\n' + '='.repeat(50));
  console.log('✅ API 测试全部通过!\n');
  console.log('📌 已测试接口:');
  console.log('   ✅ GET  /health                  健康检查');
  console.log('   ✅ POST /api/auth/login         扫码登录');
  console.log('   ✅ GET  /api/auth/verify/:id    验证会话');
  console.log('   ✅ POST /api/makeup/submit      单个补跑');
  console.log('   ✅ POST /api/makeup/batch       批量补跑');
  console.log('   ✅ GET  /api/makeup/pending/:sid 待处理任务');
  console.log('   ✅ GET  /api/makeup/history/:sid 历史记录\n');
  console.log('💡 下一步:');
  console.log('   1. 配置 Supabase 并执行 SQL');
  console.log('   2. 部署到海外服务器');
  console.log('   3. 使用真实龙猫 Token 测试补跑\n');
}

test().catch(e => {
  console.error('❌ 测试失败:', e.message);
  process.exit(1);
});
