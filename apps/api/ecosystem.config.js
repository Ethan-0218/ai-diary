module.exports = {
  apps: [
    {
      name: 'ai-diary-api',
      script: 'dist/main.js',
      cwd: '/srv/ai-diary/apps/api',
      exec_mode: 'fork',
      // ESM 전용 의존성(jose 등)을 require하려면 Node 22+ 필요(require(ESM) 지원).
      // 기존 서비스는 Node 20 유지, ai-diary만 nvm node22 심링크로 실행.
      interpreter: '/home/ubuntu/.local/bin/node22',
      env: {
        NODE_ENV: 'production',
        PORT: 5200,
      },
      env_file: '/srv/ai-diary/apps/api/.env',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/srv/ai-diary/apps/api/logs/error.log',
      out_file: '/srv/ai-diary/apps/api/logs/out.log',
      merge_logs: true,
      max_memory_restart: '1024M',
    },
  ],
};
