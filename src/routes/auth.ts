/**
 * 认证路由 - Express 版本
 */
import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { callTotoroApi } from '../services/totoro.js';

const router = Router();

// 扫码登录（单设备模式：同一学号只能有一个有效会话，新登录自动踢掉旧会话）
router.post('/login', async (req, res) => {
  try {
    const { campusId, schoolId, stuNumber, token, phoneNumber, sex } = req.body;

    if (!campusId || !schoolId || !stuNumber || !token) {
      return res.status(400).json({ success: false, message: '缺少必需参数' });
    }

    const skipTokenVerify = process.env.SKIP_TOKEN_VERIFY === 'true' || process.env.SKIP_TOKEN_VERIFY === '1';
    if (skipTokenVerify) {
      console.warn('⚠️ SKIP_TOKEN_VERIFY 已开启：跳过龙猫 Token 校验（仅本地/测试，勿用于公网）');
    } else {
      try {
        // 调用龙猫 /user/userInfo 验证 Token
        const verifyResult = await callTotoroApi('/user/userInfo', {
          campusId,
          schoolId,
          stuNumber,
          token,
        });

        // 详细日志：打印龙猫返回的原始数据，便于排查问题
        console.log(`[auth/login] 龙猫 /user/userInfo 原始响应:`, JSON.stringify(verifyResult, null, 2));

        // 验证逻辑：龙猫返回的 code 判断
        // 可能的成功响应格式：
        // 1. { code: '00', ... }
        // 2. { code: '0', ... }
        // 3. { status: 'success', ... }
        // 4. { data: {...}, code: '00' } (数据在 data 字段里)
        const c = verifyResult?.code;
        const isSuccessResponse =
          verifyResult && (
            c === '00' ||
            c === '0' ||
            c === 0 ||
            verifyResult.status === 'success' ||
            (verifyResult.data && (c === '00' || c === '0'))
          );

        if (!isSuccessResponse) {
          // 龙猫返回了非成功响应
          const errorCode = verifyResult?.code || '未知';
          const errorMsg = verifyResult?.message || verifyResult?.msg || '';
          console.error(`[auth/login] 龙猫 Token 验证失败: code=${errorCode}, msg=${errorMsg}, response=${JSON.stringify(verifyResult).slice(0, 500)}`);

          // 判断是否为可接受的"软错误"
          // 某些情况下龙猫返回 200 但 code 不是 '00'，但实际 token 可能仍然有效
          // 例如：code=100 但有 data 信息
          const hasData = verifyResult?.data || Object.keys(verifyResult || {}).length > 0;
          if (hasData && !errorCode.match(/token/i)) {
            // 有数据且错误码不包含 token 相关字样，认为是软错误，允许通过
            console.warn(`[auth/login] 检测到软错误但有数据，认为 Token 有效: code=${errorCode}`);
          } else {
            // 真正的 Token 错误
            let userHint = '';
            if (String(errorCode).match(/token/i) || errorMsg.match(/token/i)) {
              userHint = '请重新扫码登录龙猫 APP 获取新 Token';
            } else {
              userHint = '龙猫服务器验证失败，请稍后重试或重新扫码';
            }
            return res.status(401).json({
              success: false,
              message: 'Token 无效或已过期',
              code: errorCode,
              hint: userHint
            });
          }
        } else {
          console.log(`[auth/login] 龙猫 Token 验证成功: code=${c}`);
        }
      } catch (e) {
        // 网络错误或其他异常
        console.error('[auth/login] Token 验证异常:', e);
        const errorMessage = e instanceof Error ? e.message : String(e);

        // 判断是否为 TotoroApiError（龙猫返回的业务错误）
        if (e instanceof Error && e.name === 'TotoroApiError') {
          const totoroError = e as any;
          console.error(`[auth/login] 龙猫业务错误: code=${totoroError.code}, message=${totoroError.message}`);

          // 龙猫返回 code=100/101 等 Token 相关错误
          if (String(totoroError.code).match(/token|100|101/i)) {
            return res.status(401).json({
              success: false,
              message: 'Token 无效或已过期',
              code: totoroError.code,
              hint: '请重新扫码登录龙猫 APP 获取新 Token'
            });
          }
          // 其他业务错误，也放行（避免误杀）
          console.warn(`[auth/login] 龙猫业务错误但放行: code=${totoroError.code}`);
        } else if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('timeout') || errorMessage.includes('ECONNREFUSED')) {
          // 网络问题，也放行（确保用户体验）
          console.warn(`[auth/login] 网络异常但放行，允许登录: ${errorMessage}`);
        } else {
          // 其他错误，放行
          console.warn(`[auth/login] 未知错误但放行: ${errorMessage}`);
        }
      }
    }

    // ──────────────────────────────────────────
    // 单设备登录：原子 upsert（防止并发 delete+insert 竞态）
    // 同一学号只保留最新一条会话，旧会话自动被替换
    // ──────────────────────────────────────────
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase.rpc('upsert_session', {
      p_id: sessionId,
      p_campus_id: campusId,
      p_school_id: schoolId,
      p_stu_number: stuNumber,
      p_token: token,
      p_phone_number: phoneNumber,
      p_sex: sex,
      p_expires_at: expiresAt,
    });

    // 如果 RPC 不存在，降级为 upsert（需要 stu_number UNIQUE 约束已存在）
    if (error?.code === '42883' || error?.message?.includes('does not exist')) {
      const { error: upsertErr } = await supabase
        .from('sessions')
        .upsert(
          {
            id: sessionId,
            campus_id: campusId,
            school_id: schoolId,
            stu_number: stuNumber,
            token,
            phone_number: phoneNumber,
            sex,
            expires_at: expiresAt,
          },
          { onConflict: 'stu_number' }
        );
      if (upsertErr) {
        console.error('存储会话失败(upsert降级):', upsertErr);
        return res.status(500).json({ success: false, message: '存储会话失败: ' + upsertErr.message });
      }
      // 降级路径下同步建档
      await supabase
        .from('user_balances')
        .upsert(
          { stu_number: stuNumber, session_id: sessionId, balance: 0, balance_sunrun: 0 },
          { onConflict: 'stu_number' }
        );
    } else if (error) {
      console.error('存储会话失败:', error);
      return res.status(500).json({ success: false, message: '存储会话失败: ' + error.message });
    }

    // upsert_session 在 ON CONFLICT(stu_number) 时故意不更新 sessions.id（避免破坏 makeup_tasks 外键），
    // 因此库里的 id 可能是首次登录时的 UUID，与本次生成的 sessionId 不一致。必须回读真实 id 再返回给前端。
    const { data: persisted, error: readErr } = await supabase
      .from('sessions')
      .select('id, expires_at')
      .eq('stu_number', stuNumber)
      .maybeSingle();

    if (readErr) {
      console.warn('[auth/login] 回读 session 失败:', readErr.message);
    }
    const actualSessionId = persisted?.id ?? sessionId;
    const actualExpiresAt = persisted?.expires_at
      ? new Date(persisted.expires_at as string).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    return res.json({
      success: true,
      message: '登录成功',
      data: {
        sessionId: actualSessionId,
        stuNumber,
        expiresAt: actualExpiresAt,
      },
    });
  } catch (error: any) {
    console.error('登录失败:', error);
    return res.status(500).json({ success: false, message: error.message || '登录失败' });
  }
});

// 验证会话（按 sessionId 验证，session 存在即有效）
router.get('/verify/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const { data: session, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();

    if (error || !session) {
      return res.status(404).json({ success: false, message: '会话不存在' });
    }

    if (new Date(session.expires_at) < new Date()) {
      return res.status(401).json({ success: false, message: '会话已过期' });
    }

    return res.json({
      success: true,
      data: {
        stuNumber: session.stu_number,
        campusId: session.campus_id,
        schoolId: session.school_id,
        sex: session.sex,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 退出登录（按 sessionId 删除）
router.post('/logout/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    await supabase.from('sessions').delete().eq('id', sessionId);

    return res.json({ success: true, message: '已退出登录' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
