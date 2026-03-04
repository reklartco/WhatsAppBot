const express = require('express');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { handleWebhook, verifyWebhook, sendTextMessage } = require('./services/whatsappService');
const logger = require('./utils/logger');

dotenv.config();
const app = express();

app.use(express.json({ limit: '1mb' }));

// WhatsApp webhook doğrulama (GET)
app.get(process.env.WEBHOOK_PATH || '/webhook/whatsapp', verifyWebhook);

// Gelen mesajlar (POST)
app.post(process.env.WEBHOOK_PATH || '/webhook/whatsapp', handleWebhook);

// Sağlık kontrolü
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// WooCommerce webhook endpoint'i
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

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`WhatsApp Bot sunucusu ${PORT} portunda çalışıyor`);
  });
}

module.exports = app;
