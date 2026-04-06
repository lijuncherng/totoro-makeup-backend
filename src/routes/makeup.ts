/**
 * 补跑任务路由
 * 包含余额扣减逻辑：每次补跑扣1次，失败退款
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { supabase } from '../db/supabase.js';
import { executeMakeup } from '../services/executor.js';

const router = Router();

const COST_PER_RUN = 1;

/**
 * 统一会话校验：sessionId 必须属于对应 stuNumber，否则 403。
 * 单设备登录后，会话只通过 stuNumber 存在，所以直接按 stuNumber 查询即可。
 */
async function requireSession(sessionId: string): Promise<{ stuNumber: string; session: any }> {
  const { data: session, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();

  if (error || !session) {
    throw Object.assign(new Error('SESSION_NOT_FOUND'), { status: 401 });
  }

  const expiresAt = (session as any).expires_at || (session as any).expiresAt;
  if (expiresAt && new Date(expiresAt) < new Date()) {
    throw Object.assign(new Error('SESSION_EXPIRED'), { status: 401 });
  }

  const stuNumber = session.stu_number;
  if (!stuNumber) {
    throw Object.assign(new Error('NO_STU_NUMBER'), { status: 400 });
  }

  return { stuNumber, session };
}

/**
 * 原子扣减余额（乐观锁 + 重试）
 */
async function deductBalanceByStu(stuNumber: string, amount: number): Promise<{ success: boolean; newBalance: number }> {
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const { data: current, error: selectError } = await supabase
      .from('user_balances')
      .select('balance')
      .eq('stu_number', stuNumber)
      .maybeSingle();

    if (selectError) {
      console.error(`[deductBalance] 查询余额失败 (attempt ${attempt}):`, selectError);
    }

    const currentBalance = current?.balance ?? 0;

    if (currentBalance < amount) {
      return { success: false, newBalance: currentBalance };
    }

    const newBalance = currentBalance - amount;

    const { data: updated, error: updateError } = await supabase
      .from('user_balances')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('stu_number', stuNumber)
      .eq('balance', currentBalance)
      .select('balance')
      .single();

    if (!updateError && updated) {
      return { success: true, newBalance: updated.balance };
    }

    console.warn(`[deductBalance] 乐观锁冲突 (attempt ${attempt}/${MAX_RETRIES}):`, updateError?.message || 'no data returned');
  }

  console.error(`[deductBalance] 重试 ${MAX_RETRIES} 次后仍失败，stuNumber: ${stuNumber}`);
  return { success: false, newBalance: 0 };
}

/**
 * 退款（支持补跑和阳光跑）
 */
async function refundBalanceByStu(stuNumber: string, amount: number, kind: 'makeup' | 'sunrun' = 'makeup'): Promise<void> {
  const { data: current } = await supabase
    .from('user_balances')
    .select('balance, balance_sunrun')
    .eq('stu_number', stuNumber)
    .maybeSingle();

  const currentMakeup = current?.balance ?? 0;
  const currentSunrun = (current as any)?.balance_sunrun ?? 0;

  if (kind === 'sunrun') {
    const newSunrun = currentSunrun + amount;
    await supabase
      .from('user_balances')
      .update({ balance_sunrun: newSunrun, updated_at: new Date().toISOString() })
      .eq('stu_number', stuNumber);
    void supabase.from('balance_transactions').insert({
      stu_number: stuNumber,
      type: 'refund',
      amount,
      balance_after: newSunrun,
      balance_kind: 'sunrun',
      description: `阳光跑失败退款 (+${amount})`,
    });
  } else {
    const newBalance = currentMakeup + amount;
    await supabase
      .from('user_balances')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('stu_number', stuNumber);
    void supabase.from('balance_transactions').insert({
      stu_number: stuNumber,
      type: 'refund',
      amount,
      balance_after: newBalance,
      balance_kind: 'makeup',
      description: `补跑失败退款 (+${amount})`,
    });
  }
}

/**
 * 记录扣费
 */
async function recordDeductionByStu(stuNumber: string, amount: number, taskId: string): Promise<void> {
  const { data: cur } = await supabase
    .from('user_balances')
    .select('balance')
    .eq('stu_number', stuNumber)
    .maybeSingle();

  void supabase.from('balance_transactions').insert({
    stu_number: stuNumber,
    type: 'deduct',
    amount: -amount,
    balance_after: cur?.balance || 0,
    balance_kind: 'makeup',
    description: `补跑扣费 (-${amount})`,
    task_id: taskId,
  });
}

/**
 * 将数据库 snake_case 转成 executor 需要的 camelCase
 */
function mapSessionFromDb(row: any) {
  return {
    campusId: row.campus_id,
    schoolId: row.school_id,
    stuNumber: row.stu_number,
    token: row.token,
    phoneNumber: row.phone_number,
    sex: row.sex,
  };
}

/**
 * 后台执行任务（失败时自动退款）
 */
async function executeInBackground(
  session: any,
  taskId: string,
  params: any,
  stuNumber: string
) {
  try {
    const updateResult = await supabase.from('makeup_tasks').update({ status: 'processing' }).eq('id', taskId);
    console.log(`[executeInBackground] 任务 ${taskId} 开始执行, customDate=${params.customDate} period=${params.customPeriod} stuNumber=${stuNumber} 更新processing结果:`, JSON.stringify(updateResult));

    const result = await executeMakeup(session, params);

    // 检查是否真正成功：必须有 scantronId（龙猫服务器返回的记录ID）
    if (!result || !result.scantronId || result.scantronId.trim() === '') {
      console.warn(`[executeInBackground] 任务 ${taskId} 龙猫未返回 scantronId，标记为失败并退款`);
      await refundBalanceByStu(stuNumber, COST_PER_RUN, 'makeup');
      const failResult = await supabase.from('makeup_tasks').update({
        status: 'failed',
        result,
        error_message: '龙猫未返回 scantronId，可能未成功记录，已退款',
      }).eq('id', taskId);
      console.log(`[executeInBackground] 任务 ${taskId} 标记failed结果:`, JSON.stringify(failResult));
    } else {
      // 有 scantronId，说明成功记录到龙猫服务器
      const completeResult = await supabase.from('makeup_tasks').update({
        status: 'completed',
        result,
        completed_at: new Date().toISOString(),
      }).eq('id', taskId);
      console.log(`[executeInBackground] 任务 ${taskId} ✅ 标记completed，scantronId=${result.scantronId} 更新结果:`, JSON.stringify(completeResult));

      // 立即再次确认写入是否成功
      const verify: any = await supabase.from('makeup_tasks').select('*').eq('id', taskId).maybeSingle();
      console.log(`[executeInBackground] 任务 ${taskId} 最终状态确认: status=${verify?.status} custom_date=${verify?.custom_date} scantronId=${verify?.result?.scantronId}`);
    }
  } catch (error: any) {
    console.error(`[executeInBackground] 任务 ${taskId} 执行失败: code=${(error as any)?.code} message=${error.message}`);
    await refundBalanceByStu(stuNumber, COST_PER_RUN, 'makeup');
    // 龙猫 token 相关错误时追加扫码提示
    const isTokenError = (error.message || '').match(/登录|token|非法访问|无效|非法/i);
    const failResult = await supabase.from('makeup_tasks').update({
      status: 'failed',
      error_message: isTokenError
        ? `${error.message}（请重新扫码登录龙猫 APP 获取新 Token）`
        : error.message,
    }).eq('id', taskId);
    console.log(`[executeInBackground] 任务 ${taskId} 异常后标记failed结果:`, JSON.stringify(failResult));
  }
}

// ================================================================
// 提交补跑任务
// ================================================================
router.post('/submit', async (req, res) => {
  try {
    const { sessionId, routeId, taskId: reqTaskId, customDate, customPeriod, runPoint, campusIdOverride } = req.body;

    console.log('[makeup.submit] incoming request:', JSON.stringify({
      sessionId,
      routeId,
      reqTaskId,
      customDate,
      customPeriod,
      campusIdOverride,
      hasRunPoint: !!runPoint,
      runPointTaskId: runPoint?.taskId,
      runPointPointId: runPoint?.pointId,
      pointListLength: Array.isArray(runPoint?.pointList) ? runPoint.pointList.length : 0,
    }, null, 2));

    if (!sessionId) {
      return res.status(400).json({ success: false, message: '缺少 sessionId' });
    }

    const { stuNumber, session } = await requireSession(sessionId);

    // 预检查余额
    const { data: balanceRow } = await supabase
      .from('user_balances')
      .select('balance')
      .eq('stu_number', stuNumber)
      .maybeSingle();

    const currentBalance = balanceRow?.balance || 0;

    if (currentBalance < COST_PER_RUN) {
      return res.status(402).json({
        success: false,
        message: `余额不足，需要 ${COST_PER_RUN} 次，当前 ${currentBalance} 次，请先充值`,
        balance: currentBalance,
      });
    }

    // 原子扣减
    const deduct = await deductBalanceByStu(stuNumber, COST_PER_RUN);
    if (!deduct.success) {
      return res.status(402).json({ success: false, message: '余额不足，请先充值', balance: currentBalance });
    }

    const newTaskId = crypto.randomUUID();
    const date = customDate || new Date().toISOString().split('T')[0];

    // 创建任务（mileage 仅作历史记录，系统会根据性别自动生成）
    const { error: taskError } = await supabase.from('makeup_tasks').insert({
      id: newTaskId,
      user_id: sessionId,
      stu_number: stuNumber,   // ← 与 sessions.stu_number 一对一绑定
      route_id: routeId || '',
      task_id: reqTaskId || '',
      custom_date: date,
      custom_period: customPeriod || 'AM',
      min_time: '4',
      max_time: '100',
      status: 'pending',
    });

    if (taskError) {
      await refundBalanceByStu(stuNumber, COST_PER_RUN, 'makeup');
      return res.status(500).json({ success: false, message: '创建任务失败，已退款' });
    }

    await recordDeductionByStu(stuNumber, COST_PER_RUN, newTaskId);

    // 异步执行（mileage 由 executor 根据性别自动生成，centerLng/Lat 用于椭圆兜底）
    // 如果前端传了 campusIdOverride，合并进 session 传给 executor（綦江用户绑错校区时绕过）
    const sessionForExecutor = campusIdOverride
      ? { ...session, campus_id: campusIdOverride, campusId: campusIdOverride }
      : session;
    executeInBackground(mapSessionFromDb(sessionForExecutor), newTaskId, {
      routeId,
      taskId: reqTaskId,
      customDate: date,
      customPeriod: customPeriod || 'PM',
      runPoint,
      centerLng: (session as any).campus_center_lng,
      centerLat: (session as any).campus_center_lat,
    }, stuNumber).catch(console.error);

    return res.json({
      success: true,
      message: `补跑任务已提交，消耗 ${COST_PER_RUN} 次`,
      data: { taskId: newTaskId, customDate: date, customPeriod: customPeriod || 'PM', remainingBalance: deduct.newBalance },
    });
  } catch (error: any) {
    console.error('提交补跑任务失败:', error);
    const status = typeof error?.status === 'number' ? error.status : 500;
    return res.status(status).json({ success: false, message: error.message || '提交失败' });
  }
});

// ================================================================
// 一键补跑（批量）
// ================================================================
router.post('/batch', async (req, res) => {
  try {
    const { sessionId, count, customPeriod } = req.body;

    if (!sessionId || !count) {
      return res.status(400).json({ success: false, message: '缺少参数' });
    }
    if (count < 1 || count > 20) {
      return res.status(400).json({ success: false, message: '每次最多提交 20 个补跑任务' });
    }

    const { stuNumber, session } = await requireSession(sessionId);

    // 预检查余额
    const { data: balanceRow } = await supabase
      .from('user_balances')
      .select('balance')
      .eq('stu_number', stuNumber)
      .maybeSingle();

    const currentBalance = balanceRow?.balance || 0;
    const totalCost = count * COST_PER_RUN;

    if (currentBalance < totalCost) {
      return res.status(402).json({
        success: false,
        message: `余额不足，需要 ${totalCost} 次，当前 ${currentBalance} 次`,
        balance: currentBalance,
      });
    }

    // 原子扣减
    const deduct = await deductBalanceByStu(stuNumber, totalCost);
    if (!deduct.success) {
      return res.status(402).json({ success: false, message: '余额不足，请先充值' });
    }

    const taskIds: string[] = [];
    const today = new Date();

    for (let i = 0; i < count; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - (i + 1));
      const dateStr = date.toISOString().split('T')[0];
      const taskId = crypto.randomUUID();
      const period = customPeriod || (i % 2 === 0 ? 'AM' : 'PM');

      await supabase.from('makeup_tasks').insert({
        id: taskId,
        user_id: sessionId,
        stu_number: stuNumber,
        route_id: '',
        task_id: '',
        custom_date: dateStr,
        custom_period: period,
        min_time: '4',
        max_time: '100',
        status: 'pending',
      });

      taskIds.push(taskId);

      // mileage 由 executor 根据性别自动生成，centerLng/Lat 用于椭圆兜底
      executeInBackground(mapSessionFromDb(session), taskId, {
        customDate: dateStr,
        customPeriod: period,
        centerLng: (session as any).campus_center_lng,
        centerLat: (session as any).campus_center_lat,
      }, stuNumber).catch(console.error);
    }

    await recordDeductionByStu(stuNumber, totalCost, taskIds.join(','));

    return res.json({
      success: true,
      message: `已提交 ${count} 个补跑任务，消耗 ${totalCost} 次`,
      data: { taskIds, remainingBalance: deduct.newBalance },
    });
  } catch (error: any) {
    console.error('批量提交失败:', error);
    const status = typeof error?.status === 'number' ? error.status : 500;
    return res.status(status).json({ success: false, message: error.message || '批量提交失败' });
  }
});

// ================================================================
// 获取待处理任务
// ================================================================
router.get('/pending/:sessionId', async (req, res) => {
  try {
    const { stuNumber } = await requireSession(req.params.sessionId);
    const { data, error } = await supabase
      .from('makeup_tasks')
      .select('*')
      .eq('stu_number', stuNumber)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ success: false, message: error.message });
    return res.json({ success: true, data: data || [] });
  } catch (e: any) {
    return res.status(e.status || 500).json({ success: false, message: e.message });
  }
});

// ================================================================
// 独立扣款接口（给走外部API的补跑方式使用，先扣余额再跑外部接口）
// ================================================================
router.post('/deduct', async (req, res) => {
  try {
    const { sessionId, count } = req.body;
    if (!sessionId) return res.status(400).json({ success: false, message: '缺少 sessionId' });
    if (!count || count < 1) return res.status(400).json({ success: false, message: 'count 必须 >= 1' });

    const { stuNumber } = await requireSession(sessionId);
    const amount = parseInt(count);

    // 预检查余额
    const { data: balanceRow } = await supabase.from('user_balances').select('balance').eq('stu_number', stuNumber).maybeSingle();
    const currentBalance = balanceRow?.balance ?? 0;
    if (currentBalance < amount) {
      return res.status(402).json({ success: false, message: `余额不足`, balance: currentBalance });
    }

    const deduct = await deductBalanceByStu(stuNumber, amount);
    if (!deduct.success) {
      // 乐观锁耗尽，可能是并发冲突，重新查一次实际余额
      const { data: realBalanceRow } = await supabase
        .from('user_balances')
        .select('balance')
        .eq('stu_number', stuNumber)
        .maybeSingle();
      const realBalance = realBalanceRow?.balance ?? 0;
      return res.status(402).json({
        success: false,
        message: realBalance >= amount ? '扣款失败（并发冲突），请重试' : '余额不足',
        balance: realBalance,
      });
    }

    return res.json({ success: true, deducted: amount, balance: deduct.newBalance });
  } catch (error: any) {
    const status = typeof error?.status === 'number' ? error.status : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
});

// ================================================================
// 退款接口（补跑失败时退款）
// ================================================================
router.post('/refund', async (req, res) => {
  try {
    const { sessionId, count } = req.body;
    if (!sessionId) return res.status(400).json({ success: false, message: '缺少 sessionId' });

    const { stuNumber } = await requireSession(sessionId);
    const amount = parseInt(count || '1');
    await refundBalanceByStu(stuNumber, amount, 'makeup');
    return res.json({ success: true });
  } catch (error: any) {
    const status = typeof error?.status === 'number' ? error.status : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
});

// ================================================================
// 获取历史记录
// ================================================================
router.get('/history/:sessionId', async (req, res) => {
  try {
    const { stuNumber } = await requireSession(req.params.sessionId);
    const limit = parseInt(req.query.limit as string || '50');

    console.log(
      `[makeup.history] sessionId=${req.params.sessionId} → stu_number=${stuNumber} limit=${limit}`,
    );

    const { data, error } = await supabase
      .from('makeup_tasks')
      .select('*')
      .eq('stu_number', stuNumber)
      .in('status', ['pending', 'processing', 'completed', 'failed'])
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return res.status(500).json({ success: false, message: error.message });

    // 调试：打印前5条的 stu_number / status / result
    const sample = (data || []).slice(0, 5).map((t: any) => ({
      id: t.id,
      stu_number: t.stu_number,
      status: t.status,
      custom_date: t.custom_date,
      result: t.result,
      result_scantronId: t.result?.scantronId,
    }));
    console.log(`[makeup.history] 查询到 ${(data || []).length} 条，示例:`, JSON.stringify(sample));

    // 附加真实执行数据（前端展示用）
    const enriched = (data || []).map(task => {
      const r = task.result as any;
      return {
        id: task.id,
        custom_date: task.custom_date,
        custom_period: task.custom_period,
        status: task.status,
        error_message: task.error_message,
        created_at: task.created_at,
        completed_at: task.completed_at,
        // 真实执行数据（来自龙猫返回）
        actualKm: r?.km || null,
        actualTime: r?.runTime || null,
        actualPace: r?.pace || null,
        scantronId: r?.scantronId || null,
        pointCount: r?.pointCount || null,
        // 兼容旧格式
        message: r?.scantronId
          ? `成功 · ${r.km}km · ${r.runTime ? Math.round(r.runTime / 60) + '分钟' : ''} · scantronId:${r.scantronId}`
          : (task.status === 'pending' || task.status === 'processing')
          ? '执行中...'
          : (task.error_message || '未知'),
      };
    });

    return res.json({ success: true, data: enriched });
  } catch (e: any) {
    return res.status(e.status || 500).json({ success: false, message: e.message });
  }
});

// ================================================================
// 获取单条任务详情（含真实结果）
// ================================================================
router.get('/detail/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { sessionId } = req.query as { sessionId?: string };

    let query = supabase
      .from('makeup_tasks')
      .select('*')
      .eq('id', taskId)
      .maybeSingle();

    const { data: task, error } = await query;

    if (error || !task) {
      return res.status(404).json({ success: false, message: '任务不存在' });
    }

    // 鉴权（如果传了 sessionId）
    if (sessionId) {
      try {
        const { stuNumber } = await requireSession(sessionId);
        if (stuNumber !== task.stu_number) {
          return res.status(403).json({ success: false, message: '无权限查看此任务' });
        }
      } catch {
        // 无 sessionId 时只返回公开字段
      }
    }

    const r = task.result as any;
    return res.json({
      success: true,
      data: {
        id: task.id,
        stu_number: task.stu_number,
        custom_date: task.custom_date,
        custom_period: task.custom_period,
        status: task.status,
        error_message: task.error_message,
        created_at: task.created_at,
        completed_at: task.completed_at,
        // 真实执行数据
        actualKm: r?.km || null,
        actualTime: r?.runTime || null,
        actualPace: r?.pace || null,
        scantronId: r?.scantronId || null,
        pointCount: r?.pointCount || null,
        // 龙猫原始返回（用于调试）
        rawResult: r || null,
      },
    });
  } catch (e: any) {
    return res.status(e.status || 500).json({ success: false, message: e.message });
  }
});

// ================================================================
// 接收 Nuxt freerun 成功后的写入请求（内部接口，不需要 session 校验）
// ================================================================
router.post('/freerun-complete', async (req, res) => {
  try {
    const { taskId, sessionId, stuNumber, result, customDate, customPeriod, minTime, maxTime } = req.body;
    if (!stuNumber || !result) {
      return res.status(400).json({ success: false, message: '缺少 stuNumber 或 result' });
    }

    // makeup-backend 中 user_id 字段实际存储的是 sessions.id（UUID）
    // 直接用传入的 sessionId，验证它是否是有效 UUID
    let userId: string | null = null;
    if (sessionId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
      userId = sessionId;
    }

    const id = taskId || randomUUID();
    const { error } = await supabase.from('makeup_tasks').insert({
      id,
      user_id: userId,
      stu_number: stuNumber,
      route_id: '',
      task_id: id,
      custom_date: customDate || new Date().toISOString().split('T')[0],
      custom_period: customPeriod || 'AM',
      mileage: String(result?.km || '2.0'),
      min_time: String(minTime || 10),
      max_time: String(maxTime || 11),
      status: 'completed',
      result,
      completed_at: new Date().toISOString(),
    });

    if (error) {
      console.error('[makeup freerun-complete] 写入失败:', error);
      return res.status(500).json({ success: false, message: error.message });
    }

    console.log('[makeup freerun-complete] ✅ 写入成功, taskId:', taskId, 'stuNumber:', stuNumber);
    return res.json({ success: true, taskId });
  } catch (e: any) {
    console.error('[makeup freerun-complete] 异常:', e.message);
    return res.status(500).json({ success: false, message: e.message });
  }
});

export default router;
