import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import makeupRoutes from './routes/makeup.js';
import authRoutes from './routes/auth.js';
import taskRoutes from './routes/tasks.js';
import rechargeRoutes from './routes/recharge.js';
import consumptionRoutes from './routes/consumption.js';
import { supabase } from './db/supabase.js';

if (!supabase) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const ADMIN_SECRET = process.env.ADMIN_SECRET;
if (!ADMIN_SECRET) {
  console.error('Missing ADMIN_SECRET');
  process.exit(1);
}

const app = express();
const PORT = Number(process.env.PORT || 3005);
const HOST = process.env.HOST || '0.0.0.0';

export { supabase };

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').filter(Boolean);
if (!allowedOrigins || allowedOrigins.length === 0 || allowedOrigins.includes('*')) {
  app.use(cors({ origin: '*', credentials: true }));
} else {
  app.use(cors({ origin: allowedOrigins, credentials: true }));
}

app.use(express.json({ limit: '10mb' }));

app.get('/', (_req, res) => {
  res.type('html').send(
    '<!DOCTYPE html><meta charset="utf-8"><title>makeup-backend</title>'
    + '<p>This is the makeup API service. Use the Nuxt frontend or call the API endpoints directly.</p>'
    + '<ul><li><a href="/health">/health</a></li>'
    + '<li>Routes: <code>/api/auth</code>, <code>/api/makeup</code>, <code>/api/tasks</code></li></ul>',
  );
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/makeup', makeupRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/recharge', rechargeRoutes);
app.use('/api/consumption', consumptionRoutes);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ success: false, message: err.message || 'Internal server error' });
});

app.listen(PORT, HOST, () => {
  console.log(`makeup-backend listening on http://${HOST}:${PORT}`);
  console.log(`Supabase: ${process.env.SUPABASE_URL}`);
});

export default app;
