module.exports = {
  apps: [
    {
      name: 'ai-diary-api',
      script: 'dist/main.js',
      cwd: '/srv/ai-diary/apps/api',
      exec_mode: 'fork',
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
