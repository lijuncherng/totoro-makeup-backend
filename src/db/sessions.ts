// 数据库操作 - 使用内存存储作为后备
import { type Session, type MakeupTask } from './types.js';
import * as memoryStore from './memoryStore.js';

// 重新导出类型
export type { Session, MakeupTask };

// 导出内存存储的函数（作为后备）
export const createSession = memoryStore.createSession;
export const getSession = memoryStore.getSession;
export const getSessionByStudent = memoryStore.getSessionByStudent;
export const createMakeupTask = memoryStore.createMakeupTask;
export const getPendingTasks = memoryStore.getPendingTasks;
export const updateTaskStatus = memoryStore.updateTaskStatus;
export const getTaskHistory = memoryStore.getTaskHistory;
export const getTask = memoryStore.getTask;
