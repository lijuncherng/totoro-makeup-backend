# 龙猫补跑海外后端服务 (Totoro Makeup Backend)

基于 Supabase 的海外补跑后端服务，支持独立部署在海外服务器上。

## 功能特性

- 🚀 **异步任务队列** - 支持批量补跑，不阻塞请求
- 📊 **任务状态追踪** - 实时查看补跑进度
- 🔐 **会话管理** - 扫码登录，长期有效
- 🌍 **海外部署** - 支持部署在任意海外服务器
- 💾 **Supabase 存储** - 免费的 PostgreSQL + 实时订阅
- 🔒 **RSA 加密** - 与龙猫服务器一致的加密算法
- 🗺️ **轨迹生成** - 智能生成模拟跑步轨迹

## 架构设计

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   前端页面       │ --> │   补跑后端       │ --> │   龙猫服务器    │
│   (本项目)       │     │   (海外节点)     │     │   (国内)        │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              │
                              ▼
                        ┌─────────────────┐
                        │   Supabase      │
                        │   PostgreSQL    │
                        └─────────────────┘
```

## 快速开始

### 1. 配置 Supabase

1. 创建 [Supabase](https://supabase.com) 项目（免费）
2. 在 SQL Editor 中执行 `supabase/migrations/001_init.sql`
3. 获取 `Project URL` 和 `Service Role Key`

### 2. 配置环境变量

```bash
cd makeup-backend
cp .env.example .env
```

编辑 `.env` 文件：

```env
# Supabase 配置
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# 龙猫服务器配置
TOTORO_API_URL=https://app.xtotoro.com/app
TOTORO_USER_AGENT=TotoroSchool/1.2.14 (iPhone; iOS 17.4.1; Scale/3.00)

# 服务配置
PORT=3001
NODE_ENV=production

# 允许的域名
ALLOWED_ORIGINS=https://your-domain.com,https://www.your-domain.com
```

### 3. 安装依赖并运行

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 生产模式
npm run build
npm start
```

## 部署到海外服务器

### 方式一：Docker 部署（推荐）

```bash
# 构建镜像
docker build -t totoro-makeup .

# 运行容器
docker run -d -p 3001:3001 \
  --env-file .env \
  --restart unless-stopped \
  --name totoro-makeup \
  totoro-makeup
```

或使用 docker-compose：

```bash
# 编辑 .env 文件填入配置
cp .env.example .env

# 启动服务
docker-compose up -d
```

### 方式二：PM2 部署

```bash
# 安装 PM2
npm install -g pm2

# 构建
npm run build

# 启动服务
pm2 start dist/index.js --name totoro-makeup

# 保存进程列表
pm2 save

# 设置开机自启
pm2 startup
```

### 方式三：Cloudflare Workers（免费，无需服务器）

**不需要自己的服务器**，只需要 Supabase 项目 + Cloudflare 免费账号。

#### 步骤 1：确保 Supabase 表结构已就绪

确保你的 Supabase 项目里已有以下表（参考 `supabase/schema.sql`）：

- `sessions` — 登录会话
- `user_balances` — 余额
- `recharge_cards` — 卡密
- `makeup_tasks` — 补跑记录

#### 步骤 2：安装 Wrangler CLI 并登录

```bash
npm install -g wrangler
wrangler login
```

#### 步骤 3：设置密钥（不写在代码里）

```bash
cd makeup-backend

# 设置 Supabase URL
wrangler secret put SUPABASE_URL
# → 输入你的 Supabase URL，例如 https://xxxx.supabase.co

# 设置 Service Role 密钥
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# → 输入你的 SUPABASE_SERVICE_ROLE_KEY

# 设置管理密钥（可选）
wrangler secret put ADMIN_SECRET
# → 输入任意随机字符串
```

#### 步骤 4：部署

```bash
cd makeup-backend
npx wrangler deploy
```

部署成功后，你会得到一个 Workers URL，类似：

```
https://totoro-makeup-backend.<your-subdomain>.workers.dev
```

#### 步骤 5：配置 Nuxt 前端

在项目根目录 `.env` 中添加：

```env
# 浏览器直连 CF Worker（所有补跑请求走 Cloudflare）
NUXT_PUBLIC_MAKEUP_BACKEND_URL=https://totoro-makeup-backend.xxxxxx.workers.dev
```

重启 Nuxt 后，手动补跑会自动走 Cloudflare Workers → Supabase。

#### 常见问题

**Q: 补跑执行慢/超时？**
Cloudflare Workers 免费版 CPU 时间限制 10ms，付费版 50ms，但实际补跑主要是网络 IO，等待龙猫服务器响应不计入 CPU 时间，一般够用。如果遇到超时可升级到付费版（$5/月）。

**Q: 龙猫 Token 验证失败？**
在 Cloudflare Dashboard → Workers → 你的 Worker → Settings → Variables 里添加：
- Name: `SKIP_TOKEN_VERIFY`，Value: `true`

**Q: CORS 错误？**
在同样位置添加：
- Name: `ALLOWED_ORIGINS`，Value: `https://你的Nuxt网站域名`（多个用逗号分隔）

**Q: 想自定义域名？**
Cloudflare Dashboard → Workers → 你的 Worker → Triggers → Custom Domains，添加你自己的域名（需要域名已在 Cloudflare 管理）。

---

### 方式五：Railway（推荐，免费额度够用）

Railway 是一个海外 Node.js 托管平台，有免费额度，适合跑这个 backend 直连 Supabase 和龙猫服务器。

**架构：Railway → Supabase + 龙猫（国内）**

#### 步骤 1：Fork 并上传代码

把 `makeup-backend` 目录上传到 GitHub（或直接用 Railway 的 Deploy from Git repo）。

#### 步骤 2：在 Railway 创建项目

1. 打开 [railway.app](https://railway.app)，用 GitHub 登录
2. 点击 **New Project** → **Deploy from GitHub repo**
3. 选择包含 `makeup-backend` 的仓库
4. Railway 会自动识别 `Dockerfile`，点击 **Configure** 确认构建配置
5. 在 **Variables** 里添加以下环境变量：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `SUPABASE_URL` | `https://tgxzonqqifaakjmbaiml.supabase.co` | Supabase 项目地址 |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Supabase Service Role Key |
| `ADMIN_SECRET` | `你自己设的随机字符串` | 管理员密钥 |
| `ALLOWED_ORIGINS` | `*` | 允许的来源（开发测试用 `*`，生产填前端域名） |
| `PORT` | `3005` | Railway 会自动设置，不必手动填 |

#### 步骤 3：部署

点击 **Deploy**，Railway 会用 Dockerfile 构建镜像并启动服务。构建完成后，Railway 会分配一个 `.up.railway.app` 域名，例如：

```
https://totoro-makeup-backend.up.railway.app
```

点击 **Settings** → **Networking** → **Public Networking**，启用公网访问。

#### 步骤 4：验证部署

访问 `https://你的地址.up.railway.app/health`，应该返回：

```json
{"status":"ok","platform":"node-express","timestamp":"..."}
```

#### 步骤 5：配置 Nuxt 前端

在项目根目录 `.env` 中修改（或添加）：

```env
# Railway 上的 Node.js 后端（境外，稳）
MAKEUP_BACKEND_REMOTE_URL=https://你的地址.up.railway.app
NUXT_PUBLIC_MAKEUP_BACKEND_URL=https://你的地址.up.railway.app
MAKEUP_BACKEND_INTERNAL_URL=https://你的地址.up.railway.app
```

然后重启 Nuxt（`pnpm dev`）。

---

### 方式六：手动部署到 VPS

```bash
# 1. 上传代码到服务器
scp -r makeup-backend user@your-server:/opt/

# 2. SSH 登录服务器
ssh user@your-server

# 3. 安装依赖并构建
cd /opt/makeup-backend
npm install
npm run build

# 4. 使用 systemd 管理服务
sudo nano /etc/systemd/system/totoro-makeup.service
```

创建 systemd 服务文件：

```ini
[Unit]
Description=Totoro Makeup Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/makeup-backend
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable totoro-makeup
sudo systemctl start totoro-makeup
```

## 前端对接

在主项目 `nuxt.config.ts` 中配置海外后端地址：

```typescript
export default defineNuxtConfig({
  runtimeConfig: {
    public: {
      makeupBackendUrl: process.env.NUXT_PUBLIC_MAKEUP_BACKEND_URL || 'http://localhost:3001',
    },
  },
})
```

访问海外补跑页面：`/makeup/overseas`

## API 接口

### 认证接口

#### POST /api/auth/login
扫码登录

```json
{
  "campusId": "QJXQ",
  "schoolId": "cqifs",
  "stuNumber": "202413006775",
  "token": "user-token-from-scan",
  "sex": "男"
}
```

响应：
```json
{
  "success": true,
  "data": {
    "sessionId": "uuid",
    "expiresAt": "2026-04-19T00:00:00Z"
  }
}
```

#### GET /api/auth/verify/:sessionId
验证会话有效性

### 补跑接口

#### POST /api/makeup/submit
提交单个补跑任务

```json
{
  "sessionId": "uuid",
  "routeId": "sunrunLine-20240426000001",
  "taskId": "sunrunTaskPaper-20250222000001",
  "customDate": "2026-03-11",
  "customPeriod": "AM",
  "mileage": "2.00",
  "runPoint": {
    "pointId": "xxx",
    "taskId": "xxx",
    "longitude": "106.6949505",
    "latitude": "29.0353885",
    "pointList": [...]
  }
}
```

#### POST /api/makeup/batch
批量提交补跑任务

```json
{
  "sessionId": "uuid",
  "count": 5,
  "customPeriod": "AM"
}
```

响应：
```json
{
  "success": true,
  "message": "已提交 5 个补跑任务",
  "data": {
    "taskIds": ["uuid1", "uuid2", "uuid3", "uuid4", "uuid5"]
  }
}
```

#### GET /api/makeup/pending/:sessionId
获取待处理任务

#### GET /api/makeup/history/:sessionId
获取历史记录

### 任务接口

#### GET /api/tasks/status/:taskId
获取任务状态

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "completed",
    "customDate": "2026-03-11",
    "customPeriod": "AM",
    "createdAt": "2026-03-19T10:00:00Z",
    "completedAt": "2026-03-19T10:01:30Z"
  }
}
```

#### POST /api/tasks/execute/:taskId
手动触发任务执行

#### POST /api/tasks/cancel/:taskId
取消任务

### 健康检查

#### GET /health

```json
{
  "status": "ok",
  "timestamp": "2026-03-19T10:00:00Z"
}
```

## 目录结构

```
makeup-backend/
├── src/
│   ├── index.ts              # 入口文件
│   ├── db/
│   │   └── sessions.ts       # 数据库操作
│   ├── routes/
│   │   ├── auth.ts          # 认证路由
│   │   ├── makeup.ts        # 补跑路由
│   │   └── tasks.ts         # 任务路由
│   └── services/
│       ├── encryption.ts    # RSA 加密
│       ├── totoro.ts        # 龙猫 API 调用
│       ├── executor.ts      # 补跑执行器
│       ├── queue.ts         # 任务队列
│       └── routeGenerator.ts # 轨迹生成
├── supabase/
│   └── migrations/
│       └── 001_init.sql     # 数据库初始化
├── .env.example             # 环境变量示例
├── .env                    # 环境变量（本地）
├── Dockerfile              # Docker 配置
├── docker-compose.yml      # Docker Compose 配置
├── package.json
├── tsconfig.json
└── README.md
```

## 推荐海外 VPS 服务商

| 服务商 | 特点 | 推荐配置 | 价格 |
|--------|------|----------|------|
| [Vultr](https://www.vultr.com) | 全球节点，价格实惠 | 1 CPU, 1GB RAM | $6/月 |
| [DigitalOcean](https://www.digitalocean.com) | 稳定可靠 | 1 CPU, 1GB RAM | $6/月 |
| [Linode](https://www.linode.com) | 性能优秀 | 1 CPU, 1GB RAM | $6/月 |
| [Hetzner](https://www.hetzner.com) | 欧洲节点，性价比高 | 2 CPU, 4GB RAM | €4.5/月 |
| [Cloudflare Workers](https://workers.cloudflare.com) | 免费 Serverless | 每天 10 万请求 | 免费 |

## 注意事项

1. **加密算法**：已实现与龙猫服务器一致的 RSA 加密算法
2. **Token 安全**：Token 存储在 Supabase，建议启用 Supabase 的加密存储
3. **请求频率**：避免短时间内大量提交，可能被龙猫服务器风控
4. **数据备份**：定期备份 Supabase 数据

## License

MIT
