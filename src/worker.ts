/**
 * Cloudflare Workers 入口 - 使用 Hono 框架
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createClient } from '@supabase/supabase-js';
import authRoutes from './routes/auth.js';
import makeupRoutes from './routes/makeup.js';
import taskRoutes from './routes/tasks.js';
import { supabase } from './db/supabase.js';
import type { Env } from './types/env.js';

const app = new Hono<{ Bindings: Env }>();

// CORS 配置
app.use('*', cors({
  origin: (origin) => origin || '*',
  credentials: true,
}));

// 健康检查
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    platform: 'cloudflare-workers',
    timestamp: new Date().toISOString(),
  });
});

// API 路由
app.route('/api/auth', authRoutes);
app.route('/api/makeup', makeupRoutes);
app.route('/api/tasks', taskRoutes);

// 错误处理
app.onError((err, c) => {
  console.error('Worker Error:', err);
  return c.json({
    success: false,
    message: err.message || 'Internal server error',
  }, 500);
});

// 导出 worker
export default {
  fetch: app.fetch,
};
