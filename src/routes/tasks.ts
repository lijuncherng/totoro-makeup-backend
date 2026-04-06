/**
 * 任务管理路由 - Express 版本
 * 所有接口均通过 stu_number 绑定用户数据，实现用户数据完全隔离
 */
import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { executeMakeup } from '../services/executor.js';

const router = Router();

// ──────────────────────────────────────────
// 内部辅助：获取任务并校验 sessionId 归属
// ──────────────────────────────────────────
async function getTaskWithAuth(taskId: string, sessionId: string) {
  const { data: task, error } = await supabase
    .from('makeup_tasks')
    .select('*')
    .eq('id', taskId)
    .maybeSingle();

  if (error || !task) {
    throw Object.assign(new Error('任务不存在'), { status: 404 });
  }

  // 通过 sessions 表验证 sessionId 是否属于该 stuNumber
  const { data: session } = await supabase
    .from('sessions')
    .select('stu_number')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session || session.stu_number !== task.stu_number) {
    throw Object.assign(new Error('无权限操作此任务'), { status: 403 });
  }

  return task;
}

// 获取任务状态（无需鉴权，仅返回公开字段）
router.get('/status/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { data, error } = await supabase
      .from('makeup_tasks')
      .select('id, stu_number, status, custom_date, custom_period, mileage, created_at, completed_at, error_message')
      .eq('id', taskId)
      .single();

    if (error || !data) {
      return res.status(404).json({ success: false, message: '任务不存在' });
    }

    return res.json({
      success: true,
      data: {
        id: data.id,
        status: data.status,
        customDate: data.custom_date,
        customPeriod: data.custom_period,
        mileage: data.mileage,
        createdAt: data.created_at,
        completedAt: data.completed_at,
        errorMessage: data.error_message,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 手动触发任务执行（管理员/用户自触发）
router.post('/execute/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { sessionId } = req.body;

    const task = await getTaskWithAuth(taskId, sessionId);

    if (task.status === 'processing') {
      return res.status(400).json({ success: false, message: '任务正在执行中' });
    }

    // 通过 stu_number 直接查 sessions 获取 token
    const { data: session, error: se } = await supabase
      .from('sessions')
      .select('*')
      .eq('stu_number', task.stu_number)
      .maybeSingle();

    if (se || !session) {
      return res.status(401).json({ success: false, message: '用户会话不存在' });
    }

    await supabase.from('makeup_tasks').update({ status: 'processing' }).eq('id', taskId);

    try {
      const result = await executeMakeup({
        campusId: session.campus_id,
        schoolId: session.school_id,
        stuNumber: session.stu_number,
        token: session.token,
        phoneNumber: session.phone_number,
        sex: session.sex,
      }, {
        routeId: task.route_id,
        taskId: task.task_id,
        customDate: task.custom_date,
        customPeriod: task.custom_period,
        mileage: task.mileage,
      });

      await supabase.from('makeup_tasks').update({
        status: 'completed',
        result,
        completed_at: new Date().toISOString(),
      }).eq('id', taskId);

      return res.json({ success: true, message: '任务执行成功', data: result });
    } catch (execError: any) {
      await supabase.from('makeup_tasks').update({
        status: 'failed',
        error_message: execError.message,
      }).eq('id', taskId);

      return res.status(500).json({ success: false, message: `执行失败: ${execError.message}` });
    }
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message });
  }
});

// 取消任务（仅任务归属者可取消）
router.post('/cancel/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { sessionId } = req.body as { sessionId?: string };

    if (!sessionId) {
      return res.status(400).json({ success: false, message: '缺少 sessionId' });
    }

    const task = await getTaskWithAuth(taskId, sessionId);

    if (task.status === 'completed' || task.status === 'failed') {
      return res.status(400).json({ success: false, message: '无法取消已结束的任务' });
    }

    await supabase.from('makeup_tasks').update({
      status: 'failed',
      error_message: '用户取消',
    }).eq('id', taskId);

    return res.json({ success: true, message: '任务已取消' });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message });
  }
});

export default router;
