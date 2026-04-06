module.exports = {
  apps: [
    {
      name: 'makeup-backend',
      script: 'dist/index.js',
      cwd: '/www/wwwroot/totoro-paradise/makeup-backend',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      env: {
        NODE_ENV: 'production',
        PORT: 3005,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3005,
        SUPABASE_URL: 'https://tgxzonqqifaakjmbaiml.supabase.co',
        SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRneHpvbnFxaWZhYWtqbWJhaW1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5ODM2MTEsImV4cCI6MjA4OTU1OTYxMX0.Z3SWLe2nP9hRiWTMbwhcC02e0baAtrqM3TXhp5u6FdM',
        SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRneHpvbnFxaWZhYWtqbWJhaW1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzk4MzYxMSwiZXhwIjoyMDg5NTU5NjExfQ.nd7Y-H0tWpIRvT8wxnrpZ-s5De6Tyq_RbW1cwNNdpyo',
        TOTORO_API_URL: 'https://app.xtotoro.com/app',
        TOTORO_USER_AGENT: 'TotoroSchool/1.2.14 (iPhone; iOS 17.4.1; Scale/3.00)',
        ADMIN_SECRET: 'cd3038fff1c52d8fa366e1417fbeaff378243d138b59b11a29c0d0c41e2a49ae',
        ALLOWED_ORIGINS: 'http://8.156.84.10,https://8.156.84.10',
        SKIP_TOKEN_VERIFY: 'true',
      },
    },
  ],
};
