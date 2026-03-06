const axios = require('axios');
const logger = require('../utils/logger');

const BASE_URL = process.env.EVOLUTION_BASE_URL || 'http://evolution-api:8080';
const API_KEY = process.env.EVOLUTION_APIKEY || '';
const INSTANCE = process.env.EVOLUTION_INSTANCE || '1etiket-main';

// Axios instance with default config
const evoApi = axios.create({
  baseURL: BASE_URL,
  headers: {
    'apikey': API_KEY,
    'Content-Type': 'application/json'
  },
  timeout: 15000
});

// ========== INSTANCE YÖNETİMİ ==========

/**
 * Yeni instance oluştur (ilk kurulumda)
 */
async function createInstance(instanceName = INSTANCE) {
  const res = await evoApi.post('/instance/create', {
    instanceName,
    integration: 'WHATSAPP-BAILEYS',
    qrcode: true,
    rejectCall: false,
    groupsIgnore: true,
    alwaysOnline: false,
    readMessages: false,
    readStatus: false,
    syncFullHistory: false
  });
  logger.info(`Instance oluşturuldu: ${instanceName}`);
  return res.data;
}

/**
 * Instance durumunu kontrol et
 */
async function getInstanceStatus(instanceName = INSTANCE) {
  try {
    const res = await evoApi.get(`/instance/connectionState/${encodeURIComponent(instanceName)}`);
    return res.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return { instance: { state: 'not_found' } };
    }
    throw error;
  }
}

/**
 * QR kodu al (bağlantı için)
 */
async function getQRCode(instanceName = INSTANCE) {
  const res = await evoApi.get(`/instance/connect/${encodeURIComponent(instanceName)}`);
  return res.data;
}

/**
 * Instance'ı yeniden başlat
 */
async function restartInstance(instanceName = INSTANCE) {
  const res = await evoApi.put(`/instance/restart/${encodeURIComponent(instanceName)}`);
  logger.info(`Instance yeniden başlatıldı: ${instanceName}`);
  return res.data;
}

/**
 * Instance'dan çıkış yap (logout)
 */
async function logoutInstance(instanceName = INSTANCE) {
  const res = await evoApi.delete(`/instance/logout/${encodeURIComponent(instanceName)}`);
  logger.info(`Instance çıkış yapıldı: ${instanceName}`);
  return res.data;
}

/**
 * Webhook ayarla (Evolution API'ye webhook URL bildir)
 */
async function setWebhook(webhookUrl, instanceName = INSTANCE) {
  const res = await evoApi.post(`/webhook/set/${encodeURIComponent(instanceName)}`, {
    webhook: {
      enabled: true,
      url: webhookUrl,
      webhookByEvents: false,
      webhookBase64: false,
      events: [
        'MESSAGES_UPSERT',
        'MESSAGES_UPDATE',
        'CONNECTION_UPDATE',
        'QRCODE_UPDATED',
        'MESSAGES_DELETE'
      ]
    }
  });
  logger.info(`Webhook ayarlandı: ${webhookUrl}`);
  return res.data;
}

// ========== MESAJ GÖNDERME ==========

/**
 * Düz metin mesajı gönder
 */
async function sendText(number, text, instanceName = INSTANCE) {
  const res = await evoApi.post(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    number: formatNumber(number),
    text,
    delay: getRandomDelay()
  });
  logger.info(`Metin gönderildi: ${number}`);
  return res.data;
}

/**
 * Butonlu mesaj gönder (Evolution API'de list olarak)
 * Evolution API WhatsApp Web'de native button desteklemez,
 * bu yüzden numbered list formatında gönderiyoruz
 */
async function sendButtons(number, bodyText, buttons, instanceName = INSTANCE) {
  // Evolution API'de WhatsApp Web buton desteği sınırlı
  // Numbered list olarak fallback yapıyoruz
  let text = bodyText + '\n';
  buttons.forEach((btn, i) => {
    text += `\n${i + 1}. ${btn.title}`;
  });
  text += '\n\nLütfen numara ile seçim yapın.';

  const res = await evoApi.post(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    number: formatNumber(number),
    text,
    delay: getRandomDelay()
  });
  logger.info(`Butonlu mesaj gönderildi: ${number}`);
  return res.data;
}

/**
 * Liste mesajı gönder
 * Evolution API'de de numbered list olarak
 */
async function sendList(number, bodyText, buttonText, sections, instanceName = INSTANCE) {
  let text = bodyText + '\n';
  let index = 1;
  for (const section of sections) {
    if (section.title) {
      text += `\n*${section.title}*`;
    }
    for (const row of section.rows) {
      text += `\n${index}. ${row.title}`;
      if (row.description) {
        text += ` (${row.description})`;
      }
      index++;
    }
  }
  text += '\n\nLütfen numara ile seçim yapın.';

  const res = await evoApi.post(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    number: formatNumber(number),
    text,
    delay: getRandomDelay()
  });
  logger.info(`Liste mesajı gönderildi: ${number}`);
  return res.data;
}

/**
 * CTA URL Button — link gönder
 */
async function sendCTAUrl(number, bodyText, buttonText, url, instanceName = INSTANCE) {
  const text = `${bodyText}\n\n${buttonText}: ${url}`;

  const res = await evoApi.post(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    number: formatNumber(number),
    text,
    delay: getRandomDelay()
  });
  logger.info(`CTA mesajı gönderildi: ${number}`);
  return res.data;
}

/**
 * Medya gönder (resim, döküman vb.)
 */
async function sendMedia(number, mediaType, mediaUrl, caption = '', instanceName = INSTANCE) {
  const endpoint = mediaType === 'image'
    ? `/message/sendMedia/${encodeURIComponent(instanceName)}`
    : `/message/sendMedia/${encodeURIComponent(instanceName)}`;

  const res = await evoApi.post(endpoint, {
    number: formatNumber(number),
    mediatype: mediaType,
    media: mediaUrl,
    caption,
    delay: getRandomDelay()
  });
  logger.info(`Medya gönderildi (${mediaType}): ${number}`);
  return res.data;
}

/**
 * Medya dosyasını base64 olarak indir
 * Evolution API'de gelen mesajdaki medyayı çekmek için
 */
async function downloadMediaBase64(messageId, instanceName = INSTANCE) {
  const res = await evoApi.post(`/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`, {
    message: { key: { id: messageId } }
  });
  return res.data;
}

// ========== YARDIMCI FONKSİYONLAR ==========

/**
 * Türkiye numaralarını normalize et
 * WhatsApp formatı: 905xxxxxxxxx (ülke kodu ile, + işareti olmadan)
 */
function formatNumber(number) {
  let clean = String(number).replace(/\D/g, '');

  // 0 ile başlıyorsa → 90 ekle
  if (clean.startsWith('0') && clean.length === 11) {
    clean = '90' + clean.substring(1);
  }

  // 5 ile başlıyorsa → 90 ekle
  if (clean.startsWith('5') && clean.length === 10) {
    clean = '90' + clean;
  }

  // Zaten 90 ile başlıyorsa doğru formatta
  if (!clean.startsWith('90')) {
    clean = '90' + clean;
  }

  return clean;
}

/**
 * Anti-ban: rastgele gecikme (1-3 saniye arası)
 */
function getRandomDelay() {
  return Math.floor(Math.random() * 2000) + 1000;
}

module.exports = {
  // Instance yönetimi
  createInstance,
  getInstanceStatus,
  getQRCode,
  restartInstance,
  logoutInstance,
  setWebhook,
  // Mesaj gönderme
  sendText,
  sendButtons,
  sendList,
  sendCTAUrl,
  sendMedia,
  downloadMediaBase64,
  // Yardımcı
  formatNumber,
  getRandomDelay
};
