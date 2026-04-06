/**
 * 阳光跑 / 本地跑步页扣次：先 reserve，成功 complete，失败 refund
 */
import { Router } from 'express';
import { supabase } from '../db/supabase.js';

const router = Router();

type Kind = 'makeup' | 'sunrun';

/** 从 sessionId 解析出 stuNumber（优先查 sessions 表） */
async function resolveStuNumber(sessionId: string): Promise<string | null> {
  const { data: session } = await supabase
    .from('sessions')
    .select('stu_number')
    .eq('id', sessionId)
    .maybeSingle();
  return session?.stu_number || null;
}

/** 用 stu_number 查余额 */
async function getBalancesByStu(stuNumber: string) {
  const { data } = await supabase
    .from('user_balances')
    .select('balance, balance_sunrun')
    .eq('stu_number', stuNumber)
    .maybeSingle();
  return {
    makeup: data?.balance ?? 0,
    sunrun: data?.balance_sunrun ?? 0,
  };
}

/** 乐观锁扣减指定桶 */
async function deductBucketByStu(
  stuNumber: string,
  kind: Kind,
  amount: number,
  _depth = 0
): Promise<{ success: boolean; newMakeup: number; newSunrun: number }> {
  const MAX_RETRIES = 3;
  const col = kind === 'makeup' ? 'balance' : 'balance_sunrun';
  const { data: row } = await supabase
    .from('user_balances')
    .select('balance, balance_sunrun')
    .eq('stu_number', stuNumber)
    .maybeSingle();

  const makeup = row?.balance ?? 0;
  const sunrun = row?.balance_sunrun ?? 0;
  const current = kind === 'makeup' ? makeup : sunrun;

  if (current < amount) {
    return { success: false, newMakeup: makeup, newSunrun: sunrun };
  }

  const newMakeup = kind === 'makeup' ? makeup - amount : makeup;
  const newSunrun = kind === 'sunrun' ? sunrun - amount : sunrun;

  const { data: updated, error } = await supabase
    .from('user_balances')
    .update({
      balance: newMakeup,
      balance_sunrun: newSunrun,
      updated_at: new Date().toISOString(),
    })
    .eq('stu_number', stuNumber)
    .eq(col, current)
    .select('balance, balance_sunrun')
    .single();

  if (error || !updated) {
    if (_depth >= MAX_RETRIES - 1) {
      console.error(`[deductBucketByStu] 重试 ${MAX_RETRIES} 次后仍失败:`, stuNumber, kind, error?.message);
      return { success: false, newMakeup: makeup, newSunrun: sunrun };
    }
    return deductBucketByStu(stuNumber, kind, amount, _depth + 1);
  }

  return {
    success: true,
    newMakeup: updated.balance,
    newSunrun: updated.balance_sunrun,
  };
}

/** 乐观锁回补次数 */
async function addBucketByStu(
  stuNumber: string,
  kind: Kind,
  amount: number
): Promise<boolean> {
  const col = kind === 'makeup' ? 'balance' : 'balance_sunrun';
  const { data: row } = await supabase
    .from('user_balances')
    .select('balance, balance_sunrun')
    .eq('stu_number', stuNumber)
    .maybeSingle();

  if (!row) {
    console.error('[addBucketByStu] 未找到用户余额记录:', stuNumber);
    return false;
  }

  const makeup = row.balance ?? 0;
  const sunrun = row.balance_sunrun ?? 0;
  const newMakeup = kind === 'makeup' ? makeup + amount : makeup;
  const newSunrun = kind === 'sunrun' ? sunrun + amount : sunrun;

  // 乐观锁：校验余额没被其他请求改变，防止并发丢失更新
  const { data: updated, error } = await supabase
    .from('user_balances')
    .update({
      balance: newMakeup,
      balance_sunrun: newSunrun,
      updated_at: new Date().toISOString(),
    })
    .eq('stu_number', stuNumber)
    .eq(col, kind === 'makeup' ? makeup : sunrun)
    .select('balance, balance_sunrun')
    .single();

  if (error || !updated) {
    console.error('[addBucketByStu] 乐观锁冲突或更新失败，回补失败:', stuNumber, kind, error?.message);
    return false;
  }

  return true;
}

// POST { sessionId, kind: 'makeup' | 'sunrun' }
router.post('/reserve', async (req, res) => {
  try {
    const { sessionId, kind } = req.body as { sessionId?: string; kind?: Kind };
    if (!sessionId || (kind !== 'makeup' && kind !== 'sunrun')) {
      return res.status(400).json({ success: false, message: '缺少 sessionId 或 kind（makeup|sunrun）' });
    }

    // 强制从 sessions 表解析学号，禁止信任前端传入的 stuNumber
    const { data: session, error: se } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (se || !session) {
      return res.status(401).json({ success: false, message: '会话不存在或已过期' });
    }
    const expiresAt = (session as any).expires_at || (session as any).expiresAt;
    if (expiresAt && new Date(expiresAt) < new Date()) {
      return res.status(401).json({ success: false, message: '会话已过期' });
    }
    const stuNumber = session.stu_number;
    if (!stuNumber) {
      return res.status(400).json({ success: false, message: '无法确定用户学号' });
    }

    const bal = await getBalancesByStu(stuNumber);
    const need = kind === 'makeup' ? bal.makeup : bal.sunrun;
    if (need < 1) {
      return res.status(402).json({
        success: false,
        message: kind === 'makeup' ? '补跑次数不足，请使用补跑卡密（TMC-）充值' : '阳光跑次数不足，请使用阳光跑卡密（TSR-）充值',
        balanceMakeup: bal.makeup,
        balanceSunrun: bal.sunrun,
      });
    }

    const d = await deductBucketByStu(stuNumber, kind, 1);
    if (!d.success) {
      const b = await getBalancesByStu(stuNumber);
      return res.status(402).json({
        success: false,
        message: '次数不足',
        balanceMakeup: b.makeup,
        balanceSunrun: b.sunrun,
      });
    }

    // 防重复：仅拦截「进行中」的 active。completed/refunded 是历史记录，必须允许再次 reserve
    const { data: existing } = await supabase
      .from('balance_consumptions')
      .select('id, status')
      .eq('stu_number', stuNumber)
      .eq('kind', kind)
      .eq('status', 'active')
      .maybeSingle();

    if (existing) {
      const refunded = await addBucketByStu(stuNumber, kind, 1);
      if (!refunded) {
        console.error('[reserve] active 退款失败（乐观锁冲突），需人工处理 session:', sessionId);
      }
      return res.status(409).json({
        success: false,
        message: '该会话已有进行中的扣次，请勿重复提交；若上次异常退出可稍后再试或联系管理员清理',
        existingConsumptionId: existing.id,
      });
    }

    const { data: cons, error: ce } = await supabase
      .from('balance_consumptions')
      .insert({
        session_id: sessionId,
        stu_number: stuNumber,
        kind,
        status: 'active',
      })
      .select('id')
      .single();

    if (ce || !cons) {
      await addBucketByStu(stuNumber, kind, 1);
      return res.status(500).json({ success: false, message: '创建消费记录失败，已退回次数' });
    }

    const label = kind === 'makeup' ? '本地补跑模式扣次' : '阳光跑扣次';
    await supabase.from('balance_transactions').insert({
      stu_number: stuNumber,
      session_id: sessionId,
      type: 'deduct',
      amount: -1,
      balance_after: kind === 'makeup' ? d.newMakeup : d.newSunrun,
      balance_kind: kind,
      description: `${label} (-1)`,
      task_id: cons.id,
    });

    return res.json({
      success: true,
      data: {
        consumptionId: cons.id,
        balanceMakeup: d.newMakeup,
        balanceSunrun: d.newSunrun,
      },
    });
  } catch (e: any) {
    console.error('reserve:', e);
    return res.status(500).json({ success: false, message: e.message || 'reserve 失败' });
  }
});

// POST { sessionId, consumptionId }
router.post('/complete', async (req, res) => {
  try {
    const { sessionId, consumptionId } = req.body as { sessionId?: string; consumptionId?: string };
    if (!sessionId || !consumptionId) {
      return res.status(400).json({ success: false, message: '缺少参数' });
    }

    // 以消费记录为准：长跑提交可能耗时数分钟，期间 sessions 行可能被登出/换端清理，
    // 但 reserve 时已写入 session_id + stu_number，不应再依赖 sessions 仍存在。
    const { data: row, error: rowErr } = await supabase
      .from('balance_consumptions')
      .select('*')
      .eq('id', consumptionId)
      .maybeSingle();

    if (rowErr || !row) {
      return res.status(404).json({ success: false, message: '消费记录不存在' });
    }
    const sid = String(sessionId).trim();
    const storedSid = String(row.session_id ?? '').trim();
    if (!storedSid || storedSid !== sid) {
      return res.status(401).json({ success: false, message: '会话与扣次记录不匹配' });
    }

    if (row.status !== 'active') {
      return res.json({ success: true, message: '记录已处理' });
    }

    await supabase
      .from('balance_consumptions')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', consumptionId);

    return res.json({ success: true });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// POST { sessionId, consumptionId }
router.post('/refund', async (req, res) => {
  try {
    const { sessionId, consumptionId } = req.body as { sessionId?: string; consumptionId?: string };
    if (!sessionId || !consumptionId) {
      return res.status(400).json({ success: false, message: '缺少参数' });
    }

    const { data: row, error: rowErr } = await supabase
      .from('balance_consumptions')
      .select('*')
      .eq('id', consumptionId)
      .maybeSingle();

    if (rowErr || !row) {
      return res.status(404).json({ success: false, message: '消费记录不存在' });
    }
    const sid = String(sessionId).trim();
    const storedSid = String(row.session_id ?? '').trim();
    if (!storedSid || storedSid !== sid) {
      return res.status(401).json({ success: false, message: '会话与扣次记录不匹配' });
    }

    const stuNumber = row.stu_number as string | null;
    if (!stuNumber) {
      return res.status(400).json({ success: false, message: '消费记录缺少学号' });
    }

    if (row.status !== 'active') {
      return res.json({ success: true, message: '无需退款' });
    }

    const kind = row.kind as Kind;
    const added = await addBucketByStu(stuNumber, kind, 1);
    if (!added) {
      console.error('[refund] 回补失败（乐观锁冲突），需人工处理 consumption:', consumptionId);
    }

    const b = await getBalancesByStu(stuNumber);
    await supabase
      .from('balance_consumptions')
      .update({ status: 'refunded', refunded_at: new Date().toISOString() })
      .eq('id', consumptionId);

    // 使用消费记录中已有的 session_id（真正的 UUID）
    await supabase.from('balance_transactions').insert({
      stu_number: stuNumber,
      session_id: row.session_id,
      type: 'refund',
      amount: 1,
      balance_after: kind === 'makeup' ? b.makeup : b.sunrun,
      balance_kind: kind,
      description: `${kind === 'makeup' ? '补跑' : '阳光跑'}失败退款 (+1)`,
      task_id: consumptionId,
    });

    return res.json({
      success: true,
      data: { balanceMakeup: b.makeup, balanceSunrun: b.sunrun },
    });
  } catch (e: any) {
    console.error('refund:', e);
    return res.status(500).json({ success: false, message: e.message || '退款失败' });
  }
});

export default router;
