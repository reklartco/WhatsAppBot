/**
 * Broadcast Service — Segment bazlı toplu mesaj gönderimi
 *
 * Kampanya tipleri:
 * - miss_you: 6+ ay sipariş vermeyenler → %10 indirim
 * - vip: VIP müşteriler (5000₺+ harcama) → 500₺ kupon
 * - seasonal: Mevsimsel hatırlatma
 * - custom: Özel mesaj
 */

const db = require('./database');
const logger = require('../utils/logger');
const { sendTextMessage } = require('./whatsappService');
const { isQuietHours } = require('../utils/timeUtils');

const MAX_DAILY_BROADCAST = 200; // Günlük maks broadcast mesajı
const DELAY_BETWEEN_MS = 5000; // Mesajlar arası 5sn (anti-ban)

let isSending = false;

/**
 * Segment bazlı müşteri listesi getir
 * @param {string} segment - 'sleeping', 'vip', 'normal', 'all', 'inactive_6m', 'high_value'
 * @returns {Array}
 */
function getTargetCustomers(segment) {
  const d = db.getDb();

  switch (segment) {
    case 'sleeping':
      return d.prepare(`
        SELECT * FROM customers WHERE segment = 'sleeping' AND bot_enabled = 1
      `).all();

    case 'inactive_6m': {
      const sixMonthsAgo = Date.now() - (180 * 24 * 60 * 60 * 1000);
      return d.prepare(`
        SELECT * FROM customers
        WHERE total_orders > 0 AND last_order_date < ? AND bot_enabled = 1
      `).all(sixMonthsAgo);
    }

    case 'vip':
      return d.prepare(`
        SELECT * FROM customers WHERE segment = 'vip' AND bot_enabled = 1
      `).all();

    case 'high_value': {
      return d.prepare(`
        SELECT * FROM customers WHERE total_spending >= 5000 AND bot_enabled = 1
      `).all();
    }

    case 'normal':
      return d.prepare(`
        SELECT * FROM customers WHERE segment = 'normal' AND bot_enabled = 1
      `).all();

    case 'all':
      return d.prepare(`
        SELECT * FROM customers WHERE bot_enabled = 1
      `).all();

    default:
      return [];
  }
}

/**
 * Kampanya gönder
 * @param {Object} options
 * @param {string} options.name - Kampanya adı
 * @param {string} options.segment - Hedef segment
 * @param {string} options.template - Mesaj şablonu ({name}, {product} değişkenleri)
 * @param {Object} options.couponConfig - Kupon ayarları (opsiyonel)
 * @returns {Object} Kampanya sonucu
 */
async function sendCampaign({ name, segment, template, couponConfig = null }) {
  if (isSending) {
    throw new Error('Başka bir kampanya zaten gönderiliyor');
  }

  // Sessiz saat kontrolü: 18:00-10:00 arası kampanya gönderme
  if (isQuietHours()) {
    throw new Error('Sessiz saat (18:00-10:00) — kampanya gönderilemez. Lütfen 10:00-18:00 arasında tekrar deneyin.');
  }

  const customers = getTargetCustomers(segment);
  if (customers.length === 0) {
    return { success: true, message: 'Hedef kitle boş', sent: 0 };
  }

  const targets = customers.slice(0, MAX_DAILY_BROADCAST);

  // Kampanya kaydı
  const campaign = db.createBroadcastCampaign(
    name, segment, template, couponConfig, targets.length
  );
  const campaignId = campaign.lastInsertRowid;

  isSending = true;
  let sentCount = 0;

  // Arka planda gönder
  (async () => {
    try {
      db.updateBroadcastCampaign(campaignId, { status: 'sending' });

      for (const customer of targets) {
        try {
          // Mesaj şablonunu kişiselleştir
          let message = template
            .replace(/{name}/g, customer.name || 'Değerli Müşterimiz')
            .replace(/{product}/g, customer.last_order_product || 'etiket')
            .replace(/{total}/g, customer.total_spending?.toFixed(0) || '0');

          // Kupon oluştur (config varsa)
          if (couponConfig) {
            try {
              const couponService = require('./couponService');
              const coupon = await couponService.createCoupon({
                amount: couponConfig.amount,
                type: couponConfig.type || 'fixed_cart',
                minSpend: couponConfig.minSpend || 0,
                expiryDays: couponConfig.expiryDays || 30,
                email: customer.email || null,
                prefix: couponConfig.prefix || 'KAMPANYA'
              });
              message = message.replace(/{coupon}/g, coupon.code);
            } catch (e) {
              logger.error(`[BROADCAST] Kupon hatası (${customer.phone}):`, e.message);
              message = message.replace(/{coupon}/g, '(kupon oluşturulamadı)');
            }
          }

          await sendTextMessage(customer.phone, message);
          sentCount++;

          // Her 10 mesajda bir kampanya güncelle
          if (sentCount % 10 === 0) {
            db.updateBroadcastCampaign(campaignId, { sentCount });
          }

          // Anti-ban delay
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_MS));
        } catch (error) {
          logger.error(`[BROADCAST] Gönderim hatası (${customer.phone}):`, error.message);
        }
      }

      db.updateBroadcastCampaign(campaignId, { sentCount, status: 'completed' });
      logger.info(`[BROADCAST] Kampanya #${campaignId} tamamlandı: ${sentCount}/${targets.length} gönderildi`);
    } catch (error) {
      logger.error(`[BROADCAST] Kampanya #${campaignId} hatası:`, error.message);
      db.updateBroadcastCampaign(campaignId, { sentCount, status: 'completed' });
    } finally {
      isSending = false;
    }
  })();

  return {
    success: true,
    campaignId,
    totalTarget: targets.length,
    message: `Kampanya başlatıldı, ${targets.length} müşteriye gönderilecek`
  };
}

/**
 * Kampanya önizleme (kaç kişiye gidecek)
 */
function previewCampaign(segment) {
  const customers = getTargetCustomers(segment);
  return {
    totalTarget: customers.length,
    segment,
    maxAllowed: MAX_DAILY_BROADCAST,
    willSend: Math.min(customers.length, MAX_DAILY_BROADCAST)
  };
}

/**
 * Kampanya geçmişi
 */
function getCampaignHistory(limit = 20) {
  return db.getBroadcastCampaigns(limit);
}

module.exports = {
  sendCampaign,
  previewCampaign,
  getCampaignHistory,
  getTargetCustomers,
  isSending: () => isSending
};
