import { updateTaskStatus, type Session, type MakeupTask } from '../db/sessions.js';
import { executeMakeup } from './executor.js';

// 任务执行队列
const taskQueue: Map<string, Promise<any>> = new Map();

// 提交补跑任务到执行队列
export function submitMakeupTask(taskId: string, session: Session, params: any): Promise<any> {
  // 如果任务已在队列中，返回现有 Promise
  if (taskQueue.has(taskId)) {
    return taskQueue.get(taskId)!;
  }

  // 创建执行 Promise
  const executePromise = (async () => {
    try {
      await updateTaskStatus(taskId, 'processing');

      console.log(`🎯 开始执行补跑任务 ${taskId}`);
      console.log(`   日期: ${params.customDate} ${params.customPeriod}`);
      console.log(`   里程: ${params.mileage}km`);

      const result = await executeMakeup(session, params);

      await updateTaskStatus(taskId, 'completed', result);

      console.log(`✅ 任务 ${taskId} 执行成功`);
      console.log(`   scantronId: ${result.scantronId}`);

      return result;
    } catch (error: any) {
      console.error(`❌ 任务 ${taskId} 执行失败:`, error);

      await updateTaskStatus(taskId, 'failed', null, error.message);

      throw error;
    } finally {
      // 从队列中移除
      taskQueue.delete(taskId);
    }
  })();

  taskQueue.set(taskId, executePromise);
  return executePromise;
}

// 获取队列状态
export function getQueueStatus(): { pending: number; executing: number } {
  return {
    pending: taskQueue.size,
    executing: taskQueue.size,
  };
}

// 等待任务完成
export async function waitForTask(taskId: string, timeout = 60000): Promise<any> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (!taskQueue.has(taskId)) {
      // 任务已完成，从数据库获取结果
      const { supabase } = await import('../index.js');
      const { data } = await supabase
        .from('makeup_tasks')
        .select('*')
        .eq('id', taskId)
        .single();

      return data;
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error('任务执行超时');
}
