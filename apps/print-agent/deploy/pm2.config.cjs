// PM2 (Linux, macOS o Windows):
//   npm i -g pm2
//   pm2 start apps/print-agent/deploy/pm2.config.cjs
//   pm2 save && pm2 startup        (Linux/macOS: arranque automático)
//   Windows: npm i -g pm2-windows-startup && pm2-startup install
const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'restaurante-hub-agent',
      script: path.join(__dirname, '..', 'dist', 'cli.js'),
      args: 'start',
      cwd: path.join(__dirname, '..'),
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 1000,
      time: true,
      env: {
        NODE_ENV: 'production',
        // Opcional: si no se definen se usa ~/.restaurante-hub/agent.json
        // RH_API_URL: 'https://mi-restaurante.up.railway.app',
        // RH_AGENT_TOKEN: '...',
      },
    },
  ],
};
