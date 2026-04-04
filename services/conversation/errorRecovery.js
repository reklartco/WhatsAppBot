const { sendTextMessage } = require('../whatsappService');
const { STATES } = require('./states');

function getMainMenuText() {
  return (
    `1. Fiyat Hesaplama\n` +
    `2. Etiket Türleri Hakkında Bilgi\n` +
    `3. Müşteri Temsilcisi`
  );
}

async function handleMainMenuError(from, conv) {
  conv.data.errorCount = (conv.data.errorCount || 0) + 1;

  if (conv.data.errorCount >= 5) {
    await sendTextMessage(from,
      `Anlaşılan zorluk yaşıyorsunuz. Size yardımcı olabilmem için:\n\n` +
      `1. Ana menüye dön\n` +
      `2. Müşteri temsilcisine bağlan`
    );
    conv.data.errorCount = 0;
    conv.data._errorRecoveryMenu = true;
  } else if (conv.data.errorCount >= 3) {
    await sendTextMessage(from,
      `Anlayamadım. Lütfen 1-3 arası bir numara yazarak seçim yapın:\n\n` +
      getMainMenuText()
    );
  } else {
    await sendTextMessage(from,
      `Anlayamadım. Lütfen numara ile seçim yapın:\n\n` +
      getMainMenuText()
    );
  }
}

/**
 * Genel error recovery fonksiyonu — tüm state handler'larda kullanılır.
 * @returns {boolean} true ise handler'dan çıkılmalı (recovery tetiklendi)
 */
async function handleStateError(from, conv, defaultMsg) {
  conv.data.errorCount = (conv.data.errorCount || 0) + 1;

  if (conv.data.errorCount >= 5) {
    await sendTextMessage(from,
      `Anlaşılan zorluk yaşıyorsunuz. Size yardımcı olabilmem için:\n\n` +
      `1. Ana menüye dön\n` +
      `2. Müşteri temsilcisine bağlan`
    );
    conv.data.errorCount = 0;
    conv.data._errorRecoveryMenu = true;
    conv.data._previousState = conv.state;
    conv.state = STATES.MAIN_MENU;
    return true;
  } else if (conv.data.errorCount >= 3 && conv.data.previousState) {
    await sendTextMessage(from,
      `Birkaç hatalı giriş yaptınız. Sizi bir önceki adıma yönlendiriyorum.`
    );
    conv.state = conv.data.previousState;
    conv.data.errorCount = 0;
    return true;
  } else {
    await sendTextMessage(from, defaultMsg);
    return false;
  }
}

/** Başarılı bir state geçişinde error counter'ı sıfırla ve önceki state'i kaydet */
function onSuccessfulTransition(conv, fromState) {
  conv.data.previousState = fromState;
  conv.data.errorCount = 0;
}

module.exports = {
  getMainMenuText,
  handleMainMenuError,
  handleStateError,
  onSuccessfulTransition,
};
