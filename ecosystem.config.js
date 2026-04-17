module.exports = {
  apps: [{
    name: 'wuv-admin',
    script: 'server.js',
    cwd: '/opt/wuv-admin',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    env: {
      NODE_ENV: 'production',
      PORT: 3200,
      WUV_FLEET_KEY: process.env.WUV_FLEET_KEY,
      WUV_ADMIN_TOKEN: process.env.WUV_ADMIN_TOKEN,
      DB_PATH: '/opt/wuv-admin/data/wuv-admin.db',
      VERSION_JSON_PATH: '/var/www/html/iso/version.json',
      ISO_DIR: '/var/www/html/iso'
    },
    error_file: '/opt/wuv-admin/logs/error.log',
    out_file: '/opt/wuv-admin/logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
