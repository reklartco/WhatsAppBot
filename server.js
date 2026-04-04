const express = require('express');
const crypto = require('crypto');
const dotenv = require('dotenv');
const logger = require('./utils/logger');
const { isQuietHours, getNextActiveTimestamp, getTurkeyHour } = require('./utils/timeUtils');

dotenv.config();

const path = require('path');
const app = express();
app.use(express.json({ limit: '10mb' }));

// Static dosyalar (React admin panel)
const panelAppPath = path.join(__dirname, 'public', 'panel-app');
const fs = require('fs');
if (fs.existsSync(panelAppPath)) {
  app.use('/panel', express.static(panelAppPath));
  app.get('/panel/*', (req, res) => {
    res.sendFile(path.join(panelAppPath, 'index.html'));
  });
} else {
  // Fallback: eski vanilla JS panel
  app.use('/panel', express.static(path.join(__dirname, 'public')));
}
// Eski panel her zaman erişilebilir
app.use('/panel-legacy', express.static(path.join(__dirname, 'public')));

// ========== SERVICES ==========

const { handleEvolutionWebhook, sendTextMessage } = require('./services/whatsappService');
const {
  sendHumanMessage,
  enableHumanHandoff,
  disableHumanHandoff,
  requestApproval,
  activatePriceBot,
  activateOrderBot,
  STATES,
  conversations
} = require('./services/conversationManager');
const {
  getInstanceStatus,
  getQRCode,
  createInstance,
  setWebhook
} = require('./services/evolutionTransport');
const { getQueueStatus } = require('./services/messageQueue');
const db = require('./services/database');
const sessionMonitor = require('./services/sessionMonitor');
const customerService = require('./services/customerService');
const statsService = require('./services/statsService');

// ========== ADMIN AUTH MIDDLEWARE ==========

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'change-me-admin-secret';

function adminAuth(req, res, next) {
  const token = req.headers['x-admin-secret'] || req.query.secret;
  if (token !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Yetkisiz erişim' });
  }
  next();
}

// ========== EVOLUTION API WEBHOOK ==========

app.post(process.env.EVOLUTION_WEBHOOK_PATH || '/webhook/evolution', handleEvolutionWebhook);

// ========== HEALTH CHECK ==========

app.get('/health', async (req, res) => {
  let connectionStatus = 'unknown';
  try {
    const status = await getInstanceStatus();
    connectionStatus = status?.instance?.state || status?.state || 'unknown';
  } catch (e) {
    connectionStatus = 'error';
  }

  res.json({
    status: 'ok',
    uptime: process.uptime(),
    whatsapp: connectionStatus,
    queue: getQueueStatus(),
    stats: db.getStats()
  });
});

// ========== WOOCOMMERCE WEBHOOK ==========

// Eski bildirim kayıtlarını günlük temizle (7 günden eski)
setInterval(() => {
  try { db.cleanupOldNotifications(); } catch (e) { /* ignore */ }
}, 24 * 60 * 60 * 1000).unref();

// Sipariş bildirim deduplication — SQLite kalıcı + in-memory hızlı kontrol
// DB: container restart'ta bile korunur | Memory: aynı saniyede gelen 2. webhook'u yakalar
const orderNotificationCache = new Map();

function isDuplicateNotification(orderNumber, status, phone) {
  const key = `${orderNumber}:${status}`;

  // 1) In-memory hızlı kontrol (aynı anda gelen 2 webhook'u yakalar)
  if (orderNotificationCache.has(key)) {
    logger.info(`[WC-WEBHOOK] Duplicate engellendi (memory): Sipariş #${orderNumber} status=${status}`);
    return true;
  }

  // 2) DB kalıcı kontrol (container restart sonrasında bile çalışır)
  if (db.isNotificationSent(orderNumber, status)) {
    logger.info(`[WC-WEBHOOK] Duplicate engellendi (DB): Sipariş #${orderNumber} status=${status}`);
    orderNotificationCache.set(key, Date.now()); // Sonraki çağrılar için memory'ye de ekle
    return true;
  }

  // İlk kez → kaydet
  orderNotificationCache.set(key, Date.now());
  db.markNotificationSent(orderNumber, status, phone || '');

  // Memory temizliği (48 saatten eski)
  if (orderNotificationCache.size > 1000) {
    const twoDaysAgo = Date.now() - 48 * 60 * 60 * 1000;
    for (const [k, v] of orderNotificationCache) {
      if (v < twoDaysAgo) orderNotificationCache.delete(k);
    }
  }

  return false;
}

async function triggerFileRequest(phone, orderNumber) {
  try {
    // In-memory conversation kontrolü
    let conv = conversations.get(phone);

    if (conv && conv.state === STATES.CONFIRM_ORDER) {
      // Sipariş onayı henüz tamamlanmamış, 5sn sonra tekrar dene
      logger.info(`Sipariş onayı bekleniyor, 5sn sonra tekrar denenecek: ${phone}`);
      setTimeout(() => triggerFileRequest(phone, orderNumber), 5000);
      return;
    }

    // Konuşma yoksa veya IDLE/başka state'te → oluştur/güncelle
    if (!conv) {
      conv = {
        state: STATES.AWAITING_FILE,
        name: '',
        data: { orderNumber },
        lastActivity: Date.now(),
        isHumanHandoff: false
      };
      conversations.set(phone, conv);
    } else {
      conv.state = STATES.AWAITING_FILE;
      conv.data.orderNumber = orderNumber;
      conv.lastActivity = Date.now();
      // _closedAt varsa temizle — yeni etkileşim başlıyor
      delete conv.data._closedAt;
    }

    // DB'ye kaydet
    db.saveConversation(phone, conv);

    // Dosya isteme mesajı gönder
    await sendTextMessage(phone,
      `✅ Ödemeniz alındı! Sipariş #${orderNumber} onaylandı.\n\n` +
      `Lütfen baskı dosyanızı gönderin:\n` +
      `📎 Kabul edilen formatlar: PDF, AI, PNG, JPEG veya Canva linki\n\n` +
      `💡 Tasarım desteği için "tasarım" yazabilirsiniz.`
    );

    logger.info(`Dosya isteme tetiklendi: ${phone} — Sipariş #${orderNumber} (State: ${conv.state})`);
  } catch (error) {
    logger.error('triggerFileRequest hatası:', error);
  }
}

app.post('/webhook/woocommerce', async (req, res) => {
  const signature = req.headers['x-wc-webhook-signature'];
  const secret = process.env.WC_WEBHOOK_SECRET || '';

  if (secret) {
    const hash = crypto.createHmac('sha256', secret)
      .update(JSON.stringify(req.body))
      .digest('base64');

    if (signature !== hash) {
      return res.status(401).send('Geçersiz imza');
    }
  }

  res.sendStatus(200);

  try {
    const order = req.body;
    const status = order.status;
    const orderNumber = order.number || order.id;

    if (!status || !orderNumber) return;

    // Telefon numarası: önce whatsapp meta, yoksa fatura telefonu
    let whatsappNumber = order.meta_data?.find(m => m.key === 'whatsapp_number')?.value
      || order.billing?.phone;

    if (!whatsappNumber) return;

    // Telefon numarasını normalize et (başında + veya 0 varsa düzelt)
    whatsappNumber = whatsappNumber.replace(/[\s\-\(\)\+]/g, '');
    if (whatsappNumber.startsWith('0')) whatsappNumber = '90' + whatsappNumber.slice(1);
    if (!whatsappNumber.startsWith('90') && whatsappNumber.length === 10) whatsappNumber = '90' + whatsappNumber;

    // ===== DEDUPLICATION: Aynı sipariş+status için tekrar mesaj gönderme =====
    if (isDuplicateNotification(orderNumber, status, whatsappNumber)) {
      return; // Zaten bu bildirim gönderildi, atla
    }

    const isWhatsAppOrder = order.meta_data?.find(m =>
      m.key === 'order_source' && m.value === 'whatsapp'
    );

    logger.info(`[WC-WEBHOOK] Sipariş #${orderNumber} status=${status} phone=${whatsappNumber} isWhatsApp=${!!isWhatsAppOrder}`);

    // processing → dosya isteme: SADECE WhatsApp bottan gelen siparişler
    if (status === 'processing') {
      if (isWhatsAppOrder) {
        await triggerFileRequest(whatsappNumber, orderNumber);
      }
      // Web sitesi siparişlerinde processing'de mesaj gönderme
      return;
    }

    // Kargo takip numarasını al (farklı eklentiler farklı meta key kullanır)
    const trackingNumber = order.meta_data?.find(m =>
      ['tracking_number', '_tracking_number', 'kargo_takip', 'shipment_tracking_number'].includes(m.key)
    )?.value || null;

    const trackingUrl = order.meta_data?.find(m =>
      ['tracking_url', '_tracking_url', 'kargo_link'].includes(m.key)
    )?.value || null;

    // Durum bazlı mesajlar
    let message = null;

    // Baskıda (custom WC status)
    if (status === 'baskda' || status === 'wc-baskda') {
      message = `🖨️ Siparişiniz #${order.number} baskıya alındı!\n\nBaskı süreci tamamlandığında bilgilendirileceksiniz.`;
    }

    // Kargoya verildi (custom WC status + standart)
    else if (status === 'kargoya-verildi' || status === 'wc-kargoya-verildi' || status === 'shipped' || status === 'wc-shipped') {
      let shippedMsg = `🚚 Siparişiniz #${order.number} kargoya verildi!\n`;
      if (trackingNumber) {
        shippedMsg += `\nKargo Takip No: *${trackingNumber}*`;
      }
      if (trackingUrl) {
        shippedMsg += `\nTakip Linki: ${trackingUrl}`;
      }
      shippedMsg += `\n\nTahmini teslimat süresi: 1-3 iş günü.`;
      shippedMsg += `\nSipariş detayı: https://1etiket.com.tr/hesabim/`;
      message = shippedMsg;

    }

    // Standart WC durumları
    else {
      const statusMessages = {
        'completed': `✅ Siparişiniz #${order.number} teslim edildi! Keyifle kullanmanız dileğiyle 😊\n\nMemnun kaldıysanız Google'da yorum bırakmanız bize çok yardımcı olur:\nhttps://search.google.com/local/writereview?placeid=ChIJWwETipLZuxQRwbP3Yb1UecM`,
        'on-hold': `⏳ Siparişiniz #${order.number} beklemede. Lütfen ödemenizi tamamlayın.`,
        'cancelled': `❌ Siparişiniz #${order.number} iptal edildi.`,
        'refunded': `💸 Siparişiniz #${order.number} için iade işlemi başlatıldı.`
      };
      message = statusMessages[status];
    }

    if (message) {
      // Sessiz saat kontrolü: 18:00-10:00 arası bildirim gönderme, sabah 10:00'a ertele
      if (isQuietHours()) {
        const schedulerService = require('./services/schedulerService');
        const nextActive = getNextActiveTimestamp();
        db.scheduleTask(whatsappNumber, 'webhook_notification', nextActive, JSON.stringify({
          message,
          orderNumber: String(orderNumber),
          status
        }));
        logger.info(`[WC-WEBHOOK] Sessiz saat (TR ${getTurkeyHour()}:00) — Sipariş #${orderNumber} bildirimi sabah 10:00'a ertelendi`);
      } else {
        await sendTextMessage(whatsappNumber, message);
        logger.info(`[WC-WEBHOOK] Bildirim gönderildi: ${whatsappNumber} — Sipariş #${orderNumber} Durum: ${status}`);
      }
    } else {
      logger.info(`[WC-WEBHOOK] Mesaj yok, atlandı: Sipariş #${orderNumber} status=${status}`);
    }
  } catch (error) {
    logger.error('[WC-WEBHOOK] Hata:', error);
  }
});

// ========== ADMIN API ENDPOINT'LERİ ==========

// --- Instance Yönetimi ---

app.get('/admin/instance/status', adminAuth, async (req, res) => {
  try {
    const status = await getInstanceStatus();
    res.json({ status, monitor: sessionMonitor.getStatus() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/admin/instance/qr', adminAuth, async (req, res) => {
  try {
    const qr = await getQRCode();
    res.json(qr);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/admin/instance/create', adminAuth, async (req, res) => {
  try {
    const result = await createInstance(req.body.instanceName);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/admin/instance/webhook', adminAuth, async (req, res) => {
  try {
    const webhookUrl = req.body.url || process.env.WEBHOOK_PUBLIC_URL;
    if (!webhookUrl) {
      return res.status(400).json({ error: 'Webhook URL gerekli' });
    }
    const result = await setWebhook(webhookUrl);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Konuşma Yönetimi ---

app.get('/admin/conversations', adminAuth, (req, res) => {
  const conversations = db.getActiveConversations().map(c => ({
    ...c,
    unreadCount: db.getUnreadCount(c.phone)
  }));
  res.json({ count: conversations.length, conversations });
});

app.get('/admin/conversations/handoff', adminAuth, (req, res) => {
  const handoffs = db.getHumanHandoffConversations();
  res.json({ count: handoffs.length, handoffs });
});

app.get('/admin/conversations/:phone/messages', adminAuth, (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const before = req.query.before ? parseInt(req.query.before) : null;
  const raw = db.getMessageHistory(req.params.phone, limit, before);
  // metadata JSON'ı parse et
  const messages = raw.map(m => {
    let metadata = {};
    try { metadata = JSON.parse(m.metadata || '{}'); } catch (e) {}
    return { ...m, metadata };
  });
  res.json({ phone: req.params.phone, count: messages.length, messages });
});

// Tüm konuşmaları okundu işaretle (ÖNCE: :phone parametresinden önce olmalı)
app.post('/admin/conversations/mark-all-read', adminAuth, (req, res) => {
  db.markAllConversationsRead();
  res.json({ success: true });
});

// Konuşmayı okundu işaretle
app.post('/admin/conversations/:phone/mark-read', adminAuth, (req, res) => {
  db.markConversationRead(req.params.phone);
  res.json({ success: true });
});

// Medya dosyası indirme (resim/belge/ses)
app.get('/admin/media/:messageId', async (req, res) => {
  // img tag'ları custom header gönderemez, query param ile auth
  const secret = req.headers['x-admin-secret'] || req.query.secret;
  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Yetkisiz erişim' });
  }
  try {
    const { downloadMediaBase64 } = require('./services/evolutionTransport');
    const result = await downloadMediaBase64(req.params.messageId);
    if (!result?.base64) {
      return res.status(404).json({ error: 'Medya bulunamadı' });
    }
    const buffer = Buffer.from(result.base64, 'base64');
    res.set('Content-Type', result.mimetype || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (error) {
    res.status(404).json({ error: 'Medya indirilemedi veya süresi dolmuş' });
  }
});

app.post('/admin/conversations/:phone/send', adminAuth, async (req, res) => {
  try {
    const { text, agent } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Mesaj metni gerekli' });
    }
    // NOT: Admin mesaj gönderdiğinde bot otomatik devre dışı kalmaz.
    // Bot sadece onay pattern'i algılandığında (sendHumanMessage içinde) sessiz kalır.
    // Admin botu tamamen devre dışı bırakmak isterse "Devral" butonunu kullanır.
    await sendHumanMessage(req.params.phone, text, agent || 'admin');
    res.json({ success: true, message: 'Mesaj gönderildi' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/admin/conversations/:phone/request-approval', adminAuth, async (req, res) => {
  try {
    const { text, agent } = req.body;
    // Mesaj gönder + state'i AWAITING_APPROVAL'a geçir
    if (text) {
      await sendHumanMessage(req.params.phone, text, agent || 'admin');
    }
    const result = requestApproval(req.params.phone, agent || 'admin');
    res.json({ success: result, message: 'Onay bekleniyor, müşteri cevabını bot işleyecek' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/admin/conversations/:phone/handoff', adminAuth, (req, res) => {
  const result = enableHumanHandoff(req.params.phone, req.body.agent || 'admin');
  res.json({ success: result });
});

app.post('/admin/conversations/:phone/release', adminAuth, (req, res) => {
  const result = disableHumanHandoff(req.params.phone);
  res.json({ success: result });
});

// Botu başlat — karşılama mesajını gönder (IDLE'a resetle + welcome)
app.post('/admin/conversations/:phone/start-bot', adminAuth, async (req, res) => {
  try {
    const phone = req.params.phone;
    const cm = require('./services/conversationManager');
    let conv = cm.conversations.get(phone) || db.getConversation(phone);

    if (!conv) {
      // Yeni konuşma oluştur
      conv = {
        phone,
        name: '',
        state: 'IDLE',
        data: {},
        isHumanHandoff: false,
        humanAgent: null,
        lastActivity: Date.now(),
        createdAt: Date.now()
      };
      cm.conversations.set(phone, conv);
    }

    // State'i sıfırla
    conv.isHumanHandoff = false;
    conv.humanAgent = null;
    conv.state = 'IDLE';
    conv.data = {};
    db.saveConversation(phone, conv);
    cm.conversations.set(phone, conv);

    // Karşılama mesajını gönder (processMessage simülasyonu)
    const { sendText } = require('./services/evolutionTransport');
    const name = conv.name || '';
    const firstName = name.split(' ')[0] || 'Müşteri';

    const welcomeMsg =
      `Merhaba ${firstName}! Size nasıl yardımcı olabiliriz?\n\n` +
      `Hızlı fiyat almak için lütfen şu şekilde yazınız:\n` +
      `_5x5 cm 500 adet standart Etiket fiyatı istiyorum._\n\n` +
      `Farklı etiket türleri için:\n` +
      `_6x8 cm 750 adet Şeffaf Etiket fiyatı istiyorum._\n\n` +
      `*Menü*\n` +
      `1. Fiyat Hesaplama\n` +
      `2. Etiket Türleri Hakkında Bilgi\n` +
      `3. Müşteri Temsilcisi`;

    await sendText(phone, welcomeMsg);
    db.saveMessage(phone, 'outbound', welcomeMsg, 'text', {});

    // State'i MAIN_MENU'ya geçir
    conv.state = 'MAIN_MENU';
    conv.lastActivity = Date.now();
    db.saveConversation(phone, conv);
    cm.conversations.set(phone, conv);

    logger.info(`[START BOT] ${phone} → Bot admin tarafından başlatıldı`);
    res.json({ success: true, message: 'Bot başlatıldı, karşılama mesajı gönderildi' });
  } catch (error) {
    logger.error(`[START BOT] Hata:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// --- Müşteri Yönetimi (CRM) ---

app.get('/admin/customers', adminAuth, (req, res) => {
  try {
    const filters = {
      segment: req.query.segment || null,
      limit: parseInt(req.query.limit) || 100,
      offset: parseInt(req.query.offset) || 0,
      search: req.query.search || null
    };
    const result = db.getAllCustomers(filters);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/admin/customers/:phone', adminAuth, async (req, res) => {
  try {
    const profile = customerService.getCustomerProfile(req.params.phone);
    if (!profile) {
      return res.status(404).json({ error: 'Müşteri bulunamadı' });
    }

    // Otomatik WC sync (1 saatten eski ise)
    const customer = profile.customer;
    if (customer.wcCustomerId && (!customer.wcLastSync || Date.now() - customer.wcLastSync > 3600000)) {
      try {
        await customerService.syncCustomerFromWC(req.params.phone);
        const updated = customerService.getCustomerProfile(req.params.phone);
        return res.json(updated);
      } catch (e) { /* sync başarısız, mevcut veriyi dön */ }
    }

    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/admin/customers/:phone/bot-toggle', adminAuth, (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled (boolean) gerekli' });
    }
    const result = customerService.toggleBot(req.params.phone, enabled);
    res.json({ success: result.success, botEnabled: result.botEnabled, phone: req.params.phone });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/admin/customers/:phone/sync', adminAuth, async (req, res) => {
  try {
    const customer = await customerService.syncCustomerFromWC(req.params.phone);
    if (!customer) {
      return res.status(404).json({ error: 'Müşteri bulunamadı' });
    }
    res.json({ success: true, customer });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/admin/customers/:phone/segment', adminAuth, (req, res) => {
  try {
    const { segment } = req.body;
    if (!['vip', 'normal', 'risk', 'sleeping'].includes(segment)) {
      return res.status(400).json({ error: 'Geçersiz segment: vip, normal, risk, sleeping' });
    }
    const result = db.updateCustomerSegment(req.params.phone, segment);
    res.json({ success: result, segment });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- AI Gözlemler ---

app.get('/admin/ai/observations', adminAuth, (req, res) => {
  try {
    const phone = req.query.phone;
    const limit = parseInt(req.query.limit) || 20;

    let observations;
    if (phone) {
      observations = db.getAiObservations(phone, limit);
    } else {
      observations = db.getUnreviewedObservations(limit);
    }
    res.json({ count: observations.length, observations });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/admin/ai/observations/:id/approve', adminAuth, (req, res) => {
  try {
    const result = db.reviewObservation(parseInt(req.params.id), true);
    res.json({ success: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/admin/ai/observations/:id/reject', adminAuth, (req, res) => {
  try {
    const result = db.reviewObservation(parseInt(req.params.id), false);
    res.json({ success: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- AI Toplu Analiz ---
app.post('/admin/ai/analyze-history/:phone', adminAuth, async (req, res) => {
  try {
    const aiService = require('./services/aiService');
    const result = await aiService.analyzeHistory(req.params.phone, parseInt(req.query.limit) || 50);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/admin/ai/batch-analyze', adminAuth, async (req, res) => {
  try {
    const aiService = require('./services/aiService');
    const max = parseInt(req.query.max) || 50;
    // Background'da çalıştır — hemen response dön
    res.json({ status: 'started', message: `${max} konuşma analiz ediliyor...` });
    aiService.batchAnalyzeAll(max).catch(e => logger.error('[AI-BATCH] Hata:', e.message));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Bağlantı Durumu ---

app.get('/admin/connection/status', adminAuth, async (req, res) => {
  try {
    const status = await statsService.getConnectionStatus();
    res.json(status);
  } catch (error) {
    res.json({ isConnected: false, state: 'error', error: error.message });
  }
});

// --- Dashboard İstatistikleri ---

app.get('/admin/stats/dashboard', adminAuth, (req, res) => {
  try {
    const stats = statsService.getDashboardStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- İstatistikler ---

app.get('/admin/stats', adminAuth, (req, res) => {
  res.json({
    ...db.getStats(),
    queue: getQueueStatus(),
    monitor: sessionMonitor.getStatus(),
    uptime: process.uptime()
  });
});

app.get('/admin/messages/recent', adminAuth, (req, res) => {
  const messages = db.getRecentMessages(parseInt(req.query.limit) || 100);
  res.json({ count: messages.length, messages });
});

// --- Broadcast Kampanyalar ---

app.get('/admin/broadcast/preview', adminAuth, (req, res) => {
  try {
    const broadcastService = require('./services/broadcastService');
    const preview = broadcastService.previewCampaign(req.query.segment || 'all');
    res.json(preview);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/admin/broadcast/send', adminAuth, async (req, res) => {
  try {
    const broadcastService = require('./services/broadcastService');
    const { name, segment, template, couponConfig } = req.body;

    if (!template) {
      return res.status(400).json({ error: 'Mesaj şablonu gerekli' });
    }

    const result = await broadcastService.sendCampaign({
      name: name || `Kampanya ${new Date().toLocaleDateString('tr-TR')}`,
      segment: segment || 'all',
      template,
      couponConfig: couponConfig || null
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== PARTIAL BOT (ADMIN KOMUTLARI) ==========

app.post('/admin/conversations/:phone/activate-price-bot', adminAuth, (req, res) => {
  try {
    const { agent } = req.body;
    const result = activatePriceBot(req.params.phone, agent || 'admin');
    res.json({ success: result, message: 'Fiyat botu aktif — müşterinin sonraki mesajı fiyat olarak işlenecek' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/admin/conversations/:phone/activate-order-bot', adminAuth, (req, res) => {
  try {
    const { agent } = req.body;
    const result = activateOrderBot(req.params.phone, agent || 'admin');
    if (!result) {
      return res.status(404).json({ error: 'Konuşma bulunamadı' });
    }
    res.json({ success: result, message: 'Sipariş botu aktif — müşteriden mail adresi istenecek' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/admin/broadcast/history', adminAuth, (req, res) => {
  try {
    const broadcastService = require('./services/broadcastService');
    const campaigns = broadcastService.getCampaignHistory(parseInt(req.query.limit) || 20);
    res.json({ campaigns });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== GRACEFUL SHUTDOWN ==========

process.on('SIGTERM', () => {
  logger.info('SIGTERM alındı, kapatılıyor...');
  sessionMonitor.stop();
  db.closeDb();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT alındı, kapatılıyor...');
  sessionMonitor.stop();
  db.closeDb();
  process.exit(0);
});

// ========== SUNUCU BAŞLAT ==========

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`1Etiket WhatsApp Bot — port ${PORT}`);
    logger.info(`Evolution API: ${process.env.EVOLUTION_BASE_URL || 'http://evolution-api:8080'}`);
    sessionMonitor.start();
    customerService.startBackgroundSync();

    // Scheduler servisi başlat (hatırlatmalar, review istekleri, reorder vs.)
    const schedulerService = require('./services/schedulerService');
    schedulerService.start();
  });
}

module.exports = app;
