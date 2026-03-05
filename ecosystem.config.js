module.exports = {
  apps: [{
    name: '1etiket-whatsapp-bot',
    script: 'server.js',
    instances: 1, // WhatsApp webhook sıralı işlenmeli, cluster kullanma
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    // Otomatik yeniden başlatma
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 5000,
    // Log dosyaları
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    // Bellek limiti (512MB üstünde yeniden başlat)
    max_memory_restart: '512M',
    // Dosya değişikliğinde yeniden başlatma (production'da kapalı)
    watch: false
  }]
};
