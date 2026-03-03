#!/usr/bin/env node

/**
 * Başlatma öncesi ortam değişkenlerini doğrula
 * Kullanım: node scripts/validate-env.js
 */

const dotenv = require('dotenv');
dotenv.config();

const REQUIRED = [
  { key: 'WHATSAPP_TOKEN', hint: 'Meta Cloud API token (developers.facebook.com)' },
  { key: 'WHATSAPP_PHONE_ID', hint: 'WhatsApp telefon numarası ID' },
  { key: 'WHATSAPP_VERIFY_TOKEN', hint: 'Webhook doğrulama token (kendiniz belirleyin)' },
  { key: 'WC_URL', hint: 'WooCommerce site URL (örn: https://1etiket.com.tr)' },
  { key: 'WC_CONSUMER_KEY', hint: 'WooCommerce REST API consumer key (ck_xxx)' },
  { key: 'WC_CONSUMER_SECRET', hint: 'WooCommerce REST API consumer secret (cs_xxx)' },
];

const OPTIONAL = [
  { key: 'PORT', default: '3000' },
  { key: 'WEBHOOK_PATH', default: '/webhook/whatsapp' },
  { key: 'PRICE_API_URL', hint: 'Yoksa yerel fiyat hesaplama kullanılır' },
  { key: 'PRICE_API_KEY', hint: 'Fiyat API anahtarı' },
  { key: 'WC_WEBHOOK_SECRET', hint: 'WooCommerce webhook imza doğrulama' },
  { key: 'UPLOAD_DIR', default: './uploads/baski-dosyalari' },
];

console.log('\n=== 1etiket WhatsApp Bot — Ortam Doğrulama ===\n');

let hasError = false;

// Zorunlu değişkenler
console.log('Zorunlu değişkenler:');
for (const { key, hint } of REQUIRED) {
  const value = process.env[key];
  if (!value || value.startsWith('your_') || value === 'EAAxxxxxxx') {
    console.log(`  EKSIK  ${key}`);
    console.log(`         ${hint}`);
    hasError = true;
  } else {
    const masked = value.substring(0, 6) + '***';
    console.log(`  OK     ${key} = ${masked}`);
  }
}

// Opsiyonel değişkenler
console.log('\nOpsiyonel değişkenler:');
for (const { key, hint, default: def } of OPTIONAL) {
  const value = process.env[key];
  if (value) {
    console.log(`  OK     ${key} = ${value.substring(0, 20)}${value.length > 20 ? '...' : ''}`);
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

  // WooCommerce bağlantısı
  if (process.env.WC_URL && process.env.WC_CONSUMER_KEY) {
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

  // WhatsApp API
  if (process.env.WHATSAPP_TOKEN && !process.env.WHATSAPP_TOKEN.startsWith('EAAx')) {
    try {
      await axios.get(
        `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}`,
        { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } }
      );
      console.log('  OK     WhatsApp Cloud API bağlantısı başarılı');
    } catch (e) {
      console.log(`  HATA   WhatsApp API: ${e.response?.data?.error?.message || e.message}`);
      hasError = true;
    }
  }

  // Sonuç
  console.log('\n' + '='.repeat(50));
  if (hasError) {
    console.log('SONUÇ: Eksik veya hatalı ayarlar var. .env dosyasını düzenleyin.');
    process.exit(1);
  } else {
    console.log('SONUÇ: Tüm ayarlar tamam. Başlatılabilir!');
    console.log('\nBaşlatma komutları:');
    console.log('  Geliştirme:  npm run dev');
    console.log('  Production:  pm2 start ecosystem.config.js');
    console.log('  Docker:      docker compose up -d');
    process.exit(0);
  }
}

testConnections().catch(e => {
  console.error('Doğrulama hatası:', e.message);
  process.exit(1);
});
