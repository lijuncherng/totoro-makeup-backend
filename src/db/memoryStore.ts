// 内存会话存储（用于本地测试，不依赖 Supabase）
import { type Session, type MakeupTask } from './types.js';

// 内存存储
const sessions: Map<string, Session> = new Map();
const tasks: Map<string, MakeupTask> = new Map();

// 会话操作
export async function createSession(session: Session): Promise<Session> {
  sessions.set(session.id, session);
  console.log(`📝 创建会话: ${session.id} (${session.stuNumber})`);
  return session;
}

export async function getSession(id: string): Promise<Session | null> {
  const session = sessions.get(id);
  if (!session) {
    // 尝试从数据库获取
    const { supabase } = await import('../index.js');
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return null;
    return data as Session;
  }
  return session;
}

export async function getSessionByStudent(stuNumber: string): Promise<Session | null> {
  for (const session of sessions.values()) {
    if (session.stuNumber === stuNumber) {
      return session;
    }
  }

  // 尝试从数据库获取
  const { supabase } = await import('../index.js');
  const { data } = await supabase
    .from('sessions')
    .select('*')
    .eq('stuNumber', stuNumber)
    .order('createdAt', { ascending: false })
    .limit(1)
    .single();

  return data as Session | null;
}

// 任务操作
export async function createMakeupTask(task: Omit<MakeupTask, 'id' | 'createdAt'>): Promise<MakeupTask> {
  const fullTask: MakeupTask = {
    ...task,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  tasks.set(fullTask.id, fullTask);
  console.log(`📝 创建任务: ${fullTask.id} (${fullTask.customDate} ${fullTask.customPeriod})`);
  return fullTask;
}

export async function getPendingTasks(userId: string): Promise<MakeupTask[]> {
  const userTasks: MakeupTask[] = [];
  for (const task of tasks.values()) {
    if (task.userId === userId && (task.status === 'pending' || task.status === 'processing')) {
      userTasks.push(task);
    }
  }
  return userTasks;
}

export async function updateTaskStatus(
  taskId: string,
  status: MakeupTask['status'],
  result?: any,
  errorMessage?: string
): Promise<void> {
  let task = tasks.get(taskId);

  if (!task) {
    // 从数据库获取
    const { supabase } = await import('../index.js');
    const { data } = await supabase
      .from('makeup_tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (data) {
      task = data as MakeupTask;
    }
  }

  if (task) {
    task.status = status;
    if (result) task.result = result;
    if (errorMessage) task.errorMessage = errorMessage;
    if (status === 'completed' || status === 'failed') {
      task.completedAt = new Date().toISOString();
    }
    tasks.set(taskId, task);

    console.log(`📝 更新任务 ${taskId}: ${status}`);
  }
}

export async function getTaskHistory(userId: string, limit = 50): Promise<MakeupTask[]> {
  const userTasks: MakeupTask[] = [];
  for (const task of tasks.values()) {
    if (task.userId === userId) {
      userTasks.push(task);
    }
  }
  return userTasks.slice(0, limit);
}

export async function getTask(taskId: string): Promise<MakeupTask | null> {
  return tasks.get(taskId) || null;
}
