module.exports = {
  apps: [
    {
      name: 'integrame-backend',
      script: 'dist/index.js',
      cwd: 'G:/Integrame/backend',
      instances: 1,
      autorestart: true,       // reporneste automat daca crapa
      watch: false,
      max_memory_restart: '512M',
      restart_delay: 1000,     // asteapta 1s inainte de restart
      max_restarts: 20,
      env: {
        NODE_ENV: 'development',
        PORT: 4000,
      },
      error_file: 'G:/Integrame/logs/backend-error.log',
      out_file: 'G:/Integrame/logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
