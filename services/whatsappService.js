const {
  sendText,
  sendButtons,
  sendList,
  sendCTAUrl,
  downloadMediaBase64
} = require('./evolutionTransport');
const { enqueueMessage } = require('./messageQueue');
const logger = require('../utils/logger');

// ========== EVOLUTION API WEBHOOK HANDLER ==========

/**
 * Evolution API'den gelen webhook event'lerini işle
 * Event tipleri: MESSAGES_UPSERT, CONNECTION_UPDATE, QRCODE_UPDATED vb.
 */
async function handleEvolutionWebhook(req, res) {
  // Evolution API hızlı cevap bekler
  res.sendStatus(200);

  try {
    const body = req.body;
    const event = body.event;

    switch (event) {
      case 'messages.upsert':
        await handleIncomingMessage(body);
        break;

      case 'connection.update':
        handleConnectionUpdate(body);
        break;

      case 'qrcode.updated':
        handleQRCodeUpdate(body);
        break;

      case 'messages.update':
        handleMessageStatusUpdate(body);
        break;

      case 'messages.delete':
        logger.info('Mesaj silindi:', body.data?.key?.id);
        break;

      default:
        logger.info(`Bilinmeyen event: ${event}`);
    }
  } catch (error) {
    logger.error('Evolution webhook hatası:', error);
  }
}

/**
 * Gelen mesajı işle (messages.upsert)
 */
async function handleIncomingMessage(body) {
  const data = body.data;

  // Grup mesajlarını yoksay (fromMe dahil)
  if (data.key?.remoteJid?.includes('@g.us')) return;

  // Kendi gönderdiğimiz mesajları işle (admin WhatsApp'tan yazdıysa kaydet)
  if (data.key?.fromMe) {
    const jid = data.key?.remoteJid || '';
    const phone = jid.replace('@s.whatsapp.net', '');
    if (!phone) return;

    const message = normalizeMessage(data);
    const content = message.text?.body || message.image?.caption || message.document?.caption || '';
    if (!content) return;

    // Bot'un gönderdiği mesajlarla çakışmayı önle:
    // Son 30 saniyede aynı içerikle outbound mesaj varsa, bu bot'un mesajıdır
    const recent = db.getMessageHistory(phone, 5);
    const isDuplicate = recent.some(m =>
      (m.direction === 'outbound' || m.direction === 'human') &&
      m.content === content &&
      (Date.now() - m.created_at) < 30000
    );

    if (!isDuplicate) {
      db.saveMessage(phone, 'human', content, 'text');
      logger.info(`[ADMIN-WA] ${phone}: admin WhatsApp'tan mesaj yazdı`);
    }
    return;
  }

  // Grup mesajlarını yoksay
  if (data.key?.remoteJid?.includes('@g.us')) return;

  // Telefon numarasını çıkar (jid formatından)
  const jid = data.key?.remoteJid || '';
  const from = jid.replace('@s.whatsapp.net', '');

  if (!from) return;

  // İsim bilgisi
  const name = data.pushName || 'Müşteri';

  // Mesaj içeriğini normalize et (Evolution → standart format)
  const message = normalizeMessage(data);

  logger.info(`Gelen mesaj: ${from} (${name}) — Tip: ${message.type}`);

  // Konuşma yöneticisine gönder (lazy require — circular dependency önleme)
  const { processMessage } = require('./conversationManager');
  await processMessage(from, name, message);
}

/**
 * Evolution API mesaj formatını standart formata dönüştür
 * Böylece conversationManager değişmeden çalışır
 */
function normalizeMessage(data) {
  const msg = data.message;

  if (!msg) {
    // Mesaj boş ama yeni konuşma olabilir (reklam, CTWA vb.)
    logger.info(`[RAW] Boş mesaj objesi — keys: ${JSON.stringify(Object.keys(data || {}))}`);
    return { type: 'text', text: { body: '' } };
  }

  // Debug: bilinmeyen mesaj tiplerini yakala
  const msgKeys = Object.keys(msg);
  const knownKeys = ['conversation', 'extendedTextMessage', 'buttonsResponseMessage', 'listResponseMessage',
    'documentMessage', 'documentWithCaptionMessage', 'imageMessage', 'audioMessage', 'locationMessage',
    'messageContextInfo', 'senderKeyDistributionMessage'];
  const unknownKeys = msgKeys.filter(k => !knownKeys.includes(k));
  if (unknownKeys.length > 0) {
    logger.info(`[RAW] Mesaj keys: ${JSON.stringify(msgKeys)}`);
  }

  // Düz metin
  if (msg.conversation || msg.extendedTextMessage) {
    const text = msg.conversation || msg.extendedTextMessage?.text || '';
    // CTWA (Click-to-WhatsApp) reklam bilgisini logla
    if (msg.extendedTextMessage?.contextInfo?.externalAdReply) {
      logger.info(`[CTWA] Reklamdan gelen mesaj: "${text}"`);
    }
    return {
      type: 'text',
      text: { body: text }
    };
  }

  // Template mesajı (reklamlardan gelebilir)
  if (msg.templateMessage) {
    const tmpl = msg.templateMessage;
    const text = tmpl.hydratedTemplate?.hydratedContentText
      || tmpl.hydratedFourRowTemplate?.hydratedContentText
      || tmpl.fourRowTemplate?.content?.text
      || '';
    logger.info(`[TEMPLATE] Template mesaj: "${text}"`);
    return { type: 'text', text: { body: text } };
  }

  // High Structured Message (CTWA ads, yeni format)
  if (msg.highlyStructuredMessage) {
    const hsm = msg.highlyStructuredMessage;
    const text = hsm.hydratedHsm?.hydratedTemplate?.hydratedContentText || '';
    logger.info(`[HSM] Structured mesaj: "${text}"`);
    return { type: 'text', text: { body: text } };
  }

  // RequestPhone / NativeFlow (bazı reklam türleri)
  if (msg.requestPhoneNumberMessage || msg.nativeFlowResponseMessage) {
    logger.info(`[AD] Özel reklam mesajı tipi: ${msgKeys.join(', ')}`);
    return { type: 'text', text: { body: '' } };
  }

  // ViewOnce mesaj (resim)
  if (msg.viewOnceMessage || msg.viewOnceMessageV2) {
    const inner = msg.viewOnceMessage?.message || msg.viewOnceMessageV2?.message;
    if (inner?.imageMessage) {
      return {
        type: 'image',
        image: {
          id: data.key?.id,
          mimeType: inner.imageMessage.mimetype,
          caption: inner.imageMessage.caption || ''
        }
      };
    }
    return { type: 'text', text: { body: '' } };
  }

  // Buton cevabı
  if (msg.buttonsResponseMessage) {
    return {
      type: 'interactive',
      interactive: {
        type: 'button_reply',
        button_reply: {
          id: msg.buttonsResponseMessage.selectedButtonId,
          title: msg.buttonsResponseMessage.selectedDisplayText
        }
      }
    };
  }

  // Liste cevabı
  if (msg.listResponseMessage) {
    return {
      type: 'interactive',
      interactive: {
        type: 'list_reply',
        list_reply: {
          id: msg.listResponseMessage.singleSelectReply?.selectedRowId,
          title: msg.listResponseMessage.title
        }
      }
    };
  }

  // Döküman
  if (msg.documentMessage || msg.documentWithCaptionMessage) {
    const doc = msg.documentMessage || msg.documentWithCaptionMessage?.message?.documentMessage;
    return {
      type: 'document',
      document: {
        id: data.key?.id,
        filename: doc?.fileName || 'document',
        mimeType: doc?.mimetype,
        caption: doc?.caption || ''
      }
    };
  }

  // Resim
  if (msg.imageMessage) {
    return {
      type: 'image',
      image: {
        id: data.key?.id,
        mimeType: msg.imageMessage.mimetype,
        caption: msg.imageMessage.caption || ''
      }
    };
  }

  // Ses
  if (msg.audioMessage) {
    return {
      type: 'audio',
      audio: { id: data.key?.id }
    };
  }

  // Konum
  if (msg.locationMessage) {
    return {
      type: 'location',
      location: {
        latitude: msg.locationMessage.degreesLatitude,
        longitude: msg.locationMessage.degreesLongitude
      }
    };
  }

  // Bilinmeyen tip — yine de text olarak dön ki bot tepki verebilsin
  logger.info(`[RAW] Bilinmeyen mesaj tipi: ${JSON.stringify(msgKeys)}`);
  // Mesajın içinde herhangi bir metin var mı diye son bir kontrol
  const fallbackText = tryExtractText(msg);
  return { type: 'text', text: { body: fallbackText } };
}

/**
 * Bilinmeyen formatlı mesajlardan metin çıkarmayı dene
 */
function tryExtractText(msg) {
  if (!msg) return '';
  // Recursive olarak 'text', 'body', 'caption', 'conversation' key'lerini ara
  for (const key of Object.keys(msg)) {
    const val = msg[key];
    if (typeof val === 'string' && val.length > 1 && val.length < 2000) {
      if (['text', 'body', 'caption', 'conversation', 'content', 'contentText',
           'hydratedContentText', 'selectedDisplayText', 'title'].includes(key)) {
        return val;
      }
    }
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      const nested = tryExtractText(val);
      if (nested) return nested;
    }
  }
  return '';
}

/**
 * Bağlantı durumu değişikliği
 */
function handleConnectionUpdate(body) {
  const state = body.data?.state;
  const statusReason = body.data?.statusReason;

  logger.info(`Bağlantı durumu: ${state} (reason: ${statusReason})`);

  if (global.connectionEmitter) {
    global.connectionEmitter.emit('connectionUpdate', { state, statusReason });
  }
}

/**
 * QR kodu güncellemesi
 */
function handleQRCodeUpdate(body) {
  const qr = body.data?.qrcode;
  logger.warn('QR Kodu güncellendi — tarama bekleniyor');

  if (global.connectionEmitter) {
    global.connectionEmitter.emit('qrcodeUpdate', { qr });
  }
}

/**
 * Mesaj durumu (delivered, read vb.)
 */
function handleMessageStatusUpdate(body) {
  const status = body.data?.status;
  const id = body.data?.key?.id;
  if (status && id) {
    logger.info(`Mesaj ${id}: ${status}`);
  }
}

// ========== MESAJ GÖNDERME (Queue üzerinden) ==========

const db = require('./database');

/**
 * Düz metin mesajı gönder (queue ile rate limiting)
 */
async function sendTextMessage(to, text) {
  const result = await enqueueMessage(async () => {
    return sendText(to, text);
  }, to);
  db.saveMessage(to, 'outbound', text, 'text');
  return result;
}

/**
 * Butonlu mesaj gönder
 */
async function sendButtonMessage(to, bodyText, buttons) {
  const result = await enqueueMessage(async () => {
    return sendButtons(to, bodyText, buttons);
  }, to);
  const buttonLabels = buttons.map((b, i) => `${i + 1}. ${b.title}`).join('\n');
  db.saveMessage(to, 'outbound', `${bodyText}\n\n${buttonLabels}`, 'button');
  return result;
}

/**
 * Liste mesajı gönder
 */
async function sendListMessage(to, bodyText, buttonText, sections) {
  const result = await enqueueMessage(async () => {
    return sendList(to, bodyText, buttonText, sections);
  }, to);
  const rows = sections.flatMap(s => s.rows || []);
  const rowLabels = rows.map((r, i) => `${i + 1}. ${r.title}`).join('\n');
  db.saveMessage(to, 'outbound', `${bodyText}\n\n${rowLabels}`, 'list');
  return result;
}

/**
 * CTA URL butonu gönder
 */
async function sendCTAButton(to, bodyText, buttonText, url) {
  const result = await enqueueMessage(async () => {
    return sendCTAUrl(to, bodyText, buttonText, url);
  }, to);
  db.saveMessage(to, 'outbound', `${bodyText}\n\n[${buttonText}](${url})`, 'cta');
  return result;
}

/**
 * Medya indir (Evolution API üzerinden)
 */
async function downloadMedia(messageId) {
  const result = await downloadMediaBase64(messageId);

  if (!result?.base64) {
    throw new Error('Medya indirilemedi');
  }

  return {
    buffer: Buffer.from(result.base64, 'base64'),
    mimeType: result.mimetype || 'application/octet-stream',
    fileSize: result.base64.length * 0.75
  };
}

module.exports = {
  handleEvolutionWebhook,
  normalizeMessage,
  sendTextMessage,
  sendButtonMessage,
  sendListMessage,
  sendCTAButton,
  downloadMedia
};
