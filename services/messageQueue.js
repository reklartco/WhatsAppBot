const logger = require('../utils/logger');

// ========== MESAJ KUYRUĞU (Anti-Ban Rate Limiting) ==========

// Genel kuyruk
const queue = [];
let isProcessing = false;

// Kişi bazlı cooldown (son mesaj zamanı)
const cooldowns = new Map();

// Ayarlar
const MIN_DELAY_MS = 1500;       // Mesajlar arası minimum bekleme (ms)
const COOLDOWN_MS = 3000;        // Aynı kişiye mesajlar arası minimum bekleme
const MAX_QUEUE_SIZE = 500;      // Maksimum kuyruk boyutu
const MAX_PER_MINUTE = 20;       // Dakika başı maksimum mesaj

// Dakika bazlı sayaç
let minuteCounter = 0;
let minuteStart = Date.now();

/**
 * Mesajı kuyruğa ekle
 * @param {Function} sendFn - Gönderme fonksiyonu (async)
 * @param {string} recipient - Alıcı telefon numarası
 * @returns {Promise} - Mesaj gönderildiğinde resolve olur
 */
function enqueueMessage(sendFn, recipient) {
  return new Promise((resolve, reject) => {
    if (queue.length >= MAX_QUEUE_SIZE) {
      logger.warn(`Kuyruk dolu (${MAX_QUEUE_SIZE}), mesaj reddedildi: ${recipient}`);
      reject(new Error('Mesaj kuyruğu dolu'));
      return;
    }

    queue.push({ sendFn, recipient, resolve, reject, addedAt: Date.now() });
    processQueue();
  });
}

/**
 * Kuyruğu işle (FIFO, rate limit ile)
 */
async function processQueue() {
  if (isProcessing) return;
  if (queue.length === 0) return;

  isProcessing = true;

  while (queue.length > 0) {
    // Dakika limitini kontrol et
    const now = Date.now();
    if (now - minuteStart > 60000) {
      minuteCounter = 0;
      minuteStart = now;
    }

    if (minuteCounter >= MAX_PER_MINUTE) {
      const waitTime = 60000 - (now - minuteStart) + 1000;
      logger.warn(`Dakika limiti aşıldı, ${Math.ceil(waitTime / 1000)}s bekleniyor`);
      await sleep(waitTime);
      minuteCounter = 0;
      minuteStart = Date.now();
    }

    const item = queue.shift();

    // Kişi bazlı cooldown kontrolü
    const lastSent = cooldowns.get(item.recipient) || 0;
    const elapsed = Date.now() - lastSent;
    if (elapsed < COOLDOWN_MS) {
      await sleep(COOLDOWN_MS - elapsed);
    }

    try {
      const result = await item.sendFn();
      cooldowns.set(item.recipient, Date.now());
      minuteCounter++;
      item.resolve(result);
    } catch (error) {
      logger.error(`Kuyruk mesaj gönderme hatası (${item.recipient}):`, error.message);
      item.reject(error);
    }

    // Mesajlar arası minimum bekleme + random jitter
    const jitter = Math.floor(Math.random() * 1000);
    await sleep(MIN_DELAY_MS + jitter);
  }

  isProcessing = false;
}

/**
 * Kuyruk durumunu al
 */
function getQueueStatus() {
  return {
    pending: queue.length,
    isProcessing,
    minuteCounter,
    minuteLimit: MAX_PER_MINUTE,
    cooldownCount: cooldowns.size
  };
}

/**
 * Kuyruğu temizle (acil durum)
 */
function clearQueue() {
  while (queue.length > 0) {
    const item = queue.shift();
    item.reject(new Error('Kuyruk temizlendi'));
  }
  logger.warn('Mesaj kuyruğu temizlendi');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Cooldown'ları periyodik temizle (bellek sızıntısı önleme)
const cooldownCleanup = setInterval(() => {
  const cutoff = Date.now() - 300000; // 5 dk'dan eski cooldown'ları sil
  for (const [key, time] of cooldowns) {
    if (time < cutoff) cooldowns.delete(key);
  }
}, 60000);
cooldownCleanup.unref();

module.exports = {
  enqueueMessage,
  getQueueStatus,
  clearQueue
};
