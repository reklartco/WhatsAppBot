/**
 * Scheduler Service — Zamanlı görev yönetimi
 *
 * Görev tipleri:
 * - abandoned_cart: Fiyat gösterildi ama sipariş oluşturulmadı (3 gün sonra hatırlatma)
 * - abandoned_cart_coupon: Kupon hatırlatması (abandoned_cart + 1 saat sonra)
 * - review_request: Teslimat sonrası yorum isteme (kargoya verilmeden 4 gün sonra)
 * - reorder: Tekrar sipariş hatırlatma (3 ay sonra)
 * - campaign: Kampanya mesajı (broadcast)
 */

const db = require('./database');
const logger = require('../utils/logger');
const { sendTextMessage } = require('./whatsappService');
const { isQuietHours, getTurkeyHour } = require('../utils/timeUtils');

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 dakikada bir kontrol
let checkInterval = null;

// ========== GÖREV ZAMANLAYICI ==========

function start() {
  if (checkInterval) return;
  checkInterval = setInterval(processScheduledTasks, CHECK_INTERVAL_MS);
  checkInterval.unref();
  logger.info(`[SCHEDULER] Başlatıldı — ${CHECK_INTERVAL_MS / 1000}sn aralıkla kontrol`);

  // İlk çalıştırmayı 30sn sonra yap (sunucu başlangıcında)
  setTimeout(processScheduledTasks, 30 * 1000);
}

function stop() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    logger.info('[SCHEDULER] Durduruldu');
  }
}

async function processScheduledTasks() {
  try {
    // Sessiz saat kontrolü: 18:00-10:00 arası otomatik mesaj gönderme
    if (isQuietHours()) {
      return; // Görevler bekleyecek, 10:00'da işlenecek
    }

    const now = Date.now();
    const tasks = db.getPendingTasks(now);

    if (tasks.length === 0) return;

    logger.info(`[SCHEDULER] ${tasks.length} görev işlenecek (Türkiye saati: ${getTurkeyHour()}:00)`);

    for (const task of tasks) {
      try {
        await executeTask(task);
        db.markTaskSent(task.id, 'ok');
        logger.info(`[SCHEDULER] Görev #${task.id} (${task.task_type}) → ${task.phone} gönderildi`);
      } catch (error) {
        db.markTaskFailed(task.id, error.message);
        logger.error(`[SCHEDULER] Görev #${task.id} hatası:`, error.message);
      }

      // Rate limiting — görevler arası 2sn bekle
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (error) {
    logger.error('[SCHEDULER] processScheduledTasks hatası:', error.message);
  }
}

// ========== GÖREV HANDLER'LARI ==========

async function executeTask(task) {
  const data = JSON.parse(task.data || '{}');

  switch (task.task_type) {
    case 'abandoned_cart':
      await handleAbandonedCart(task.phone, data);
      break;

    case 'abandoned_cart_coupon':
      await handleAbandonedCartCoupon(task.phone, data);
      break;

    case 'review_request':
      await handleReviewRequest(task.phone, data);
      break;

    case 'social_media_promo':
      await handleSocialMediaPromo(task.phone, data);
      break;

    case 'reorder':
      await handleReorder(task.phone, data);
      break;

    case 'abandoned_cart_cancel':
      await handleAbandonedCartCancel(task.phone, data);
      break;

    case 'campaign':
      await handleCampaign(task.phone, data);
      break;

    case 'webhook_notification':
      // Sessiz saatten ertelenmiş WC webhook bildirimi
      if (data.message) {
        await sendTextMessage(task.phone, data.message);
        logger.info(`[SCHEDULER] Ertelenmiş bildirim gönderildi: ${task.phone} — Sipariş #${data.orderNumber} (${data.status})`);
      }
      break;

    default:
      logger.warn(`[SCHEDULER] Bilinmeyen görev tipi: ${task.task_type}`);
  }
}

// --- Abandoned Cart Hatırlatma ---
async function handleAbandonedCart(phone, data) {
  // Müşteri bu arada sipariş verdiyse gönderme
  const conv = db.getConversation(phone);
  if (conv && ['AWAITING_PAYMENT', 'AWAITING_FILE', 'AWAITING_APPROVAL', 'CONFIRM_ORDER'].includes(conv.state)) {
    logger.info(`[SCHEDULER] Abandoned cart atlandı — ${phone} sipariş sürecinde`);
    return;
  }

  const materialName = data.materialName || 'etiket';
  const size = data.size || '';

  await sendTextMessage(phone,
    `Merhaba! 👋\n\n` +
    `Daha önce ${materialName}${size ? ` (${size})` : ''} için fiyat bilgisi almıştınız.\n\n` +
    `Siparişinizi henüz onaylamadınız. Bir sorun mu var?\n\n` +
    `Yardımcı olabileceğimiz başka bir konu varsa sizlere yardımcı olmaktan memnuniyet duyarız.\n\n` +
    `Sipariş vermek için "sipariş" yazabilirsiniz.`
  );

  // 1 saat sonra kupon hatırlatması planla
  if (!db.hasPendingTask(phone, 'abandoned_cart_coupon')) {
    const ONE_HOUR = 60 * 60 * 1000;
    db.scheduleTask(phone, 'abandoned_cart_coupon', Date.now() + ONE_HOUR, data);
  }
}

// --- Abandoned Cart Kupon ---
async function handleAbandonedCartCoupon(phone, data) {
  // Sipariş verdiyse gönderme
  const conv = db.getConversation(phone);
  if (conv && ['AWAITING_PAYMENT', 'AWAITING_FILE', 'AWAITING_APPROVAL', 'CONFIRM_ORDER'].includes(conv.state)) {
    return;
  }

  try {
    const couponService = require('./couponService');
    const coupon = await couponService.createCoupon({
      amount: 100,
      type: 'fixed_cart',
      minSpend: 1000,
      expiryDays: 3,
      email: data.email || null,
      prefix: 'SEPET'
    });

    await sendTextMessage(phone,
      `Sepetinize özel *100₺ indirim kuponu* tanımladık! 🎉\n\n` +
      `1.000₺ ve üstü alışverişlerinizde geçerlidir.\n` +
      `3 gün içinde kullanabilirsiniz.\n\n` +
      `Kupon kodunuz: *${coupon.code}*\n\n` +
      `Sipariş vermek için "sipariş" yazabilirsiniz.`
    );
  } catch (error) {
    logger.error(`[SCHEDULER] Kupon oluşturma hatası (${phone}):`, error.message);
    // Kupon olmadan da hatırlatma gönder
    await sendTextMessage(phone,
      `Sizlere özel indirim fırsatlarımız için bize yazabilirsiniz! 😊\n\n` +
      `Sipariş vermek için "sipariş" yazabilirsiniz.`
    );
  }

  // Kupon 3 gün geçerli — 3 gün sonra hâlâ sipariş gelmezse otomatik iptal
  if (!db.hasPendingTask(phone, 'abandoned_cart_cancel')) {
    const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
    db.scheduleTask(phone, 'abandoned_cart_cancel', Date.now() + THREE_DAYS, data);
    logger.info(`[SCHEDULER] Abandoned cart iptal planlandı: ${phone} — 3 gün sonra (kupon süresi)`);
  }
}

// --- Abandoned Cart Otomatik İptal (kupondan 1 gün sonra) ---
async function handleAbandonedCartCancel(phone, data) {
  // Müşteri bu arada sipariş verdiyse iptal etme
  const conv = db.getConversation(phone);
  if (conv && ['AWAITING_PAYMENT', 'AWAITING_FILE', 'AWAITING_APPROVAL', 'CONFIRM_ORDER'].includes(conv.state)) {
    logger.info(`[SCHEDULER] Abandoned cart iptal atlandı — ${phone} sipariş sürecinde`);
    return;
  }

  const materialName = data.materialName || 'etiket';

  await sendTextMessage(phone,
    `Merhaba! 👋\n\n` +
    `${materialName} siparişiniz için uzun süredir dönüş alamadık.\n\n` +
    `Siparişiniz otomatik olarak iptal edilmiştir. ❌\n\n` +
    `Tekrar sipariş vermek isterseniz her zaman "sipariş" yazabilirsiniz. Bizi tercih ettiğiniz için teşekkürler! 🙏`
  );

  // Konuşmayı IDLE'a sıfırla
  if (conv) {
    conv.state = 'IDLE';
    conv.data = {};
    conv.isHumanHandoff = false;
    conv.humanAgent = null;
    const d = db.getDb();
    d.prepare(`UPDATE conversations SET state = 'IDLE', data = '{}', is_human_handoff = 0, human_agent = NULL WHERE phone = ?`).run(phone);
    logger.info(`[SCHEDULER] ${phone} → Sipariş otomatik iptal, IDLE'a sıfırlandı`);
  }
}

// --- Teslimat Sonrası Yorum İsteme ---
async function handleReviewRequest(phone, data) {
  const googleReviewLink = process.env.GOOGLE_REVIEW_LINK || 'https://g.page/1etiket/review';

  await sendTextMessage(phone,
    `Merhaba! Sipariş #${data.orderNumber || ''} ile ilgili etiketleriniz elinize ulaştı mı? 😊\n\n` +
    `Memnun kaldıysanız Google'da yorum bırakmanız bize çok yardımcı olur:\n` +
    `${googleReviewLink}\n\n` +
    `Görüşleriniz bizim için çok değerli! 🙏`
  );

  // Sosyal medya promosyon mesajı 1 saat sonra
  if (!db.hasPendingTask(phone, 'social_media_promo')) {
    const ONE_HOUR = 60 * 60 * 1000;
    db.scheduleTask(phone, 'social_media_promo', Date.now() + ONE_HOUR, data);
  }
}

// --- Sosyal Medya Paylaşım Promosyonu ---
async function handleSocialMediaPromo(phone, data) {
  await sendTextMessage(phone,
    `Sosyal medya hesaplarınızdan etiketlerinizi görselli paylaşarak bizi etiketlerseniz:\n\n` +
    `Bir sonraki siparişiniz için *500₺ ve üzeri* alışverişlerinizde geçerli *75₺ indirim kuponu* anında hesabınızda! 🎁\n\n` +
    `Paylaş, etiketle, bize yaz — kuponun gelsin! ✨`
  );
}

// --- Reorder Hatırlatma ---
async function handleReorder(phone, data) {
  const customer = db.getCustomer(phone);
  if (!customer) return;

  const productName = data.lastProduct || customer.last_order_product || 'etiketleriniz';
  const reorderCount = customer.reorder_count || 0;

  // Kademeli indirim oranı
  let discountPercent;
  if (reorderCount === 0) {
    discountPercent = 15; // İlk dönem
  } else if (reorderCount === 1) {
    discountPercent = 10; // 2. dönem
  } else {
    discountPercent = 5;  // 3+ dönem
  }

  try {
    const couponService = require('./couponService');
    const coupon = await couponService.createCoupon({
      amount: discountPercent,
      type: 'percent',
      minSpend: 0,
      expiryDays: 30,
      email: customer.email || null,
      prefix: 'TEKRAR'
    });

    await sendTextMessage(phone,
      `Merhaba${customer.name ? ' ' + customer.name : ''}! 👋\n\n` +
      `Yaklaşık 3 ay önce sipariş ettiğiniz *${productName}* bitmiş olabilir.\n\n` +
      `Aynı siparişi tekrarlamak ister misiniz?\n\n` +
      `1. ✅ Evet, aynısından istiyorum\n` +
      `2. 🔄 Değiştirmek istiyorum\n` +
      `3. ❌ Şimdilik gerek yok\n\n` +
      `🎁 Size özel *%${discountPercent} indirim* kuponu: *${coupon.code}*\n` +
      `(30 gün geçerli)`
    );

    // Reorder count güncelle
    const d = db.getDb();
    d.prepare('UPDATE customers SET reorder_count = reorder_count + 1, last_reorder_reminder = ? WHERE phone = ?')
      .run(Date.now(), phone);

  } catch (error) {
    logger.error(`[SCHEDULER] Reorder hatırlatma hatası (${phone}):`, error.message);
    // Kupon olmadan da hatırlat
    await sendTextMessage(phone,
      `Merhaba${customer.name ? ' ' + customer.name : ''}! 👋\n\n` +
      `Yaklaşık 3 ay önce sipariş ettiğiniz *${productName}* bitmiş olabilir.\n` +
      `Tekrar sipariş vermek için "sipariş" yazabilirsiniz.`
    );
  }
}

// --- Kampanya Mesajı ---
async function handleCampaign(phone, data) {
  const message = data.message || data.template;
  if (!message) return;

  await sendTextMessage(phone, message);
}

// ========== HELPER FONKSİYONLAR ==========

// Fiyat gösterildikten sonra abandoned cart hatırlatma planla
function scheduleAbandonedCart(phone, data) {
  // Zaten pending varsa ekleme
  if (db.hasPendingTask(phone, 'abandoned_cart')) {
    return;
  }
  const ONE_DAY = 24 * 60 * 60 * 1000;
  db.scheduleTask(phone, 'abandoned_cart', Date.now() + ONE_DAY, data);
  logger.info(`[SCHEDULER] Abandoned cart planlandı: ${phone} — 1 gün sonra`);
}

// Sipariş oluşturulunca abandoned cart iptal et
function cancelAbandonedCart(phone) {
  db.cancelTask(phone, 'abandoned_cart');
  db.cancelTask(phone, 'abandoned_cart_coupon');
  db.cancelTask(phone, 'abandoned_cart_cancel');
  logger.info(`[SCHEDULER] Abandoned cart iptal edildi: ${phone}`);
}

// Kargoya verilince review request planla
function scheduleReviewRequest(phone, orderNumber) {
  if (db.hasPendingTask(phone, 'review_request')) return;
  const FOUR_DAYS = 4 * 24 * 60 * 60 * 1000;
  db.scheduleTask(phone, 'review_request', Date.now() + FOUR_DAYS, { orderNumber });
  logger.info(`[SCHEDULER] Review request planlandı: ${phone} — 4 gün sonra`);
}

// Reorder hatırlatma planla (customerService'den çağrılır)
function scheduleReorder(phone, data) {
  if (db.hasPendingTask(phone, 'reorder')) return;
  const THREE_MONTHS = 90 * 24 * 60 * 60 * 1000;
  db.scheduleTask(phone, 'reorder', Date.now() + THREE_MONTHS, data);
  logger.info(`[SCHEDULER] Reorder planlandı: ${phone} — 3 ay sonra`);
}

module.exports = {
  start,
  stop,
  processScheduledTasks,
  scheduleAbandonedCart,
  cancelAbandonedCart,
  scheduleReviewRequest,
  scheduleReorder,
  executeTask
};
