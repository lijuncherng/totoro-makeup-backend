/**
 * Cloudflare Worker 补跑后端（Supabase + 补跑一体化）
 *
 * 部署: npx wrangler deploy
 * 本地调试: npx wrangler dev
 *
 * 环境变量（在 Cloudflare Dashboard 或 wrangler.toml [vars] 中配置）:
 *   SUPABASE_URL              - Supabase 项目 URL
 *   SUPABASE_SERVICE_ROLE_KEY - Supabase SERVICE_ROLE 密钥
 *   ADMIN_SECRET              - 管理接口密钥
 *   SKIP_TOKEN_VERIFY         - 'true' 跳过龙猫 Token 校验（仅测试用）
 *   ALLOWED_ORIGINS           - 允许的来源域名，逗号分隔
 */

// ──────────────────────────────────────────────
// 1. 加密（Cloudflare Workers Web Crypto API）
// ──────────────────────────────────────────────

const RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDU/j+c5FdkEwhSIF9jmw+050iN0
/yfjhk/669RyFiG5wu0Adpk3NR2Ikbo2lA+rTBJBx1bpGVGCvMKKQ/pljNUSmJtJaM
5ieONFrZD6RhSUbjrNENH89Ks9GGWi+1dkOfdSHNujQilF5oLOIHez1HYmwmlADA29
Ux4yb8e4+PtLQIDAQAB
-----END PUBLIC KEY-----`;

const TOTORO_BASE = 'https://app.xtotoro.com/app';
const UA = 'TotoroSchool/1.2.14 (iPhone; iOS 17.4.1; Scale/3.00)';

function base64Encode(arr: Uint8Array): string {
  let binary = '';
  for (const b of arr) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function importPublicKey() {
  const pemBody = RSA_PUBLIC_KEY
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');
  const der = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'spki', der,
    { name: 'RSA-OAEP', hash: 'SHA-1' },
    false, ['encrypt'],
  );
}

async function encryptContent(data: Record<string, unknown>): Promise<string> {
  const jsonStr = JSON.stringify(data);
  const buf = new TextEncoder().encode(jsonStr);
  const pk = await importPublicKey();
  const MAX = 128 - 42; // RSA-1024 / OAEP-SHA1
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < buf.length; i += MAX) {
    const enc = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pk, buf.slice(i, i + MAX));
    chunks.push(new Uint8Array(enc));
  }
  const out = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return base64Encode(out);
}

// ──────────────────────────────────────────────
// 2. 龙猫 API 调用
// ──────────────────────────────────────────────

async function totoroCall(path: string, body: Record<string, unknown>): Promise<unknown> {
  const encBody = await encryptContent(body);
  const res = await fetch(`${TOTORO_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Host': 'app.xtotoro.com',
      'User-Agent': UA,
      'Accept': 'application/json',
    },
    body: encBody,
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text, status: res.status }; }
}

function isBizError(data: unknown): boolean {
  const d = data as Record<string, unknown>;
  const c = d?.code;
  if (c === undefined) return false;
  return c !== '00' && c !== '0' && c !== 0 && c !== 'success';
}

// ──────────────────────────────────────────────
// 3. Supabase 客户端（Workers 兼容，无需 @supabase 包）
// ──────────────────────────────────────────────

function sbFetch(env: Env, path: string, body?: unknown) {
  const headers: Record<string, string> = {
    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function sbQuery<T = unknown>(env: Env, path: string): Promise<T | null> {
  const headers: Record<string, string> = {
    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Prefer': 'return=representation',
  };
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers });
  const arr = await res.json();
  return Array.isArray(arr) && arr.length > 0 ? arr[0] as T : null;
}

async function sbInsert(env: Env, table: string, row: Record<string, unknown>) {
  const headers: Record<string, string> = {
    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
  return fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(row),
  });
}

async function sbUpdate(env: Env, table: string, pk: Record<string, string>, updates: Record<string, unknown>) {
  const headers: Record<string, string> = {
    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
  const filter = Object.entries(pk).map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
  return fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(updates),
  });
}

async function sbUpsert(env: Env, table: string, row: Record<string, unknown>) {
  const headers: Record<string, string> = {
    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates',
  };
  return fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(row),
  });
}

// ──────────────────────────────────────────────
// 4. 补跑执行逻辑
// ──────────────────────────────────────────────

function getStd(sex?: string) {
  if (sex === '1' || sex === '男') return { minKm: 2.0, maxKm: 2.3, minT: 10, maxT: 11 };
  if (sex === '2' || sex === '女') return { minKm: 1.6, maxKm: 1.63, minT: 10, maxT: 13 };
  return { minKm: 2.0, maxKm: 2.3, minT: 10, maxT: 11 };
}

function fmtDur(seconds: number) {
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function fmtClock(d: Date) {
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

function rnd(min: number, max: number) { return min + Math.random() * (max - min); }

function genOval(km: number, cx: number, cy: number): Array<[number, number]> {
  const pts = [];
  const n = Math.ceil(km);
  for (let i = 0; i <= n; i++) {
    const a = (2 * Math.PI * i) / n;
    pts.push([cx + 0.002 * km * Math.cos(a), cy + 0.001 * km * Math.sin(a)]);
  }
  return pts;
}

async function executeMakeup(
  env: Env,
  session: { campusId: string; schoolId: string; stuNumber: string; token: string; sex?: string },
  customDate: string,
  customPeriod: 'AM' | 'PM',
  runPoint?: { pointList?: Array<{ longitude: string; latitude: string }>; pointId?: string },
) {
  const std = getStd(session.sex);
  const km = parseFloat(rnd(std.minKm, std.maxKm).toFixed(2));
  const runSec = Math.floor(rnd(std.minT, std.maxT) * 60);
  const avgSpeed = (km / (runSec / 3600)).toFixed(2);

  // 构造补跑时间
  const base = new Date(`${customDate}T12:00:00Z`);
  if (customPeriod === 'AM') base.setUTCHours(22 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60), 0, 0);
  else base.setUTCHours(6 + Math.floor(Math.random() * 6), Math.floor(Math.random() * 60), 0, 0);

  const startSec = Math.floor(base.getTime() / 1000);
  const endSec = startSec + runSec;
  const startStr = fmtClock(new Date(startSec * 1000));
  const endStr = fmtClock(new Date(endSec * 1000));

  // 轨迹点
  let points: Array<[number, number]>;
  if (runPoint?.pointList?.length) {
    points = runPoint.pointList.map((p) => [parseFloat(p.longitude), parseFloat(p.latitude)]);
  } else {
    points = genOval(km, 106.6949505, 29.0353885);
  }

  const reqBody: Record<string, unknown> = {
    campusId: session.campusId,
    schoolId: session.schoolId,
    stuNumber: session.stuNumber,
    token: session.token,
    routeId: runPoint?.pointId || '',
    taskId: '',
    version: '1.2.14',
    runType: '0',
    phoneInfo: '$CN11/iPhone15,4/17.4.1',
    km: km.toFixed(2),
    steps: Math.floor(km * 1300),
    avgSpeed,
    usedTime: fmtDur(runSec),
    startTime: startStr,
    endTime: endStr,
    evaluateDate: `${customDate} ${endStr}`,
    ifLocalSubmit: '1',
    LocalSubmitReason: '7.30',
    customDate,
    customPeriod,
    signQrcode: runPoint?.pointId || '',
    flag: '1',
    fitDegree: '1',
    warnFlag: '0',
    warnType: '',
    faceData: '',
    headImage: '',
    mac: 'ios',
    pointList: '',
    sensorString: '',
    baseStation: '',
  };

  // 初始化（可选，失败不影响主流程）
  try {
    await totoroCall('/sunrun/getRunBegin', { campusId: session.campusId, schoolId: session.schoolId, stuNumber: session.stuNumber, token: session.token });
  } catch (_) { /* ignore */ }

  // 提交跑步
  const res1 = await totoroCall('/platform/recrecord/sunRunExercises', reqBody);
  if (isBizError(res1)) {
    const d = res1 as Record<string, unknown>;
    throw new Error(`龙猫拒绝: ${d.message || d.msg || d.code}`);
  }
  const d1 = res1 as Record<string, unknown>;
  const scantronId = String(d1.scantronId || d1.data?.scantronId || '');

  // 提交轨迹
  try {
    await fetch(`${TOTORO_BASE}/platform/recrecord/sunRunExercisesDetail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Host': 'app.xtotoro.com', 'User-Agent': UA },
      body: JSON.stringify({ pointList: points, scantronId, stuNumber: session.stuNumber, token: session.token }),
    });
  } catch (_) { /* ignore */ }

  return { scantronId, km: km.toFixed(2), evaluateDate: reqBody.evaluateDate };
}

// ──────────────────────────────────────────────
// 5. 路由处理
// ──────────────────────────────────────────────

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...extraHeaders },
  });
}

function corsPreflight(allowedOrigins?: string) {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': allowedOrigins || '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PATCH',
      'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization, x-admin-secret',
    },
  });
}

function getPath(url: string) { return new URL(url).pathname; }

// ──────────────────────────────────────────────
// 6. Worker 入口
// ──────────────────────────────────────────────

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ADMIN_SECRET?: string;
  SKIP_TOKEN_VERIFY?: string;
  ALLOWED_ORIGINS?: string;
}

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext) {
    const path = getPath(req.url);

    if (req.method === 'OPTIONS') return corsPreflight(env.ALLOWED_ORIGINS);

    try {
      // ── 健康检查 ──
      if (path === '/health' || path === '/') {
        return json({ status: 'ok', time: new Date().toISOString(), worker: 'makeup-cf-v3' });
      }

      // ── 会话验证 ── GET /api/auth/verify/:sessionId ──
      const verifyMatch = path.match(/^\/api\/auth\/verify\/([^/]+)$/);
      if (verifyMatch && req.method === 'GET') {
        const sessionId = verifyMatch[1];
        const session = await sbQuery<{
          stu_number: string; campus_id: string; school_id: string; sex: string; expires_at: string
        }>(env, `sessions?id=eq.${encodeURIComponent(sessionId)}&select=stu_number,campus_id,school_id,sex,expires_at`);
        if (!session) return json({ success: false, message: '会话不存在' }, 404);
        if (new Date(session.expires_at) < new Date()) return json({ success: false, message: '会话已过期' }, 401);
        return json({ success: true, data: { stuNumber: session.stu_number, campusId: session.campus_id, schoolId: session.school_id, sex: session.sex } });
      }

      // ── 登录 ── POST /api/auth/login ──
      if (path === '/api/auth/login' && req.method === 'POST') {
        const { campusId, schoolId, stuNumber, token, phoneNumber, sex } = await req.json() as Record<string, string>;

        if (!campusId || !schoolId || !stuNumber || !token) {
          return json({ success: false, message: '缺少必需参数' }, 400);
        }

        // Token 校验（可选）
        if (env.SKIP_TOKEN_VERIFY !== 'true') {
          try {
            const encBody = await encryptContent({ campusId, schoolId, stuNumber, token });
            const v = await fetch(`${TOTORO_BASE}/user/userInfo`, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Host': 'app.xtotoro.com', 'User-Agent': UA, 'Accept': 'application/json' },
              body: encBody,
            });
            const vText = await v.text();
            let vData: Record<string, unknown>;
            try { vData = JSON.parse(vText); } catch { vData = {}; }
            const c = vData?.code;
            const ok = c === '00' || c === '0' || c === 0 || vData?.status === 'success';
            if (!ok) {
              const hint = String(c ?? '').match(/token/i) ? '请重新扫码登录龙猫 APP 获取新 Token' : '龙猫服务器验证失败，请稍后重试';
              return json({ success: false, message: 'Token 无效或已过期', hint }, 401);
            }
          } catch (_) { /* 网络问题跳过 */ }
        }

        // 生成会话
        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        // Upsert session
        await sbUpsert(env, 'sessions', {
          id: sessionId,
          campus_id: campusId,
          school_id: schoolId,
          stu_number: stuNumber,
          token,
          phone_number: phoneNumber || '',
          sex: sex || '',
          expires_at: expiresAt,
        }, 'stu_number');

        // Upsert balance record
        await sbUpsert(env, 'user_balances', {
          stu_number: stuNumber,
          session_id: sessionId,
          balance: 0,
          balance_sunrun: 0,
        }, 'stu_number');

        // 回读真实 id（onConflict 时 id 可能已存在）
        const persisted = await sbQuery<{ id: string; expires_at: string }>(env, `sessions?stu_number=eq.${encodeURIComponent(stuNumber)}&select=id,expires_at`);
        const actualId = persisted?.id ?? sessionId;
        const actualExp = persisted?.expires_at ?? expiresAt;

        return json({ success: true, message: '登录成功', data: { sessionId: actualId, stuNumber, expiresAt: actualExp } });
      }

      // ── 余额查询 ── GET /api/recharge/balance/:stuNumber ──
      const balanceMatch = path.match(/^\/api\/recharge\/balance\/([^/]+)$/);
      if (balanceMatch && req.method === 'GET') {
        const stuNumber = balanceMatch[1];
        const row = await sbQuery<{ balance: number; balance_sunrun: number }>(env, `user_balances?stu_number=eq.${encodeURIComponent(stuNumber)}&select=balance,balance_sunrun`);
        return json({ success: true, data: { balance: row?.balance ?? 0, balanceSunrun: row?.balance_sunrun ?? 0 } });
      }

      // ── 卡密充值 ── POST /api/recharge/redeem ──
      if (path === '/api/recharge/redeem' && req.method === 'POST') {
        const { code, stuNumber } = await req.json();
        // 查找卡密
        const card = await sbQuery<{ id: string; amount: number; kind: string; used: boolean }>(env, `recharge_cards?code=eq.${encodeURIComponent(code)}&used=eq.false&select=id,amount,kind,used`);
        if (!card) return json({ success: false, message: '卡密无效或已使用' }, 400);

        // 标记为已用
        await sbUpdate(env, 'recharge_cards', { id: card.id }, { used: true, used_at: new Date().toISOString(), used_by: stuNumber });

        // 增加余额
        const bal = await sbQuery<{ balance: number }>(env, `user_balances?stu_number=eq.${encodeURIComponent(stuNumber)}&select=balance`);
        if (bal) {
          await sbUpdate(env, 'user_balances', { stu_number: stuNumber }, {
            balance: (bal.balance ?? 0) + card.amount,
            updated_at: new Date().toISOString(),
          });
        } else {
          await sbInsert(env, 'user_balances', { stu_number: stuNumber, balance: card.amount });
        }

        return json({ success: true, message: `充值成功 +${card.amount}` });
      }

      // ── 补跑提交 ── POST /api/makeup/submit ──
      if (path === '/api/makeup/submit' && req.method === 'POST') {
        const body = await req.json();
        const { session: rawSession, customDate, customPeriod, routeId, runPoint } = body;
        const session = rawSession as { campusId: string; schoolId: string; stuNumber: string; token: string; sex?: string };

        if (!session?.token || !session?.stuNumber) return json({ success: false, message: '未授权' }, 401);

        // Token 校验（可选）
        if (env.SKIP_TOKEN_VERIFY !== 'true') {
          try {
            const v = await totoroCall('/user/userInfo', session) as Record<string, unknown>;
            const c = v?.code;
            if (c !== '00' && c !== '0' && c !== 0 && v?.status !== 'success') {
              return json({ success: false, message: 'Token 无效或已过期，请重新扫码' }, 401);
            }
          } catch (_) { /* 网络问题跳过 */ }
        }

        // 检查余额
        const bal = await sbQuery<{ balance: number }>(env, `user_balances?stu_number=eq.${encodeURIComponent(session.stuNumber)}&select=balance`);
        if (!bal || bal.balance < 1) return json({ success: false, message: '余额不足，请先充值' }, 400);

        // 扣余额
        await sbUpdate(env, 'user_balances', { stu_number: session.stuNumber }, { balance: Math.max(0, (bal.balance ?? 0) - 1) });

        // 执行补跑
        let result: { scantronId: string; km: string; evaluateDate: string };
        try {
          result = await executeMakeup(env, session, customDate, customPeriod, runPoint);
        } catch (e: unknown) {
          // 失败退款
          const newBal = (bal.balance ?? 0);
          await sbUpdate(env, 'user_balances', { stu_number: session.stuNumber }, { balance: newBal });
          return json({ success: false, message: `补跑失败: ${e instanceof Error ? e.message : String(e)}` }, 500);
        }

        // 写入 makeup_tasks 记录
        await sbInsert(env, 'makeup_tasks', {
          stu_number: session.stuNumber,
          task_id: crypto.randomUUID(),
          custom_date: customDate,
          custom_period: customPeriod,
          scantron_id: result.scantronId,
          km: result.km,
          status: 'success',
          created_at: new Date().toISOString(),
        });

        return json({ success: true, message: '补跑成功', data: result });
      }

      // ── 退款 ── POST /api/makeup/refund ──
      if (path === '/api/makeup/refund' && req.method === 'POST') {
        const { stuNumber } = await req.json();
        const bal = await sbQuery<{ balance: number }>(env, `user_balances?stu_number=eq.${encodeURIComponent(stuNumber)}&select=balance`);
        await sbUpdate(env, 'user_balances', { stu_number: stuNumber }, { balance: (bal?.balance ?? 0) + 1 });
        return json({ success: true });
      }

      return new Response('Not Found', { status: 404 });
    } catch (e: unknown) {
      console.error('CF Worker error:', e);
      return json({ success: false, message: `服务器错误: ${e instanceof Error ? e.message : String(e)}` }, 500);
    }
  },
};
