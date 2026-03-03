const axios = require('axios');
const { processMessage } = require('./conversationManager');
const logger = require('../utils/logger');

const GRAPH_API = 'https://graph.facebook.com/v21.0';
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const TOKEN = process.env.WHATSAPP_TOKEN;

// ========== WEBHOOK HANDLER'LAR ==========

/**
 * Meta webhook doğrulaması (ilk kurulumda bir kez çağrılır)
 */
function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    logger.info('Webhook doğrulandı');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
}

/**
 * Gelen mesajları işle
 * Meta her mesaj/durum değişikliğinde buraya POST atar
 */
async function handleWebhook(req, res) {
  // Meta 200 OK bekler — geç cevap verirseniz tekrar gönderir
  res.sendStatus(200);

  try {
    const body = req.body;

    if (body.object !== 'whatsapp_business_account') return;

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    // Durum güncellemeleri (delivered, read) — loglama için
    if (value?.statuses) {
      const status = value.statuses[0];
      logger.info(`Mesaj ${status.id}: ${status.status}`);
      return;
    }

    // Gelen mesaj
    if (value?.messages) {
      const message = value.messages[0];
      const contact = value.contacts?.[0];
      const from = message.from; // Müşteri telefon numarası (905xxxxxxxxx)
      const name = contact?.profile?.name || 'Müşteri';

      logger.info(`Gelen mesaj: ${from} (${name}) — Tip: ${message.type}`);

      // Konuşma yöneticisine gönder
      await processMessage(from, name, message);
    }
  } catch (error) {
    logger.error('Webhook işleme hatası:', error);
  }
}

// ========== MESAJ GÖNDERME FONKSİYONLARI ==========

/**
 * Düz metin mesajı gönder
 */
async function sendTextMessage(to, text) {
  return sendMessage(to, { type: 'text', text: { body: text } });
}

/**
 * Reply Buttons mesajı gönder (max 3 buton)
 * Müşteri butona basarak seçim yapar
 */
async function sendButtonMessage(to, bodyText, buttons) {
  return sendMessage(to, {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.map((btn, i) => ({
          type: 'reply',
          reply: { id: btn.id, title: btn.title.substring(0, 20) }
        }))
      }
    }
  });
}

/**
 * List Message gönder (max 10 seçenek)
 * Materyal seçimi gibi çok seçenekli durumlar için
 */
async function sendListMessage(to, bodyText, buttonText, sections) {
  return sendMessage(to, {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText },
      action: {
        button: buttonText.substring(0, 20),
        sections: sections
      }
    }
  });
}

/**
 * CTA URL Button — Ödeme linki için
 */
async function sendCTAButton(to, bodyText, buttonText, url) {
  return sendMessage(to, {
    type: 'interactive',
    interactive: {
      type: 'cta_url',
      body: { text: bodyText },
      action: {
        name: 'cta_url',
        parameters: {
          display_text: buttonText,
          url: url
        }
      }
    }
  });
}

/**
 * Medya dosyası indir (müşterinin gönderdiği baskı dosyası)
 */
async function downloadMedia(mediaId) {
  // 1. Media URL'sini al
  const urlResponse = await axios.get(
    `${GRAPH_API}/${mediaId}`,
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );

  // 2. Dosyayı indir
  const fileResponse = await axios.get(urlResponse.data.url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    responseType: 'arraybuffer'
  });

  return {
    buffer: fileResponse.data,
    mimeType: urlResponse.data.mime_type,
    fileSize: urlResponse.data.file_size
  };
}

/**
 * Temel mesaj gönderme fonksiyonu
 */
async function sendMessage(to, messageContent) {
  try {
    const response = await axios.post(
      `${GRAPH_API}/${PHONE_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
        ...messageContent
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    logger.info(`Mesaj gönderildi: ${to} — ID: ${response.data.messages[0].id}`);
    return response.data;
  } catch (error) {
    logger.error(`Mesaj gönderme hatası (${to}):`, error.response?.data || error.message);
    throw error;
  }
}

module.exports = {
  verifyWebhook,
  handleWebhook,
  sendTextMessage,
  sendButtonMessage,
  sendListMessage,
  sendCTAButton,
  downloadMedia,
  sendMessage
};
