const { sendTextMessage } = require('../../whatsappService');
const { STATES } = require('../states');
const { tryNLtoCart, parseOrderRegex } = require('../parseOrder');
const { normalizeTurkish } = require('../../../utils/validator');
const logger = require('../../../utils/logger');

async function handleIdle(from, name, conv, msgContent) {
  const text = msgContent.text?.trim() || '';

  // Veda/onay sonrası kısa süre içinde gelen mesajlarda hoşgeldin gönderme
  if (conv.data._closedAt) {
    const norm = normalizeTurkish(text.toLowerCase());
    const isExplicitRestart =
      norm === 'bot' || norm === 'robot' || norm === 'merhaba' || norm === 'selam' ||
      norm === 'menu' || norm === 'menü' || norm === 'menu' ||
      norm.startsWith('bot ') || norm.startsWith('merhaba ') || norm.startsWith('selam ');
    if (!isExplicitRestart) {
      logger.info(`[IDLE GUARD] ${from}: Veda sonrası mesaj yoksayıldı (${text.substring(0, 30)})`);
      return;
    }
    delete conv.data._closedAt;
  }

  // Uzun mesajlarda önce NL-to-Cart dene
  if (text.length >= 8) {
    const nlResult = await tryNLtoCart(from, conv, text);
    if (nlResult) return;

    // tryNLtoCart başarısız — boyut bilgisi varsa kaydet
    const regexFallback = parseOrderRegex(text);
    if (regexFallback && regexFallback.width && regexFallback.height) {
      conv.data._pendingWidth = regexFallback.width;
      conv.data._pendingHeight = regexFallback.height;
      if (regexFallback.quantity && regexFallback.quantity >= 50) {
        conv.data._pendingQuantity = regexFallback.quantity;
      }
      logger.info(`[IDLE] ${from}: NL-Cart başarısız ama boyut korundu: ${regexFallback.width}x${regexFallback.height}mm qty=${regexFallback.quantity || 'yok'}`);
    }
  }

  const firstName = name.split(' ')[0];

  await sendTextMessage(from,
    `Merhaba ${firstName}! Size nasıl yardımcı olabiliriz?\n\n` +
    `Hızlı fiyat almak için lütfen şu şekilde yazınız:\n` +
    `_5x5 cm 500 adet standart Etiket fiyatı istiyorum._\n\n` +
    `Farklı etiket türleri için:\n` +
    `_6x8 cm 750 adet Şeffaf Etiket fiyatı istiyorum._\n\n` +
    `*Menü*\n` +
    `1. Fiyat Hesaplama\n` +
    `2. Etiket Türleri Hakkında Bilgi\n` +
    `3. Müşteri Temsilcisi`
  );

  conv.state = STATES.MAIN_MENU;
}

module.exports = { handleIdle };
