const express = require('express');
const crypto = require('crypto');
const dotenv = require('dotenv');
const logger = require('./utils/logger');

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
  disableHumanHandoff
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

    const whatsappNumber = order.meta_data?.find(m => m.key === 'whatsapp_number')?.value
      || order.billing?.phone;

    if (!whatsappNumber) return;

    const isWhatsAppOrder = order.meta_data?.find(m =>
      m.key === 'order_source' && m.value === 'whatsapp'
    );

    if (!isWhatsAppOrder) return;

    const statusMessages = {
      'processing': `Siparişiniz #${order.number} hazırlanmaya başlandı!`,
      'completed': `Siparişiniz #${order.number} tamamlandı ve kargoya hazır!`,
      'on-hold': `Siparişiniz #${order.number} beklemede. Lütfen ödemenizi tamamlayın.`,
      'cancelled': `Siparişiniz #${order.number} iptal edildi.`,
      'refunded': `Siparişiniz #${order.number} için iade işlemi başlatıldı.`
    };

    const message = statusMessages[status];
    if (message) {
      await sendTextMessage(whatsappNumber, message);
      logger.info(`WooCommerce bildirim gönderildi: ${whatsappNumber} — Durum: ${status}`);
    }
  } catch (error) {
    logger.error('WooCommerce webhook hatası:', error);
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
  const conversations = db.getActiveConversations();
  res.json({ count: conversations.length, conversations });
});

app.get('/admin/conversations/handoff', adminAuth, (req, res) => {
  const handoffs = db.getHumanHandoffConversations();
  res.json({ count: handoffs.length, handoffs });
});

app.get('/admin/conversations/:phone/messages', adminAuth, (req, res) => {
  const raw = db.getMessageHistory(req.params.phone, parseInt(req.query.limit) || 50);
  // metadata JSON'ı parse et
  const messages = raw.map(m => {
    let metadata = {};
    try { metadata = JSON.parse(m.metadata || '{}'); } catch (e) {}
    return { ...m, metadata };
  });
  res.json({ phone: req.params.phone, count: messages.length, messages });
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
    enableHumanHandoff(req.params.phone, agent || 'admin');
    await sendHumanMessage(req.params.phone, text, agent || 'admin');
    res.json({ success: true, message: 'Mesaj gönderildi' });
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
  });
}

module.exports = app;
