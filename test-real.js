// 用真实 Token 测试补跑
async function testRealMakeup() {
  const baseUrl = 'http://localhost:3005';

  // 你的真实 session 信息
  const sessionInfo = {
    campusId: 'QJXQ',
    schoolId: 'cqifs',
    stuNumber: '202413006775',
    stuName: '李俊呈',
    token: 'APPO0NT4XS7yCP1RBzLk0Ge0Ma388IwMptO2lxEyubZFgt7s6wng7suqSxerD/ePht2qDmkO9k29WfeQKQrrcQESwBkRStHFRte',
    phoneNumber: '13038323154',
    sex: '男',
  };

  console.log('🧪 海外补跑后端 - 真实 Token 测试\n');
  console.log('='.repeat(50));
  console.log('👤 学生:', sessionInfo.stuName);
  console.log('📱 学号:', sessionInfo.stuNumber);
  console.log('🏫 学校:', sessionInfo.schoolId);
  console.log('📍 校区:', sessionInfo.campusId);
  console.log('='.repeat(50));

  try {
    // 1. 登录
    console.log('\n1️⃣ 登录验证...');
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sessionInfo,
        skipVerify: true, // 跳过 Token 验证（因为龙猫服务器在国内）
      }),
    });
    const login = await loginRes.json();

    if (!login.success || !login.data?.sessionId) {
      console.log('❌ 登录失败:', login.message);
      return;
    }

    console.log('✅ 登录成功!');
    console.log('   SessionID:', login.data.sessionId);
    const sessionId = login.data.sessionId;

    // 2. 提交单个补跑（3天前）
    console.log('\n2️⃣ 提交补跑任务...');
    const testDate = new Date();
    testDate.setDate(testDate.getDate() - 3);
    const dateStr = testDate.toISOString().split('T')[0];

    console.log(`   📅 补跑日期: ${dateStr}`);
    console.log(`   ⏰ 时段: PM`);

    const submitRes = await fetch(`${baseUrl}/api/makeup/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        customDate: dateStr,
        customPeriod: 'PM',
        mileage: '2.00',
        routeId: '',
        taskId: '',
      }),
    });
    const submit = await submitRes.json();

    if (!submit.success) {
      console.log('❌ 提交失败:', submit.message);
      return;
    }

    console.log('✅ 任务提交成功!');
    console.log('   任务ID:', submit.data.taskId);
    const taskId = submit.data.taskId;

    // 3. 等待任务执行
    console.log('\n3️⃣ 等待任务执行...');
    console.log('   (这可能需要 1-2 分钟，请耐心等待)\n');

    // 轮询任务状态
    let completed = false;
    let attempts = 0;
    const maxAttempts = 60;

    while (!completed && attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 2000));

      const statusRes = await fetch(`${baseUrl}/api/tasks/status/${taskId}`);
      const status = await statusRes.json();

      if (status.success && status.data) {
        console.log(`   [${new Date().toLocaleTimeString()}] 状态: ${status.data.status}`);

        if (status.data.status === 'completed') {
          completed = true;
          console.log('\n✅ 补跑完成!');
          if (status.data.result) {
            console.log('   结果:', JSON.stringify(status.data.result, null, 2));
          }
        } else if (status.data.status === 'failed') {
          completed = true;
          console.log('\n❌ 补跑失败:', status.data.errorMessage);
        }
      }

      attempts++;
    }

    if (!completed) {
      console.log('\n⏰ 等待超时，请查看后端日志');
    }

    // 4. 查询历史
    console.log('\n4️⃣ 查询历史记录...');
    const historyRes = await fetch(`${baseUrl}/api/makeup/history/${sessionId}`);
    const history = await historyRes.json();
    console.log(`   共 ${history.data?.length || 0} 条记录`);

    if (history.data && history.data.length > 0) {
      console.log('\n📋 最近记录:');
      history.data.slice(0, 5).forEach((task, i) => {
        console.log(`   ${i + 1}. ${task.customDate} ${task.customPeriod} - ${task.status}`);
      });
    }

  } catch (e) {
    console.error('❌ 测试失败:', e.message);
  }

  console.log('\n' + '='.repeat(50));
  console.log('✅ 测试完成!\n');
  console.log('💡 查看后端日志获取更多详情\n');
}

testRealMakeup();
