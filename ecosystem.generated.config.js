module.exports = { apps: [
  { name: 'wabapanel-api', script: '/www/wwwroot/redpanel/wabapanel-express/src/server.js', cwd: '/www/wwwroot/redpanel/wabapanel-express', watch: false, autorestart: true, max_restarts: 10, restart_delay: 3000 },
  { name: 'wabapanel-app', script: 'node_modules/next/dist/bin/next', args: 'start -p 3002', cwd: '/www/wwwroot/redpanel/wabapanel-frontend', watch: false, autorestart: true, max_restarts: 10, restart_delay: 3000 }
] };
