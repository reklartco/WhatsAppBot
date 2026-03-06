#!/usr/bin/env node

/**
 * Başlatma öncesi ortam değişkenlerini doğrula
 * Kullanım: node scripts/validate-env.js
 */

const dotenv = require('dotenv');
dotenv.config();

const REQUIRED = [
  { key: 'EVOLUTION_BASE_URL', hint: 'Evolution API URL (örn: http://evolution-api:8080)' },
  { key: 'EVOLUTION_APIKEY', hint: 'Evolution API anahtarı' },
  { key: 'EVOLUTION_INSTANCE', hint: 'Evolution instance adı (örn: 1etiket-main)' },
  { key: 'ADMIN_SECRET', hint: 'Admin panel erişim anahtarı' },
  { key: 'WC_URL', hint: 'WooCommerce site URL (örn: https://1etiket.com.tr)' },
  { key: 'WC_CONSUMER_KEY', hint: 'WooCommerce REST API consumer key (ck_xxx)' },
  { key: 'WC_CONSUMER_SECRET', hint: 'WooCommerce REST API consumer secret (cs_xxx)' },
];

const OPTIONAL = [
  { key: 'PORT', default: '3000' },
  { key: 'EVOLUTION_WEBHOOK_PATH', default: '/webhook/evolution' },
  { key: 'WEBHOOK_PUBLIC_URL', hint: 'Evolution webhook public URL' },
  { key: 'PRICE_API_URL', hint: 'Yoksa yerel fiyat hesaplama kullanılır' },
  { key: 'PRICE_API_KEY', hint: 'Fiyat API anahtarı' },
  { key: 'WC_WEBHOOK_SECRET', hint: 'WooCommerce webhook imza doğrulama' },
  { key: 'UPLOAD_DIR', default: './uploads/baski-dosyalari' },
  { key: 'DB_PATH', default: './data/conversations.db' },
  { key: 'POSTGRES_PASSWORD', hint: 'PostgreSQL şifresi (Evolution API için)' },
];

console.log('\n=== 1etiket WhatsApp Bot v2.0 — Ortam Doğrulama ===\n');

let hasError = false;

// Zorunlu değişkenler
console.log('Zorunlu değişkenler:');
for (const { key, hint } of REQUIRED) {
  const value = process.env[key];
  if (!value || value.startsWith('change-me') || value.startsWith('your_') || value.startsWith('ck_xxx')) {
    console.log(`  EKSIK  ${key}`);
    console.log(`         ${hint}`);
    hasError = true;
  } else {
    const masked = value.substring(0, 8) + '***';
    console.log(`  OK     ${key} = ${masked}`);
  }
}

// Opsiyonel değişkenler
console.log('\nOpsiyonel değişkenler:');
for (const { key, hint, default: def } of OPTIONAL) {
  const value = process.env[key];
  if (value) {
    console.log(`  OK     ${key} = ${value.substring(0, 25)}${value.length > 25 ? '...' : ''}`);
  } else if (def) {
    console.log(`  VARSAY ${key} = ${def}`);
  } else {
    console.log(`  YOK    ${key} — ${hint || ''}`);
  }
}

// Bağlantı testleri
console.log('\nBağlantı testleri:');

async function testConnections() {
  const axios = require('axios');

  // Evolution API bağlantısı
  if (process.env.EVOLUTION_BASE_URL && !process.env.EVOLUTION_APIKEY?.startsWith('change-me')) {
    try {
      await axios.get(`${process.env.EVOLUTION_BASE_URL}/instance/fetchInstances`, {
        headers: { apikey: process.env.EVOLUTION_APIKEY },
        timeout: 5000
      });
      console.log('  OK     Evolution API bağlantısı başarılı');
    } catch (e) {
      if (e.code === 'ECONNREFUSED') {
        console.log('  HATA   Evolution API: Bağlantı reddedildi (servis çalışıyor mu?)');
      } else {
        console.log(`  UYARI  Evolution API: ${e.response?.status || e.message}`);
      }
    }
  }

  // WooCommerce bağlantısı
  if (process.env.WC_URL && process.env.WC_CONSUMER_KEY && !process.env.WC_CONSUMER_KEY.startsWith('ck_xxx')) {
    try {
      const WooCommerceRestApi = require('@woocommerce/woocommerce-rest-api').default;
      const wc = new WooCommerceRestApi({
        url: process.env.WC_URL,
        consumerKey: process.env.WC_CONSUMER_KEY,
        consumerSecret: process.env.WC_CONSUMER_SECRET,
        version: 'wc/v3'
      });
      await wc.get('system_status');
      console.log('  OK     WooCommerce API bağlantısı başarılı');
    } catch (e) {
      console.log(`  HATA   WooCommerce API: ${e.message}`);
      hasError = true;
    }
  }

  // Sonuç
  console.log('\n' + '='.repeat(50));
  if (hasError) {
    console.log('SONUÇ: Eksik veya hatalı ayarlar var. .env dosyasını düzenleyin.');
    process.exit(1);
  } else {
    console.log('SONUÇ: Ayarlar tamam!');
    console.log('\nBaşlatma komutları:');
    console.log('  Docker:      docker compose up -d');
    console.log('  Geliştirme:  npm run dev');
    console.log('  PM2:         pm2 start ecosystem.config.js');
    process.exit(0);
  }
}

testConnections().catch(e => {
  console.error('Doğrulama hatası:', e.message);
  process.exit(1);
});
