/**
 * 卡密充值路由（补跑 TMC / 阳光跑 TSR 分账）
 */
import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import {
  generateBatchCards,
  isValidRedeemCardCodeFormat,
  type CardKind,
} from '../utils/cardGenerator.js';

const router = Router();

const ADMIN_SECRET = process.env.ADMIN_SECRET;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 从 sessionId 解析出 stuNumber：若已是学号（非 UUID）则直接返回，否则查 sessions 表；查表失败则退回为学号 */
async function resolveStuNumber(sessionId: string): Promise<string | null> {
  const trimmed = sessionId?.trim();
  if (!trimmed || trimmed === '') return null;
  if (!UUID_REGEX.test(trimmed)) {
    return trimmed;
  }
  try {
    const { data: session, error } = await supabase
      .from('sessions')
      .select('stu_number')
      .eq('id', trimmed)  // 使用 trimmed 而不是 sessionId
      .maybeSingle();
    if (error) {
      if (/uuid|invalid input syntax/i.test(String(error.message))) {
        return trimmed;
      }
      throw error;
    }
    return session?.stu_number ?? null;
  } catch (e: any) {
    if (e?.message && /uuid|invalid input syntax/i.test(String(e.message))) {
      return trimmed;
    }
    throw e;
  }
}

/**
 * 原子兑换卡密（确保一张卡密只能使用一次）
 *
 * ============================================
 * 卡密唯一性保证机制
 * ============================================
 * 
 * 核心原则：
 * - 一张卡密只能被使用一次（无论谁使用）
 * - 使用后立即失效，立即反馈到数据库
 * - 其他人不能再使用同一张卡密
 * - 同一用户可以使用多张不同的卡密
 *
 * 实现原理：
 * - 使用 PostgreSQL 函数 atomic_redeem_card 保证原子性
 * - 函数内部使用原子 UPDATE，WHERE 条件确保只有 used_by 为空的卡才能被更新
 * - 一旦 UPDATE 成功，used_by 和 used_at 立即写入数据库
 * - 数据库的原子性保证并发安全（多个请求同时兑换同一张卡密时，只有一个会成功）
 *
 * 保证机制：
 * - code 字段本身是 UNIQUE，确保每张卡密只有一条记录
 * - PostgreSQL 函数在单个事务内完成检查+更新，无竞态条件
 * - 函数返回被兑换的卡密信息；返回 null 表示卡密不存在、已被使用或已过期
 * - 所有兑换都通过此函数，没有其他路径可以绕过
 *
 * 重要：此函数是唯一可以修改 recharge_cards.used_by 的路径
 */

/**
 * 按卡密查库（仅用大写精确匹配，避免 ilike 误匹配多行）
 * 注意：若库里曾存小写 code，会与 UNIQUE 大写行并存成「两条同码」，导致可刷两次——生成接口已强制大写。
 */
async function fetchRechargeCardRowByCode(code: string): Promise<any | null> {
  const c = code.trim().toUpperCase();
  const { data: exact } = await supabase
    .from('recharge_cards')
    .select('*')
    .eq('code', c)
    .maybeSingle();
  return exact ?? null;
}

/** 卡密是否已被使用（任何非空 used_by 即视为已核销） */
function isCardUsedInRow(row: any): boolean {
  if (!row) return false;
  const u = row.used_by;
  if (u === null || u === undefined) return false;
  return String(u).trim() !== '';
}

/** usedBy：若库中 used_by 为 UUID/FK，应传 session.id；若为 VARCHAR 学号可传学号 */
async function atomicRedeemCard(
  code: string,
  usedBy: string
): Promise<{ success: boolean; card?: any; error?: string }> {
  // 参数验证：usedBy 不能为空
  if (!usedBy || usedBy.trim() === '') {
    console.error('atomicRedeemCard: usedBy 参数为空', { code, usedBy });
    return { success: false, error: '系统错误：usedBy 参数无效' };
  }

  try {
    const { data, error } = await supabase.rpc('atomic_redeem_card', {
      p_code: code,
      p_used_by: usedBy,
    });

    if (error) {
      // 函数不存在时给出友好提示
      if (/function.*does not exist/i.test(error.message)) {
        console.error('⚠️ atomic_redeem_card 函数不存在，请先在数据库创建！');
        return {
          success: false,
          error: '系统配置错误：atomic_redeem_card 函数未部署，请联系管理员',
        };
      }
      // UUID 错误：可能是 used_by 参数为空或格式错误，或者数据库字段类型不匹配
      if (/invalid input syntax for type uuid/i.test(error.message)) {
        console.error('UUID 错误:', { 
          code, 
          usedBy, 
          usedByType: typeof usedBy,
          usedByLength: usedBy?.length,
          isEmpty: usedBy === '',
          isWhitespace: usedBy?.trim() === '',
          error: error.message 
        });
        // 返回原始错误信息，让调用者知道这是 UUID 错误，可以尝试回退
        return { 
          success: false, 
          error: `UUID 类型错误: ${error.message}` 
        };
      }
      console.error('atomic_redeem_card 错误:', { code, usedBy, error: error.message });
      return { success: false, error: error.message };
    }

    if (!data) {
      // 函数返回 null：不存在 / 已使用 / 已过期 / 并发
      const cardInfo = await fetchRechargeCardRowByCode(code);

      if (!cardInfo) {
        return { success: false, error: '卡密不存在' };
      }
      if (cardInfo.expires_at && new Date(cardInfo.expires_at) < new Date()) {
        return { success: false, error: '卡密已过期' };
      }
      if (isCardUsedInRow(cardInfo)) {
        return {
          success: false,
          error: '卡密已失效：本卡已被使用，每张卡仅可使用一次',
        };
      }
      return { success: false, error: '兑换失败，请重试' };
    }

    // 合并 RPC 返回值与库表行；校验「已核销」以 merged 为准（兼容库中 code 大小写与查询不一致时，RETURNING 仍含 used_by）
    const merged: Record<string, unknown> = { ...(data as object) };
    const dbRow = await fetchRechargeCardRowByCode(code);
    if (dbRow) {
      Object.assign(merged, dbRow);
    }

    if (!isCardUsedInRow(merged)) {
      console.error('严重：atomic_redeem_card 返回成功但无法确认 used_by 已写入', {
        code,
        merged,
        rpcData: data,
      });
      return {
        success: false,
        error: '卡密核销校验失败，请稍后重试。若仍成功请不要再输入同一卡密。',
      };
    }

    return { success: true, card: merged };
  } catch (e: any) {
    return { success: false, error: e.message || '兑换异常' };
  }
}

/**
 * 解析 atomic_redeem_card / Supabase 返回的行（兼容 snake_case、大小写）
 */
function parseRedeemedCardRow(row: any): { times: number; cardKind: CardKind } | null {
  if (!row || typeof row !== 'object') return null;
  const timesRaw =
    row.times ??
    row.Times ??
    (row as any).time ??
    (typeof row === 'object' && 'times' in row ? (row as any)['times'] : undefined);
  const times = Math.floor(Number(timesRaw));
  if (!Number.isFinite(times) || times < 1) return null;
  const kindRaw = String(row.card_kind ?? row.cardKind ?? 'makeup').toLowerCase();
  const cardKind: CardKind = kindRaw === 'sunrun' ? 'sunrun' : 'makeup';
  return { times, cardKind };
}

/**
 * 重要：禁止在应用层清空 recharge_cards.used_by。
 * 历史上曾用「回滚」在异常时恢复卡密，会导致同一张卡可反复兑换，严重破坏唯一性。
 * atomic_redeem_card 一旦成功，卡密即永久核销；后续若解析/余额失败，只能人工在库中处理，绝不自动释放卡密。
 */

function adminAuth(req: any, res: any, next: any) {
  const secret = req.headers['x-admin-secret'];
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return res.status(403).json({ success: false, message: '无权限' });
  }
  next();
}

/**
 * 管理员直接充值接口（绕过卡密，用于人工补额）
 * POST /api/recharge/admin/recharge
 * Body: { stuNumber: string, times: number, kind: 'makeup' | 'sunrun' }
 */
router.post('/admin/recharge', adminAuth, async (req, res) => {
  try {
    const { stuNumber, times, kind } = req.body as {
      stuNumber?: string;
      times?: number;
      kind?: 'makeup' | 'sunrun';
    };

    if (!stuNumber || typeof stuNumber !== 'string' || stuNumber.trim() === '') {
      return res.status(400).json({ success: false, message: '缺少 stuNumber' });
    }
    if (!times || !Number.isInteger(times) || times <= 0) {
      return res.status(400).json({ success: false, message: '次数必须为大于 0 的整数' });
    }
    if (kind !== 'makeup' && kind !== 'sunrun') {
      return res.status(400).json({ success: false, message: 'kind 须为 makeup 或 sunrun' });
    }

    const resolvedStu = (await resolveStuNumber(stuNumber.trim())) ?? stuNumber.trim();
    const MAX_RETRIES = 3;
    let finalMakeup = 0;
    let finalSunrun = 0;
    let ok = false;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const { data: currentRow } = await supabase
        .from('user_balances')
        .select('id, balance, balance_sunrun')
        .eq('stu_number', resolvedStu)
        .maybeSingle();

      const prevMakeup = currentRow?.balance ?? 0;
      const prevSunrun = (currentRow as any)?.balance_sunrun ?? 0;
      const newMakeup = kind === 'makeup' ? prevMakeup + times : prevMakeup;
      const newSunrun = kind === 'sunrun' ? prevSunrun + times : prevSunrun;

      if (currentRow) {
        const { data: updated, error: ue } = await supabase
          .from('user_balances')
          .update({ balance: newMakeup, balance_sunrun: newSunrun, updated_at: new Date().toISOString() })
          .eq('stu_number', resolvedStu)
          .eq('balance', prevMakeup)
          .select('balance, balance_sunrun')
          .single();
        if (ue === null && updated) {
          finalMakeup = newMakeup;
          finalSunrun = newSunrun;
          ok = true;
          break;
        }
      } else {
        const { error: ie } = await supabase.from('user_balances').insert({
          stu_number: resolvedStu,
          balance: newMakeup,
          balance_sunrun: newSunrun,
          updated_at: new Date().toISOString(),
        });
        if (ie === null) {
          finalMakeup = newMakeup;
          finalSunrun = newSunrun;
          ok = true;
          break;
        }
      }
    }

    if (!ok) {
      return res.status(500).json({ success: false, message: '充值失败：余额更新超时，请稍后重试' });
    }

    await supabase.from('balance_transactions').insert({
      stu_number: resolvedStu,
      type: 'admin_recharge',
      amount: times,
      balance_after: kind === 'makeup' ? finalMakeup : finalSunrun,
      balance_kind: kind,
      description: `管理员手动充值${kind === 'makeup' ? '补跑' : '阳光跑'} ×${times}`,
    });

    const label = kind === 'makeup' ? '补跑' : '阳光跑';
    return res.json({
      success: true,
      message: `已为 ${resolvedStu} 充值 ${times} 次${label}`,
      data: {
        stuNumber: resolvedStu,
        added: times,
        kind,
        balance: finalMakeup,
        balanceMakeup: finalMakeup,
        balanceSunrun: finalSunrun,
      },
    });
  } catch (error: any) {
    console.error('管理员充值失败:', error);
    return res.status(500).json({ success: false, message: error.message || '管理员充值失败' });
  }
});

/** balance = 补跑次数，balance_sunrun = 阳光跑次数 */
router.get('/balance/:stuNumber', async (req, res) => {
  try {
    const { stuNumber } = req.params;

    // 尝试解析：UUID → stuNumber（兜底，解决 sessions 表 RLS 导致 resolveStuNumber 失败的问题）
    const resolvedStu = await resolveStuNumber(stuNumber) ?? stuNumber;

    const { data, error } = await supabase
      .from('user_balances')
      .select('balance, balance_sunrun, updated_at')
      .eq('stu_number', resolvedStu)
      .maybeSingle();

    if (error || !data) {
      // 兼容旧数据：仅当 resolvedStu 本身是 UUID 时才用 session_id 查（列若为 UUID，用学号会触发 invalid uuid 错误）
      if (UUID_REGEX.test(resolvedStu)) {
        const { data: old } = await supabase
          .from('user_balances')
          .select('balance, balance_sunrun, updated_at')
          .eq('session_id', resolvedStu)
          .maybeSingle();
        if (old) {
          return res.json({
            success: true,
            data: {
              balance: old.balance ?? 0,
              balanceMakeup: old.balance ?? 0,
              balanceSunrun: (old as any).balance_sunrun ?? 0,
              updatedAt: old.updated_at,
            },
          });
        }
      }
      return res.json({
        success: true,
        data: {
          balance: 0,
          balanceMakeup: 0,
          balanceSunrun: 0,
        },
      });
    }

    return res.json({
      success: true,
      data: {
        balance: data.balance ?? 0,
        balanceMakeup: data.balance ?? 0,
        balanceSunrun: (data as any).balance_sunrun ?? 0,
        updatedAt: data.updated_at,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 从 sessionId（UUID）解析出 stuNumber
 * 用于：充值等操作强制以 session 中的学号为受益人，杜绝前端伪造
 */
async function resolveStuFromSession(sessionIdValue: string): Promise<string | null> {
  if (!sessionIdValue || !UUID_REGEX.test(sessionIdValue)) return null;
  try {
    const { data } = await supabase
      .from('sessions')
      .select('stu_number')
      .eq('id', sessionIdValue.trim())
      .maybeSingle();
    return data?.stu_number ?? null;
  } catch {
    return null;
  }
}

router.post('/redeem', async (req, res) => {
  try {
    const { sessionId, code } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, message: '缺少卡密 code' });
    }

    // ——————————————————————————————————————————
    // 强制校验：只认 sessionId（UUID），从 sessions 表解析学号
    // 禁止前端传 stuNumber，防止 A 用户拿着 B 的 sessionId 替 B 充值
    // ——————————————————————————————————————————
    if (!sessionId || typeof sessionId !== 'string' || !UUID_REGEX.test(sessionId.trim())) {
      return res.status(400).json({
        success: false,
        message: '缺少有效的 sessionId，请刷新页面后重试',
      });
    }

    const resolvedStu = await resolveStuFromSession(sessionId.trim());
    if (!resolvedStu) {
      return res.status(401).json({
        success: false,
        message: 'session 已失效，请重新登录后再充值',
      });
    }

    // 格式校验
    const normalizedCode = code.toUpperCase().trim();
    if (!isValidRedeemCardCodeFormat(normalizedCode)) {
      return res.status(400).json({
        success: false,
        message: '卡密格式不正确。请填写以 TMC-（补跑）或 TSR-（阳光跑）开头的有效卡密',
      });
    }

    // 预检查：卡密是否已被使用
    const preRow = await fetchRechargeCardRowByCode(normalizedCode);
    if (preRow && isCardUsedInRow(preRow)) {
      return res.status(400).json({
        success: false,
        message: '卡密已失效：本卡已被使用，每张卡仅可使用一次',
      });
    }

    // 原子兑换（resolvedStu 为学号 VARCHAR，与 atomic_redeem_card 的 used_by 类型一致）
    const redeemResult = await atomicRedeemCard(normalizedCode, resolvedStu);

    // 预检查已做过，这里只处理「网络超时但实际执行成功」的幂等漏网
    if (!redeemResult.success && redeemResult.error === '兑换失败，请重试') {
      const row = await fetchRechargeCardRowByCode(normalizedCode);
      if (row && isCardUsedInRow(row)) {
        return res.status(400).json({
          success: false,
          message: '卡密已失效：本卡已被使用，每张卡仅可使用一次',
        });
      }
    }

    if (!redeemResult.success) {
      const errMsg = String(redeemResult.error || '');
      const status = errMsg.includes('已失效') || errMsg.includes('已过期') ? 400 : 404;
      return res.status(status).json({ success: false, message: redeemResult.error });
    }

    const card = redeemResult.card;
    const parsed = parseRedeemedCardRow({ ...card, ...(await fetchRechargeCardRowByCode(normalizedCode)) });
    if (!parsed) {
      return res.status(500).json({
        success: false,
        message: '卡密已在系统中核销，但系统无法读取充值信息。请联系管理员。',
      });
    }

    const { times: redeemTimes, cardKind } = parsed;

    // 余额更新（乐观锁，防止并发充值丢失次数）
    const MAX_REDEEM_RETRIES = 3;
    let finalMakeup = 0;
    let finalSunrun = 0;
    let redeemSuccess = false;

    for (let attempt = 1; attempt <= MAX_REDEEM_RETRIES; attempt++) {
      const { data: currentRow } = await supabase
        .from('user_balances')
        .select('id, balance, balance_sunrun')
        .eq('stu_number', resolvedStu)
        .maybeSingle();

      const prevMakeup  = currentRow?.balance ?? 0;
      const prevSunrun  = (currentRow as any)?.balance_sunrun ?? 0;
      const newMakeup   = cardKind === 'makeup' ? prevMakeup  + redeemTimes : prevMakeup;
      const newSunrun   = cardKind === 'sunrun'  ? prevSunrun  + redeemTimes : prevSunrun;

      if (currentRow) {
        const { data: updated, error: ue } = await supabase
          .from('user_balances')
          .update({ balance: newMakeup, balance_sunrun: newSunrun, updated_at: new Date().toISOString() })
          .eq('stu_number', resolvedStu)
          .eq('balance', prevMakeup)  // 乐观锁：余额未变化时才更新
          .select('balance, balance_sunrun')
          .single();
        if (ue === null && updated) {
          finalMakeup = newMakeup;
          finalSunrun = newSunrun;
          redeemSuccess = true;
          break;
        }
        console.warn(`[redeem] 乐观锁冲突 (attempt ${attempt}/${MAX_REDEEM_RETRIES}), 重试...`);
      } else {
        const { error: ie } = await supabase.from('user_balances').insert({
          session_id: sessionId.trim(),
          stu_number: resolvedStu,
          balance: newMakeup,
          balance_sunrun: newSunrun,
          updated_at: new Date().toISOString(),
        });
        if (ie === null) {
          finalMakeup = newMakeup;
          finalSunrun = newSunrun;
          redeemSuccess = true;
          break;
        }
        console.warn(`[redeem] 插入余额行失败 (attempt ${attempt}/${MAX_REDEEM_RETRIES}), 重试...`);
      }
    }

    if (!redeemSuccess) {
      return res.status(500).json({
        success: false,
        message: '充值失败：余额更新超时，请稍后重试。若已扣款请联系管理员。',
      });
    }

    // 交易记录
    await supabase.from('balance_transactions').insert({
      stu_number: resolvedStu, type: 'recharge', amount: redeemTimes,
      balance_after: cardKind === 'makeup' ? finalMakeup : finalSunrun,
      balance_kind: cardKind,
      description: cardKind === 'makeup' ? `补跑卡密: ${normalizedCode}` : `阳光跑卡密: ${normalizedCode}`,
      card_code: normalizedCode,
    });

    const label = cardKind === 'makeup' ? '补跑' : '阳光跑';
    return res.json({
      success: true,
      message: `充值成功，获得 ${redeemTimes} 次${label}`,
      data: { balance: finalMakeup, balanceMakeup: finalMakeup, balanceSunrun: finalSunrun, added: redeemTimes, cardKind },
    });
  } catch (error: any) {
    console.error('兑换卡密失败:', error);
    return res.status(500).json({ success: false, message: error.message || '兑换卡密失败' });
  }
});

router.get('/transactions/:stuNumber', async (req, res) => {
  try {
    const { stuNumber } = req.params;
    const sessionId = req.query.sessionId as string;
    const limit = parseInt((req.query.limit as string) || '20');

    // 权限校验：请求者的 session 必须属于该学号
    if (!sessionId) {
      return res.status(400).json({ success: false, message: '缺少 sessionId 参数' });
    }
    const resolvedStu = await resolveStuNumber(sessionId);
    if (!resolvedStu || resolvedStu !== stuNumber) {
      return res.status(403).json({ success: false, message: '无权限查看此用户的交易记录' });
    }

    const { data, error } = await supabase
      .from('balance_transactions')
      .select('*')
      .eq('stu_number', stuNumber)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return res.status(500).json({ success: false, message: error.message });
    }

    return res.json({ success: true, data: data || [] });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/generate', adminAuth, async (req, res) => {
  try {
    const { count = 1, times = 1, expiresDays = 365, kind = 'makeup' } = req.body;

    if (kind !== 'makeup' && kind !== 'sunrun') {
      return res.status(400).json({ success: false, message: 'kind 须为 makeup 或 sunrun' });
    }

    if (count < 1 || count > 100) {
      return res.status(400).json({ success: false, message: '每次最多生成 100 个卡密' });
    }

    if (times < 1) {
      return res.status(400).json({ success: false, message: '次数必须大于 0' });
    }

    const cards = generateBatchCards(count, times, { expiresDays, kind });

    const cardsToInsert = cards.map((card) => ({
      code: card.code.trim().toUpperCase(),
      type: times === 1 ? 'once' : 'times',
      card_kind: kind,
      times: card.times,
      expires_at: card.expiresAt?.toISOString() || null,
      batch_id: card.batchId,
    }));

    const { error } = await supabase.from('recharge_cards').insert(cardsToInsert);

    if (error) {
      console.error('写入卡密失败:', error);
      return res.status(500).json({ success: false, message: '写入数据库失败: ' + error.message });
    }

    return res.json({
      success: true,
      message: `成功生成 ${count} 个${kind === 'makeup' ? '补跑(TMC)' : '阳光跑(TSR)'}卡密`,
      data: {
        kind,
        batchId: cards[0].batchId,
        cards: cards.map((c) => ({
          code: c.code,
          times: c.times,
          expiresAt: c.expiresAt?.toISOString(),
        })),
      },
    });
  } catch (error: any) {
    console.error('生成卡密失败:', error);
    return res.status(500).json({ success: false, message: error.message || '生成卡密失败' });
  }
});

router.get('/admin/cards', adminAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('recharge_cards')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      return res.status(500).json({ success: false, message: error.message });
    }

    return res.json({ success: true, data: data || [] });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
